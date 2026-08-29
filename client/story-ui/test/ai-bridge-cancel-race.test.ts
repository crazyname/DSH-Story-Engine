import{describe,expect,it,vi}from'vitest'
import{StoryAiBridge}from'../src/client/ai-bridge.ts'
import{createInitialProjection}from'../src/client/initial-projection.ts'

const ok=(value:unknown)=>({result:{ok:true as const,value}})

describe('AI cancellation precedence',()=>{
 it('keeps cancellation terminal when history was already in flight',async()=>{
  const values=new Map<string,string>([['dsh-story-ai-session:save-inflight-cancel','session-inflight-cancel']])
  let historyCalls=0
  let releaseHistory!:()=>void
  let historyStarted!:()=>void
  const historyBlocked=new Promise<void>(resolve=>{releaseHistory=resolve})
  const historyEntered=new Promise<void>(resolve=>{historyStarted=resolve})
  const partial={event:{type:'assistant/message',seq:2,data:{message:{content:[{type:'text',text:'{"messages":['}]}}}}
  const ended={event:{type:'turn/end',seq:3,data:{}}}
  const cancel=vi.fn(async()=>ok({accepted:true}))
  const history=vi.fn(async()=>{
   historyCalls+=1
   if(historyCalls===1)return ok({events:[]})
   historyStarted()
   await historyBlocked
   return ok({events:[partial,ended]})
  })
  const api={sessions:{create:vi.fn(async()=>ok({sessionId:'session-inflight-cancel'})),history,prompt:vi.fn(async()=>ok({accepted:true})),cancel},workspace:{archiveSession:vi.fn(async()=>ok({}))}}
  const storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value)}}
  const bridge=new StoryAiBridge(api as never,storage,async()=>{})
  const save={...createInitialProjection(),saveId:'save-inflight-cancel'}

  const sending=bridge.send(save,save.selectedChannelId,'在历史请求进行时取消')
  await historyEntered
  expect(bridge.turn(save.saveId)?.state).toBe('running')

  await bridge.cancel(save.saveId)
  expect(cancel).toHaveBeenCalledWith({sessionId:'session-inflight-cancel'})
  expect(bridge.turn(save.saveId)?.state).toBe('cancelled')

  releaseHistory()
  await expect(sending).rejects.toThrow('AI 回合已取消')
  expect(bridge.turn(save.saveId)?.state).toBe('cancelled')
  expect(bridge.turn(save.saveId)?.error).toBeUndefined()
  expect(history).toHaveBeenCalledTimes(2)
 })
})
