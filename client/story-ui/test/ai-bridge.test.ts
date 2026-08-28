import{describe,expect,it,vi}from'vitest'
import{StoryAiBridge}from'../src/client/ai-bridge.ts'
import{createInitialProjection}from'../src/client/initial-projection.ts'
const ok=(value:unknown)=>({result:{ok:true as const,value}})
describe('hidden AI session bridge',()=>{it('creates an archived game session and parses structured messages',async()=>{const calls:string[]=[];let histories=0;const api={sessions:{async create(){calls.push('create');return ok({sessionId:'hidden'})},async history(){histories+=1;if(histories===1)return ok({events:[]});return ok({events:[{event:{type:'assistant/message',seq:2,data:{message:{content:[{type:'text',text:'{"messages":[{"senderId":"p-hezhou","kind":"dialogue","content":"灯室见。"}]}' }]}}}},{event:{type:'turn/end',seq:3,data:{}}}]})},async prompt(){calls.push('prompt');return ok({accepted:true})}},workspace:{async archiveSession(){calls.push('archive');return ok({})}}};const storage={getItem:()=> 'hidden',setItem:vi.fn()};const bridge=new StoryAiBridge(api as never,storage,async()=>{});const result=await bridge.send(createInitialProjection(),'c-direct-hezhou','今晚见');expect(result.messages).toEqual([{senderId:'p-hezhou',kind:'dialogue',content:'灯室见。'}]);expect(calls).toEqual(['create','archive','prompt'])})})

describe('per-save session persistence',()=>{
  it('restores the session id from storage after a page reload',()=>{
    const bridge=new StoryAiBridge({} as never,{getItem:(key)=>key==='dsh-story-ai-session:save-a'?'persisted-a':null,setItem:vi.fn()},async()=>{})
    expect(bridge.currentSessionId('save-a')).toBe('persisted-a')
  })
  it('forks DSH history and runtime state for save-as',async()=>{
    const values=new Map([['dsh-story-ai-session:save-a','source-session']])
    const storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value)}}
    const archive=vi.fn(async()=>ok({}))
    const cloneRuntime=vi.fn(async()=>{})
    const api={sessions:{fork:vi.fn(async()=>ok({sessionId:'child-session'}))},workspace:{archiveSession:archive}}
    const bridge=new StoryAiBridge(api as never,storage,async()=>{},cloneRuntime)
    await expect(bridge.forkSave('save-a','save-b','lantern-station')).resolves.toBe('child-session')
    expect(api.sessions.fork).toHaveBeenCalledWith({sessionId:'source-session',increaseTitle:false})
    expect(cloneRuntime).toHaveBeenCalledWith({packId:'lantern-station',sourceSessionId:'source-session',targetSessionId:'child-session'})
    expect(bridge.currentSessionId('save-b')).toBe('child-session')
  })
  it('recovers a completed pending turn after reload',async()=>{
    const save=createInitialProjection();save.saveId='save-reload'
    const values=new Map<string,string>([
      ['dsh-story-ai-session:save-reload','session-reload'],
      ['dsh-story-ai-pending:save-reload',JSON.stringify({sessionId:'session-reload',baseline:4,channelId:save.selectedChannelId})],
    ])
    const storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value)}}
    const api={sessions:{history:vi.fn(async()=>ok({events:[{event:{type:'assistant/message',seq:5,data:{message:{content:[{type:'text',text:'{"messages":[{"senderId":"p-hezhou","kind":"dialogue","content":"我还在。"}]}' }]}}}},{event:{type:'turn/end',seq:6,data:{}}}]}))}}
    const bridge=new StoryAiBridge(api as never,storage,async()=>{})
    const recovered=await bridge.recover(save)
    expect(recovered).toMatchObject({channelId:save.selectedChannelId,result:{messages:[{senderId:'p-hezhou',content:'我还在。'}]}})
    expect(values.get('dsh-story-ai-pending:save-reload')).toBe('')
  })
})

