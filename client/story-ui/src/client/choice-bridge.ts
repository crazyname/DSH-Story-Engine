/**
 * Choice-card bridge for the game shell.
 *
 * `story_present_choice` asks the player through DSH's user-questions seam:
 * the host pushes a `question/requested` mux frame (an answerable
 * server-request) and waits for a matching client-response on `/api/respond`.
 * The default web UI renders that card in the ordinary-chat composer, which
 * the full-screen game shell covers — so this bridge opens its own mux stream,
 * surfaces the pending question as a game-side choice card, and answers it
 * through the same respond protocol when the player clicks.
 */

/** One selectable option offered by the story_present_choice tool. */
export interface StoryChoiceOption {
  label: string
  description?: string
}

/** One pending question card. */
export interface StoryChoiceCard {
  /** Stable answerable server-request id (echoed in the client-response). */
  rpcId: string
  /** The game session the question belongs to. */
  sessionId: string
  /** Stable caller-provided question id, echoed in the answer. */
  id: string
  question: string
  header?: string
  detail?: string
  options: StoryChoiceOption[]
  multiSelect?: boolean
}

/** Bridge events surface consumed by the shell component. */
export interface StoryChoiceBridge {
  /** Latest pending card, or undefined while none is pending. */
  subscribe(listener: (card: StoryChoiceCard | undefined) => void): () => void
  /** Bind the bridge to one save's session; clears foreign pending cards. */
  bindSave(saveId: string | null): void
  /** Answer the pending card with one option label (or a custom answer). */
  answer(card: StoryChoiceCard, selected: string[], custom?: string): Promise<void>
  /** Stop the mux stream and release listeners. */
  dispose(): void
}

/** Minimal wire shapes for the answerable question protocol. */
type MuxFrame =
  | { type: 'question/requested'; sessionId: string; questions: Array<{
      id: string; question: string; detail?: string; header?: string; multiSelect?: boolean
      options?: Array<{ label: string; description?: string }>
    }> }
  | { type: 'question/resolved'; sessionId: string; questionRpcId: string; outcome: 'answered' | 'cancelled' }
  | { type: 'stream/error'; error: unknown }

interface StoryApiForChoices {
  events: { mux(payload: Record<string, unknown>, signal: AbortSignal): AsyncIterable<{ rpcId: string; payload: MuxFrame }> }
  respond(message: { type: 'client-response'; rpcId: string; result: { ok: true; value: { sessionId: string; answer: { answers: Array<{ id: string; selected: string[]; custom?: string }> } } } }): Promise<{ accepted: true } | { accepted: false; reason: string }>
}

/** The shared DSH api client surface the game client consumes. */
export type StoryClientApi = import('./ai-bridge.ts').StoryApi & StoryApiForChoices

/** Answer receipt: `accepted:true` means the host accepted the response. */
type AnswerReceipt = { accepted: true } | { accepted: false; reason: string }

/**
 * Create the game choice-card bridge over the DSH api client.
 * @param api - the shared connection api (same object StoryAiBridge receives).
 * @param sessionFor - resolves the active game session id for a save; only
 *   questions addressed to that session are surfaced, so a replayed card from
 *   a different save (or a stale session) never pollutes the current game.
 */
export function createStoryChoiceBridge(
  api: StoryClientApi,
  sessionFor: (saveId: string) => string | null,
  onRequested?: (sessionId: string) => void,
): StoryChoiceBridge {
  const listeners = new Set<(card: StoryChoiceCard | undefined) => void>()
  const pendingBySession = new Map<string, StoryChoiceCard>()
  let disposed = false
  let activeSaveId: string | null = null

  const activeCard = (): StoryChoiceCard | undefined => {
    if (activeSaveId === null) return undefined
    const sessionId = sessionFor(activeSaveId)
    return sessionId === null ? undefined : pendingBySession.get(sessionId)
  }

  /** Bind the bridge to one save's session without discarding other saves' pending cards. */
  const bindSave = (saveId: string | null): void => {
    activeSaveId = saveId
    notify()
  }

  const notify = (): void => { const card=activeCard();for (const listener of [...listeners]) listener(card) }

  const resolveFrame = (rpcId: string, frame: MuxFrame): void => {
    if (frame.type === 'question/requested') {
      const questions = frame.questions ?? []
      const first = questions[0] as NonNullable<typeof questions[0]> | undefined
      if (first === undefined) return
      const next = {
        rpcId,
        sessionId: frame.sessionId,
        id: first.id,
        question: first.question,
        ...(first.header === undefined ? {} : { header: first.header }),
        ...(first.detail === undefined ? {} : { detail: first.detail }),
        options: first.options ?? [],
        ...(first.multiSelect === true ? { multiSelect: true } : {}),
      }
      pendingBySession.set(frame.sessionId,next)
      onRequested?.(frame.sessionId)
      if(activeSaveId!==null&&sessionFor(activeSaveId)===frame.sessionId)notify()
    } else if (frame.type === 'question/resolved') {
      const pending=pendingBySession.get(frame.sessionId)
      if(pending!==undefined&&pending.rpcId===frame.questionRpcId){pendingBySession.delete(frame.sessionId);if(activeSaveId!==null&&sessionFor(activeSaveId)===frame.sessionId)notify()}
    }
  }

  const controller = new AbortController()
  const pump = (async () => {
    while(!disposed){
      try {
        for await (const envelope of api.events.mux({}, controller.signal)) {
          if (disposed) break
          resolveFrame(envelope.rpcId, envelope.payload)
        }
      } catch (error) {
        if (!disposed) console.error('[story-choice] mux stream ended; reconnecting:', error)
      }
      if(!disposed)await new Promise(resolve=>setTimeout(resolve,500))
    }
  })()

  return {
    subscribe(listener) {
      listeners.add(listener)
      listener(activeCard())
      return () => { listeners.delete(listener) }
    },
    bindSave(saveId) { bindSave(saveId) },
    async answer(current, selected, custom) {
      const pending=pendingBySession.get(current.sessionId)
      if (pending === undefined || pending.rpcId !== current.rpcId) throw new Error('选择已失效，请重新触发')
      const answer = { id: pending.id, selected: [...selected], ...(custom === undefined ? {} : { custom }) }
      const message = {
        type: 'client-response' as const,
        rpcId: pending.rpcId,
        result: { ok: true as const, value: { sessionId: pending.sessionId, answer: { answers: [answer] } } },
      }
      // respond returns a bare receipt ({ accepted }), not an RPC envelope.
      const receipt = await api.respond(message)
      if (receipt.accepted !== true) throw new Error(`回答未被接受：${receipt.reason ?? 'unknown'}`)
      pendingBySession.delete(pending.sessionId)
      if(activeSaveId!==null&&sessionFor(activeSaveId)===pending.sessionId)notify()
    },
    dispose() {
      disposed = true
      controller.abort()
      listeners.clear()
      void pump
    },
  }
}
