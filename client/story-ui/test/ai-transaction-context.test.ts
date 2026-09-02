import{describe,expect,it,vi}from'vitest'
import{StoryAiBridge}from'../src/client/ai-bridge.ts'
import{createInitialProjection}from'../src/client/initial-projection.ts'

const ok=(value:unknown)=>({result:{ok:true as const,value}})

describe('hidden transaction control context',()=>{
 it('keeps the same transaction id in initial and retry prompts without repeating player input',async()=>{
  const values=new Map<string,string>([['dsh-story-ai-session:save-tx-context','session-tx-context']])
  const prompt=vi.fn(async()=>ok({accepted:true}))
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
})
