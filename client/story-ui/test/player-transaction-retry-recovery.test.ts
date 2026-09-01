import{describe,expect,it,vi}from'vitest'
import{createPreparedTransaction,reviseTransaction,type StoryTransactionRecord}from'../src/transaction-journal.ts'
import{PlayerTransactionCoordinator}from'../src/client/player-transaction-coordinator.ts'
import{appendAiMessages}from'../src/client/story-domain.ts'
import{createInitialProjection}from'../src/client/initial-projection.ts'

async function openInitial(saveId:string,channelId:string):Promise<StoryTransactionRecord>{
 const prepared=await createPreparedTransaction({transactionId:'tx-retry-recovery',saveId,channelId,text:'继续',baseProjectionRevision:0})
 const planned=reviseTransaction(prepared,{hiddenTurns:[{turnId:'turn-initial',kind:'initial',state:'planned',sessionId:'session-retry'}],activeTurnId:'turn-initial'})
 const dispatched=reviseTransaction(planned,{hiddenTurns:[{turnId:'turn-initial',kind:'initial',state:'dispatched',sessionId:'session-retry',dshRequestId:'rpc-initial'}],activeTurnId:'turn-initial'})
 return reviseTransaction(dispatched,{status:'needs-recovery',diagnostic:{code:'hidden-recovery-failed',message:'initial structured result failed'}})
}

