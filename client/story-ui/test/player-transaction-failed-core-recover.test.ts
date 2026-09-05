import{describe,expect,it,vi}from'vitest'
import{createPreparedTransaction,reviseTransaction,type StoryTransactionRecord}from'../src/transaction-journal.ts'
import{PlayerTransactionCoordinator}from'../src/client/player-transaction-coordinator.ts'
import{appendPlayerMessage}from'../src/client/story-domain.ts'
import{createInitialProjection}from'../src/client/initial-projection.ts'

function operation(operationId:string,state:'applied-or-replayed'|'failed'){return{ref:{stepKey:`step-${operationId}`,operationId},state,evidence:[]}}
function summary(states:Array<ReturnType<typeof operation>>){const hasCanonicalEffect=states.some(item=>item.state==='applied-or-replayed');const readyForSocialCommit=states.every(item=>item.state==='applied-or-replayed');const repairablePartial=hasCanonicalEffect&&states.some(item=>item.state==='failed');return{operations:states,hasCanonicalEffect,readyForSocialCommit,deterministicNoEffectFailure:false,repairablePartial,unresolved:false}}

async function fixture(){
 const base={...createInitialProjection(),saveId:'save-failed-recover'}
 const projection=appendPlayerMessage(base,base.selectedChannelId,'继续')
 const prepared=await createPreparedTransaction({transactionId:'tx-failed-recover',saveId:projection.saveId,channelId:projection.selectedChannelId,text:'继续',baseProjectionRevision:0})
 const planned=reviseTransaction(prepared,{hiddenTurns:[{turnId:'turn-failed',kind:'initial',state:'planned',sessionId:'session-core'}],activeTurnId:'turn-failed'})
 const dispatched=reviseTransaction(planned,{hiddenTurns:[{turnId:'turn-failed',kind:'initial',state:'dispatched',sessionId:'session-core'}],activeTurnId:'turn-failed'})
 const linked=reviseTransaction(dispatched,{operationRefs:[{stepKey:'step-op-applied',operationId:'op-applied'},{stepKey:'step-op-failed',operationId:'op-failed'}]})
 let record=reviseTransaction(linked,{status:'needs-recovery',hiddenTurns:[{turnId:'turn-failed',kind:'initial',state:'failed',sessionId:'session-core'}],activeTurnId:undefined,diagnostic:{code:'hidden-failed',message:'failed after partial core work'}})
 const journal={listOpen:vi.fn(async()=>['committed','cancelled','failed'].includes(record.status)?[]:[record]),prepare:vi.fn(),save:vi.fn(async(next:StoryTransactionRecord)=>{record=next;return next})}
 return{projection,journal,get record(){return record}}
}

describe('restart recovery after a failed hidden turn with canonical core effect',()=>{
 it('uses durable journal evidence to start one continuation even when local pending state is gone',async()=>{
  const state=await fixture();let reconciliations=0
  const partial=summary([operation('op-applied','applied-or-replayed'),operation('op-failed','failed')])
  const ready=summary([operation('op-applied','applied-or-replayed'),operation('op-failed','applied-or-replayed')])
  const core={reconcile:vi.fn(async()=>{reconciliations+=1;return reconciliations===1?partial:ready})}
  const continuation=vi.fn(async(_projection:any,_channel:string,instruction:string,hooks:any)=>{expect(instruction).toContain('op-applied');expect(instruction).toContain('op-failed');const evidence={turnId:hooks.turnId,sessionId:'session-core',baseline:10,dshRequestId:'rpc-recover'};await hooks.beforeDispatch({...evidence,dshRequestId:undefined});await hooks.afterAccepted(evidence);return{raw:'{}',messages:[{senderId:'p-hezhou',kind:'dialogue' as const,content:'恢复完成。'}],turnId:evidence.turnId,dshTurn:3}})
  const ai={send:vi.fn(),recover:vi.fn(),recoverFromEvidence:vi.fn(),retry:vi.fn(),continueTransaction:continuation,cancel:vi.fn(),acknowledge:vi.fn(),turn:vi.fn(()=>null)}
  const coordinator=new PlayerTransactionCoordinator(state.journal as never,{save:vi.fn()} as never,ai as never,core as never)

  const recovered=await coordinator.recover(state.projection)

  expect(recovered?.turnId).toBe(state.record.canonicalResultTurnId)
  expect(continuation).toHaveBeenCalledTimes(1)
  expect(ai.recover).not.toHaveBeenCalled()
  expect(state.record.hiddenTurns.map(turn=>turn.kind)).toEqual(['initial','continuation'])
  expect(core.reconcile).toHaveBeenCalledTimes(2)
 })
})
