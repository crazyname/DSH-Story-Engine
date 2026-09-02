import { createHash } from 'node:crypto'
import {
  assertTransactionId,
  reviseTransaction,
  type StoryOperationRef,
  type StoryTransactionRecord,
} from './transaction-journal.ts'
import type { StoryTransactionStore } from './transaction-store.ts'

const MUTATING_STORY_TOOL_NAMES = [
  'story_commit_state',
  'story_advance_scene',
  'story_initialize_episode_state',
  'story_enter_episode_scene',
  'story_record_script_choice',
  'story_record_work_event',
  'story_pause_for_revision',
  'story_submit_script_revision',
  'story_record_episode_summary',
] as const

export const MUTATING_STORY_TOOLS: ReadonlySet<string> = new Set(MUTATING_STORY_TOOL_NAMES)

type CoreToolExecution = {
  readonly name: string
  readonly arguments: unknown
  readonly agent?: { readonly id?: unknown }
}

type TransactionStorePort = Pick<StoryTransactionStore, 'findOpenBySession' | 'findOperationOwner' | 'read' | 'write'>

const TERMINAL_TRANSACTION = new Set<StoryTransactionRecord['status']>(['committed', 'cancelled', 'failed'])

function object(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} 必须是对象`)
  return value as Record<string, unknown>
}

function stableId(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} 必须是字符串`)
  assertTransactionId(value, label)
  return value
}

function sessionId(exec: CoreToolExecution): string {
  const value = exec.agent?.id
  if (typeof value !== 'string' || value.trim() === '') throw new Error('mutating story_* 工具缺少 Agent/session identity')
  return stableId(value, 'sessionId')
}

function retryableJournalConflict(error: unknown): boolean {
  return error instanceof Error && error.message.includes('transaction') && error.message.includes('冲突')
}

function sameOperationRef(left: StoryOperationRef, right: StoryOperationRef): boolean {
  return left.stepKey === right.stepKey && left.operationId === right.operationId
}

export function isMutatingStoryTool(name: string): boolean {
  return MUTATING_STORY_TOOLS.has(name)
}

export function coreStepKey(transactionId: string, toolName: string, operationId: string): string {
  assertTransactionId(transactionId)
  assertTransactionId(operationId, 'operation_id')
  const digest = createHash('sha256')
    .update(JSON.stringify([transactionId, toolName, operationId]))
    .digest('hex')
  return `core-${digest}`
}

/**
 * Persists child core-operation identity before a mutating story_* body runs.
 *
 * The active transaction is resolved from the durable hidden-session evidence,
 * not from browser memory. A model-supplied transaction_id is treated as an
 * additional assertion: when present it must match the resolved transaction.
 * Standalone story_* calls remain possible when the session has no open player
 * transaction and no transaction_id is claimed.
 */
export class CoreStepJournalPreflight {
  constructor(private readonly transactions: TransactionStorePort) {}

  private existing(record: StoryTransactionRecord, expected: StoryOperationRef): StoryOperationRef | undefined {
    const byStep = record.operationRefs.find(item => item.stepKey === expected.stepKey)
    const byOperation = record.operationRefs.find(item => item.operationId === expected.operationId)
    if (byStep === undefined && byOperation === undefined) return undefined
    if (byStep !== undefined && byOperation !== undefined && sameOperationRef(byStep, expected) && sameOperationRef(byOperation, expected)) return byStep
    throw new Error(`transaction 幂等冲突：core step identity 已被不同 operation 占用：${expected.operationId}`)
  }

  private assertRecordStillOwnsSession(record: StoryTransactionRecord, expectedSessionId: string): void {
    if (TERMINAL_TRANSACTION.has(record.status)) throw new Error(`transaction ${record.transactionId} 已是终态 ${record.status}`)
    if (!record.hiddenTurns.some(turn => turn.sessionId === expectedSessionId)) {
      throw new Error(`transaction ${record.transactionId} 不再关联当前 DSH session：${expectedSessionId}`)
    }
  }

  private async assertOperationOwnership(record: StoryTransactionRecord, operationId: string): Promise<void> {
    const owner = await this.transactions.findOperationOwner(record.saveId, operationId)
    if (owner !== undefined && owner.transactionId !== record.transactionId) {
      throw new Error(`transaction 幂等冲突：operationId ${operationId} 已属于 ${owner.transactionId}`)
    }
  }

  async prepare(exec: CoreToolExecution): Promise<StoryTransactionRecord | undefined> {
    if (!isMutatingStoryTool(exec.name)) return undefined

    const args = object(exec.arguments, `${exec.name} arguments`)
    const operationId = stableId(args.operation_id, 'operation_id')
    const claimedTransactionId = args.transaction_id === undefined ? undefined : stableId(args.transaction_id, 'transaction_id')
    const currentSessionId = sessionId(exec)

    let current = await this.transactions.findOpenBySession(currentSessionId)
    if (current === undefined) {
      if (claimedTransactionId !== undefined) {
        throw new Error(`transaction ${claimedTransactionId} 不存在可恢复的 open journal；拒绝脱离 journal 执行 core mutation`)
      }
      return undefined
    }

    if (claimedTransactionId !== undefined && claimedTransactionId !== current.transactionId) {
      throw new Error(`transaction identity 冲突：工具声明 ${claimedTransactionId}，当前 session 属于 ${current.transactionId}`)
    }

    const expected: StoryOperationRef = {
      stepKey: coreStepKey(current.transactionId, exec.name, operationId),
      operationId,
    }

    for (let attempt = 0; attempt < 8; attempt += 1) {
      this.assertRecordStillOwnsSession(current, currentSessionId)
      await this.assertOperationOwnership(current, operationId)
      if (this.existing(current, expected) !== undefined) return current

      const next = reviseTransaction(current, { operationRefs: [...current.operationRefs, expected] })
      try {
        return await this.transactions.write(current.saveId, current.transactionId, current.revision, next)
      } catch (error) {
        if (!retryableJournalConflict(error)) throw error
        const refreshed = await this.transactions.read(current.saveId, current.transactionId)
        if (refreshed === undefined) throw new Error(`transaction 在 core step preflight 期间消失：${current.transactionId}`)
        current = refreshed
      }
    }

    throw new Error(`transaction ${current.transactionId} 的 core step journal 并发冲突未能收敛`)
  }
}