describe('retry recovery matrix',()=>{
 it('updates retry uncertainty diagnostics and recovers the same retry without creating another hidden turn',async()=>{
  const projection={...createInitialProjection(),saveId:'save-retry-uncertain'}
  let record=await openInitial(projection.saveId,projection.selectedChannelId)
  let local:any={version:1,id:'turn-initial',sessionId:'session-retry',baseline:10,channelId:projection.selectedChannelId,prompt:'original',state:'failed',dshRequestId:'rpc-initial',dshTurn:4,error:'initial structured result failed'}
  let retryTurnId:string|undefined
  const journal={listOpen:vi.fn(async()=>[record]),prepare:vi.fn(),save:vi.fn(async(next:StoryTransactionRecord)=>{record=next;return next})}
  const retry=vi.fn(async(_projection:any,hooks:any)=>{const evidence={turnId:hooks.turnId,sessionId:'session-retry',baseline:20};retryTurnId=evidence.turnId;await hooks.beforeDispatch(evidence);await hooks.afterAccepted({...evidence,dshRequestId:'rpc-retry'});local={version:1,id:evidence.turnId,sessionId:'session-retry',baseline:20,channelId:projection.selectedChannelId,prompt:'retry',state:'uncertain',dshRequestId:'rpc-retry',error:'history offline during retry'};throw new Error('history offline during retry')})
  const recover=vi.fn(async()=>({channelId:projection.selectedChannelId,turnId:retryTurnId!,result:{raw:'{}',messages:[{senderId:'p-hezhou',kind:'dialogue' as const,content:'恢复成功。'}],dshTurn:5}}))
  const acknowledge=vi.fn()
  const ai={send:vi.fn(),recover,retry,cancel:vi.fn(),acknowledge,turn:vi.fn(()=>local)}
  const coordinator=new PlayerTransactionCoordinator(journal as never,{save:vi.fn()} as never,ai as never)
  await expect(coordinator.retry(projection)).rejects.toThrow('history offline during retry')
  expect(retryTurnId).toBeDefined()
  expect(record).toMatchObject({status:'needs-recovery',activeTurnId:retryTurnId,diagnostic:{code:'hidden-recovery-failed',message:'history offline during retry'},hiddenTurns:[{turnId:'turn-initial',kind:'initial',state:'failed',dshTurn:4},{turnId:retryTurnId,kind:'retry',state:'dispatched',dshRequestId:'rpc-retry'}]})
  const hiddenCount=record.hiddenTurns.length
  const recovered=await coordinator.recover(projection)
  expect(recovered?.turnId).toBe(retryTurnId)
  expect(retry).toHaveBeenCalledTimes(1)
  expect(record.hiddenTurns).toHaveLength(hiddenCount)
  expect(record).toMatchObject({status:'needs-recovery',canonicalResultTurnId:retryTurnId,activeTurnId:undefined,diagnostic:undefined,hiddenTurns:[{turnId:'turn-initial',state:'failed'},{turnId:retryTurnId,kind:'retry',state:'completed',dshTurn:5}]})
  await coordinator.acknowledge(projection.saveId,retryTurnId!)
  expect(record.status).toBe('committed')
  expect(acknowledge).toHaveBeenCalledWith(projection.saveId,retryTurnId)
 })

 it('finalizes a completed retry from durable projection even when browser pending state is gone',async()=>{
  const base={...createInitialProjection(),saveId:'save-retry-projected'}
  const prepared=await createPreparedTransaction({transactionId:'tx-retry-projected',saveId:base.saveId,channelId:base.selectedChannelId,text:'继续',baseProjectionRevision:0})
  const initialPlanned=reviseTransaction(prepared,{hiddenTurns:[{turnId:'turn-initial',kind:'initial',state:'planned',sessionId:'session-retry'}],activeTurnId:'turn-initial'})
  const initialDispatched=reviseTransaction(initialPlanned,{hiddenTurns:[{turnId:'turn-initial',kind:'initial',state:'dispatched',sessionId:'session-retry',dshRequestId:'rpc-initial'}],activeTurnId:'turn-initial'})
  const initialFailed=reviseTransaction(initialDispatched,{status:'needs-recovery',hiddenTurns:[{turnId:'turn-initial',kind:'initial',state:'failed',sessionId:'session-retry',dshRequestId:'rpc-initial',dshTurn:4}],activeTurnId:undefined,diagnostic:{code:'hidden-failed',message:'initial failed'}})
  const retryPlanned=reviseTransaction(initialFailed,{hiddenTurns:[...initialFailed.hiddenTurns,{turnId:'turn-retry',kind:'retry',state:'planned',sessionId:'session-retry'}],activeTurnId:'turn-retry'})
  const retryDispatched=reviseTransaction(retryPlanned,{hiddenTurns:[retryPlanned.hiddenTurns[0]!,{turnId:'turn-retry',kind:'retry',state:'dispatched',sessionId:'session-retry',dshRequestId:'rpc-retry'}],activeTurnId:'turn-retry'})
  let record=reviseTransaction(retryDispatched,{hiddenTurns:[retryDispatched.hiddenTurns[0]!,{turnId:'turn-retry',kind:'retry',state:'completed',sessionId:'session-retry',dshRequestId:'rpc-retry',dshTurn:5}],activeTurnId:undefined,canonicalResultTurnId:'turn-retry',diagnostic:undefined})
  const durable=appendAiMessages(base,base.selectedChannelId,[{senderId:'p-hezhou',kind:'dialogue',content:'Host 已保存。'}],new Date('2026-09-01T05:00:00.000Z'),'turn-retry')
  const recover=vi.fn()
  const acknowledge=vi.fn()
  const ai={send:vi.fn(),recover,retry:vi.fn(),cancel:vi.fn(),acknowledge,turn:vi.fn(()=>null)}
  const journal={listOpen:vi.fn(async()=>[record]),prepare:vi.fn(),save:vi.fn(async(next:StoryTransactionRecord)=>{record=next;return next})}
  const coordinator=new PlayerTransactionCoordinator(journal as never,{save:vi.fn()} as never,ai as never)
  await expect(coordinator.recover(durable)).resolves.toBeNull()
  expect(recover).not.toHaveBeenCalled()
  expect(acknowledge).toHaveBeenCalledWith(base.saveId,'turn-retry')
  expect(record.status).toBe('committed')
  expect(record.canonicalResultTurnId).toBe('turn-retry')
  expect(record.hiddenTurns[0]?.state).toBe('failed')
 })
})
