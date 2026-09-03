import{describe,expect,it,vi}from'vitest'
import{createPreparedTransaction,reviseTransaction}from'../src/transaction-journal.ts'
import{CoreTransactionReconciler}from'../src/client/core-reconciliation.ts'

async function record(){
 const prepared=await createPreparedTransaction({transactionId:'tx-session-check',saveId:'save-a',channelId:'scene-main',text:'继续',baseProjectionRevision:0})
 const planned=reviseTransaction(prepared,{hiddenTurns:[{turnId:'turn-a',kind:'initial',state:'planned',sessionId:'session-a'}],activeTurnId:'turn-a'})
 return reviseTransaction(planned,{operationRefs:[{stepKey:'step-a',operationId:'op-a'}]})
}

describe('core receipt hidden-session ownership',()=>{
 it('rejects a structurally valid receipt returned from a session not owned by the transaction journal',async()=>{
  const current=await record()
  const receipts={load:vi.fn(async()=>({sessionId:'session-other',receipt:{operationId:'op-a',transactionId:'tx-session-check',operation:'story_commit_state',fingerprint:'a'.repeat(64),stateVersion:1,committedAt:'2026-09-03T00:00:00.000Z',result:{ok:true}}}))}
  const tools={load:vi.fn(async()=>[])}

  const result=await new CoreTransactionReconciler(receipts as never,tools as never).reconcile(current)

  expect(result.operations[0]).toMatchObject({state:'inconsistent',detail:expect.stringContaining('未登记的 hidden session')})
  expect(result.hasCanonicalEffect).toBe(false)
  expect(result.readyForSocialCommit).toBe(false)
  expect(result.unresolved).toBe(true)
 })
})
