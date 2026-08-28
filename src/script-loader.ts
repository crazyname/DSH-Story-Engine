import { access, readdir, readFile } from 'node:fs/promises'
import { join, relative, resolve, sep } from 'node:path'
import type { EpisodeScript, Scene, ScriptRecord, WorkResult } from './serial-types.js'

export interface ScriptIndex {
  byEpisode: Record<string, ScriptRecord>
  sceneToEpisode: Map<string, string>
  choiceToScene: Map<string, { episodeId: string; sceneId: string }>
  transitionsByCondition: Map<string, Array<{ targetSceneId: string; episodeId: string }>>
}
export interface ParsedScript { script: EpisodeScript; index: ScriptIndex; diagnostics: string[] }

function object(value: unknown, at: string): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${at} 必须是对象`)
  return value as Record<string, any>
}
function strings(value: unknown, at: string): string[] {
  if (!Array.isArray(value) || !value.every(v => typeof v === 'string')) throw new Error(`${at} 必须是字符串数组`)
  return value
}
function nonempty(value: unknown, at: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${at} 不能为空`)
  return value
}

export function validateScriptSchema(value: unknown, scriptPath = '<memory>'): ParsedScript {
  const data = object(value, scriptPath)
  if (data.schemaVersion !== 1) throw new Error('schemaVersion 必须为 1')
  const episodeId = nonempty(data.episodeId, 'episodeId')
  if (!/^[a-z0-9][a-z0-9._-]{1,127}$/.test(episodeId)) throw new Error(`episodeId 格式无效：${episodeId}`)
  if (!Number.isInteger(data.season) || data.season < 1) throw new Error('season 必须为正整数')
  if (!Number.isInteger(data.episode) || data.episode < 1) throw new Error('episode 必须为正整数')
  nonempty(data.title, 'title')
  if (!['draft', 'validated', 'playing', 'completed', 'superseded'].includes(data.status)) throw new Error('status 无效')
  const continuity = object(data.continuity, 'continuity')
  if (typeof continuity.startsAfter !== 'string') throw new Error('continuity.startsAfter 必须是字符串')
  strings(continuity.fixedFacts, 'continuity.fixedFacts'); strings(continuity.openThreads, 'continuity.openThreads')
  const seasonDecision = object(continuity.seasonDecision, 'continuity.seasonDecision')
  if (!['continue_current_season', 'start_new_season'].includes(seasonDecision.mode)) throw new Error('continuity.seasonDecision.mode 无效')
  nonempty(seasonDecision.reason, 'continuity.seasonDecision.reason')
  if (!Array.isArray(data.scenes) || data.scenes.length === 0) throw new Error('scenes 必须为非空数组')

  const sceneIds = new Set<string>(); const choiceIds = new Set<string>()
  for (const raw of data.scenes) {
    const scene = object(raw, 'scene'); const id = nonempty(scene.id, 'scene.id')
    if (sceneIds.has(id)) throw new Error(`重复场景 ID：${id}`); sceneIds.add(id)
    if (!['work', 'off_work'].includes(scene.mode)) throw new Error(`scene.mode 无效：${String(scene.mode)}`)
    nonempty(scene.title, `${id}.title`)
    for (const key of ['entryConditions','cast','fixedFacts','secrets','beats','dialogueAnchors','improvisationEnvelope','exitConditions','stateEffects']) strings(scene[key], `${id}.${key}`)
    object(scene.characterGoals, `${id}.characterGoals`)
    if (scene.beats.length === 0 || scene.exitConditions.length === 0) throw new Error(`${id} 的 beats 和 exitConditions 不能为空`)
    if (!Array.isArray(scene.transitions)) throw new Error(`${id}.transitions 必须为数组`)
    for (const rawTransition of scene.transitions) {
      const transition = object(rawTransition, `${id}.transition`)
      nonempty(transition.condition, `${id}.transition.condition`); nonempty(transition.nextScene, `${id}.transition.nextScene`)
    }
    if (!Array.isArray(scene.choices)) throw new Error(`${id}.choices 必须为数组`)
    for (const rawChoice of scene.choices) {
      const choice = object(rawChoice, `${id}.choice`); const choiceId = nonempty(choice.id, `${id}.choice.id`)
      if (choiceIds.has(choiceId)) throw new Error(`重复选择 ID：${choiceId}`); choiceIds.add(choiceId)
      nonempty(choice.prompt, `${choiceId}.prompt`)
      if (choice.allowFreeInput !== true) throw new Error(`${choiceId}.allowFreeInput 必须为 true`)
      if (!Array.isArray(choice.options) || choice.options.length < 2 || choice.options.length > 4) throw new Error(`${choiceId}.options 必须为 2-4 个`)
      const optionIds = new Set<string>()
      for (const rawOption of choice.options) {
        const option = object(rawOption, `${choiceId}.option`); const optionId = nonempty(option.id, `${choiceId}.option.id`)
        if (optionIds.has(optionId)) throw new Error(`${choiceId} 存在重复选项 ${optionId}`); optionIds.add(optionId)
        nonempty(option.label, `${choiceId}.${optionId}.label`); strings(option.consequenceTags, `${choiceId}.${optionId}.consequenceTags`)
        if (option.nextScene !== undefined && typeof option.nextScene !== 'string') throw new Error(`${choiceId}.${optionId}.nextScene 必须是字符串`)
      }
    }
    if (scene.mode === 'work') {
      const summary = object(scene.workSummary, `${id}.workSummary`)
      if (typeof summary.autoResolveMinorEvents !== 'boolean' || !Array.isArray(summary.events)) throw new Error(`work 模式场景必须有合法 workSummary`)
      for (const rawEvent of summary.events) {
        const event = object(rawEvent, `${id}.workEvent`); nonempty(event.name, 'workEvent.name')
        if (!Array.isArray(event.assignedActors) || event.assignedActors.length === 0) throw new Error('workEvent.assignedActors 不能为空')
        const results: WorkResult[] = ['perfect','success','partial','failure','disaster']
        if (!results.includes(event.result)) throw new Error('workEvent.result 无效')
        strings(event.stateEffects, 'workEvent.stateEffects')
      }
    }
  }
  const ending = object(data.ending, 'ending'); if (strings(ending.completionConditions, 'ending.completionConditions').length === 0) throw new Error('completionConditions 不能为空')
  const recap = object(ending.recap, 'ending.recap')
  if (recap.includeChosen !== true || recap.includeDeclined !== true || recap.showNetworkPercentages !== false || recap.revealHiddenBranches !== false || typeof recap.includeConsequences !== 'boolean') throw new Error('ending.recap 违反隐私或总结约束')
  const revision = object(data.revision, 'revision')
  if (!Number.isInteger(revision.version) || revision.version < 1 || revision.outOfScriptPolicy !== 'immediate_pause_revise_validate_resume' || !Array.isArray(revision.history)) throw new Error('revision 无效')
  const script = data as EpisodeScript
  return { script, index: buildIndex(script, scriptPath), diagnostics: [] }
}

