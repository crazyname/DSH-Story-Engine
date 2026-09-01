import{describe,expect,it,vi}from'vitest'
import{createPreparedTransaction,reviseTransaction,type StoryTransactionRecord}from'../src/transaction-journal.ts'
import{PlayerTransactionCoordinator}from'../src/client/player-transaction-coordinator.ts'
import{createInitialProjection}from'../src/client/initial-projection.ts'

async function failedOpenRecord(saveId:string,channelId:string):Promise<StoryTransactionRecord>{
 const prepared=await createPreparedTransaction({transactionId:'tx-retry',saveId,channelId,text:'继续',baseProjectionRevision:0})
 const planned=reviseTransaction(prepared,{hiddenTurns:[{turnId:'turn-initial',kind:'initial',state:'planned',sessionId:'session-retry'}],activeTurnId:'turn-initial'})
 const dispatched=reviseTransaction(planned,{hiddenTurns:[{turnId:'turn-initial',kind:'initial',state:'dispatched',sessionId:'session-retry',dshRequestId:'rpc-initial'}],activeTurnId:'turn-initial'})
 return reviseTransaction(dispatched,{status:'needs-recovery',diagnostic:{code:'hidden-recovery-failed',message:'invalid structured result'}})
}

describe('same transaction hidden retry',()=>{
 it('terminalizes a failed hidden turn and appends one retry under the same transaction',async()=>{
  const projection={...createInitialProjection(),saveId:'save-retry'}
  let record=await failedOpenRecord(projection.saveId,projection.selectedChannelId)
  const journal={listOpen:vi.fn(async()=>[record]),prepare:vi.fn(),save:vi.fn(async(next:StoryTransactionRecord)=>{record=next;return next})}
  const acknowledge=vi.fn()
  const retry=vi.fn(async(_projection:any,hooks:any)=>{const evidence={turnId:hooks.turnId,sessionId:'session-retry',baseline:20};await hooks.beforeDispatch(evidence);await hooks.afterAccepted({...evidence,dshRequestId:'rpc-retry'});return{raw:'{}',messages:[{senderId:'p-hezhou',kind:'dialogue' as const,content:'重试成功。'}],turnId:evidence.turnId,dshTurn:5}})
  const ai={send:vi.fn(),recover:vi.fn(),retry,cancel:vi.fn(),acknowledge,turn:vi.fn(()=>({version:1,id:'turn-initial',sessionId:'session-retry',baseline:10,channelId:projection.selectedChannelId,prompt:'original',state:'failed' as const,dshRequestId:'rpc-initial',dshTurn:4,error:'invalid structured result'}))}
  const coordinator=new PlayerTransactionCoordinator(journal as never,{save:vi.fn()} as never,ai as never)
  const result=await coordinator.retry(projection)
  expect(retry).toHaveBeenCalledTimes(1)
  expect(result.turnId).toMatch(/^turn-/)
  expect(record).toMatchObject({transactionId:'tx-retry',status:'needs-recovery',canonicalResultTurnId:result.turnId,hiddenTurns:[{turnId:'turn-initial',kind:'initial',state:'failed',sessionId:'session-retry',dshRequestId:'rpc-initial',dshTurn:4},{turnId:result.turnId,kind:'retry',state:'completed',sessionId:'session-retry',dshRequestId:'rpc-retry',dshTurn:5}]})
  expect(record.activeTurnId).toBeUndefined()
  await coordinator.acknowledge(projection.saveId,result.turnId!)
  expect(record.status).toBe('committed')
  expect(acknowledge).toHaveBeenCalledWith(projection.saveId,result.turnId)
 })

 it('does not treat a cancelled hidden turn as retryable before D2c reconciliation',async()=>{
  const projection={...createInitialProjection(),saveId:'save-cancelled-retry'}
  const prepared=await createPreparedTransaction({transactionId:'tx-cancelled-retry',saveId:projection.saveId,channelId:projection.selectedChannelId,text:'继续',baseProjectionRevision:0})
  const planned=reviseTransaction(prepared,{hiddenTurns:[{turnId:'turn-cancelled',kind:'initial',state:'planned',sessionId:'session-cancelled'}],activeTurnId:'turn-cancelled'})
  let record=reviseTransaction(planned,{status:'needs-recovery',hiddenTurns:[{turnId:'turn-cancelled',kind:'initial',state:'cancelled',sessionId:'session-cancelled'}],activeTurnId:undefined,diagnostic:{code:'cancelled-after-hidden-dispatch',message:'needs core reconciliation'}})
  const retry=vi.fn()
  const ai={send:vi.fn(),recover:vi.fn(),retry,cancel:vi.fn(),acknowledge:vi.fn(),turn:vi.fn(()=>({version:1,id:'turn-cancelled',sessionId:'session-cancelled',baseline:1,channelId:projection.selectedChannelId,prompt:'original',state:'cancelled' as const}))}
  const coordinator=new PlayerTransactionCoordinator({listOpen:vi.fn(async()=>[record]),prepare:vi.fn(),save:vi.fn(async(next:StoryTransactionRecord)=>{record=next;return next})} as never,{save:vi.fn()} as never,ai as never)
  await expect(coordinator.retry(projection)).rejects.toThrow('D2c')
  expect(retry).not.toHaveBeenCalled()
  expect(record.hiddenTurns).toHaveLength(1)
 })
})
