import type{AiMessageInput,StorySaveProjection}from'./story-domain.ts'
import type{Rpc}from'./rpc-shape.ts'
import{unwrap}from'./rpc-shape.ts'
export interface StoryApi{sessions:{create(payload:Record<string,unknown>):Promise<Rpc<{sessionId:string}>>;fork(payload:Record<string,unknown>):Promise<Rpc<{sessionId:string}>>;history(payload:Record<string,unknown>):Promise<Rpc<{events:Array<{event:any}>}>>;prompt(payload:Record<string,unknown>):Promise<Rpc<{accepted:true}>>};workspace:{archiveSession(payload:Record<string,unknown>):Promise<Rpc<unknown>>}}
export interface AiBridgeResult{messages:AiMessageInput[];raw:string}
export interface RecoveredAiBridgeResult{channelId:string;result:AiBridgeResult}
interface PendingTurn{sessionId:string;baseline:number;channelId:string}
function assistantText(events:Array<{event:any}>,afterSeq:number):string|undefined{const messages=events.map(x=>x.event).filter(e=>e?.type==='assistant/message'&&Number(e.seq)>afterSeq);const last=messages.at(-1);const blocks=last?.data?.message?.content;if(!Array.isArray(blocks))return undefined;return blocks.filter((b:any)=>b?.type==='text'&&typeof b.text==='string').map((b:any)=>b.text).join('\n').trim()||undefined}
function turnEnded(events:Array<{event:any}>,afterSeq:number):boolean{return events.some(x=>x.event?.type==='turn/end'&&Number(x.event.seq)>afterSeq)}
function parseMessages(raw:string,projection:StorySaveProjection,channelId:string):AiMessageInput[]{
  const fenced=raw.match(/```(?:json)?\s*([\s\S]*?)```/u)?.[1]??raw
  const narrate=():AiMessageInput[]=>{
    const narrator=projection.participants.find(p=>p.role==='narrator')?.id??projection.channels.find(c=>c.id===channelId)?.participantIds.find(id=>projection.participants.find(p=>p.id===id)?.role==='npc')
    if(!narrator)throw new Error('没有可用的旁白或 NPC')
    return[{senderId:narrator,kind:'narration',content:raw}]
  }
  const parse=(text:string):AiMessageInput[]=>{
    const value=JSON.parse(text)as{messages?:unknown}
    if(!Array.isArray(value.messages))throw new Error()
    const roleToId=(role:string):string=>{
      if(role==='narration'||role==='narrator')return projection.participants.find(p=>p.role==='narrator')?.id??role
      if(role==='system')return projection.participants.find(p=>p.role==='system')?.id??role
      return role
    }
    return value.messages.map((item:any)=>({senderId:roleToId(String(item.senderId)),kind:String(item.kind)as AiMessageInput['kind'],content:String(item.content)}))
  }
  const repairQuotes=(text:string):string=>{
    let out='';let inString=false
    const isCJK=(c:string|undefined)=>c!==undefined&&/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(c)
    for(let i=0;i<text.length;i++){const ch=text[i]
      if(ch==='\\'&&inString){out+=ch+(text[i+1]??'');i++;continue}
      if(ch!=='"'){out+=ch;continue}
      if(!inString){inString=true;out+=ch;continue}
      const prev=text[i-1];const next=text[i+1]
      const prevCJK=isCJK(prev);const nextCJK=isCJK(next)
      if((prevCJK&&(nextCJK||next==='"'))||(prevCJK&&next===undefined)){out+='\\"'}
      else{inString=false;out+=ch}
    }
    return out
  }
  try{return parse(fenced)}catch{
    const repaired=repairQuotes(fenced)
    if(repaired!==fenced){try{return parse(repaired)}catch{return narrate()}}
    return narrate()
  }
}
export class StoryAiBridge{
 constructor(
  private readonly api:StoryApi,
  private readonly storage:Pick<Storage,'getItem'|'setItem'>,
  private readonly delay:(ms:number)=>Promise<void>=(ms)=>new Promise(resolve=>setTimeout(resolve,ms)),
  private readonly cloneRuntime:(payload:{packId:string;sourceSessionId:string;targetSessionId:string})=>Promise<void>=async(payload)=>{
   const response=await fetch('/story-engine/api/runtime/clone',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)})
   if(!response.ok){const detail=await response.json().catch(()=>({}))as{error?:string};throw new Error(detail.error??`复制剧情状态失败：${response.status}`)}
  },
 ){}
 private cached:Map<string,string>=new Map()
 /** The hidden session id for one save; each save gets its own session so a
  *  new game never inherits another save's story state or pending questions. */
 private key(saveId:string):string{return`dsh-story-ai-session:${saveId}`}
 private pendingKey(saveId:string):string{return`dsh-story-ai-pending:${saveId}`}
 private remember(saveId:string,sessionId:string):void{this.storage.setItem(this.key(saveId),sessionId);this.cached.set(saveId,sessionId)}
 private pending(saveId:string):PendingTurn|null{const raw=this.storage.getItem(this.pendingKey(saveId));if(raw===null||raw==='')return null;try{const value=JSON.parse(raw)as PendingTurn;return typeof value.sessionId==='string'&&Number.isFinite(value.baseline)&&typeof value.channelId==='string'?value:null}catch{return null}}
 private rememberPending(saveId:string,value:PendingTurn):void{this.storage.setItem(this.pendingKey(saveId),JSON.stringify(value))}
 private clearPending(saveId:string):void{this.storage.setItem(this.pendingKey(saveId),'')}
 private async session(saveId:string,agentPreset:string):Promise<string>{
  let id=this.currentSessionId(saveId)
  if(id===null){id=crypto.randomUUID();this.remember(saveId,id)}
  const created=unwrap(await this.api.sessions.create({sessionId:id,cwd:'D:/DSH-Story-Engine',agentPreset}),'创建文字游戏会话')
  await this.api.workspace.archiveSession({sessionId:created.sessionId})
  return created.sessionId
 }
 /** The session id bound to a save, or null before the first send for it. */
 currentSessionId(saveId:string):string|null{
  const cached=this.cached.get(saveId)
  if(cached!==undefined)return cached
  const persisted=this.storage.getItem(this.key(saveId))
  if(persisted===null||persisted.trim()==='')return null
  this.cached.set(saveId,persisted)
  return persisted
 }
 /** Fork both DSH conversation history and Story Engine runtime state. */
 async forkSave(sourceSaveId:string,targetSaveId:string,packId:string):Promise<string|null>{
  const sourceSessionId=this.currentSessionId(sourceSaveId)
  if(sourceSessionId===null)return null
  const forked=unwrap(await this.api.sessions.fork({sessionId:sourceSessionId,increaseTitle:false}),'复制文字游戏会话')
  await this.api.workspace.archiveSession({sessionId:forked.sessionId})
  await this.cloneRuntime({packId,sourceSessionId,targetSessionId:forked.sessionId})
  this.remember(targetSaveId,forked.sessionId)
  return forked.sessionId
 }
 private async wait(projection:StorySaveProjection,pending:PendingTurn):Promise<AiBridgeResult>{
  for(let attempt=0;attempt<3600;attempt+=1){
   await this.delay(500)
   const history=unwrap(await this.api.sessions.history({sessionId:pending.sessionId,maxMessages:20}),'读取回复')
   const raw=assistantText(history.events,pending.baseline)
   if(raw!==undefined&&turnEnded(history.events,pending.baseline)){this.clearPending(projection.saveId);return{raw,messages:parseMessages(raw,projection,pending.channelId)}}
   if(raw===undefined&&turnEnded(history.events,pending.baseline)){this.clearPending(projection.saveId);throw new Error('AI 回合已经结束，但没有生成可显示的回复')}
  }
  throw new Error('AI 回合仍在运行；下次打开存档会自动继续等待')
 }
 async recover(projection:StorySaveProjection):Promise<RecoveredAiBridgeResult|null>{
  const pending=this.pending(projection.saveId)
  if(pending===null)return null
  const sessionId=this.currentSessionId(projection.saveId)
  if(sessionId===null||sessionId!==pending.sessionId||!projection.channels.some(channel=>channel.id===pending.channelId)){this.clearPending(projection.saveId);throw new Error('待恢复的 AI 回合与当前存档不匹配')}
  return{channelId:pending.channelId,result:await this.wait(projection,pending)}
 }
 async send(projection:StorySaveProjection,channelId:string,playerInput:string):Promise<AiBridgeResult>{const agentPreset=projection.agentPreset??`story-${projection.packId}`;const sessionId=await this.session(projection.saveId,agentPreset);const before=unwrap(await this.api.sessions.history({sessionId,maxMessages:2}),'读取会话');const baseline=Math.max(-1,...before.events.map(x=>Number(x.event?.seq??-1)));const channel=projection.channels.find(c=>c.id===channelId)!;const prompt=`当前文字游戏频道：${channel.title}\n当前进度：${projection.frame.seasonLabel} ${projection.frame.episodeLabel} ${projection.frame.sceneLabel}\n玩家输入：${playerInput}\n可用发送者：${channel.participantIds.join(', ')}，旁白和系统也可使用。请推进剧情并调用必要的 story_* 工具。最终仅输出 JSON：{"messages":[{"senderId":"人物ID","kind":"dialogue|narration|action|system|work-dispatch|relationship|episode-summary","content":"内容"}]}。不得替玩家角色发言或决定。注意：content 内的对白引用请使用中文引号“”或「」，不要使用英文双引号 "，以免破坏 JSON 格式。`;unwrap(await this.api.sessions.prompt({sessionId,mode:'queue',content:[{type:'text',text:prompt}],clientTimeZone:Intl.DateTimeFormat().resolvedOptions().timeZone}),'发送');const pending={sessionId,baseline,channelId};this.rememberPending(projection.saveId,pending);return this.wait(projection,pending) }
}
