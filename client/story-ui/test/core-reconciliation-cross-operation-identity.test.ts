import{describe,expect,it,vi}from'vitest'
import{createPreparedTransaction,reviseTransaction}from'../src/transaction-journal.ts'
import{CoreTransactionReconciler}from'../src/client/core-reconciliation.ts'

async function record(){
 const prepared=await createPreparedTransaction({transactionId:'tx-cross-op',saveId:'save-a',channelId:'scene-main',text:'继续',baseProjectionRevision:0})
 const planned=reviseTransaction(prepared,{hiddenTurns:[{turnId:'turn-a',kind:'initial',state:'planned',sessionId:'session-a'}],activeTurnId:'turn-a'})
 const dispatched=reviseTransaction(planned,{hiddenTurns:[{turnId:'turn-a',kind:'initial',state:'dispatched',sessionId:'session-a'}],activeTurnId:'turn-a'})
 const completed=reviseTransaction(dispatched,{hiddenTurns:[{turnId:'turn-a',kind:'initial',state:'completed',sessionId:'session-a'}],activeTurnId:undefined})
 return reviseTransaction(completed,{operationRefs:[{stepKey:'step-old',operationId:'op-old'},{stepKey:'step-new',operationId:'op-new'}]})
}

function evidence(operationId:string,callId:string,isError:boolean){return{sessionId:'session-a',operationId,transactionId:'tx-cross-op',toolName:'story_commit_state',argumentsCanonical:`{"changes":{"flag":true},"operation_id":"${operationId}","reason":"same","transaction_id":"tx-cross-op"}`,callId,callSeq:operationId==='op-old'?1:3,resultSeq:operationId==='op-old'?2:4,isError,result:isError?{error:'failed'}:{ok:true}}}

describe('cross-operation semantic identity',()=>{
 it('fails closed when a failed atomic mutation is replayed under a new operation id and later receives a receipt',async()=>{
  const current=await record()
  const receipts={load:vi.fn(async(_save:string,_tx:string,operationId:string)=>operationId==='op-new'?{sessionId:'session-a',receipt:{operationId:'op-new',transactionId:'tx-cross-op',operation:'story_commit_state',fingerprint:'a'.repeat(64),stateVersion:2,committedAt:'2026-09-05T00:00:00.000Z',result:{ok:true}}}:undefined)}
  const tools={load:vi.fn(async()=>[evidence('op-old','call-old',true),evidence('op-new','call-new',false)])}

  const result=await new CoreTransactionReconciler(receipts as never,tools as never).reconcile(current)

  expect(result.operations.map(item=>item.state)).toEqual(['inconsistent','inconsistent'])
  expect(result.operations.every(item=>item.detail?.includes('不同 operationId'))).toBe(true)
  expect(result.hasCanonicalEffect).toBe(true)
  expect(result.readyForSocialCommit).toBe(false)
  expect(result.repairablePartial).toBe(false)
  expect(result.unresolved).toBe(true)
 })
})
