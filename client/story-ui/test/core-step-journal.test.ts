import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CoreStepJournalPreflight, coreStepKey } from '../src/core-step-journal.ts'
import { createPreparedTransaction, reviseTransaction, type StoryTransactionRecord } from '../src/transaction-journal.ts'
import { StoryTransactionStore } from '../src/transaction-store.ts'

async function openTransaction(
  store: StoryTransactionStore,
  input: { saveId: string; transactionId: string; sessionId: string },
): Promise<StoryTransactionRecord> {
  const initial = await createPreparedTransaction({
    transactionId: input.transactionId,
    saveId: input.saveId,
    channelId: 'scene-main',
    text: '继续',
    baseProjectionRevision: 0,
    now: new Date('2026-09-03T00:00:00.000Z'),
  })
  await store.write(input.saveId, input.transactionId, -1, initial)
  const linked = reviseTransaction(initial, {
    hiddenTurns: [{
      turnId: `turn-${input.saveId}`,
      kind: 'initial',
      state: 'planned',
      sessionId: input.sessionId,
    }],
    activeTurnId: `turn-${input.saveId}`,
  }, new Date('2026-09-03T00:00:01.000Z'))
  return store.write(input.saveId, input.transactionId, 0, linked)
}

function execution(name: string, operationId: string, sessionId = 'session-1', transactionId?: string) {
  return {
    name,
    arguments: {
      operation_id: operationId,
      ...(transactionId === undefined ? {} : { transaction_id: transactionId }),
    },
    agent: { id: sessionId },
  }
}

