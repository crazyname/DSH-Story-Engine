import{describe,expect,it,vi}from'vitest'
import{createPreparedTransaction,reviseTransaction}from'../src/transaction-journal.ts'
import{CoreTransactionReconciler}from'../src/client/core-reconciliation.ts'

async function record(operationIds:string[]){
 const prepared=await createPreparedTransaction({transactionId:'tx-core-reconcile',saveId:'save-a',channelId:'scene-main',text:'继续',baseProjectionRevision:0})
 const planned=reviseTransaction(prepared,{hiddenTurns:[{turnId:'turn-a',kind:'initial',state:'planned',sessionId:'session-a'}],activeTurnId:'turn-a'})
 const dispatched=reviseTransaction(planned,{hiddenTurns:[{turnId:'turn-a',kind:'initial',state:'dispatched',sessionId:'session-a'}],activeTurnId:'turn-a'})
 const completed=reviseTransaction(dispatched,{hiddenTurns:[{turnId:'turn-a',kind:'initial',state:'completed',sessionId:'session-a'}],activeTurnId:undefined})
 return reviseTransaction(completed,{operationRefs:operationIds.map((operationId,index)=>({stepKey:`step-${index}`,operationId}))})
}
function receipt(operationId:string){return{sessionId:'session-a',receipt:{operationId,transactionId:'tx-core-reconcile',operation:'story_commit_state',fingerprint:'a'.repeat(64),stateVersion:1,committedAt:'2026-09-03T00:00:00.000Z',result:{ok:true}}}}
function evidence(operationId:string,input:{sessionId?:string;toolName?:string;argumentsCanonical?:string;callId?:string;isError?:boolean;result?:unknown;pending?:boolean}={}){return{sessionId:input.sessionId??'session-a',operationId,transactionId:'tx-core-reconcile',toolName:input.toolName??'story_commit_state',argumentsCanonical:input.argumentsCanonical??`{"operation_id":"${operationId}","transaction_id":"tx-core-reconcile"}`,callId:input.callId??`call-${operationId}-${input.sessionId??'session-a'}`,callSeq:1,...(input.pending?{}:{resultSeq:2,isError:input.isError??false,result:input.result??{ok:true}})}}

