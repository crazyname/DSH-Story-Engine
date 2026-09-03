import{describe,expect,it,vi}from'vitest'
import{createPreparedTransaction,reviseTransaction,type StoryTransactionRecord}from'../src/transaction-journal.ts'
import{PlayerTransactionCoordinator}from'../src/client/player-transaction-coordinator.ts'
import{appendPlayerMessage}from'../src/client/story-domain.ts'
import{createInitialProjection}from'../src/client/initial-projection.ts'

async function fixture(){
 const save=appendPlayerMessage({...createInitialProjection(),saveId:'save-recover-refresh'},'scene-main','继续')
 const prepared=await createPreparedTransaction({transactionId:'tx-recover-refresh',saveId:save.saveId,channelId:save.selectedChannelId,text:'继续',baseProjectionRevision:0,now:new Date('2026-09-03T00:00:00.000Z')})
 const planned=reviseTransaction(prepared,{hiddenTurns:[{turnId:'turn-recover',kind:'initial',state:'planned',sessionId:'session-recover',dshRequestId:'rpc-recover'}],activeTurnId:'turn-recover'})
 let record=reviseTransaction(planned,{hiddenTurns:[{turnId:'turn-recover',kind:'initial',state:'dispatched',sessionId:'session-recover',dshRequestId:'rpc-recover'}],activeTurnId:'turn-recover'})
 const journal={
  listOpen:vi.fn(async()=>['committed','cancelled','failed'].includes(record.status)?[]:[record]),
  prepare:vi.fn(),
  save:vi.fn(async(next:StoryTransactionRecord)=>{if(next.revision!==record.revision+1)throw new Error(`stale journal revision ${next.revision}; current ${record.revision}`);record=next;return next}),
 }
 return{save,journal,get record(){return record},set record(next:StoryTransactionRecord){record=next}}
}

const aiResult={raw:'{}',messages:[{senderId:'p-hezhou',kind:'dialogue' as const,content:'恢复完成。'}]}

describe('player transaction recovery journal refresh',()=>{
 it('preserves Host preflight operationRefs written while recoverAi waits',async()=>{
  const state=await fixture()
  const reconcile=vi.fn(async(record:StoryTransactionRecord)=>{
   expect(record.operationRefs).toEqual([{stepKey:'step-op-recover',operationId:'op-recover'}])
   expect(record.hiddenTurns[0]).toMatchObject({state:'completed',dshTurn:7})
   return{operations:[{ref:record.operationRefs[0]!,state:'applied-or-replayed',evidence:[]}],hasCanonicalEffect:true,readyForSocialCommit:true,deterministicNoEffectFailure:false,repairablePartial:false,unresolved:false}
  })
  const recover=vi.fn(async()=>{
   state.record=await state.journal.save(reviseTransaction(state.record,{operationRefs:[{stepKey:'step-op-recover',operationId:'op-recover'}]}))
   return{channelId:state.save.selectedChannelId,result:{...aiResult,dshTurn:7},turnId:'turn-recover'}
  })
  const ai={send:vi.fn(),recover,recoverFromEvidence:vi.fn(),retry:vi.fn(),continueTransaction:vi.fn(),cancel:vi.fn(),turn:vi.fn(()=>({id:'turn-recover',state:'running'})),acknowledge:vi.fn()}
  const coordinator=new PlayerTransactionCoordinator(state.journal as never,{save:vi.fn()} as never,ai as never,{reconcile} as never)

  const result=await coordinator.recover(state.save)

  expect(result?.turnId).toBe('turn-recover')
  expect(state.record.operationRefs).toEqual([{stepKey:'step-op-recover',operationId:'op-recover'}])
  expect(state.record.hiddenTurns[0]).toMatchObject({state:'completed',dshTurn:7})
  expect(state.record.canonicalResultTurnId).toBe('turn-recover')
  expect(reconcile).toHaveBeenCalledTimes(1)
 })
})
