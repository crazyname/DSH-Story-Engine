/**
 * Story Engine client plugin, browser half (Stage A: shell + mode switch).
 *
 * Two additive registrations, both waiting on their slot declarations so
 * apply order against ui-sidebar / ui-layout never matters:
 *  - `sidebar.footer.action` — the 文字游戏 entry button in the sidebar foot.
 *  - `shell.overlay` — the full-screen game shell, rendered only while game
 *    mode is active and returning null otherwise (no DOM when hidden, so the
 *    overlay layer stays click-through for ordinary chat).
 *
 * Mode state lives in a controller created in this closure and shared with
 * both components through their inject faces (the bare observable rides the
 * reserved `hooks` compartment; the renderer binds it to `useGameMode`).
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the SlotMap declarations (the keys' owners) into this
// program so both registrations typecheck against the real declarations —
// no runtime edge to ui-layout or ui-sidebar.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { createGameModeController } from './mode.ts'
import { StoryGameAction } from './StoryGameAction.tsx'
import { StoryGameShell } from './StoryGameShell.tsx'
import { StoryAiBridge } from './ai-bridge.ts'
import { createStoryChoiceBridge, type StoryChoiceBridge, type StoryClientApi } from './choice-bridge.ts'
import { HostProjectionStorage } from './host-persistence.ts'
import { HostTransactionJournal } from './host-transactions.ts'
import { PlayerTransactionCoordinator } from './player-transaction-coordinator.ts'
import type { StorySaveProjection } from './story-domain.ts'

/** Required services: the slot registry (declaration lifetimes + registration). */
export const inject = ['slots','connection']

/**
 * Client plugin body: one shared game-mode controller, then both entries.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  const controller = createGameModeController()
  const connection=ctx.get('connection') as unknown as {api:StoryClientApi}
  const ai=new StoryAiBridge(connection.api,window.localStorage)
  const playerTransactions=new PlayerTransactionCoordinator(new HostTransactionJournal(),new HostProjectionStorage(),ai)
  // One choice bridge per plugin lifetime. It only surfaces questions whose
  // session belongs to the currently active save (per-save hidden sessions),
  // so a replayed card from another game never leaks into this one.
  const choices:StoryChoiceBridge=createStoryChoiceBridge(connection.api,(saveId:string)=>ai.currentSessionId(saveId))
  // slots.inject waits on the declaration lifecycle: it runs once the
  // declaring register() commits, reruns after redeclaration, and rolls back
  // with this plugin's fiber. Each callback returns the registration's own
  // disposer.
  ctx.slots.inject('sidebar.footer.action', () =>
    ctx.slots.register(
      {
        name: 'sidebar.footer.action',
        id: 'story-game',
        inject: () => ({ enterGame: controller.enter, hooks: { gameMode: controller.source } }),
      },
      StoryGameAction,
    ))
  ctx.slots.inject('shell.overlay', () =>
    ctx.slots.register(
      {
        name: 'shell.overlay',
        id: 'story-game-shell',
        inject: () => ({
          exitGame: controller.exit,
          sendToAI:(projection:StorySaveProjection,channelId:string,input:string)=>playerTransactions.send(projection,channelId,input),
          recoverAiTurn:(projection:StorySaveProjection)=>playerTransactions.recover(projection),
          cancelAiTurn:(saveId:string)=>playerTransactions.cancel(saveId),
          retryAiTurn:(projection:StorySaveProjection)=>playerTransactions.retry(projection),
          acknowledgeAiTurn:(saveId:string,turnId:string)=>playerTransactions.acknowledge(saveId,turnId),
          aiTurn:(saveId:string)=>{const turn=ai.turn(saveId);return turn?.state==='uncertain'?{...turn,state:'running' as const}:turn},
          markWaitingChoice:(saveId:string,sessionId:string)=>ai.markWaitingChoice(saveId,sessionId),
          forkAiSession:(sourceSaveId:string,targetSaveId:string,packId:string)=>ai.forkSave(sourceSaveId,targetSaveId,packId),
          releaseAiSave:(saveId:string,packId?:string)=>ai.releaseSave(saveId,packId),
          choices,
          hooks: { gameMode: controller.source },
        }),
      },
      StoryGameShell,
    ))
}