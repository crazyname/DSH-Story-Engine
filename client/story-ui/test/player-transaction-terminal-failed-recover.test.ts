import{describe,expect,it,vi}from'vitest'
import{createPreparedTransaction,reviseTransaction,type StoryTransactionRecord}from'../src/transaction-journal.ts'
import{PlayerTransactionCoordinator}from'../src/client/player-transaction-coordinator.ts'
import{appendPlayerMessage}from'../src/client/story-domain.ts'
import{createInitialProjection}from'../src/client/initial-projection.ts'

async function fixture(){
 const base={...createInitialProjection(),saveId:'save-terminal-failed-recover'}
 const projection=appendPlayerMessage(base,base.selectedChannelId,'继续')
 const prepared=await createPreparedTransaction({transactionId:'tx-terminal-failed-recover',saveId:projection.saveId,channelId:projection.selectedChannelId,text:'继续',baseProjectionRevision:0})
 const planned=reviseTransaction(prepared,{hiddenTurns:[{turnId:'turn-failed',kind:'initial',state:'planned',sessionId:'session-core'}],activeTurnId:'turn-failed'})
 const dispatched=reviseTransaction(planned,{hiddenTurns:[{turnId:'turn-failed',kind:'initial',state:'dispatched',sessionId:'session-core'}],activeTurnId:'turn-failed'})
 const linked=reviseTransaction(dispatched,{operationRefs:[{stepKey:'step-op-failed',operationId:'op-failed'}]})
 let record=reviseTransaction(linked,{status:'needs-recovery',hiddenTurns:[{turnId:'turn-failed',kind:'initial',state:'failed',sessionId:'session-core'}],activeTurnId:undefined,diagnostic:{code:'hidden-failed',message:'failed before restart'}})
 const journal={
  listOpen:vi.fn(async()=>['committed','cancelled','failed'].includes(record.status)?[]:[record]),
  prepare:vi.fn(),
  save:vi.fn(async(next:StoryTransactionRecord)=>{if(next.revision!==record.revision+1)throw new Error(`stale journal revision ${next.revision}; current ${record.revision}`);record=next;return next}),
 }
 return{projection,journal,get record(){return record}}
}

describe('restart recovery for deterministic no-effect Core failure',()=>{
 it('terminal-fails the durable transaction and clears the terminal hidden turn instead of leaving needs-recovery stuck',async()=>{
  const state=await fixture()
  const core={reconcile:vi.fn(async()=>({operations:[{ref:state.record.operationRefs[0]!,state:'failed' as const,evidence:[],detail:'rejected'}],hasCanonicalEffect:false,readyForSocialCommit:false,deterministicNoEffectFailure:true,repairablePartial:false,unresolved:false}))}
  const acknowledge=vi.fn()
  const ai={send:vi.fn(),recover:vi.fn(),recoverFromEvidence:vi.fn(),retry:vi.fn(),continueTransaction:vi.fn(),cancel:vi.fn(),turn:vi.fn(()=>({version:1,id:'turn-failed',sessionId:'session-core',baseline:0,channelId:state.projection.selectedChannelId,prompt:'old',state:'failed' as const,error:'failed'})),acknowledge}
  const coordinator=new PlayerTransactionCoordinator(state.journal as never,{save:vi.fn()} as never,ai as never,core as never)

  await expect(coordinator.recover(state.projection)).resolves.toBeNull()

  expect(state.record.status).toBe('failed')
  expect(state.record.canonicalResultTurnId).toBeUndefined()
  expect(state.record.diagnostic?.code).toBe('core-operation-failed-no-effect')
  expect(acknowledge).toHaveBeenCalledWith(state.projection.saveId,'turn-failed')
  expect(ai.recover).not.toHaveBeenCalled()
  expect(ai.recoverFromEvidence).not.toHaveBeenCalled()
  expect(ai.continueTransaction).not.toHaveBeenCalled()
 })
})