export function buildIndex(script: EpisodeScript, scriptPath = '<memory>'): ScriptIndex {
  const index: ScriptIndex = { byEpisode: {}, sceneToEpisode: new Map(), choiceToScene: new Map(), transitionsByCondition: new Map() }
  index.byEpisode[script.episodeId] = { episodeId: script.episodeId, season: script.season, episode: script.episode, title: script.title, status: script.status, version: script.revision.version, scriptPath, sceneIds: script.scenes.map(s => s.id) }
  for (const scene of script.scenes) {
    index.sceneToEpisode.set(scene.id, script.episodeId)
    for (const choice of scene.choices) {
      index.choiceToScene.set(choice.id, { episodeId: script.episodeId, sceneId: scene.id })
      for (const option of choice.options) if (option.nextScene) addTransition(index, `choice:${choice.id}:${option.id}`, option.nextScene, script.episodeId)
    }
    for (const transition of scene.transitions) addTransition(index, transition.condition, transition.nextScene, script.episodeId)
  }
  return index
}
function addTransition(index: ScriptIndex, condition: string, targetSceneId: string, episodeId: string): void {
  const values = index.transitionsByCondition.get(condition) ?? []; values.push({ targetSceneId, episodeId }); index.transitionsByCondition.set(condition, values)
}

