import{describe,expect,it,vi}from'vitest'
import{DshToolEvidenceReader}from'../src/client/dsh-tool-evidence.ts'

function call(seq:number,callId:string){return{event:{seq,type:'tool/call',data:{callId,name:'story_commit_state',arguments:JSON.stringify({operation_id:'op-a',transaction_id:'tx-a'})}}}}
function result(seq:number,callId:string){return{event:{seq,type:'tool/result',data:{message:{source:{kind:'tool',callId},content:[{type:'tool-result',toolCallId:callId,isError:false,content:[{type:'text',text:'{"ok":true}'}]}]}}}}}

describe('DSH durable tool evidence reader',()=>{
 it('walks rc.2 history backward until call and result evidence can be paired',async()=>{
  const history=vi.fn(async(payload:any)=>{
   if(payload.beforeSeq===undefined)return{result:{ok:true as const,value:{events:[result(20,'call-a')],hasMore:true}}}
   expect(payload.beforeSeq).toBe(20)
   return{result:{ok:true as const,value:{events:[call(10,'call-a')],hasMore:false}}}
  })
  const reader=new DshToolEvidenceReader({sessions:{history}} as never)
  await expect(reader.load(['session-a'],'tx-a',['op-a'])).resolves.toEqual([{
   sessionId:'session-a',operationId:'op-a',transactionId:'tx-a',toolName:'story_commit_state',argumentsCanonical:'{"operation_id":"op-a","transaction_id":"tx-a"}',callId:'call-a',callSeq:10,resultSeq:20,isError:false,result:{ok:true},
  }])
  expect(history).toHaveBeenCalledTimes(2)
 })

 it('preserves evidence from distinct hidden sessions for conflict detection upstream',async()=>{
  const history=vi.fn(async(payload:any)=>({result:{ok:true as const,value:{events:[call(1,`call-${payload.sessionId}`),result(2,`call-${payload.sessionId}`)],hasMore:false}}}))
  const reader=new DshToolEvidenceReader({sessions:{history}} as never)
  const evidence=await reader.load(['session-a','session-b'],'tx-a',['op-a'])
  expect(evidence.map(item=>item.sessionId)).toEqual(['session-a','session-b'])
 })

 it('fails closed when a paginated page cannot provide a valid seq boundary',async()=>{
  const history=vi.fn(async()=>({result:{ok:true as const,value:{events:[{event:{type:'tool/result',data:{}}}],hasMore:true}}}))
  const reader=new DshToolEvidenceReader({sessions:{history}} as never)
  await expect(reader.load(['session-a'],'tx-a',['op-a'])).rejects.toThrow('分页缺少有效 seq')
 })
})
