import{describe,expect,it,vi}from'vitest'
import{StoryAiBridge}from'../src/client/ai-bridge.ts'
import{createInitialProjection}from'../src/client/initial-projection.ts'

const ok=(value:unknown)=>({result:{ok:true as const,value}})

describe('hidden transaction control context',()=>{
 it('keeps the same transaction id in initial and retry prompts without repeating player input',async()=>{
  const values=new Map<string,string>([['dsh-story-ai-session:save-tx-context','session-tx-context']])
  const prompt=vi.fn(async(_payload:any)=>ok({accepted:true}))
  let history=0
  const raw='{"messages":[{"senderId":"p-hezhou","kind":"dialogue","content":"收到。"}]}'
  const api={sessions:{
   create:vi.fn(async()=>ok({sessionId:'session-tx-context'})),
   history:vi.fn(async()=>{history+=1;if(history===1)return ok({events:[]});if(history===2)return ok({events:[{event:{type:'turn/end',seq:2,data:{}}}]});if(history===3)return ok({events:[{event:{type:'turn/end',seq:2,data:{}}}]});return ok({events:[{event:{type:'turn/end',seq:2,data:{}}},{event:{type:'assistant/message',seq:4,data:{message:{content:[{type:'text',text:raw}]}}}},{event:{type:'turn/end',seq:5,data:{}}}]})}),
   prompt,
   cancel:vi.fn(async()=>ok({accepted:true})),
  },workspace:{archiveSession:vi.fn(async()=>ok({}))}}
  const storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value)}}
  const bridge=new StoryAiBridge(api as never,storage,async()=>{})
  const save={...createInitialProjection(),saveId:'save-tx-context'}
  const hooks={transactionId:'tx-context'}

  await expect(bridge.send(save,save.selectedChannelId,'只发送一次的玩家输入',hooks)).rejects.toThrow('没有产生结构化回复')
  await expect(bridge.retry(save,hooks)).resolves.toMatchObject({messages:[{content:'收到。'}]})

  expect(prompt).toHaveBeenCalledTimes(2)
  const first=prompt.mock.calls[0]![0].content[0].text
  const second=prompt.mock.calls[1]![0].content[0].text
  expect(first).toContain('当前 player transaction_id：tx-context')
  expect(second).toContain('当前 player transaction_id：tx-context')
  expect(first).toContain('必须携带完全相同的 transaction_id')
  expect(second).toContain('必须携带完全相同的 transaction_id')
  expect(first).toContain('只发送一次的玩家输入')
  expect(second).toContain('不要再次转述或提交玩家输入')
  expect(second).not.toContain('只发送一次的玩家输入')
 })

 it('uses a hidden continuation prompt for partial recovery without replaying the original player input',async()=>{
  const saveId='save-continuation'
  const sessionId='session-continuation'
  const values=new Map<string,string>([
   [`dsh-story-ai-session:${saveId}`,sessionId],
   [`dsh-story-ai-pending:${saveId}`,JSON.stringify({version:1,id:'turn-old',sessionId,baseline:0,channelId:'c-direct-hezhou',prompt:'original player input: SECRET-PLAYER-TEXT',state:'completed',result:{raw:'{}',messages:[]}})],
  ])
  const prompt=vi.fn(async(_payload:any)=>ok({accepted:true}))
  let history=0
  const raw='{"messages":[{"senderId":"p-hezhou","kind":"dialogue","content":"修复完成。"}]}'
  const api={sessions:{
   create:vi.fn(async()=>ok({sessionId})),
   history:vi.fn(async()=>{history+=1;return history===1?ok({events:[]}):ok({events:[{event:{type:'assistant/message',seq:1,data:{message:{content:[{type:'text',text:raw}]}}}},{event:{type:'turn/end',seq:2,data:{}}}]})}),
   prompt,
   cancel:vi.fn(async()=>ok({accepted:true})),
  },workspace:{archiveSession:vi.fn(async()=>ok({}))}}
  const storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value)}}
  const bridge=new StoryAiBridge(api as never,storage,async()=>{})
  const save={...createInitialProjection(),saveId,selectedChannelId:'c-direct-hezhou'}

  await expect(bridge.continueTransaction(save,save.selectedChannelId,'op-a 已 applied；仅修复 op-b。',{transactionId:'tx-continuation'})).resolves.toMatchObject({messages:[{content:'修复完成。'}]})
  const text=prompt.mock.calls[0]![0].content[0].text
  expect(text).toContain('当前 player transaction_id：tx-continuation')
  expect(text).toContain('op-a 已 applied；仅修复 op-b。')
  expect(text).toContain('不要再次转述或提交原玩家输入')
  expect(text).not.toContain('SECRET-PLAYER-TEXT')
 })

 it('can continue from the persisted hidden session after local pending state is lost',async()=>{
  const saveId='save-continuation-restart';const sessionId='session-continuation-restart'
  const values=new Map<string,string>([[`dsh-story-ai-session:${saveId}`,sessionId]])
  const prompt=vi.fn(async(_payload:any)=>ok({accepted:true}));let history=0
  const raw='{"messages":[{"senderId":"p-hezhou","kind":"dialogue","content":"重启恢复完成。"}]}'
  const api={sessions:{
   create:vi.fn(async()=>ok({sessionId})),
   history:vi.fn(async()=>{history+=1;return history===1?ok({events:[]}):ok({events:[{event:{type:'assistant/message',seq:1,data:{message:{content:[{type:'text',text:raw}]}}}},{event:{type:'turn/end',seq:2,data:{}}}]})}),
   prompt,cancel:vi.fn(async()=>ok({accepted:true})),
  },workspace:{archiveSession:vi.fn(async()=>ok({}))}}
  const storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value)}}
  const bridge=new StoryAiBridge(api as never,storage,async()=>{})
  const save={...createInitialProjection(),saveId,selectedChannelId:'c-direct-hezhou'}

  await expect(bridge.continueTransaction(save,save.selectedChannelId,'只补齐 durable core 已证明后的 social 结果。',{transactionId:'tx-restart'})).resolves.toMatchObject({messages:[{content:'重启恢复完成。'}]})

  expect(prompt).toHaveBeenCalledTimes(1)
  expect(prompt.mock.calls[0]![0].content[0].text).toContain('当前 player transaction_id：tx-restart')
  expect(values.get(`dsh-story-ai-pending:${saveId}`)).toContain('completed')
 })
})