export async function discoverAndLoadEpisodes(packRoot: string): Promise<Map<string, ParsedScript>> {
  const root = resolve(packRoot, 'story', 'episodes')
  try { await access(root) } catch { return new Map() }
  const files: string[] = []
  async function walk(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const target = resolve(directory, entry.name)
      if (target !== root && !target.startsWith(`${root}${sep}`)) throw new Error(`剧本路径越界：${entry.name}`)
      if (entry.isDirectory()) await walk(target)
      else if (entry.isFile() && entry.name.endsWith('.json') && entry.name !== 'episode-script.schema.json') files.push(target)
    }
  }
  await walk(root)
  const episodes = new Map<string, ParsedScript>()
  for (const file of files.sort()) {
    const parsed = validateScriptSchema(JSON.parse(await readFile(file, 'utf8')), relative(packRoot, file).replaceAll('\\','/'))
    if (episodes.has(parsed.script.episodeId)) throw new Error(`重复剧本 ID：${parsed.script.episodeId}`)
    episodes.set(parsed.script.episodeId, parsed)
  }
  const diagnostics = validateCrossReferences(episodes); if (diagnostics.length) throw new Error(`剧本交叉引用无效：\n${diagnostics.join('\n')}`)
  return episodes
}

export function validateCrossReferences(episodes: Map<string, ParsedScript>): string[] {
  const errors: string[] = []; const allScenes = new Map<string, string>(); const allChoices = new Map<string, string>()
  for (const parsed of episodes.values()) for (const scene of parsed.script.scenes) {
    if (allScenes.has(scene.id)) errors.push(`重复的全局场景 ID：${scene.id}`); else allScenes.set(scene.id, parsed.script.episodeId)
    for (const choice of scene.choices) { if (allChoices.has(choice.id)) errors.push(`重复的全局选择 ID：${choice.id}`); else allChoices.set(choice.id, scene.id) }
  }
  for (const parsed of episodes.values()) {
    const { script } = parsed
    if (script.continuity.startsAfter && !episodes.has(script.continuity.startsAfter)) errors.push(`${script.episodeId}.startsAfter 不存在：${script.continuity.startsAfter}`)
    const localScenes = new Set(script.scenes.map(s => s.id)); const reachable = new Set<string>(); const queue = [script.scenes[0].id]
    while (queue.length) { const id = queue.shift()!; if (reachable.has(id)) continue; reachable.add(id); const scene = script.scenes.find(s => s.id === id); if (!scene) continue; for (const target of [...scene.transitions.map(t => t.nextScene), ...scene.choices.flatMap(c => c.options.map(o => o.nextScene).filter((x): x is string => Boolean(x)))]) if (localScenes.has(target)) queue.push(target) }
    for (const scene of script.scenes) {
      for (const target of [...scene.transitions.map(t => t.nextScene), ...scene.choices.flatMap(c => c.options.map(o => o.nextScene).filter((x): x is string => Boolean(x)))]) if (!allScenes.has(target)) errors.push(`${script.episodeId}/${scene.id} 引用不存在场景：${target}`)
      if (!reachable.has(scene.id)) errors.push(`${script.episodeId} 存在不可达场景：${scene.id}`)
    }
  }
  return errors
}
export function listSceneIdsInOrder(script: EpisodeScript): string[] { return script.scenes.map(s => s.id) }
export function getSceneExitConditions(scene: Scene): string[] { return [...scene.exitConditions] }
export function findTargetSceneByCondition(scripts: Map<string, ParsedScript>, condition: string): { targetSceneId: string; episodeId: string } | null {
  for (const parsed of scripts.values()) { const found = parsed.index.transitionsByCondition.get(condition)?.[0]; if (found) return found }
  return null
}
