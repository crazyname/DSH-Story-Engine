import{describe,expect,it}from'vitest'
import{collectToolOperationEvidence}from'../src/client/tool-operation-evidence.ts'

describe('rc.2 tool result call identity completeness',()=>{
 it('does not accept a terminal result when source.callId is missing',()=>{
  const call={event:{seq:1,type:'tool/call',data:{callId:'call-a',name:'story_commit_state',arguments:JSON.stringify({operation_id:'op-a',transaction_id:'tx-a'})}}}
  const malformed={event:{seq:2,type:'tool/result',data:{message:{content:[{type:'tool-result',toolCallId:'call-a',isError:false,content:[{type:'text',text:'{"ok":true}'}]}]}}}}
  const evidence=collectToolOperationEvidence([call,malformed],'tx-a',new Set(['op-a']))
  expect(evidence).toEqual([{operationId:'op-a',transactionId:'tx-a',toolName:'story_commit_state',argumentsCanonical:'{"operation_id":"op-a","transaction_id":"tx-a"}',callId:'call-a',callSeq:1}])
 })
})
