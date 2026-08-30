import { access, copyFile, mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { assertReceiptMatches, normalizeOperationReceipts, operationCheckpointKey, prepareOperation } from './operation-idempotency.js'
import type { EpisodeScript, EpisodeSummary, OperationExecution, OperationIdentity, OperationReceipt, PlayedEvent, RuntimeState, ScriptRecord, WorkEvent } from './serial-types.js'
import { validateCrossReferences, validateScriptSchema, type ParsedScript } from './script-loader.js'

type JsonObject = Record<string, any>
const CURRENT_RUNTIME_SCHEMA_VERSION = 3
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

interface OperationMutation<T> {
  validate?: (state: RuntimeState) => void | Promise<void>
  prepare?: () => void | Promise<void>
  mutate: (state: RuntimeState) => T | Promise<T>
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
    const rawSchemaVersion = Number(engine?.schemaVersion ?? 0)
    if (Number.isInteger(rawSchemaVersion) && rawSchemaVersion > CURRENT_RUNTIME_SCHEMA_VERSION) throw new Error(`不支持的 Runtime Schema 版本：${rawSchemaVersion}`)
    const state = raw as unknown as RuntimeState
    state._engine = {
      schemaVersion: CURRENT_RUNTIME_SCHEMA_VERSION,
      stateVersion: Number(engine?.stateVersion ?? 0),
      packId: this.packId,
      createdAt: String(engine?.createdAt ?? now),
      ...(engine?.updatedAt ? {updatedAt:String(engine.updatedAt)} : {}),
      operationReceipts: normalizeOperationReceipts(engine?.operationReceipts),
    }
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
  private async exclusive<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(sessionId) ?? Promise.resolve()
    let release!: () => void
    const current = new Promise<void>(resolve => { release = resolve })
    const queued = previous.then(() => current)
    this.queues.set(sessionId, queued)
    await previous
    try { return await fn() }
    finally {
      release()
      if (this.queues.get(sessionId) === queued) this.queues.delete(sessionId)
    }
  }
  private async mutate(sessionId: string, expected: number, reason: string, fn: (state: RuntimeState) => void | Promise<void>): Promise<RuntimeState> {
    return this.exclusive(sessionId, async () => {
      const state = await this.read(sessionId); this.assertVersion(state, expected); await fn(state)
      state._engine.stateVersion += 1; state._engine.updatedAt = new Date().toISOString(); state.history.push({version:state._engine.stateVersion,reason,at:state._engine.updatedAt})
      await this.atomicWrite(this.path(sessionId), state); return state
    })
  }
  private async mutateOperation<T>(sessionId: string, expected: number, operation: string, identity: OperationIdentity, payload: unknown, reason: string, action: OperationMutation<T>): Promise<OperationExecution<T>> {
    const prepared = prepareOperation(operation, identity, payload)
    return this.exclusive(sessionId, async () => {
      const state = await this.read(sessionId)
      const existing = state._engine.operationReceipts[prepared.operationId]
      if (existing) {
        assertReceiptMatches(existing, prepared)
        return { receipt: structuredClone(existing) as OperationReceipt<T>, replayed: true }
      }
      this.assertVersion(state, expected)
      await action.validate?.(state)
      await action.prepare?.()
      const result = await action.mutate(state)
      state._engine.stateVersion += 1
      const committedAt = new Date().toISOString()
      state._engine.updatedAt = committedAt
      state.history.push({version:state._engine.stateVersion,reason,at:committedAt})
      const receipt: OperationReceipt<T> = {
        operationId: prepared.operationId,
        ...(prepared.transactionId ? { transactionId: prepared.transactionId } : {}),
        operation: prepared.operation,
        fingerprint: prepared.fingerprint,
        stateVersion: state._engine.stateVersion,
        committedAt,
        result: structuredClone(result),
      }
      state._engine.operationReceipts[prepared.operationId] = receipt
      await this.atomicWrite(this.path(sessionId), state)
      return { receipt: structuredClone(receipt), replayed: false }
    })
  }
  async commit(sessionId: string, expected: number, changes: JsonObject, reason: string, identity: OperationIdentity): Promise<OperationExecution<{reason:string}>> {
    return this.mutateOperation(sessionId, expected, 'story_commit_state', identity, {changes,reason}, reason, {
      validate: () => { const forbidden = Object.keys(changes).filter(k => PROTECTED.has(k)); if (forbidden.length) throw new Error(`禁止修改引擎保护字段：${forbidden.join(', ')}`) },
      mutate: state => { for (const [key,value] of Object.entries(changes)) (state as any)[key] = value && typeof value === 'object' && !Array.isArray(value) ? merge(((state as any)[key] ?? {}) as JsonObject, value as JsonObject) : structuredClone(value); return {reason} },
    })
  }
  async initializeScripts(sessionId: string, expected: number, episodes: Map<string, ParsedScript>, identity: OperationIdentity): Promise<OperationExecution<{episodeIds:string[]}>> {
    const records: Record<string, ScriptRecord> = {}; for (const [id,p] of episodes) records[id] = p.index.byEpisode[id]
    const episodeIds = Object.keys(records).sort()
    return this.mutateOperation(sessionId, expected, 'story_initialize_episode_state', identity, {records}, 'initialize_episode_scripts', { mutate: state => { state.authoredScript.scripts = records; return {episodeIds} } })
  }
  async advanceScene(sessionId: string, expected: number, scene: string, summary: string, identity: OperationIdentity): Promise<OperationExecution<{scene:string;checkpointId:string}>> {
    let checkpointId = ''
    return this.mutateOperation(sessionId, expected, 'story_advance_scene', identity, {scene,summary}, `advance_scene: ${summary}`, {
      validate: () => { if (!scene.trim()) throw new Error('scene 不能为空') },
      prepare: async () => { checkpointId = (await this.checkpoint(sessionId, `before_${scene}`, identity.operationId)).id },
      mutate: state => { state.campaign.scene=scene; state.campaign.turn=Number(state.campaign.turn ?? 0)+1; state.playedCanon.currentSceneId=scene; state.playedCanon.events.push(event('scene_entered',summary,{scene})); return {scene,checkpointId} },
    })
  }
  async enterEpisodeScene(sessionId: string, expected: number, script: EpisodeScript, sceneId: string, branchId = 'main', identity: OperationIdentity): Promise<OperationExecution<{episodeId:string;sceneId:string;branchId:string;checkpointId:string}>> {
    let checkpointId = ''
    return this.mutateOperation(sessionId, expected, 'story_enter_episode_scene', identity, {episodeId:script.episodeId,scriptRevision:script.revision.version,sceneId,branchId}, `enter_episode_scene:${script.episodeId}/${sceneId}`, {
      validate: () => { if (!script.scenes.some(s => s.id === sceneId)) throw new Error(`场景不属于剧本：${sceneId}`) },
      prepare: async () => { checkpointId = (await this.checkpoint(sessionId,`before_${sceneId}`,identity.operationId)).id },
      mutate: state => { const p=state.playedCanon; p.currentEpisodeId=script.episodeId;p.currentSeason=script.season;p.currentEpisode=script.episode;p.currentSceneId=sceneId;p.currentBranch=branchId;p.events.push({...event('scene_entered'),sceneId,episodeId:script.episodeId,branchId});return{episodeId:script.episodeId,sceneId,branchId,checkpointId} },
    })
  }
  async recordChoice(sessionId:string, expected:number, script:EpisodeScript, sceneId:string, choiceId:string, selectedOptionIds:string[], freeInput:string|undefined, consequences:string[], identity:OperationIdentity):Promise<OperationExecution<{episodeId:string;sceneId:string;choiceId:string;selectedOptionIds:string[]}>> {
    return this.mutateOperation(sessionId,expected,'story_record_script_choice',identity,{episodeId:script.episodeId,scriptRevision:script.revision.version,sceneId,choiceId,selectedOptionIds,freeInput,consequences},`choice:${choiceId}`,{
      validate:state=>{const scene=script.scenes.find(s=>s.id===sceneId);const choice=scene?.choices.find(c=>c.id===choiceId);if(!choice)throw new Error('选择不属于当前场景');const valid=new Set(choice.options.map(o=>o.id));if(!selectedOptionIds.length||selectedOptionIds.some(id=>!valid.has(id)))throw new Error('包含无效选择项');const played=state.playedCanon;if(played.currentEpisodeId!==script.episodeId||played.currentSceneId!==sceneId)throw new Error(`选择只能记录在当前游玩场景：当前 ${played.currentEpisodeId ?? 'none'}/${played.currentSceneId ?? 'none'}，提交 ${script.episodeId}/${sceneId}`)},
      mutate:state=>{const played=state.playedCanon;played.choices.push({episodeId:script.episodeId,sceneId,choiceId,selectedOptionIds:[...selectedOptionIds],...(freeInput?{freeInput}:{}),consequences:[...consequences],createdAt:new Date().toISOString()});played.events.push(event('choice',undefined,{choiceId,selectedOptionIds}));return{episodeId:script.episodeId,sceneId,choiceId,selectedOptionIds:[...selectedOptionIds]}},
    })
  }
  async recordWorkEvent(sessionId:string, expected:number, work:WorkEvent, identity:OperationIdentity):Promise<OperationExecution<{event:WorkEvent}>>{return this.mutateOperation(sessionId,expected,'story_record_work_event',identity,{work},`work:${work.name}`,{mutate:state=>{state.playedCanon.events.push(event('work_dispatch',work.name,{work}));return{event:structuredClone(work)}}})}
  async queueWorkEvent(sessionId:string, expected:number, work:WorkEvent):Promise<RuntimeState>{return this.mutate(sessionId,expected,`queue_work:${work.name}`,state=>{state.workCache.pendingEvents.push(structuredClone(work))}) }
  async resolveWorkEvents(sessionId:string, expected:number):Promise<{state:RuntimeState;resolved:WorkEvent[]}>{const before=await this.read(sessionId);this.assertVersion(before,expected);const resolved=structuredClone(before.workCache.pendingEvents);const state=await this.mutate(sessionId,expected,'resolve_work_events',s=>{s.workCache.pendingEvents=[];for(const work of resolved)s.playedCanon.events.push(event('work_summary',work.name,{work}))});return{state,resolved}}
  async pauseForRevision(sessionId:string,expected:number,reason:string,input:string,resumePoint:string,identity:OperationIdentity):Promise<OperationExecution<{reason:string;resumePoint:string}>>{return this.mutateOperation(sessionId,expected,'story_pause_for_revision',identity,{reason,input,resumePoint},'pause_for_revision',{validate:state=>{if(state.playedCanon.pauseState!=='running')throw new Error('当前状态不能再次暂停')},mutate:state=>{state.playedCanon.pauseState='paused-for-revision';state.playedCanon.pendingRevision={reason,input,resumePoint,pausedAt:new Date().toISOString()};state.playedCanon.events.push(event('pause_triggered',reason,{resumePoint}));return{reason,resumePoint}}})}
  async submitRevision(sessionId:string,expected:number,candidate:EpisodeScript,reason:string,identity:OperationIdentity):Promise<OperationExecution<{episodeId:string;revisionVersion:number}>>{
    let parsed!:ParsedScript
    return this.mutateOperation(sessionId,expected,'story_submit_script_revision',identity,{candidate,reason},`revision:${reason}`,{
      validate:state=>{parsed=validateScriptSchema(candidate);const episodes=new Map<string,ParsedScript>([[candidate.episodeId,parsed]]);const diagnostics=validateCrossReferences(episodes).filter(d=>!d.includes('startsAfter'));if(diagnostics.length)throw new Error(`修订校验失败：${diagnostics.join('; ')}`);if(state.playedCanon.pauseState!=='paused-for-revision')throw new Error('当前不在 paused-for-revision 状态');const previous=state.authoredScript.scripts[candidate.episodeId];if(previous&&candidate.revision.version<=previous.version)throw new Error('修订版本必须高于当前版本')},
      mutate:async state=>{state.playedCanon.pauseState='validating-revision';const directory=state.authoredScript.runtimeScriptRoot;await mkdir(directory,{recursive:true});const target=join(directory,`${this.safe(candidate.episodeId)}.v${candidate.revision.version}.json`);await this.atomicWrite(target,candidate);state.authoredScript.scripts[candidate.episodeId]={...parsed.index.byEpisode[candidate.episodeId],scriptPath:target};state.playedCanon.events.push(event('revision_submitted',reason,{episodeId:candidate.episodeId,version:candidate.revision.version}));state.playedCanon.pauseState='running';delete state.playedCanon.pendingRevision;return{episodeId:candidate.episodeId,revisionVersion:candidate.revision.version}},
    })
  }
  async recordEpisodeSummary(sessionId:string,expected:number,script:EpisodeScript,sceneId:string,consequences:string[],relationshipChanges:string[]=[],identity:OperationIdentity):Promise<OperationExecution<{summary:EpisodeSummary}>>{
    return this.mutateOperation(sessionId,expected,'story_record_episode_summary',identity,{script,sceneId,consequences,relationshipChanges},`episode_summary:${script.episodeId}`,{
      mutate:state=>{const records=state.playedCanon.choices.filter(c=>c.episodeId===script.episodeId);const chosen=records.map(r=>{const choice=script.scenes.flatMap(s=>s.choices).find(c=>c.id===r.choiceId)!;return{choiceId:r.choiceId,selected:r.selectedOptionIds.map(id=>{const option=choice.options.find(o=>o.id===id)!;return{id,label:option.label}})}});const declined=records.map(r=>{const choice=script.scenes.flatMap(s=>s.choices).find(c=>c.id===r.choiceId)!;return{choiceId:r.choiceId,options:choice.options.filter(o=>!r.selectedOptionIds.includes(o.id)).map(o=>({id:o.id,label:o.label}))}});const summary:EpisodeSummary={season:script.season,episodeId:script.episodeId,sceneId,chosen,declined,freeInputs:records.filter(r=>r.freeInput).map(r=>({choiceId:r.choiceId,input:r.freeInput!})),consequences:[...consequences],relationshipChanges:[...relationshipChanges],createdAt:new Date().toISOString()};state.playedCanon.episodeSummaries[script.episodeId]=summary;state.playedCanon.events.push(event('episode_summary',undefined,{summary}));const playedSceneIds=state.playedCanon.events.flatMap(item=>item.type==='scene_entered'&&item.episodeId===script.episodeId&&item.sceneId!==undefined?[item.sceneId]:[]);for(const playedSceneId of playedSceneIds)if(!state.playedCanon.completedScenes.includes(playedSceneId))state.playedCanon.completedScenes.push(playedSceneId);return{summary}},
    })
  }
  async checkpoint(sessionId:string,label:string,operationId?:string):Promise<{id:string;path:string}>{const source=this.path(sessionId);await this.read(sessionId);const id=operationId?`op_${operationCheckpointKey(operationId)}_${this.safe(label).slice(0,40)}`:`${Date.now()}_${this.safe(label).slice(0,50)}`;const target=join(this.directory(sessionId),'checkpoints',`${id}.json`);await mkdir(dirname(target),{recursive:true});if(operationId){try{await access(target);return{id,path:target}}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error}}await copyFile(source,target);return{id,path:target}}
  async checkpoints(sessionId:string):Promise<Array<{id:string}>>{const directory=join(this.directory(sessionId),'checkpoints');const names=await readdir(directory).catch(e=>{if((e as NodeJS.ErrnoException).code==='ENOENT')return[];throw e});return names.filter(n=>n.endsWith('.json')).sort().reverse().map(n=>({id:n.slice(0,-5)}))}
  async restoreCheckpoint(sessionId:string,checkpointId:string):Promise<RuntimeState>{if(this.safe(checkpointId)!==checkpointId)throw new Error('检查点 ID 无效');const source=join(this.directory(sessionId),'checkpoints',`${checkpointId}.json`);const restored=this.normalize(JSON.parse(await readFile(source,'utf8')),sessionId);const current=await this.read(sessionId);for(const[id,receipt]of Object.entries(restored._engine.operationReceipts)){const currentReceipt=current._engine.operationReceipts[id];if(currentReceipt&&!isDeepStrictEqual(currentReceipt,receipt))throw new Error(`检查点 operation receipt 冲突：${id}`)}restored._engine.operationReceipts={...restored._engine.operationReceipts,...current._engine.operationReceipts};restored._engine.stateVersion=current._engine.stateVersion+1;restored._engine.updatedAt=new Date().toISOString();await this.atomicWrite(this.path(sessionId),restored);return restored}
  private async atomicWrite(path:string,value:unknown):Promise<void>{await mkdir(dirname(path),{recursive:true});const temporary=`${path}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;await writeFile(temporary,`${JSON.stringify(value,null,2)}\n`,'utf8');await rename(temporary,path)}
}
