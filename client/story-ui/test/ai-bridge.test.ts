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
    expect(values.get('dsh-story-ai-pending:save-reload')).toContain('"state":"completed"')
    bridge.acknowledge(save.saveId,recovered!.turnId)
    expect(values.get('dsh-story-ai-pending:save-reload')).toBe('')
  })
})

describe('durable AI turn state machine',()=>{
  it('cancels a running turn and leaves the save interactive',async()=>{
    const values=new Map<string,string>([['dsh-story-ai-session:save-cancel','session-cancel']])
    let release=()=>{}
    const delayed=new Promise<void>(resolve=>{release=resolve})
    const cancel=vi.fn(async()=>ok({accepted:true}))
    const api={sessions:{create:vi.fn(async()=>ok({sessionId:'session-cancel'})),history:vi.fn(async()=>ok({events:[]})),prompt:vi.fn(async()=>ok({accepted:true})),cancel},workspace:{archiveSession:vi.fn(async()=>ok({}))}}
    const bridge=new StoryAiBridge(api as never,{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value)}},async()=>delayed)
    const save={...createInitialProjection(),saveId:'save-cancel'}
    const sending=bridge.send(save,save.selectedChannelId,'继续')
    await vi.waitFor(()=>expect(bridge.turn(save.saveId)?.state).toBe('running'))
    await bridge.cancel(save.saveId)
    expect(cancel).toHaveBeenCalledWith({sessionId:'session-cancel'})
    expect(bridge.turn(save.saveId)?.state).toBe('cancelled')
    release()
    await expect(sending).rejects.toThrow('已取消')
  })
  it('gives cancellation precedence over a late truncated history',async()=>{
    const values=new Map<string,string>([['dsh-story-ai-session:save-cancel-race','session-cancel-race']])
    let release=()=>{}
    const delayed=new Promise<void>(resolve=>{release=resolve})
    let history=0
    const partial={event:{type:'assistant/message',seq:2,data:{message:{content:[{type:'text',text:'{"messages":['}]}}}}
    const api={sessions:{create:vi.fn(async()=>ok({sessionId:'session-cancel-race'})),history:vi.fn(async()=>{history+=1;return ok({events:history===1?[]:[partial,{event:{type:'turn/end',seq:3,data:{}}}]})}),prompt:vi.fn(async()=>ok({accepted:true})),cancel:vi.fn(async()=>ok({accepted:true}))},workspace:{archiveSession:vi.fn(async()=>ok({}))}}
    const bridge=new StoryAiBridge(api as never,{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value)}},async()=>delayed)
    const save={...createInitialProjection(),saveId:'save-cancel-race'}
    const sending=bridge.send(save,save.selectedChannelId,'取消优先')
    await vi.waitFor(()=>expect(bridge.turn(save.saveId)?.state).toBe('running'))
    await bridge.cancel(save.saveId)
    release()
    await expect(sending).rejects.toThrow('已取消')
    expect(bridge.turn(save.saveId)?.state).toBe('cancelled')
    expect(api.sessions.history).toHaveBeenCalledTimes(1)
  })
  it('retries without duplicating the player input and records a new completed turn',async()=>{
    const values=new Map<string,string>([['dsh-story-ai-session:save-retry','session-retry']])
    let history=0
    const prompt=vi.fn(async(_payload:any)=>ok({accepted:true}))
    const api={sessions:{create:vi.fn(async()=>ok({sessionId:'session-retry'})),history:vi.fn(async()=>{history+=1;if(history===1)return ok({events:[]});if(history===2)return ok({events:[{event:{type:'turn/end',seq:2,data:{}}}]});if(history===3)return ok({events:[{event:{type:'turn/end',seq:2,data:{}}}]});return ok({events:[{event:{type:'turn/end',seq:2,data:{}}},{event:{type:'assistant/message',seq:4,data:{message:{content:[{type:'text',text:'{"messages":[{"senderId":"p-hezhou","kind":"dialogue","content":"收到。"}]}' }]}}}},{event:{type:'turn/end',seq:5,data:{}}}]})}),prompt,cancel:vi.fn(async()=>ok({accepted:true}))},workspace:{archiveSession:vi.fn(async()=>ok({}))}}
    const bridge=new StoryAiBridge(api as never,{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value)}},async()=>{})
    const save={...createInitialProjection(),saveId:'save-retry'}
    await expect(bridge.send(save,save.selectedChannelId,'只发送一次的玩家输入')).rejects.toThrow('没有产生结构化回复')
    const result=await bridge.retry(save)
    expect(result.messages).toEqual([{senderId:'p-hezhou',kind:'dialogue',content:'收到。'}])
    expect(prompt).toHaveBeenCalledTimes(2)
    expect(prompt.mock.calls[0]![0].content[0].text).toContain('只发送一次的玩家输入')
    expect(prompt.mock.calls[1]![0].content[0].text).toContain('不要再次转述或提交玩家输入')
    expect(prompt.mock.calls[1]![0].content[0].text).not.toContain('只发送一次的玩家输入')
  })
  it('records a local orphan diagnostic instead of pretending to delete a DSH session',async()=>{
    const values=new Map<string,string>([['dsh-story-ai-session:save-removed','session-removed']])
    const bridge=new StoryAiBridge({sessions:{cancel:vi.fn(async()=>ok({accepted:true}))}} as never,{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value)}},async()=>{})
    await expect(bridge.releaseSave('save-removed','example-pack')).resolves.toMatchObject({saveId:'save-removed',packId:'example-pack',sessionId:'session-removed',reason:'save-deleted'})
    expect(values.get('dsh-story-ai-session:save-removed')).toBe('')
    expect(values.get('dsh-story-ai-orphan:save-removed')).toContain('session-removed')
  })
  it('marks a choice wait only on the matching save and never cancels another save',async()=>{
    const values=new Map<string,string>([
      ['dsh-story-ai-session:save-a','session-a'],
      ['dsh-story-ai-session:save-b','session-b'],
      ['dsh-story-ai-pending:save-a',JSON.stringify({version:1,id:'turn-a',sessionId:'session-a',baseline:1,channelId:'c',prompt:'a',state:'running'})],
      ['dsh-story-ai-pending:save-b',JSON.stringify({version:1,id:'turn-b',sessionId:'session-b',baseline:1,channelId:'c',prompt:'b',state:'running'})],
    ])
    const cancel=vi.fn(async()=>ok({accepted:true}))
    const bridge=new StoryAiBridge({sessions:{cancel}} as never,{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value)}},async()=>{})
    bridge.markWaitingChoice('save-a','session-b')
    expect(bridge.turn('save-a')?.state).toBe('running')
    bridge.markWaitingChoice('save-a','session-a')
    expect(bridge.turn('save-a')?.state).toBe('waiting-choice')
    expect(bridge.turn('save-b')?.state).toBe('running')
    await bridge.cancel('save-a')
    expect(cancel).toHaveBeenCalledWith({sessionId:'session-a'})
    expect(bridge.turn('save-b')?.state).toBe('running')
  })
  it('shows only a verified ephemeral preview before the turn commits',async()=>{
    const values=new Map<string,string>([['dsh-story-ai-session:save-preview','session-preview']])
    let release=()=>{}
    const paused=new Promise<void>(resolve=>{release=resolve})
    let waits=0,history=0
    const raw='{"messages":[{"senderId":"p-hezhou","kind":"dialogue","content":"正在靠近。"}]}'
    const message={event:{type:'assistant/message',seq:2,data:{message:{content:[{type:'text',text:raw}]}}}}
    const ended={event:{type:'turn/end',seq:3,data:{}}}
    const api={sessions:{create:vi.fn(async()=>ok({sessionId:'session-preview'})),prompt:vi.fn(async()=>ok({accepted:true})),cancel:vi.fn(async()=>ok({accepted:true})),history:vi.fn(async()=>{history+=1;if(history===1)return ok({events:[]});if(history===2)return ok({events:[message]});return ok({events:[message,ended]})})},workspace:{archiveSession:vi.fn(async()=>ok({}))}}
    const bridge=new StoryAiBridge(api as never,{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value)}},async()=>{waits+=1;if(waits>1)await paused})
    const save={...createInitialProjection(),saveId:'save-preview'}
    const sending=bridge.send(save,save.selectedChannelId,'继续')
    await vi.waitFor(()=>expect(bridge.turn(save.saveId)?.preview?.messages[0]?.content).toBe('正在靠近。'))
    expect(values.get('dsh-story-ai-pending:save-preview')).not.toContain('正在靠近。')
    release()
    await expect(sending).resolves.toMatchObject({messages:[{content:'正在靠近。'}]})
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
  it('keeps malformed structured output out of canon',async()=>{
    const raw='{"messages":["broken'
    let histories=0
    const api={sessions:{async create(){return ok({sessionId:'hidden'})},async history(){histories+=1;if(histories===1)return ok({events:[]});return ok({events:[{event:{type:'assistant/message',seq:2,data:{message:{content:[{type:'text',text:raw}]}}}},{event:{type:'turn/end',seq:3,data:{}}}]})},async prompt(){return ok({accepted:true})}},workspace:{async archiveSession(){return ok({})}}}
    const bridge=new StoryAiBridge(api as never,{getItem:()=> 'hidden',setItem:vi.fn()},async()=>{})
    await expect(bridge.send(createInitialProjection(),'c-direct-hezhou','问问他')).rejects.toThrow('无法解析的结构化消息')
  })
})
