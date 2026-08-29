import { copyFile, mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import type { EpisodeScript, EpisodeSummary, PlayedEvent, RuntimeState, ScriptRecord, WorkEvent } from './serial-types.js'
import { validateCrossReferences, validateScriptSchema, type ParsedScript } from './script-loader.js'

type JsonObject = Record<string, any>
const PROTECTED = new Set(['_engine','_pack','sourceCanon','authoredScript','playedCanon','workCache','drafts','playerControl'])
function merge(target: JsonObject, patch: JsonObject): JsonObject {
  const result = { ...target }
  for (const [key,value] of Object.entries(patch)) result[key] = value && typeof value === 'object' && !Array.isArray(value) && result[key] && typeof result[key] === 'object' && !Array.isArray(result[key]) ? merge(result[key], value as JsonObject) : structuredClone(value)
  return result
}
function event(type: PlayedEvent['type'], content?: string, metadata?: Record<string, unknown>): PlayedEvent {
  return {
    id: `${type}_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
    type,
    ...(content === undefined ? {} : { content }),
    turnId: `turn_${Date.now()}`,
    createdAt: new Date().toISOString(),
    ...(metadata === undefined ? {} : { metadata }),
  }
}

export class SerialStateStore {
  private readonly queues = new Map<string, Promise<void>>()
  constructor(private readonly runtimeRoot: string, private readonly packId: string, private readonly initialState: JsonObject = {}, private readonly packMetadata?: RuntimeState['_pack']) {}
  private safe(value: string): string { return basename(value.replace(/[^a-zA-Z0-9_-]/g,'_')).slice(0,100) || 'default' }
  private directory(sessionId: string): string { return join(this.runtimeRoot, this.safe(this.packId), this.safe(sessionId)) }
  private path(sessionId: string): string { return join(this.directory(sessionId), 'state.json') }

  async read(sessionId: string): Promise<RuntimeState> {
    try { return this.normalize(JSON.parse(await readFile(this.path(sessionId),'utf8')) as JsonObject, sessionId) }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      const state = this.normalize(structuredClone(this.initialState), sessionId)
      await this.atomicWrite(this.path(sessionId), state); return state
    }
  }
  private normalize(raw: JsonObject, sessionId: string): RuntimeState {
    const now = new Date().toISOString(); const engine = raw._engine as JsonObject | undefined
    const state = raw as unknown as RuntimeState
    state._engine = { schemaVersion: 2, stateVersion: Number(engine?.stateVersion ?? 0), packId: this.packId, createdAt: String(engine?.createdAt ?? now), ...(engine?.updatedAt ? {updatedAt:String(engine.updatedAt)} : {}) }
    state._pack ??= structuredClone(this.packMetadata ?? { id:this.packId,name:'',version:'',language:'',license:'',player:{controlledCharacters:[],aiMayControlPlayer:false} })
    state.sourceCanon ??= {}; state.authoredScript ??= { scripts:{}, runtimeScriptRoot:join(this.directory(sessionId),'script-revisions') }
    state.authoredScript.scripts ??= {}; state.authoredScript.runtimeScriptRoot ??= join(this.directory(sessionId),'script-revisions')
    state.playedCanon ??= {} as RuntimeState['playedCanon']; const played = state.playedCanon
    played.events ??= []; played.choices ??= []; played.completedScenes ??= []; played.currentEpisodeId ??= null; played.currentSceneId ??= null; played.currentBranch ??= null
    played.currentSeason ??= null; played.currentEpisode ??= null; played.checkpoints ??= {}; played.pauseState ??= 'running'; played.episodeSummaries ??= {}
    state.workCache ??= {pendingEvents:[]}; state.drafts ??= {}; state.campaign ??= {scene:'opening',turn:0}; state.world ??= {}; state.relationships ??= {}; state.resources ??= {}
    state.activeMissions ??= []; state.openThreads ??= []; state.flags ??= {}; state.history ??= []
    return state
  }
  private assertVersion(state: RuntimeState, expected: number): void { if (state._engine.stateVersion !== expected) throw new Error(`状态版本冲突：当前 ${state._engine.stateVersion}，提交基于 ${expected}`) }
  private async mutate(sessionId: string, expected: number, reason: string, fn: (state: RuntimeState) => void | Promise<void>): Promise<RuntimeState> {
    const previous = this.queues.get(sessionId) ?? Promise.resolve()
    let release!: () => void
    const current = new Promise<void>(resolve => { release = resolve })
    const queued = previous.then(() => current)
    this.queues.set(sessionId, queued)
    await previous
    try {
      const state = await this.read(sessionId); this.assertVersion(state, expected); await fn(state)
      state._engine.stateVersion += 1; state._engine.updatedAt = new Date().toISOString(); state.history.push({version:state._engine.stateVersion,reason,at:state._engine.updatedAt})
      await this.atomicWrite(this.path(sessionId), state); return state
    } finally {
      release()
      if (this.queues.get(sessionId) === queued) this.queues.delete(sessionId)
    }
  }
  async commit(sessionId: string, expected: number, changes: JsonObject, reason: string): Promise<RuntimeState> {
    const forbidden = Object.keys(changes).filter(k => PROTECTED.has(k)); if (forbidden.length) throw new Error(`禁止修改引擎保护字段：${forbidden.join(', ')}`)
    return this.mutate(sessionId, expected, reason, state => { for (const [key,value] of Object.entries(changes)) (state as any)[key] = value && typeof value === 'object' && !Array.isArray(value) ? merge(((state as any)[key] ?? {}) as JsonObject, value as JsonObject) : structuredClone(value) })
  }
  async initializeScripts(sessionId: string, expected: number, episodes: Map<string, ParsedScript>): Promise<RuntimeState> {
    const records: Record<string, ScriptRecord> = {}; for (const [id,p] of episodes) records[id] = p.index.byEpisode[id]
    return this.mutate(sessionId, expected, 'initialize_episode_scripts', state => { state.authoredScript.scripts = records })
  }
  async advanceScene(sessionId: string, expected: number, scene: string, summary: string): Promise<RuntimeState> {
    if (!scene.trim()) throw new Error('scene 不能为空'); await this.checkpoint(sessionId, `before_${scene}`)
    return this.mutate(sessionId, expected, `advance_scene: ${summary}`, state => { state.campaign.scene=scene; state.campaign.turn=Number(state.campaign.turn ?? 0)+1; state.playedCanon.currentSceneId=scene; state.playedCanon.events.push(event('scene_entered',summary,{scene})) })
  }
  async enterEpisodeScene(sessionId: string, expected: number, script: EpisodeScript, sceneId: string, branchId = 'main'): Promise<RuntimeState> {
    if (!script.scenes.some(s => s.id === sceneId)) throw new Error(`场景不属于剧本：${sceneId}`); await this.checkpoint(sessionId,`before_${sceneId}`)
    return this.mutate(sessionId, expected, `enter_episode_scene:${script.episodeId}/${sceneId}`, state => { const p=state.playedCanon; p.currentEpisodeId=script.episodeId;p.currentSeason=script.season;p.currentEpisode=script.episode;p.currentSceneId=sceneId;p.currentBranch=branchId;p.events.push({...event('scene_entered'),sceneId,episodeId:script.episodeId,branchId}) })
  }
  async recordChoice(sessionId:string, expected:number, script:EpisodeScript, sceneId:string, choiceId:string, selectedOptionIds:string[], freeInput:string|undefined, consequences:string[]):Promise<RuntimeState> {
    const scene=script.scenes.find(s=>s.id===sceneId); const choice=scene?.choices.find(c=>c.id===choiceId); if(!choice) throw new Error('选择不属于当前场景')
    const valid=new Set(choice.options.map(o=>o.id)); if(!selectedOptionIds.length || selectedOptionIds.some(id=>!valid.has(id))) throw new Error('包含无效选择项')
    return this.mutate(sessionId,expected,`choice:${choiceId}`,state=>{
      const played=state.playedCanon
      if(played.currentEpisodeId!==script.episodeId||played.currentSceneId!==sceneId)throw new Error(`选择只能记录在当前游玩场景：当前 ${played.currentEpisodeId ?? 'none'}/${played.currentSceneId ?? 'none'}，提交 ${script.episodeId}/${sceneId}`)
      played.choices.push({episodeId:script.episodeId,sceneId,choiceId,selectedOptionIds:[...selectedOptionIds],...(freeInput?{freeInput}:{}),consequences:[...consequences],createdAt:new Date().toISOString()});played.events.push(event('choice',undefined,{choiceId,selectedOptionIds}))
    })
  }
  async recordWorkEvent(sessionId:string, expected:number, work:WorkEvent):Promise<RuntimeState>{return this.mutate(sessionId,expected,`work:${work.name}`,state=>{state.playedCanon.events.push(event('work_dispatch',work.name,{work}))}) }
  async queueWorkEvent(sessionId:string, expected:number, work:WorkEvent):Promise<RuntimeState>{return this.mutate(sessionId,expected,`queue_work:${work.name}`,state=>{state.workCache.pendingEvents.push(structuredClone(work))}) }
  async resolveWorkEvents(sessionId:string, expected:number):Promise<{state:RuntimeState;resolved:WorkEvent[]}>{const before=await this.read(sessionId);this.assertVersion(before,expected);const resolved=structuredClone(before.workCache.pendingEvents);const state=await this.mutate(sessionId,expected,'resolve_work_events',s=>{s.workCache.pendingEvents=[];for(const work of resolved)s.playedCanon.events.push(event('work_summary',work.name,{work}))});return{state,resolved}}
  async pauseForRevision(sessionId:string,expected:number,reason:string,input:string,resumePoint:string):Promise<RuntimeState>{return this.mutate(sessionId,expected,'pause_for_revision',state=>{if(state.playedCanon.pauseState!=='running')throw new Error('当前状态不能再次暂停');state.playedCanon.pauseState='paused-for-revision';state.playedCanon.pendingRevision={reason,input,resumePoint,pausedAt:new Date().toISOString()};state.playedCanon.events.push(event('pause_triggered',reason,{resumePoint}))})}
  async submitRevision(sessionId:string,expected:number,candidate:EpisodeScript,reason:string):Promise<RuntimeState>{
    const parsed=validateScriptSchema(candidate);const episodes=new Map<string,ParsedScript>([[candidate.episodeId,parsed]]);const diagnostics=validateCrossReferences(episodes).filter(d=>!d.includes('startsAfter'))
    if(diagnostics.length)throw new Error(`修订校验失败：${diagnostics.join('; ')}`)
    return this.mutate(sessionId,expected,`revision:${reason}`,async state=>{if(state.playedCanon.pauseState!=='paused-for-revision')throw new Error('当前不在 paused-for-revision 状态');const previous=state.authoredScript.scripts[candidate.episodeId];if(previous&&candidate.revision.version<=previous.version)throw new Error('修订版本必须高于当前版本');state.playedCanon.pauseState='validating-revision';const directory=state.authoredScript.runtimeScriptRoot;await mkdir(directory,{recursive:true});const target=join(directory,`${this.safe(candidate.episodeId)}.v${candidate.revision.version}.json`);await this.atomicWrite(target,candidate);state.authoredScript.scripts[candidate.episodeId]={...parsed.index.byEpisode[candidate.episodeId],scriptPath:target};state.playedCanon.events.push(event('revision_submitted',reason,{episodeId:candidate.episodeId,version:candidate.revision.version}));state.playedCanon.pauseState='running';delete state.playedCanon.pendingRevision})
  }
  async recordEpisodeSummary(sessionId:string,expected:number,script:EpisodeScript,sceneId:string,consequences:string[],relationshipChanges:string[]=[]):Promise<{state:RuntimeState;summary:EpisodeSummary}>{
    const before=await this.read(sessionId);this.assertVersion(before,expected);const records=before.playedCanon.choices.filter(c=>c.episodeId===script.episodeId)
    const chosen=records.map(r=>{const choice=script.scenes.flatMap(s=>s.choices).find(c=>c.id===r.choiceId)!;return{choiceId:r.choiceId,selected:r.selectedOptionIds.map(id=>{const option=choice.options.find(o=>o.id===id)!;return{id,label:option.label}})}})
    const declined=records.map(r=>{const choice=script.scenes.flatMap(s=>s.choices).find(c=>c.id===r.choiceId)!;return{choiceId:r.choiceId,options:choice.options.filter(o=>!r.selectedOptionIds.includes(o.id)).map(o=>({id:o.id,label:o.label}))}})
    const summary:EpisodeSummary={season:script.season,episodeId:script.episodeId,sceneId,chosen,declined,freeInputs:records.filter(r=>r.freeInput).map(r=>({choiceId:r.choiceId,input:r.freeInput!})),consequences:[...consequences],relationshipChanges:[...relationshipChanges],createdAt:new Date().toISOString()}
    const state=await this.mutate(sessionId,expected,`episode_summary:${script.episodeId}`,s=>{
      s.playedCanon.episodeSummaries[script.episodeId]=summary;s.playedCanon.events.push(event('episode_summary',undefined,{summary}))
      const authoredSceneIds=new Set(script.scenes.map(scene=>scene.id))
      const playedSceneIds=s.playedCanon.events.flatMap(item=>item.type==='scene_entered'&&item.episodeId===script.episodeId&&item.sceneId!==undefined&&authoredSceneIds.has(item.sceneId)?[item.sceneId]:[])
      for(const playedSceneId of playedSceneIds)if(!s.playedCanon.completedScenes.includes(playedSceneId))s.playedCanon.completedScenes.push(playedSceneId)
    })
    return{state,summary}
  }
  async checkpoint(sessionId:string,label:string):Promise<{id:string;path:string}>{const source=this.path(sessionId);await this.read(sessionId);const id=`${Date.now()}_${this.safe(label).slice(0,50)}`;const target=join(this.directory(sessionId),'checkpoints',`${id}.json`);await mkdir(dirname(target),{recursive:true});await copyFile(source,target);return{id,path:target}}
  async checkpoints(sessionId:string):Promise<Array<{id:string}>>{const directory=join(this.directory(sessionId),'checkpoints');const names=await readdir(directory).catch(e=>{if((e as NodeJS.ErrnoException).code==='ENOENT')return[];throw e});return names.filter(n=>n.endsWith('.json')).sort().reverse().map(n=>({id:n.slice(0,-5)}))}
  async restoreCheckpoint(sessionId:string,checkpointId:string):Promise<RuntimeState>{if(this.safe(checkpointId)!==checkpointId)throw new Error('检查点 ID 无效');const source=join(this.directory(sessionId),'checkpoints',`${checkpointId}.json`);const restored=this.normalize(JSON.parse(await readFile(source,'utf8')),sessionId);const current=await this.read(sessionId);restored._engine.stateVersion=current._engine.stateVersion+1;restored._engine.updatedAt=new Date().toISOString();await this.atomicWrite(this.path(sessionId),restored);return restored}
  private async atomicWrite(path:string,value:unknown):Promise<void>{await mkdir(dirname(path),{recursive:true});const temporary=`${path}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;await writeFile(temporary,`${JSON.stringify(value,null,2)}\n`,'utf8');await rename(temporary,path)}
}
