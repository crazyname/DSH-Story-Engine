import{describe,expect,it,vi}from'vitest'
import{createPreparedTransaction,reviseTransaction,type StoryTransactionRecord}from'../src/transaction-journal.ts'
import{PlayerTransactionCoordinator}from'../src/client/player-transaction-coordinator.ts'
import{appendPlayerMessage}from'../src/client/story-domain.ts'
import{createInitialProjection}from'../src/client/initial-projection.ts'

function projection(){const base={...createInitialProjection(),saveId:'save-finalize'};return appendPlayerMessage(base,base.selectedChannelId,'继续')}
function pendingSummary(operationId='op-pending'){return{operations:[{ref:{stepKey:`step-${operationId}`,operationId},state:'pending' as const,evidence:[],detail:'still pending'}],hasCanonicalEffect:false,readyForSocialCommit:false,deterministicNoEffectFailure:false,repairablePartial:false,unresolved:true}}
function failedSummary(operationId='op-failed'){return{operations:[{ref:{stepKey:`step-${operationId}`,operationId},state:'failed' as const,evidence:[],detail:'failed'}],hasCanonicalEffect:false,readyForSocialCommit:false,deterministicNoEffectFailure:true,repairablePartial:false,unresolved:false}}
async function journalRecord(state:'dispatched'|'completed',canonical=false){
 const save=projection()
 const prepared=await createPreparedTransaction({transactionId:'tx-finalize',saveId:save.saveId,channelId:save.selectedChannelId,text:'继续',baseProjectionRevision:0})
 const planned=reviseTransaction(prepared,{hiddenTurns:[{turnId:'turn-finalize',kind:'initial',state:'planned',sessionId:'session-finalize'}],activeTurnId:'turn-finalize'})
 const dispatched=reviseTransaction(planned,{hiddenTurns:[{turnId:'turn-finalize',kind:'initial',state:'dispatched',sessionId:'session-finalize'}],activeTurnId:'turn-finalize'})
 let record=reviseTransaction(dispatched,{operationRefs:[{stepKey:'step-op-pending',operationId:'op-pending'}]})
 if(state==='completed')record=reviseTransaction(record,{hiddenTurns:[{turnId:'turn-finalize',kind:'initial',state:'completed',sessionId:'session-finalize'}],activeTurnId:undefined})
 if(canonical)record=reviseTransaction(record,{canonicalResultTurnId:'turn-finalize'})
 return{save,record}
}
function harness(initial:StoryTransactionRecord){let record=initial;const journal={listOpen:vi.fn(async()=>['committed','cancelled','failed'].includes(record.status)?[]:[record]),prepare:vi.fn(),save:vi.fn(async(next:StoryTransactionRecord)=>{record=next;return next})};return{journal,get record(){return record}}}

describe('core-aware transaction finalization',()=>{
 it('blocks acknowledge when core evidence is no longer ready and preserves the AI pending result',async()=>{
  const fixture=await journalRecord('completed',true);const state=harness(fixture.record);const acknowledge=vi.fn()
  const ai={send:vi.fn(),recover:vi.fn(),recoverFromEvidence:vi.fn(),retry:vi.fn(),continueTransaction:vi.fn(),cancel:vi.fn(),turn:vi.fn(),acknowledge}
  const core={reconcile:vi.fn(async()=>pendingSummary())}
  const coordinator=new PlayerTransactionCoordinator(state.journal as never,{save:vi.fn()} as never,ai as never,core as never)

  await expect(coordinator.acknowledge(fixture.save.saveId,'turn-finalize')).rejects.toThrow('尚不能安全提交 social projection')

  expect(state.record.status).toBe('needs-recovery')
  expect(state.record.canonicalResultTurnId).toBe('turn-finalize')
  expect(acknowledge).not.toHaveBeenCalled()
 })

 it('keeps cancellation in needs-recovery while a core attempt remains unresolved',async()=>{
  const fixture=await journalRecord('dispatched');const state=harness(fixture.record)
  const ai={send:vi.fn(),recover:vi.fn(),recoverFromEvidence:vi.fn(),retry:vi.fn(),continueTransaction:vi.fn(),cancel:vi.fn(),turn:vi.fn(),acknowledge:vi.fn()}
  const core={reconcile:vi.fn(async()=>pendingSummary())}
  const coordinator=new PlayerTransactionCoordinator(state.journal as never,{save:vi.fn()} as never,ai as never,core as never)

  await coordinator.cancel(fixture.save.saveId)

  expect(state.record).toMatchObject({status:'needs-recovery',hiddenTurns:[{state:'cancelled'}],diagnostic:{code:'cancel-core-outcome-uncertain'}})
 })

 it('does not acknowledge a deterministic no-effect failure before the terminal journal write succeeds',async()=>{
  const save=projection();let record:StoryTransactionRecord|undefined
  const journal={
   listOpen:vi.fn(async()=>record===undefined||['committed','cancelled','failed'].includes(record.status)?[]:[record]),
   prepare:vi.fn(async(input:any)=>{record=await createPreparedTransaction({...input,transactionId:'tx-terminal-order'});return record}),
   save:vi.fn(async(next:StoryTransactionRecord)=>{if(next.status==='failed')throw new Error('terminal journal unavailable');record=next;return next}),
  }
  const acknowledge=vi.fn()
  const ai={
   send:vi.fn(async(_projection:any,_channel:string,_input:string,hooks:any)=>{const evidence={turnId:hooks.turnId,sessionId:'session-finalize',baseline:0};await hooks.beforeDispatch(evidence);await hooks.afterAccepted(evidence);record=await journal.save(reviseTransaction(record!,{operationRefs:[{stepKey:'step-op-failed',operationId:'op-failed'}]}));return{raw:'{}',messages:[{senderId:'p-hezhou',kind:'dialogue' as const,content:'不会提交。'}],turnId:evidence.turnId}}),
   recover:vi.fn(),recoverFromEvidence:vi.fn(),retry:vi.fn(),continueTransaction:vi.fn(),cancel:vi.fn(),turn:vi.fn(()=>null),acknowledge,
  }
  const core={reconcile:vi.fn(async()=>failedSummary())}
  const coordinator=new PlayerTransactionCoordinator(journal as never,{save:vi.fn()} as never,ai as never,core as never)

  await expect(coordinator.send(save,save.selectedChannelId,'继续')).rejects.toThrow('terminal journal unavailable')

  expect(acknowledge).not.toHaveBeenCalled()
  expect(record?.status).not.toBe('failed')
 })
})
