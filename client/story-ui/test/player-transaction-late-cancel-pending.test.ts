import{describe,expect,it,vi}from'vitest'
import{createPreparedTransaction,reviseTransaction,type StoryTransactionRecord}from'../src/transaction-journal.ts'
import{PlayerTransactionCoordinator}from'../src/client/player-transaction-coordinator.ts'
import{appendPlayerMessage}from'../src/client/story-domain.ts'
import{createInitialProjection}from'../src/client/initial-projection.ts'

async function fixture(){
 const base={...createInitialProjection(),saveId:'save-late-cancel-pending'}
 const projection=appendPlayerMessage(base,base.selectedChannelId,'继续')
 const prepared=await createPreparedTransaction({transactionId:'tx-late-cancel-pending',saveId:projection.saveId,channelId:projection.selectedChannelId,text:'继续',baseProjectionRevision:0})
 const planned=reviseTransaction(prepared,{hiddenTurns:[{turnId:'turn-a',kind:'initial',state:'planned',sessionId:'session-a'}],activeTurnId:'turn-a'})
 const dispatched=reviseTransaction(planned,{hiddenTurns:[{turnId:'turn-a',kind:'initial',state:'dispatched',sessionId:'session-a'}],activeTurnId:'turn-a'})
 let record=reviseTransaction(dispatched,{operationRefs:[{stepKey:'step-op-a',operationId:'op-a'}]})
 const journal={
  listOpen:vi.fn(async()=>['committed','cancelled','failed'].includes(record.status)?[]:[record]),
  prepare:vi.fn(),
  save:vi.fn(async(next:StoryTransactionRecord)=>{if(next.revision!==record.revision+1)throw new Error(`stale journal revision ${next.revision}; current ${record.revision}`);record=next;return next}),
 }
 return{projection,journal,get record(){return record}}
}

function pendingWithReceipt(){return{operations:[{ref:{stepKey:'step-op-a',operationId:'op-a'},state:'pending' as const,receipt:{operationId:'op-a',transactionId:'tx-late-cancel-pending',operation:'story_commit_state',fingerprint:'a'.repeat(64),stateVersion:1,committedAt:'2026-09-05T00:00:00.000Z',result:{ok:true}},evidence:[],detail:'receipt exists but retry remains pending'}],hasCanonicalEffect:true,readyForSocialCommit:false,deterministicNoEffectFailure:false,repairablePartial:false,unresolved:true}}

describe('late cancel with receipt-backed pending retry',()=>{
 it('keeps needs-recovery and never starts a continuation while the retry outcome is unresolved',async()=>{
  const state=await fixture();const continuation=vi.fn();const recover=vi.fn(async()=>null)
  const core={reconcile:vi.fn(async()=>pendingWithReceipt())}
  const ai={send:vi.fn(),recover,recoverFromEvidence:vi.fn(),retry:vi.fn(),continueTransaction:continuation,cancel:vi.fn(),acknowledge:vi.fn(),turn:vi.fn(()=>({version:1,id:'turn-a',sessionId:'session-a',baseline:0,channelId:state.projection.selectedChannelId,prompt:'old',state:'cancelled' as const}))}
  const coordinator=new PlayerTransactionCoordinator(state.journal as never,{save:vi.fn()} as never,ai as never,core as never)

  await coordinator.cancel(state.projection.saveId)
  expect(state.record).toMatchObject({status:'needs-recovery',hiddenTurns:[{state:'cancelled'}],diagnostic:{code:'cancelled-after-core-effect'}})

  await expect(coordinator.recover(state.projection)).resolves.toBeNull()
  expect(state.record.status).toBe('needs-recovery')
  expect(continuation).not.toHaveBeenCalled()
  expect(recover).toHaveBeenCalledTimes(1)
 })
})
