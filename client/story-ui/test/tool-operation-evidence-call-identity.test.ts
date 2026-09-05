import{describe,expect,it}from'vitest'
import{collectToolOperationEvidence}from'../src/client/tool-operation-evidence.ts'

function call(){return{event:{seq:1,type:'tool/call',data:{callId:'call-a',name:'story_commit_state',arguments:JSON.stringify({operation_id:'op-a',transaction_id:'tx-a'})}}}}
function expectedPending(){return[{operationId:'op-a',transactionId:'tx-a',toolName:'story_commit_state',argumentsCanonical:'{"operation_id":"op-a","transaction_id":"tx-a"}',callId:'call-a',callSeq:1}]}

describe('rc.2 tool result call identity completeness',()=>{
 it('does not accept a terminal result when source.callId is missing',()=>{
  const malformed={event:{seq:2,type:'tool/result',data:{message:{content:[{type:'tool-result',toolCallId:'call-a',isError:false,content:[{type:'text',text:'{"ok":true}'}]}]}}}}
  expect(collectToolOperationEvidence([call(),malformed],'tx-a',new Set(['op-a']))).toEqual(expectedPending())
 })
 it('does not accept a terminal result when toolCallId is missing',()=>{
  const malformed={event:{seq:2,type:'tool/result',data:{message:{source:{kind:'tool',callId:'call-a'},content:[{type:'tool-result',isError:false,content:[{type:'text',text:'{"ok":true}'}]}]}}}}
  expect(collectToolOperationEvidence([call(),malformed],'tx-a',new Set(['op-a']))).toEqual(expectedPending())
 })
})
