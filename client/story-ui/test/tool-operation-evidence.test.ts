import{describe,expect,it}from'vitest'
import{collectToolOperationEvidence,isKnownSkippedStoryResult}from'../src/client/tool-operation-evidence.ts'

function call(seq:number,callId:string,name:string,args:Record<string,unknown>){return{event:{seq,type:'tool/call',data:{turn:1,step:1,callId,name,arguments:JSON.stringify(args)}}}}
function result(seq:number,callId:string,isError:boolean,value:unknown){return{event:{seq,type:'tool/result',data:{turn:1,step:1,message:{source:{kind:'tool',callId},content:[{type:'tool-result',toolCallId:callId,isError,content:[{type:'text',text:JSON.stringify(value)}]}]}}}}}

describe('rc.2 durable tool operation evidence',()=>{
 it('pairs transaction-owned tool/call and tool/result by callId',()=>{
  const evidence=collectToolOperationEvidence([
   result(4,'call-a',false,{ok:true}),
   call(2,'call-a','story_commit_state',{operation_id:'op-a',transaction_id:'tx-a'}),
  ],'tx-a',new Set(['op-a']))
  expect(evidence).toEqual([{operationId:'op-a',transactionId:'tx-a',toolName:'story_commit_state',argumentsCanonical:'{"operation_id":"op-a","transaction_id":"tx-a"}',callId:'call-a',callSeq:2,resultSeq:4,isError:false,result:{ok:true}}])
 })

 it('canonicalizes argument object key order for retry identity comparison',()=>{
  const evidence=collectToolOperationEvidence([
   call(1,'one','story_commit_state',{transaction_id:'tx-a',reason:'same',operation_id:'op-a'}),
   result(2,'one',true,{error:'first'}),
   call(3,'two','story_commit_state',{operation_id:'op-a',reason:'same',transaction_id:'tx-a'}),
   result(4,'two',true,{error:'second'}),
  ],'tx-a',new Set(['op-a']))
  expect(new Set(evidence.map(item=>item.argumentsCanonical)).size).toBe(1)
 })

 it('ignores expected_version changes because optimistic version is not part of the D1 operation fingerprint',()=>{
  const evidence=collectToolOperationEvidence([
   call(1,'old-version','story_commit_state',{operation_id:'op-a',transaction_id:'tx-a',expected_version:3,reason:'same',changes:{flag:true}}),
   result(2,'old-version',true,{error:'stale'}),
   call(3,'new-version','story_commit_state',{operation_id:'op-a',transaction_id:'tx-a',expected_version:4,reason:'same',changes:{flag:true}}),
   result(4,'new-version',true,{error:'still failed'}),
  ],'tx-a',new Set(['op-a']))
  expect(new Set(evidence.map(item=>item.argumentsCanonical)).size).toBe(1)
  expect(evidence[0]?.argumentsCanonical).not.toContain('expected_version')
 })

 it('ignores calls belonging to another transaction or operation set',()=>{
  const evidence=collectToolOperationEvidence([
   call(1,'wrong-tx','story_commit_state',{operation_id:'op-a',transaction_id:'tx-other'}),
   call(2,'wrong-op','story_commit_state',{operation_id:'op-b',transaction_id:'tx-a'}),
   result(3,'wrong-tx',false,{ok:true}),result(4,'wrong-op',false,{ok:true}),
  ],'tx-a',new Set(['op-a']))
  expect(evidence).toEqual([])
 })

 it('retains a durable pending call when no terminal result exists',()=>{
  expect(collectToolOperationEvidence([
   call(7,'pending','story_advance_scene',{operation_id:'op-pending',transaction_id:'tx-a'}),
  ],'tx-a',new Set(['op-pending']))).toEqual([{operationId:'op-pending',transactionId:'tx-a',toolName:'story_advance_scene',argumentsCanonical:'{"operation_id":"op-pending","transaction_id":"tx-a"}',callId:'pending',callSeq:7}])
 })

 it('recognizes only the high-impact work-event escalation as a known successful skip',()=>{
  const [skipped]=collectToolOperationEvidence([
   call(1,'skip','story_record_work_event',{operation_id:'op-skip',transaction_id:'tx-a'}),
   result(2,'skip',false,{escalated:true,recorded:false}),
  ],'tx-a',new Set(['op-skip']))
  expect(skipped).toBeDefined()
  expect(isKnownSkippedStoryResult(skipped!)).toBe(true)

  const [ordinary]=collectToolOperationEvidence([
   call(3,'ordinary','story_commit_state',{operation_id:'op-normal',transaction_id:'tx-a'}),
   result(4,'ordinary',false,{ok:true}),
  ],'tx-a',new Set(['op-normal']))
  expect(isKnownSkippedStoryResult(ordinary!)).toBe(false)
 })

 it('fails closed when one callId acquires conflicting durable result identities',()=>{
  expect(()=>collectToolOperationEvidence([
   call(1,'dup','story_commit_state',{operation_id:'op-a',transaction_id:'tx-a'}),
   result(2,'dup',false,{ok:true}),
   result(3,'dup',true,{error:'late conflict'}),
  ],'tx-a',new Set(['op-a']))).toThrow('tool result identity 冲突')
 })

 it('fails closed when rc.2 result source and tool-result block disagree on callId',()=>{
  const corrupted={event:{seq:2,type:'tool/result',data:{message:{source:{kind:'tool',callId:'call-a'},content:[{type:'tool-result',toolCallId:'call-b',isError:false,content:[{type:'text',text:'{"ok":true}'}]}]}}}}
  expect(()=>collectToolOperationEvidence([
   call(1,'call-a','story_commit_state',{operation_id:'op-a',transaction_id:'tx-a'}),
   corrupted,
  ],'tx-a',new Set(['op-a']))).toThrow('call identity 冲突')
 })
})
