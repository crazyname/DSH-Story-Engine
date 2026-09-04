import{describe,expect,it,vi}from'vitest'
import{createPreparedTransaction,reviseTransaction}from'../src/transaction-journal.ts'
import{CoreTransactionReconciler}from'../src/client/core-reconciliation.ts'

async function transactionWithOperation(){
 const prepared=await createPreparedTransaction({transactionId:'tx-receipt-pending',saveId:'save-a',channelId:'scene-main',text:'继续',baseProjectionRevision:0})
 const planned=reviseTransaction(prepared,{hiddenTurns:[{turnId:'turn-a',kind:'initial',state:'planned',sessionId:'session-a'}],activeTurnId:'turn-a'})
 const dispatched=reviseTransaction(planned,{hiddenTurns:[{turnId:'turn-a',kind:'initial',state:'dispatched',sessionId:'session-a'}],activeTurnId:'turn-a'})
 const completed=reviseTransaction(dispatched,{hiddenTurns:[{turnId:'turn-a',kind:'initial',state:'completed',sessionId:'session-a'}],activeTurnId:undefined})
 return reviseTransaction(completed,{operationRefs:[{stepKey:'step-a',operationId:'op-a'}]})
}

describe('receipt-backed pending core attempt',()=>{
 it('keeps social commit blocked without forgetting the confirmed canonical effect',async()=>{
  const record=await transactionWithOperation()
  const receipts={load:vi.fn(async()=>({sessionId:'session-a',receipt:{operationId:'op-a',transactionId:'tx-receipt-pending',operation:'story_commit_state',fingerprint:'a'.repeat(64),stateVersion:1,committedAt:'2026-09-04T00:00:00.000Z',result:{ok:true}}}))}
  const tools={load:vi.fn(async()=>[{sessionId:'session-a',operationId:'op-a',transactionId:'tx-receipt-pending',toolName:'story_commit_state',argumentsCanonical:'{"operation_id":"op-a","transaction_id":"tx-receipt-pending"}',callId:'call-retry',callSeq:3}])}
  const result=await new CoreTransactionReconciler(receipts as never,tools as never).reconcile(record)
  expect(result.operations[0]).toMatchObject({state:'pending',receipt:{operationId:'op-a'},detail:expect.stringContaining('仍有 matching tool attempt 未终态')})
  expect(result).toMatchObject({hasCanonicalEffect:true,readyForSocialCommit:false,deterministicNoEffectFailure:false,repairablePartial:false,unresolved:true})
 })
})