describe('core step journal preflight', () => {
  it('persists operation identity before a mutating story tool may dispatch and replays the same preflight', async () => {
    const store = new StoryTransactionStore(await mkdtemp(join(tmpdir(), 'story-core-step-')))
    await openTransaction(store, { saveId: 'save-a', transactionId: 'tx-core', sessionId: 'session-1' })
    const preflight = new CoreStepJournalPreflight(store)

    const first = await preflight.prepare(execution('story_commit_state', 'op-1', 'session-1', 'tx-core'))
    expect(first?.operationRefs).toEqual([{
      stepKey: coreStepKey('tx-core', 'story_commit_state', 'op-1'),
      operationId: 'op-1',
    }])
    expect(first?.revision).toBe(2)

    const replay = await preflight.prepare(execution('story_commit_state', 'op-1', 'session-1', 'tx-core'))
    expect(replay?.revision).toBe(2)
    expect((await store.read('save-a', 'tx-core'))?.operationRefs).toHaveLength(1)
  })

  it('requires the active transaction identity and rejects mismatches without mutation', async () => {
    const store = new StoryTransactionStore(await mkdtemp(join(tmpdir(), 'story-core-step-tx-')))
    await openTransaction(store, { saveId: 'save-a', transactionId: 'tx-core', sessionId: 'session-1' })
    const preflight = new CoreStepJournalPreflight(store)

    await expect(preflight.prepare(execution('story_commit_state', 'op-missing-tx')))
      .rejects.toThrow('transaction_id 缺失')
    await expect(preflight.prepare(execution('story_commit_state', 'op-1', 'session-1', 'tx-other')))
      .rejects.toThrow('transaction identity 冲突')
    expect((await store.read('save-a', 'tx-core'))?.operationRefs).toEqual([])
  })

  it('rejects reusing one operation id for a different mutating tool before either body is trusted', async () => {
    const store = new StoryTransactionStore(await mkdtemp(join(tmpdir(), 'story-core-step-op-')))
    await openTransaction(store, { saveId: 'save-a', transactionId: 'tx-core', sessionId: 'session-1' })
    const preflight = new CoreStepJournalPreflight(store)

    await preflight.prepare(execution('story_commit_state', 'op-shared', 'session-1', 'tx-core'))
    await expect(preflight.prepare(execution('story_advance_scene', 'op-shared', 'session-1', 'tx-core')))
      .rejects.toThrow('core step identity 已被不同 operation 占用')
  })

  it('serializes concurrent distinct core-step identities through optimistic retry', async () => {
    const store = new StoryTransactionStore(await mkdtemp(join(tmpdir(), 'story-core-step-race-')))
    await openTransaction(store, { saveId: 'save-a', transactionId: 'tx-core', sessionId: 'session-1' })
    const preflight = new CoreStepJournalPreflight(store)

    await Promise.all([
      preflight.prepare(execution('story_commit_state', 'op-a', 'session-1', 'tx-core')),
      preflight.prepare(execution('story_enter_episode_scene', 'op-b', 'session-1', 'tx-core')),
    ])
    const record = await store.read('save-a', 'tx-core')
    expect(record?.operationRefs.map(item => item.operationId).sort()).toEqual(['op-a', 'op-b'])
    expect(record?.revision).toBe(3)
  })

  it('serializes competing transactions so one operation id has only one owner in a save', async () => {
    const store = new StoryTransactionStore(await mkdtemp(join(tmpdir(), 'story-core-step-cross-tx-race-')))
    await openTransaction(store, { saveId: 'save-a', transactionId: 'tx-a', sessionId: 'session-a' })
    await openTransaction(store, { saveId: 'save-a', transactionId: 'tx-b', sessionId: 'session-b' })
    const preflight = new CoreStepJournalPreflight(store)

    const settled = await Promise.allSettled([
      preflight.prepare(execution('story_commit_state', 'op-race', 'session-a', 'tx-a')),
      preflight.prepare(execution('story_commit_state', 'op-race', 'session-b', 'tx-b')),
    ])
    expect(settled.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(settled.filter(result => result.status === 'rejected')).toHaveLength(1)

    const a = await store.read('save-a', 'tx-a')
    const b = await store.read('save-a', 'tx-b')
    const owners = [a, b].filter(record => record?.operationRefs.some(ref => ref.operationId === 'op-race'))
    expect(owners).toHaveLength(1)
    expect([a?.operationRefs.length, b?.operationRefs.length].sort()).toEqual([0, 1])
  })

  it('rejects missing operation identity and non-string Agent identity before dispatch', async () => {
    const store = new StoryTransactionStore(await mkdtemp(join(tmpdir(), 'story-core-step-invalid-')))
    await openTransaction(store, { saveId: 'save-a', transactionId: 'tx-core', sessionId: 'session-1' })
    const preflight = new CoreStepJournalPreflight(store)

    await expect(preflight.prepare({
      name: 'story_commit_state',
      arguments: { transaction_id: 'tx-core' },
      agent: { id: 'session-1' },
    })).rejects.toThrow('operation_id 必须是字符串')

    await expect(preflight.prepare({
      name: 'story_commit_state',
      arguments: { operation_id: 'op-invalid-session', transaction_id: 'tx-core' },
      agent: { id: 42 },
    })).rejects.toThrow('缺少 Agent/session identity')

    expect((await store.read('save-a', 'tx-core'))?.operationRefs).toEqual([])
  })

  it('reserves an operation id across terminal and later transactions in the same save', async () => {
    const store = new StoryTransactionStore(await mkdtemp(join(tmpdir(), 'story-core-step-owner-')))
    const preflight = new CoreStepJournalPreflight(store)
    const oldLinked = await openTransaction(store, { saveId: 'save-a', transactionId: 'tx-old', sessionId: 'session-old' })
    const oldWithOperation = await preflight.prepare(execution('story_commit_state', 'op-reserved', 'session-old', 'tx-old'))
    expect(oldWithOperation?.operationRefs[0]?.operationId).toBe('op-reserved')

    const oldTerminal = reviseTransaction(oldWithOperation!, {
      status: 'cancelled',
      hiddenTurns: oldWithOperation!.hiddenTurns.map(turn => ({ ...turn, state: 'cancelled' as const })),
      activeTurnId: undefined,
    }, new Date('2026-09-03T00:00:02.000Z'))
    await store.write('save-a', 'tx-old', oldWithOperation!.revision, oldTerminal)

    await openTransaction(store, { saveId: 'save-a', transactionId: 'tx-new', sessionId: 'session-new' })
    await expect(preflight.prepare(execution('story_commit_state', 'op-reserved', 'session-new', 'tx-new')))
      .rejects.toThrow('operationId op-reserved 已属于 tx-old')
    expect((await store.read('save-a', 'tx-new'))?.operationRefs).toEqual([])
    expect(oldLinked.revision).toBe(1)
  })

  it('allows standalone mutations only when no transaction is claimed and leaves non-mutating tools untouched', async () => {
    const store = new StoryTransactionStore(await mkdtemp(join(tmpdir(), 'story-core-step-standalone-')))
    const preflight = new CoreStepJournalPreflight(store)

    await expect(preflight.prepare(execution('story_commit_state', 'op-standalone'))).resolves.toBeUndefined()
    await expect(preflight.prepare(execution('story_commit_state', 'op-orphan', 'session-1', 'tx-missing')))
      .rejects.toThrow('不存在可恢复的 open journal')
    await expect(preflight.prepare({ name: 'story_read_state', arguments: {}, agent: {} })).resolves.toBeUndefined()
  })

  it('resolves the unique open transaction from durable session evidence and fails closed on ambiguity', async () => {
    const store = new StoryTransactionStore(await mkdtemp(join(tmpdir(), 'story-core-step-session-')))
    await openTransaction(store, { saveId: 'save-a', transactionId: 'tx-a', sessionId: 'session-shared' })
    expect((await store.findOpenBySession('session-shared'))?.transactionId).toBe('tx-a')

    await openTransaction(store, { saveId: 'save-b', transactionId: 'tx-b', sessionId: 'session-shared' })
    await expect(store.findOpenBySession('session-shared')).rejects.toThrow('同时关联多个 open transaction')
  })

  it('ignores terminal transactions when resolving active session ownership', async () => {
    const store = new StoryTransactionStore(await mkdtemp(join(tmpdir(), 'story-core-step-terminal-')))
    const linked = await openTransaction(store, { saveId: 'save-a', transactionId: 'tx-done', sessionId: 'session-1' })
    const cancelled = reviseTransaction(linked, {
      status: 'cancelled',
      hiddenTurns: linked.hiddenTurns.map(turn => ({ ...turn, state: 'cancelled' as const })),
      activeTurnId: undefined,
    }, new Date('2026-09-03T00:00:02.000Z'))
    await store.write('save-a', 'tx-done', linked.revision, cancelled)

    await expect(store.findOpenBySession('session-1')).resolves.toBeUndefined()
  })
})
