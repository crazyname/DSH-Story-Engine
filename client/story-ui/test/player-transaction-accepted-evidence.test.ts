import{describe,expect,it,vi}from'vitest'
import{createPreparedTransaction,type StoryTransactionRecord}from'../src/transaction-journal.ts'
import{PlayerTransactionCoordinator}from'../src/client/player-transaction-coordinator.ts'
import{appendPlayerMessage}from'../src/client/story-domain.ts'
import{createInitialProjection}from'../src/client/initial-projection.ts'

describe('accepted hidden dispatch evidence recovery',()=>{
 it('retains the accepted rpcId when the dispatched journal revision fails',async()=>{
  let record:StoryTransactionRecord|undefined
  let failAcceptedWrite=true
  const journal={
   listOpen:vi.fn(async()=>record===undefined?[]:[record]),
   prepare:vi.fn(async(input:any)=>{record=await createPreparedTransaction({...input,transactionId:'tx-accepted-failure'});return record}),
   save:vi.fn(async(next:StoryTransactionRecord)=>{if(failAcceptedWrite&&next.status==='prepared'&&next.hiddenTurns.at(-1)?.state==='dispatched'){failAcceptedWrite=false;throw new Error('accepted journal write failed')}record=next;return next}),
  }
  const base={...createInitialProjection(),saveId:'save-accepted-failure'}
  const projection=appendPlayerMessage(base,base.selectedChannelId,'继续')
  const ai={
   send:vi.fn(async(_save:any,_channel:string,_input:string,hooks:any)=>{const evidence={turnId:hooks.turnId,sessionId:'session-accepted',baseline:5,dshRequestId:'rpc-accepted'};await hooks.beforeDispatch({...evidence,dshRequestId:undefined});try{await hooks.afterAccepted(evidence)}catch(error){await hooks.afterUncertain(evidence,error);throw error}throw new Error('unreachable')}),
   recover:vi.fn(),retry:vi.fn(),cancel:vi.fn(),acknowledge:vi.fn(),turn:vi.fn(()=>({id:record?.activeTurnId,sessionId:'session-accepted',baseline:5,state:'running',dshRequestId:'rpc-accepted'})),
  }
  const coordinator=new PlayerTransactionCoordinator(journal as never,{save:vi.fn(async()=>{})} as never,ai as never)
  await expect(coordinator.send(projection,projection.selectedChannelId,'继续')).rejects.toThrow('accepted journal write failed')
  expect(record).toMatchObject({status:'needs-recovery',hiddenTurns:[{kind:'initial',state:'uncertain',sessionId:'session-accepted',dshRequestId:'rpc-accepted'}],diagnostic:{code:'hidden-dispatch-uncertain',message:'accepted journal write failed'}})
 })
})
