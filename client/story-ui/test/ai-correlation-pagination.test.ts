import{describe,expect,it,vi}from'vitest'
import{StoryAiBridge}from'../src/client/ai-bridge.ts'
import{createInitialProjection}from'../src/client/initial-projection.ts'

const ok=(value:unknown,rpcId?:string)=>({...rpcId===undefined?{}:{rpcId},result:{ok:true as const,value}})

describe('correlated hidden history pagination',()=>{
 it('reconstructs a target turn when both its start and result are older than the tail page',async()=>{
  const save={...createInitialProjection(),saveId:'save-deep-correlation'}
  const values=new Map<string,string>([
   ['dsh-story-ai-session:save-deep-correlation','session-deep'],
   ['dsh-story-ai-pending:save-deep-correlation',JSON.stringify({version:1,id:'turn-deep',sessionId:'session-deep',baseline:0,channelId:save.selectedChannelId,prompt:'继续',state:'running',dshRequestId:'rpc-deep'})],
  ])
  const target='{"messages":[{"senderId":"p-hezhou","kind":"dialogue","content":"深分页恢复成功。"}]}'
  const history=vi.fn(async(payload:any)=>{
   if(payload.beforeSeq===30)return ok({events:[{event:{type:'assistant/message',seq:20,data:{turn:4,content:[{type:'text',text:target}]}}},{event:{type:'turn/end',seq:21,data:{turn:4}}}],hasMore:true})
   if(payload.beforeSeq===20)return ok({events:[{event:{type:'turn/start',seq:1,data:{turn:4,trigger:{kind:'message',source:{kind:'user',rpcId:'rpc-deep'}}}}},{event:{type:'user/message',seq:2,data:{source:{kind:'user',rpcId:'rpc-deep'},content:[{type:'text',text:'继续'}]}}}],hasMore:false})
   return ok({events:[{event:{type:'turn/start',seq:30,data:{turn:5,trigger:{kind:'message',source:{kind:'user',rpcId:'rpc-later'}}}}},{event:{type:'assistant/message',seq:31,data:{turn:5,content:[{type:'text',text:'later'}]}}},{event:{type:'turn/end',seq:32,data:{turn:5}}}],hasMore:true})
  })
  const bridge=new StoryAiBridge({sessions:{history}} as never,{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value)}},async()=>{})
  const recovered=await bridge.recover(save)
  expect(recovered).toMatchObject({turnId:'turn-deep',result:{dshTurn:4,messages:[{content:'深分页恢复成功。'}]}})
  expect(history.mock.calls.map(call=>call[0].beforeSeq??null)).toEqual([null,30,20])
  expect(bridge.turn(save.saveId)).toMatchObject({id:'turn-deep',dshTurn:4,state:'completed'})
 })

 it('keeps the reconciled native turn when structured output parsing fails',async()=>{
  const save={...createInitialProjection(),saveId:'save-failed-native-turn'}
  const values=new Map<string,string>([['dsh-story-ai-session:save-failed-native-turn','session-failed']])
  let historyCalls=0
  const history=vi.fn(async()=>{historyCalls+=1;if(historyCalls===1)return ok({events:[],hasMore:false});return ok({events:[{event:{type:'turn/start',seq:1,data:{turn:7,trigger:{kind:'message',source:{kind:'user',rpcId:'rpc-failed'}}}}},{event:{type:'assistant/message',seq:2,data:{turn:7,content:[{type:'text',text:'not-json'}]}}},{event:{type:'turn/end',seq:3,data:{turn:7}}}],hasMore:false})})
  const api={sessions:{create:vi.fn(async()=>ok({sessionId:'session-failed'})),history,prompt:vi.fn(async()=>ok({accepted:true},'rpc-failed'))},workspace:{archiveSession:vi.fn(async()=>ok({}))}}
  const bridge=new StoryAiBridge(api as never,{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value)}},async()=>{})
  await expect(bridge.send(save,save.selectedChannelId,'继续',{turnId:'turn-failed'})).rejects.toThrow('无法解析的结构化消息')
  expect(bridge.turn(save.saveId)).toMatchObject({id:'turn-failed',state:'failed',dshRequestId:'rpc-failed',dshTurn:7})
 })
})
