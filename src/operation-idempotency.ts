import { createHash } from 'node:crypto'
import type { OperationIdentity, OperationReceipt } from './serial-types.js'

const STABLE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/
const SHA256 = /^[a-f0-9]{64}$/

export interface PreparedOperation {
  operationId: string
  transactionId?: string
  operation: string
  fingerprint: string
}

function assertStableId(value: string, label: string): string {
  if (value !== value.trim() || !STABLE_ID.test(value)) throw new Error(`${label} 无效`)
  return value
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('幂等指纹不支持非有限数值')
    return value
  }
  if (Array.isArray(value)) return value.map(item => item === undefined ? null : canonicalize(item))
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const item = (value as Record<string, unknown>)[key]
      if (item !== undefined) result[key] = canonicalize(item)
    }
    return result
  }
  throw new Error(`幂等指纹不支持值类型：${typeof value}`)
}

export function operationFingerprint(operation: string, identity: OperationIdentity, payload: unknown): string {
  const operationId = assertStableId(identity.operationId, 'operationId')
  const transactionId = identity.transactionId === undefined ? undefined : assertStableId(identity.transactionId, 'transactionId')
  const canonical = canonicalize({ operation, operationId, ...(transactionId ? { transactionId } : {}), payload })
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex')
}

export function prepareOperation(operation: string, identity: OperationIdentity, payload: unknown): PreparedOperation {
  if (!operation.trim()) throw new Error('operation 不能为空')
  const operationId = assertStableId(identity.operationId, 'operationId')
  const transactionId = identity.transactionId === undefined ? undefined : assertStableId(identity.transactionId, 'transactionId')
  return {
    operationId,
    ...(transactionId ? { transactionId } : {}),
    operation,
    fingerprint: operationFingerprint(operation, { operationId, ...(transactionId ? { transactionId } : {}) }, payload),
  }
}

export function assertReceiptMatches(receipt: OperationReceipt, prepared: PreparedOperation): void {
  const same = receipt.operationId === prepared.operationId
    && receipt.operation === prepared.operation
    && receipt.fingerprint === prepared.fingerprint
    && receipt.transactionId === prepared.transactionId
  if (!same) throw new Error(`幂等操作冲突：${prepared.operationId}`)
}

export function normalizeOperationReceipts(value: unknown): Record<string, OperationReceipt> {
  if (value === undefined) return {}
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('operationReceipts 损坏')
  const result: Record<string, OperationReceipt> = {}
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!STABLE_ID.test(key) || raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('operationReceipts 损坏')
    const receipt = raw as Partial<OperationReceipt>
    if (receipt.operationId !== key
      || typeof receipt.operation !== 'string' || !receipt.operation
      || typeof receipt.fingerprint !== 'string' || !SHA256.test(receipt.fingerprint)
      || !Number.isInteger(receipt.stateVersion) || Number(receipt.stateVersion) < 0
      || typeof receipt.committedAt !== 'string' || !receipt.committedAt
      || !Object.prototype.hasOwnProperty.call(receipt, 'result')
      || (receipt.transactionId !== undefined && (typeof receipt.transactionId !== 'string' || !STABLE_ID.test(receipt.transactionId)))) {
      throw new Error('operationReceipts 损坏')
    }
    result[key] = structuredClone(receipt as OperationReceipt)
  }
  return result
}

export function operationCheckpointKey(operationId: string): string {
  return createHash('sha256').update(assertStableId(operationId, 'operationId')).digest('hex').slice(0, 20)
}