describe('core transaction reconciliation',()=>{
 it('treats matching receipts as authoritative applied/replayed evidence while still checking durable tool identities',async()=>{
  const current=await record(['op-a','op-b'])
  const receipts={load:vi.fn(async(_save:string,_tx:string,operationId:string)=>receipt(operationId))}
  const tools={load:vi.fn(async()=>[])}
  const result=await new CoreTransactionReconciler(receipts as never,tools as never).reconcile(current)
  expect(result.operations.map(item=>item.state)).toEqual(['applied-or-replayed','applied-or-replayed'])
  expect(result).toMatchObject({hasCanonicalEffect:true,readyForSocialCommit:true,deterministicNoEffectFailure:false,repairablePartial:false,unresolved:false})
  expect(tools.load).toHaveBeenCalledWith(['session-a'],'tx-core-reconcile',['op-a','op-b'])
 })

 it('fails closed when a receipt-backed operation id is reused with different durable arguments',async()=>{
  const current=await record(['op-a'])
  const receipts={load:vi.fn(async()=>receipt('op-a'))}
  const tools={load:vi.fn(async()=>[
   evidence('op-a',{argumentsCanonical:'{"changes":{"a":1},"operation_id":"op-a","transaction_id":"tx-core-reconcile"}',callId:'call-one'}),
   evidence('op-a',{argumentsCanonical:'{"changes":{"a":2},"operation_id":"op-a","transaction_id":"tx-core-reconcile"}',callId:'call-two',isError:true,result:{error:'idempotency conflict'}}),
  ])}
  const result=await new CoreTransactionReconciler(receipts as never,tools as never).reconcile(current)
  expect(result.operations[0]).toMatchObject({state:'inconsistent',detail:expect.stringContaining('不同 tool 或 arguments')})
  expect(result.readyForSocialCommit).toBe(false)
  expect(result.unresolved).toBe(true)
 })

 it('accepts only the known successful work-event escalation as skipped',async()=>{
  const current=await record(['op-skip'])
  const receipts={load:vi.fn(async()=>undefined)}
  const tools={load:vi.fn(async()=>[evidence('op-skip',{toolName:'story_record_work_event',result:{escalated:true,recorded:false}})])}
  const result=await new CoreTransactionReconciler(receipts as never,tools as never).reconcile(current)
  expect(result.operations[0]?.state).toBe('skipped')
  expect(result.readyForSocialCommit).toBe(true)
  expect(result.hasCanonicalEffect).toBe(false)
 })

 it('does not declare skipped while a matching retry call remains pending',async()=>{
  const current=await record(['op-skip'])
  const same='{"event_id":"e1","operation_id":"op-skip","transaction_id":"tx-core-reconcile"}'
  const receipts={load:vi.fn(async()=>undefined)}
  const tools={load:vi.fn(async()=>[
   evidence('op-skip',{toolName:'story_record_work_event',argumentsCanonical:same,callId:'call-done',result:{escalated:true,recorded:false}}),
   evidence('op-skip',{toolName:'story_record_work_event',argumentsCanonical:same,callId:'call-pending',pending:true}),
  ])}
  const result=await new CoreTransactionReconciler(receipts as never,tools as never).reconcile(current)
  expect(result.operations[0]?.state).toBe('pending')
  expect(result.readyForSocialCommit).toBe(false)
  expect(result.unresolved).toBe(true)
 })

 it('fails closed when a no-receipt operation id is reused with different canonical arguments',async()=>{
  const current=await record(['op-skip'])
  const receipts={load:vi.fn(async()=>undefined)}
  const tools={load:vi.fn(async()=>[
   evidence('op-skip',{toolName:'story_record_work_event',argumentsCanonical:'{"event_id":"e1","operation_id":"op-skip","transaction_id":"tx-core-reconcile"}',callId:'call-one',result:{escalated:true,recorded:false}}),
   evidence('op-skip',{toolName:'story_record_work_event',argumentsCanonical:'{"event_id":"e2","operation_id":"op-skip","transaction_id":"tx-core-reconcile"}',callId:'call-two',isError:true,result:{error:'preflight conflict'}}),
  ])}
  const result=await new CoreTransactionReconciler(receipts as never,tools as never).reconcile(current)
  expect(result.operations[0]).toMatchObject({state:'inconsistent',detail:expect.stringContaining('不同 tool 或 arguments')})
  expect(result.unresolved).toBe(true)
 })

 it('classifies deterministic no-effect failure without inventing a canonical effect',async()=>{
  const current=await record(['op-fail'])
  const receipts={load:vi.fn(async()=>undefined)}
  const tools={load:vi.fn(async()=>[evidence('op-fail',{isError:true,result:{error:'rejected'}})])}
  const result=await new CoreTransactionReconciler(receipts as never,tools as never).reconcile(current)
  expect(result.operations[0]?.state).toBe('failed')
  expect(result).toMatchObject({hasCanonicalEffect:false,readyForSocialCommit:false,deterministicNoEffectFailure:true,repairablePartial:false,unresolved:false})
 })

 it('marks receipt plus explicit failed operation as repairable partial commit',async()=>{
  const current=await record(['op-applied','op-failed'])
  const receipts={load:vi.fn(async(_save:string,_tx:string,operationId:string)=>operationId==='op-applied'?receipt(operationId):undefined)}
  const tools={load:vi.fn(async()=>[evidence('op-failed',{isError:true,result:{error:'retry me'}})])}
  const result=await new CoreTransactionReconciler(receipts as never,tools as never).reconcile(current)
  expect(result.operations.map(item=>item.state)).toEqual(['applied-or-replayed','failed'])
  expect(result).toMatchObject({hasCanonicalEffect:true,readyForSocialCommit:false,deterministicNoEffectFailure:false,repairablePartial:true,unresolved:false})
 })

 it('keeps pending tool calls unresolved and never labels them repairable',async()=>{
  const current=await record(['op-applied','op-pending'])
  const receipts={load:vi.fn(async(_save:string,_tx:string,operationId:string)=>operationId==='op-applied'?receipt(operationId):undefined)}
  const tools={load:vi.fn(async()=>[evidence('op-pending',{pending:true})])}
  const result=await new CoreTransactionReconciler(receipts as never,tools as never).reconcile(current)
  expect(result.operations[1]?.state).toBe('pending')
  expect(result).toMatchObject({hasCanonicalEffect:true,readyForSocialCommit:false,repairablePartial:false,unresolved:true})
 })

 it('fails closed on successful mutating tool result without a receipt when it is not a known skip',async()=>{
  const current=await record(['op-inconsistent'])
  const receipts={load:vi.fn(async()=>undefined)}
  const tools={load:vi.fn(async()=>[evidence('op-inconsistent',{result:{ok:true}})])}
  const result=await new CoreTransactionReconciler(receipts as never,tools as never).reconcile(current)
  expect(result.operations[0]).toMatchObject({state:'inconsistent',detail:expect.stringContaining('缺少 matching Core receipt')})
  expect(result.unresolved).toBe(true)
 })

 it('fails closed when one operation has evidence in multiple hidden sessions',async()=>{
  const current=await record(['op-duplicate'])
  const receipts={load:vi.fn(async()=>undefined)}
  const tools={load:vi.fn(async()=>[evidence('op-duplicate',{sessionId:'session-a'}),evidence('op-duplicate',{sessionId:'session-b'})])}
  const result=await new CoreTransactionReconciler(receipts as never,tools as never).reconcile(current)
  expect(result.operations[0]).toMatchObject({state:'inconsistent',detail:expect.stringContaining('多个 hidden session')})
  expect(result.unresolved).toBe(true)
 })
})
