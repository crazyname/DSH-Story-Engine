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
  expect(evidence).toEqual([{operationId:'op-a',transactionId:'tx-a',toolName:'story_commit_state',callId:'call-a',callSeq:2,resultSeq:4,isError:false,result:{ok:true}}])
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
  ],'tx-a',new Set(['op-pending']))).toEqual([{operationId:'op-pending',transactionId:'tx-a',toolName:'story_advance_scene',callId:'pending',callSeq:7}])
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
})
