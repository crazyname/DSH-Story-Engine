import{describe,expect,it,vi}from'vitest'
import{createPreparedTransaction,reviseTransaction,type StoryTransactionRecord}from'../src/transaction-journal.ts'
import{PlayerTransactionCoordinator}from'../src/client/player-transaction-coordinator.ts'
import{appendPlayerMessage}from'../src/client/story-domain.ts'
import{createInitialProjection}from'../src/client/initial-projection.ts'

function operation(operationId:string,state:'applied-or-replayed'|'failed'|'pending'|'inconsistent'){return{ref:{stepKey:`step-${operationId}`,operationId},state,evidence:[]}}
function summary(states:Array<ReturnType<typeof operation>>){const hasCanonicalEffect=states.some(item=>item.state==='applied-or-replayed');const readyForSocialCommit=states.every(item=>item.state==='applied-or-replayed');const unresolved=states.some(item=>item.state==='pending'||item.state==='inconsistent');const deterministicNoEffectFailure=!hasCanonicalEffect&&!unresolved&&states.some(item=>item.state==='failed')&&states.every(item=>item.state==='failed');const repairablePartial=hasCanonicalEffect&&!unresolved&&states.some(item=>item.state==='failed')&&states.every(item=>item.state==='applied-or-replayed'||item.state==='failed');return{operations:states,hasCanonicalEffect,readyForSocialCommit,deterministicNoEffectFailure,repairablePartial,unresolved}}

async function fixture(){
 const base={...createInitialProjection(),saveId:'save-core-retry'}
 const projection=appendPlayerMessage(base,base.selectedChannelId,'继续')
 const prepared=await createPreparedTransaction({transactionId:'tx-core-retry',saveId:projection.saveId,channelId:projection.selectedChannelId,text:'继续',baseProjectionRevision:0,now:new Date('2026-09-03T00:00:00.000Z')})
 const planned=reviseTransaction(prepared,{hiddenTurns:[{turnId:'turn-failed',kind:'initial',state:'planned',sessionId:'session-core'}],activeTurnId:'turn-failed'})
 const dispatched=reviseTransaction(planned,{hiddenTurns:[{turnId:'turn-failed',kind:'initial',state:'dispatched',sessionId:'session-core'}],activeTurnId:'turn-failed'})
 const linked=reviseTransaction(dispatched,{operationRefs:[{stepKey:'step-op-applied',operationId:'op-applied'},{stepKey:'step-op-failed',operationId:'op-failed'}]})
 let record=reviseTransaction(linked,{status:'needs-recovery',hiddenTurns:[{turnId:'turn-failed',kind:'initial',state:'failed',sessionId:'session-core'}],activeTurnId:undefined,diagnostic:{code:'hidden-failed',message:'continuation failed'}})
 const journal={
  listOpen:vi.fn(async()=>['committed','cancelled','failed'].includes(record.status)?[]:[record]),
  prepare:vi.fn(),
  save:vi.fn(async(next:StoryTransactionRecord)=>{if(next.revision!==record.revision+1)throw new Error(`stale journal revision ${next.revision}; current ${record.revision}`);record=next;return next}),
 }
 return{projection,journal,get record(){return record}}
}

describe('core-aware retry after a failed hidden turn',()=>{
 it('uses a repair continuation instead of generic retry when core evidence already exists',async()=>{
  const state=await fixture()
  let reconciliations=0
  const partial=summary([operation('op-applied','applied-or-replayed'),operation('op-failed','failed')])
  const ready=summary([operation('op-applied','applied-or-replayed'),operation('op-failed','applied-or-replayed')])
  const core={reconcile:vi.fn(async()=>{reconciliations+=1;return reconciliations===1?partial:ready})}
  const retry=vi.fn()
  const continuation=vi.fn(async(_projection:any,_channel:string,instruction:string,hooks:any)=>{
   expect(instruction).toContain('op-applied')
   expect(instruction).toContain('op-failed')
   const evidence={turnId:hooks.turnId,sessionId:'session-core',baseline:10,dshRequestId:'rpc-continuation'}
   await hooks.beforeDispatch({...evidence,dshRequestId:undefined})
   await hooks.afterAccepted(evidence)
   return{raw:'{}',messages:[{senderId:'p-hezhou',kind:'dialogue' as const,content:'修复完成。'}],turnId:evidence.turnId,dshTurn:2}
  })
  const ai={
   send:vi.fn(),recover:vi.fn(),recoverFromEvidence:vi.fn(),retry,continueTransaction:continuation,cancel:vi.fn(),acknowledge:vi.fn(),
   turn:vi.fn(()=>({version:1,id:'turn-failed',sessionId:'session-core',baseline:0,channelId:state.projection.selectedChannelId,prompt:'old',state:'failed',error:'failed'})),
  }
  const coordinator=new PlayerTransactionCoordinator(state.journal as never,{save:vi.fn()} as never,ai as never,core as never)

  const result=await coordinator.retry(state.projection)

  expect(result.turnId).toBe(state.record.canonicalResultTurnId)
  expect(retry).not.toHaveBeenCalled()
  expect(continuation).toHaveBeenCalledTimes(1)
  expect(state.record.hiddenTurns.map(turn=>turn.kind)).toEqual(['initial','continuation'])
  expect(core.reconcile).toHaveBeenCalledTimes(2)
 })

 it('blocks generic retry while core evidence remains pending',async()=>{
  const state=await fixture()
  const core={reconcile:vi.fn(async()=>summary([operation('op-applied','applied-or-replayed'),operation('op-failed','pending')]))}
  const retry=vi.fn()
  const continuation=vi.fn()
  const ai={
   send:vi.fn(),recover:vi.fn(),recoverFromEvidence:vi.fn(),retry,continueTransaction:continuation,cancel:vi.fn(),acknowledge:vi.fn(),
   turn:vi.fn(()=>({version:1,id:'turn-failed',sessionId:'session-core',baseline:0,channelId:state.projection.selectedChannelId,prompt:'old',state:'failed',error:'failed'})),
  }
  const coordinator=new PlayerTransactionCoordinator(state.journal as never,{save:vi.fn()} as never,ai as never,core as never)

  await expect(coordinator.retry(state.projection)).rejects.toThrow('core evidence 尚未收敛')

  expect(retry).not.toHaveBeenCalled()
  expect(continuation).not.toHaveBeenCalled()
  expect(state.record.status).toBe('needs-recovery')
 })
})
