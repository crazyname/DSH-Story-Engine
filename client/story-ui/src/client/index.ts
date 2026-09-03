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
import { StoryAiBridge, type AiTurn } from './ai-bridge.ts'
import { createStoryChoiceBridge, type StoryChoiceBridge, type StoryClientApi } from './choice-bridge.ts'
import { HostProjectionStorage } from './host-persistence.ts'
import { HostTransactionJournal } from './host-transactions.ts'
import { HostCoreReceiptReader } from './host-core-receipts.ts'
import { DshToolEvidenceReader } from './dsh-tool-evidence.ts'
import { CoreTransactionReconciler } from './core-reconciliation.ts'
import { PlayerTransactionCoordinator } from './player-transaction-coordinator.ts'
import { reconcileSettledLocalTurn } from './terminal-turn-reconciliation.ts'
import { createLocalProjectionStorage } from './persistence.ts'
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
  const hostProjections=new HostProjectionStorage()
  const localProjections=createLocalProjectionStorage(window.localStorage)
  const transactionJournal=new HostTransactionJournal()
  const coreReconciler=new CoreTransactionReconciler(new HostCoreReceiptReader(),new DshToolEvidenceReader(connection.api))
  const playerTransactions=new PlayerTransactionCoordinator(transactionJournal,hostProjections,ai,coreReconciler)
  const journalLocks=new Map<string,string>()
  const recoveryChannel=(saveId:string,channelId:string|undefined,authoritative:StorySaveProjection|undefined):string=>channelId??authoritative?.selectedChannelId??'journal-recovery'
  const syncRecoveryState=async(saveId:string,channelId?:string):Promise<void>=>{
    const authoritative=await hostProjections.load(saveId).catch(()=>undefined)
    if(authoritative!==undefined)localProjections.save(authoritative)
    const fallbackChannel=recoveryChannel(saveId,channelId,authoritative)
    try{
      await playerTransactions.assertQuiescent(saveId)
      try{await reconcileSettledLocalTurn(transactionJournal,ai,saveId);journalLocks.delete(saveId)}catch{journalLocks.set(saveId,fallbackChannel)}
    }catch{
      const current=ai.turn(saveId)
      if(current===null||current.state==='cancelled')journalLocks.set(saveId,fallbackChannel)
    }
  }
  const visibleTurn=(saveId:string):AiTurn|null=>{
    const lockedChannel=journalLocks.get(saveId)
    if(lockedChannel!==undefined)return{version:1,id:`journal-lock-${saveId}`,sessionId:'journal-recovery',baseline:-1,channelId:lockedChannel,prompt:'journal-recovery-lock',state:'uncertain',error:'Host transaction journal 尚未收口；请恢复或完成对账后继续'}
    return ai.turn(saveId)
  }
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
          sendToAI:async(projection:StorySaveProjection,channelId:string,input:string)=>{try{return await playerTransactions.send(projection,channelId,input)}catch(error){await syncRecoveryState(projection.saveId,channelId);throw error}},
          recoverAiTurn:async(projection:StorySaveProjection)=>{try{if(await reconcileSettledLocalTurn(transactionJournal,ai,projection.saveId))return null;return await playerTransactions.recover(projection)}finally{await syncRecoveryState(projection.saveId,projection.selectedChannelId)}},
          cancelAiTurn:async(saveId:string)=>{try{await playerTransactions.cancel(saveId)}finally{await syncRecoveryState(saveId)}},
          retryAiTurn:async(projection:StorySaveProjection)=>{try{if(await reconcileSettledLocalTurn(transactionJournal,ai,projection.saveId))throw new Error('上一 transaction 已终态；请作为新的玩家动作重新提交，不会绕过 journal retry');return await playerTransactions.retry(projection)}catch(error){await syncRecoveryState(projection.saveId,projection.selectedChannelId);throw error}},
          acknowledgeAiTurn:async(saveId:string,turnId:string)=>{await playerTransactions.acknowledge(saveId,turnId);await syncRecoveryState(saveId)},
          assertAiSaveQuiescent:(saveId:string)=>playerTransactions.assertQuiescent(saveId),
          aiTurn:visibleTurn,
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