describe('parseMessages quote tolerance',()=>{
  it('recovers JSON broken by ASCII quotes inside content',async()=>{
    const raw='{"messages":[{"senderId":"p-hezhou","kind":"dialogue","content":"鹤舟说："灯室见。"好的。"}]}'
    let histories=0
    const api={sessions:{async create(){return ok({sessionId:'hidden'})},async history(){histories+=1;if(histories===1)return ok({events:[]});return ok({events:[{event:{type:'assistant/message',seq:2,data:{message:{content:[{type:'text',text:raw}]}}}},{event:{type:'turn/end',seq:3,data:{}}}]})},async prompt(){return ok({accepted:true})}},workspace:{async archiveSession(){return ok({})}}}
    const bridge=new StoryAiBridge(api as never,{getItem:()=> 'hidden',setItem:vi.fn()},async()=>{})
    const result=await bridge.send(createInitialProjection(),'c-direct-hezhou','问问他')
    expect(result.messages).toHaveLength(1)
    expect(result.messages[0]).toMatchObject({senderId:'p-hezhou',kind:'dialogue'})
    expect(result.messages[0].content).toContain('灯室见')
  })
  it('recovers stacked closing quotes ("。"" pattern)',async()=>{
    const raw='{"messages":[{"senderId":"p-hezhou","kind":"dialogue","content":"他抬头看着你："先听完风险，再决定。""}]}'
    let histories=0
    const api={sessions:{async create(){return ok({sessionId:'hidden'})},async history(){histories+=1;if(histories===1)return ok({events:[]});return ok({events:[{event:{type:'assistant/message',seq:2,data:{message:{content:[{type:'text',text:raw}]}}}},{event:{type:'turn/end',seq:3,data:{}}}]})},async prompt(){return ok({accepted:true})}},workspace:{async archiveSession(){return ok({})}}}
    const bridge=new StoryAiBridge(api as never,{getItem:()=> 'hidden',setItem:vi.fn()},async()=>{})
    const result=await bridge.send(createInitialProjection(),'c-direct-hezhou','问问他')
    expect(result.messages).toHaveLength(1)
    expect(result.messages[0]).toMatchObject({senderId:'p-hezhou',kind:'dialogue'})
    expect(result.messages[0].content).toContain('先听完风险')
  })
  it('maps narration/system role ids to the projection participant ids',async()=>{
    const raw='{"messages":[{"senderId":"narration","kind":"narration","content":"雾潮压向近岸。"},{"senderId":"p-hezhou","kind":"dialogue","content":"先把风险说清楚。"},{"senderId":"system","kind":"work-dispatch","content":"【工作内简报】雾笛校准完成。"}]}'
    let histories=0
    const api={sessions:{async create(){return ok({sessionId:'hidden'})},async history(){histories+=1;if(histories===1)return ok({events:[]});return ok({events:[{event:{type:'assistant/message',seq:2,data:{message:{content:[{type:'text',text:raw}]}}}},{event:{type:'turn/end',seq:3,data:{}}}]})},async prompt(){return ok({accepted:true})}},workspace:{async archiveSession(){return ok({})}}}
    const bridge=new StoryAiBridge(api as never,{getItem:()=> 'hidden',setItem:vi.fn()},async()=>{})
    const result=await bridge.send(createInitialProjection(),'c-direct-hezhou','问问他')
    expect(result.messages).toHaveLength(3)
    expect(result.messages[0]).toMatchObject({senderId:'p-narrator',kind:'narration'})
    expect(result.messages[1]).toMatchObject({senderId:'p-hezhou',kind:'dialogue'})
    expect(result.messages[2]).toMatchObject({senderId:'p-system',kind:'work-dispatch'})
  })
  it('falls back to narration when JSON cannot be repaired',async()=>{
    const raw='{"messages":["broken'
    let histories=0
    const api={sessions:{async create(){return ok({sessionId:'hidden'})},async history(){histories+=1;if(histories===1)return ok({events:[]});return ok({events:[{event:{type:'assistant/message',seq:2,data:{message:{content:[{type:'text',text:raw}]}}}},{event:{type:'turn/end',seq:3,data:{}}}]})},async prompt(){return ok({accepted:true})}},workspace:{async archiveSession(){return ok({})}}}
    const bridge=new StoryAiBridge(api as never,{getItem:()=> 'hidden',setItem:vi.fn()},async()=>{})
    const result=await bridge.send(createInitialProjection(),'c-direct-hezhou','问问他')
    expect(result.messages).toHaveLength(1)
    expect(result.messages[0].kind).toBe('narration')
    expect(result.messages[0].senderId).toBe('p-narrator')
  })
})
