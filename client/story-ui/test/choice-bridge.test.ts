import { describe, expect, it, vi } from 'vitest'
import { createStoryChoiceBridge, type StoryChoiceCard } from '../src/client/choice-bridge.ts'

/** Fake mux stream fed by the test; the bridge consumes it as an async iterable. */
function fakeApi() {
  const queue: Array<{ rpcId: string; payload: unknown }> = []
  const respondCalls: unknown[] = []
  const api = {
    events: {
      async *mux() {
        while (true) {
          if (queue.length > 0) yield queue.shift() as { rpcId: string; payload: unknown }
          await new Promise((resolve) => setTimeout(resolve, 1))
        }
      },
    },
    respond: vi.fn(async (message: unknown) => {
      respondCalls.push(message)
      return { accepted: true }
    }),
  }
  return { api, queue, respondCalls }
}

/** Session map keyed by save id: saveA -> session-a, saveB -> session-b. */
const sessions = new Map<string, string>([
  ['save-a', 'session-a'],
  ['save-b', 'session-b'],
])
const sessionFor = (saveId: string) => sessions.get(saveId) ?? null

function questionFrame(rpcId: string, sessionId: string, id = 'c1') {
  return { rpcId, payload: { type: 'question/requested', sessionId, questions: [{ id, question: '怎么做？', options: [{ label: 'A' }] }] } }
}

describe('story choice bridge', () => {
  it('surfaces a question for the bound save only', async () => {
    const { api, queue } = fakeApi()
    const bridge = createStoryChoiceBridge(api as never, sessionFor)
    bridge.bindSave('save-a')
    const seen: unknown[] = []
    bridge.subscribe((card) => { seen.push(card) })

    queue.push(questionFrame('q-1', 'session-a'))
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(seen).toEqual([undefined, expect.objectContaining({ rpcId: 'q-1', sessionId: 'session-a' })])
    bridge.dispose()
  })

  it('keeps a replayed current-session card until the save binds after reload', async () => {
    const { api, queue } = fakeApi()
    const bridge = createStoryChoiceBridge(api as never, sessionFor)
    const seen: unknown[] = []
    bridge.subscribe((card) => { seen.push(card) })
    queue.push(questionFrame('q-replayed', 'session-a'))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(seen.at(-1)).toBeUndefined()
    bridge.bindSave('save-a')
    expect(seen.at(-1)).toMatchObject({ rpcId: 'q-replayed', sessionId: 'session-a' })
    bridge.dispose()
  })

  it('ignores a replayed question from another save (no pollution)', async () => {
    const { api, queue } = fakeApi()
    const bridge = createStoryChoiceBridge(api as never, sessionFor)
    bridge.bindSave('save-a')
    const seen: unknown[] = []
    bridge.subscribe((card) => { seen.push(card) })

    // Another save's pending card replays on mux open — must not surface.
    queue.push(questionFrame('q-foreign', 'session-b'))
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(seen).toEqual([undefined])
    bridge.dispose()
  })

  it('bindSave clears a card that belongs to the previous save', async () => {
    const { api, queue } = fakeApi()
    const bridge = createStoryChoiceBridge(api as never, sessionFor)
    bridge.bindSave('save-a')
    const seen: unknown[] = []
    bridge.subscribe((card) => { seen.push(card) })

    queue.push(questionFrame('q-1', 'session-a'))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(seen.at(-1)).toMatchObject({ rpcId: 'q-1' })

    bridge.bindSave('save-b')
    expect(seen.at(-1)).toBeUndefined()
    bridge.bindSave('save-a')
    expect(seen.at(-1)).toMatchObject({ rpcId: 'q-1' })
    bridge.dispose()
  })

  it('answers the pending card through respond and clears it', async () => {
    const { api, queue, respondCalls } = fakeApi()
    const bridge = createStoryChoiceBridge(api as never, sessionFor)
    bridge.bindSave('save-a')
    const seen: unknown[] = []
    bridge.subscribe((card) => { seen.push(card) })

    queue.push(questionFrame('q-1', 'session-a'))
    await new Promise((resolve) => setTimeout(resolve, 20))
    const card = seen.at(-1) as StoryChoiceCard | undefined
    if (card === undefined) throw new Error('expected a pending card')

    await bridge.answer(card, ['A'])
    expect(respondCalls).toHaveLength(1)
    expect(respondCalls[0]).toMatchObject({
      type: 'client-response',
      rpcId: 'q-1',
      result: { ok: true, value: { sessionId: 'session-a', answer: { answers: [{ id: 'c1', selected: ['A'] }] } } },
    })
    expect(seen.at(-1)).toBeUndefined()
    bridge.dispose()
  })

  it('clears the card on question/resolved', async () => {
    const { api, queue } = fakeApi()
    const bridge = createStoryChoiceBridge(api as never, sessionFor)
    bridge.bindSave('save-a')
    const seen: unknown[] = []
    bridge.subscribe((card) => { seen.push(card) })

    queue.push(questionFrame('q-1', 'session-a'))
    await new Promise((resolve) => setTimeout(resolve, 20))
    queue.push({ rpcId: 'resolved-1', payload: { type: 'question/resolved', sessionId: 'session-a', questionRpcId: 'q-1', outcome: 'answered' } })
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(seen).toEqual([undefined, expect.objectContaining({ rpcId: 'q-1' }), undefined])
    bridge.dispose()
  })

  it('rejects answering after the card was resolved', async () => {
    const { api, queue } = fakeApi()
    const bridge = createStoryChoiceBridge(api as never, sessionFor)
    bridge.bindSave('save-a')
    const seen: unknown[] = []
    bridge.subscribe((card) => { seen.push(card) })

    queue.push(questionFrame('q-1', 'session-a'))
    await new Promise((resolve) => setTimeout(resolve, 20))
    const card = seen.at(-1) as StoryChoiceCard | undefined
    if (card === undefined) throw new Error('expected a pending card')
    queue.push({ rpcId: 'resolved-1', payload: { type: 'question/resolved', sessionId: 'session-a', questionRpcId: 'q-1', outcome: 'cancelled' } })
    await new Promise((resolve) => setTimeout(resolve, 20))

    await expect(bridge.answer(card, ['A'])).rejects.toThrow('选择已失效')
    bridge.dispose()
  })
})
