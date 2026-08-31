import { createHash } from 'node:crypto'
import { copyFile, cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { basename, isAbsolute, join, relative, resolve } from 'node:path'

const projectRoot = resolve(import.meta.dirname, '..')
const defaults = {
  asset: 'C:/Users/enze/Documents/Codex/2026-08-26/steam-mod/outputs/Dispatch_AI续作前置资产包',
  work: join(projectRoot, 'work/dispatch-import-20260828'),
  out: join(projectRoot, 'packs/private/dispatch-personal-continuation'),
}

function argument(name, fallback = defaults[name]) {
  const index = process.argv.indexOf(`--${name}`)
  return resolve(index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback)
}

const assetRoot = argument('asset')
const workRoot = argument('work')
const outputRoot = argument('out')
const overlayRoot = argument('overlay', join(workRoot, 'finalized-pack-overlay'))
const stagingRoot = `${outputRoot}.building`

const pretty = value => `${JSON.stringify(value, null, 2)}\n`
const jsonl = values => `${values.map(value => JSON.stringify(value)).join('\n')}\n`

async function json(path) { return JSON.parse(await readFile(path, 'utf8')) }
async function sha256(path) { return createHash('sha256').update(await readFile(path)).digest('hex') }
async function writeJson(path, value) { await mkdir(resolve(path, '..'), { recursive: true }); await writeFile(path, pretty(value), 'utf8') }
async function writeJsonl(path, value) { await mkdir(resolve(path, '..'), { recursive: true }); await writeFile(path, jsonl(value), 'utf8') }

function privateOverlayPath(root, value) {
  if (typeof value !== 'string' || !value || isAbsolute(value)) throw new Error(`私人覆盖层路径无效：${value}`)
  const target = resolve(root, value)
  const local = relative(root, target)
  if (!local || isAbsolute(local) || local.split(/[\\/]/u).includes('..')) throw new Error(`私人覆盖层路径无效：${value}`)
  return target
}

async function files(root) {
  const result = []
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) result.push(...await files(path))
    else result.push(path)
  }
  return result.sort()
}

function bytesOf(entry) {
  const bytes = entry?.value?.Data_0?.Byte
  return Array.isArray(bytes) ? bytes.map(Number) : []
}

function uuidSequential(bytes) {
  if (bytes.length !== 16) return undefined
  const hex = bytes.map(value => value.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function interpret(key, bytes) {
  const buffer = Buffer.from(bytes)
  const value = { byte_length: bytes.length, hex: buffer.toString('hex') }
  if (bytes.length === 4) {
    value.uint32_le = buffer.readUInt32LE(0)
    value.int32_le = buffer.readInt32LE(0)
    value.float32_le = buffer.readFloatLE(0)
  }
  if (key.startsWith('BV_') && bytes.length) value.named_boolean = bytes.some(byte => byte !== 0)
  if (key.startsWith('NV_') && bytes.length === 4) value.named_number = buffer.readFloatLE(0)
  if (key.startsWith('PLAYED_') && bytes.length === 4) value.played_count = buffer.readUInt32LE(0)
  if (key.startsWith('CHOICE_') && bytes.length === 16) value.choice_guid_candidate = uuidSequential(bytes)
  return value
}

function category(key) {
  for (const prefix of ['CHOICE_', 'PLAYED_', 'BV_', 'NV_', 'SGP_', 'EC_']) if (key.startsWith(prefix)) return prefix.slice(0, -1)
  return 'OTHER'
}

await rm(stagingRoot, { recursive: true, force: true })
await mkdir(stagingRoot, { recursive: true })

await cp(assetRoot, join(stagingRoot, 'source/content-assets'), { recursive: true })
await cp(join(workRoot, 'saves'), join(stagingRoot, 'source/save-snapshot'), { recursive: true })
await mkdir(join(stagingRoot, 'source/parsed'), { recursive: true })
for (const name of ['SaveSlot1.raw.json', 'SaveSlot1.raw.recheck.json', 'uesave.stdout.log', 'uesave.stderr.log']) {
  const source = join(workRoot, 'parsed', name)
  try { await copyFile(source, join(stagingRoot, 'source/parsed', name)) } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}

const dataRoot = join(assetRoot, 'data')
const corpus = await json(join(dataRoot, 'complete_localized_corpus.json'))
const characters = await json(join(dataRoot, 'characters_index.json'))
const heroes = await json(join(dataRoot, 'hero_dossiers.json'))
const choices = await json(join(dataRoot, 'canon_choices.json'))
const events = await json(join(dataRoot, 'dispatch_events.json'))
const mechanics = await json(join(dataRoot, 'mechanics_and_skills.json'))
const chapters = await json(join(dataRoot, 'chapter_retrieval_index.json'))
const dialogues = await json(join(dataRoot, 'dialogue_by_character.json'))
const sourceManifest = await json(join(assetRoot, 'manifest.json'))
const parsed = await json(join(workRoot, 'parsed/SaveSlot1.raw.json'))

await writeJsonl(join(stagingRoot, 'index/lore/corpus.jsonl'), corpus)
await writeJsonl(join(stagingRoot, 'index/lore/dialogue-groups.jsonl'), Object.entries(dialogues).map(([name, records]) => ({ name, records })))
await writeJsonl(join(stagingRoot, 'index/characters/characters.jsonl'), characters.map((item, index) => ({ character_id: `character-${index + 1}`, ...item })))
await writeJsonl(join(stagingRoot, 'index/characters/heroes.jsonl'), heroes)
await writeJsonl(join(stagingRoot, 'index/story/choices.jsonl'), choices)
await writeJsonl(join(stagingRoot, 'index/story/events.jsonl'), events)
await writeJsonl(join(stagingRoot, 'index/story/chapters.jsonl'), chapters.map((item, index) => ({ record_id: `chapter-${index + 1}`, ...item })))
await writeJsonl(join(stagingRoot, 'index/mechanics/mechanics.jsonl'), mechanics)

const properties = parsed.root.properties
const scenes = properties.SceneSnapshots_0
const globals = properties.GlobalDataSection_0
const saveVariables = []
for (let sceneIndex = 0; sceneIndex < scenes.length; sceneIndex += 1) {
  const scene = scenes[sceneIndex]
  for (let entryIndex = 0; entryIndex < scene.KeyDataPairs_0.length; entryIndex += 1) {
    const entry = scene.KeyDataPairs_0[entryIndex]
    const bytes = bytesOf(entry)
    saveVariables.push({
      record_id: `save:scene:${sceneIndex}:${entryIndex}`,
      scope: 'scene', scene_index: sceneIndex, scene_id: scene.SceneId_0,
      entry_index: entryIndex, key: entry.key, category: category(entry.key),
      raw_value: entry.value, bytes, interpretations: interpret(entry.key, bytes),
    })
  }
}
for (let index = 0; index < globals.length; index += 1) {
  const entry = globals[index]
  const bytes = bytesOf(entry)
  saveVariables.push({
    record_id: `save:global:${index}`, scope: 'global', entry_index: index,
    key: entry.key, category: category(entry.key), raw_value: entry.value,
    bytes, interpretations: interpret(entry.key, bytes),
  })
}
await writeJsonl(join(stagingRoot, 'index/story/save-variables.jsonl'), saveVariables)

const latestSceneIndexes = scenes.map((_, index) => index).slice(-10)
const finaleRecords = saveVariables.filter(record => record.scope === 'scene' && latestSceneIndexes.includes(record.scene_index))
const verifiedNamedFinale = finaleRecords.filter(record => ['BV', 'NV'].includes(record.category))
const episodeUnlocks = Object.fromEntries(globals.map(entry => [entry.key, bytesOf(entry).some(byte => byte !== 0)]))
const categoryCounts = Object.fromEntries([...new Set(saveVariables.map(item => item.category))].sort().map(name => [name, saveVariables.filter(item => item.category === name).length]))
const mainSave = join(workRoot, 'saves/SaveSlot1.sav')
const parserWarnings = (await readFile(join(workRoot, 'parsed/uesave.stderr.log'), 'utf8').catch(() => '')).split(/\r?\n/u).filter(Boolean)

const continuity = {
  schema_version: '1.0.0',
  import_mode: 'verified-save-with-unmapped-choice-identifiers',
  source: {
    save_file: 'SaveSlot1.sav', bytes: (await stat(mainSave)).size, sha256: await sha256(mainSave),
    parser: 'uesave 0.7.1', save_class: parsed.root.save_game_type,
    engine_version: parsed.header.engine_version,
  },
  completion: { scene_count: scenes.length, episode_unlocks: episodeUnlocks, episode_8_unlocked: episodeUnlocks['NS_UnlockNotification.Extras.PlayerChoices.Episode8'] === true },
  records: { total: saveVariables.length, category_counts: categoryCounts, jsonl: 'index/story/save-variables.jsonl' },
  finale_window: { scene_indexes: latestSceneIndexes, verified_named_values: verifiedNamedFinale },
  mapping_coverage: {
    raw_save_records_preserved: true,
    original_localized_records_preserved: true,
    choice_identifier_to_localized_choice_text: 'unmapped',
    reason: '存档中的 CHOICE_* 节点标识与本地化 ChoiceStat_* 标识之间没有经过验证的映射表。',
    policy: '保留全部原始值；未验证映射不得冒充玩家选择或结局事实。',
  },
  parser_warnings: { count: parserWarnings.length, log: 'source/parsed/uesave.stderr.log' },
  player_confirmation_required_for_unmapped_outcomes: true,
}
await writeJson(join(stagingRoot, 'continuity/continuity-save.json'), continuity)

const template = await json(join(assetRoot, 'runtime/campaign_state.template.json'))
template.ending_import = {
  completed: true,
  source: 'continuity/continuity-save.json',
  save_sha256: continuity.source.sha256,
  episode_8_unlocked: continuity.completion.episode_8_unlocked,
  scene_count: scenes.length,
  verified_named_finale_values: Object.fromEntries(verifiedNamedFinale.map(record => [record.key, record.interpretations.named_boolean ?? record.interpretations.named_number])),
  unmapped_outcomes_require_player_confirmation: true,
}
template.campaign.current_scene_id = 'POSTGAME_SCENE_001'
template.campaign.turn = 0
template.world.known_facts = ['Episode 8 已在导入存档中解锁', `导入存档包含 ${scenes.length} 个场景快照`]
template.flags = { imported_dispatch_save_sha256: continuity.source.sha256, raw_choice_mapping_verified: false }
await writeJson(join(stagingRoot, 'runtime/initial-state.json'), template)

const prompt = `# 私人续作主持规则\n\n这是用户本人存档与本地游戏资产生成的私人内容包。先读取连续性状态，再检索逐条资料。搜索结果是预览；需要引用或判断时，必须用 story_get_record 读取完整记录。\n\n- 玩家只控制 Robert；AI 不替 Robert 说话、选择、行动或决定内心。\n- 原始中文、英文、剧情、人设、对话、机制均作为可检索原文保存，不得压缩后冒充原文。\n- continuity-save.json 中 verified_named_values 是直接从存档解码的值。\n- CHOICE_* 与 ChoiceStat_* 尚无已验证映射，不能据此擅自宣布具体结局、恋爱关系、伤亡或队伍状态；遇到未映射结果应询问玩家确认。\n- 新剧情必须区分“游戏原始事实”“存档已验证事实”“AI 新创作事实”。\n`
await mkdir(join(stagingRoot, 'docs'), { recursive: true })
await writeFile(join(stagingRoot, 'docs/game-master.md'), prompt, 'utf8')
await copyFile(join(assetRoot, 'docs/CONTENT_CREATION_RULES.md'), join(stagingRoot, 'docs/original-content-creation-rules.md'))

const packManifest = {
  schemaVersion: 1, id: 'dispatch-personal-continuation', name: 'Dispatch 私人续作', version: '1.0.0',
  language: 'zh-CN', license: 'Private-Use-Only',
  description: '由用户本人通关存档与本地游戏内容生成的无损私人续作包。',
  player: { controlledCharacters: ['Robert'], aiMayControlPlayer: false },
  modules: { relationships: true, missions: true, resources: true, continuityImport: true, exactRecordRetrieval: true },
  content: {
    world: 'docs/original-content-creation-rules.md', characters: 'index/characters', lore: 'index/lore',
    mechanics: 'index/mechanics', story: 'index/story', initialState: 'runtime/initial-state.json', gameMasterPrompt: 'docs/game-master.md',
  },
}
await writeJson(join(stagingRoot, 'pack.json'), packManifest)

const expectedCounts = { corpus: 12438, characters: 174, heroes: 10, choices: 110, events: 2430, mechanics: 633, chapters: 12 }
const actualCounts = { corpus: corpus.length, characters: characters.length, heroes: heroes.length, choices: choices.length, events: events.length, mechanics: mechanics.length, chapters: chapters.length }
const countChecks = Object.fromEntries(Object.keys(expectedCounts).map(key => [key, { expected: expectedCounts[key], actual: actualCounts[key], match: expectedCounts[key] === actualCounts[key] }]))

const copiedSourceFiles = await files(join(stagingRoot, 'source'))
const checksumRows = []
for (const installedPath of copiedSourceFiles) {
  const relativePath = relative(join(stagingRoot, 'source'), installedPath).replaceAll('\\', '/')
  let sourcePath
  if (relativePath.startsWith('content-assets/')) sourcePath = join(assetRoot, relativePath.slice('content-assets/'.length))
  else if (relativePath.startsWith('save-snapshot/')) sourcePath = join(workRoot, 'saves', basename(relativePath))
  else sourcePath = join(workRoot, 'parsed', basename(relativePath))
  const [sourceHash, installedHash, info] = await Promise.all([sha256(sourcePath), sha256(installedPath), stat(installedPath)])
  checksumRows.push({ relative_path: relativePath, bytes: info.size, source_sha256: sourceHash, installed_sha256: installedHash, match: sourceHash === installedHash })
}
await writeJson(join(stagingRoot, 'audit/file-checksums.json'), checksumRows)

const migrationReport = {
  status: Object.values(countChecks).every(item => item.match) && checksumRows.every(item => item.match) ? 'verified' : 'failed',
  created_at: new Date().toISOString(), source_manifest_counts: sourceManifest.record_counts,
  indexed_counts: actualCounts, count_checks: countChecks,
  save: continuity.source, save_variable_records: saveVariables.length, scene_count: scenes.length,
  completion_evidence: continuity.completion, parser_warnings: continuity.parser_warnings,
  preservation: {
    source_content_asset_files_copied_byte_for_byte: checksumRows.filter(item => item.relative_path.startsWith('content-assets/')).every(item => item.match),
    source_save_snapshot_copied_byte_for_byte: checksumRows.filter(item => item.relative_path.startsWith('save-snapshot/')).every(item => item.match),
    parsed_save_copied_byte_for_byte: checksumRows.filter(item => item.relative_path.startsWith('parsed/')).every(item => item.match),
    record_level_indexes_are_additive: true,
  },
  limitations: [
    '无已验证的 CHOICE_* 到 ChoiceStat_* 映射，因此具体选择文本不会自动宣称为玩家结局。',
    '解析器对未声明的 Struct(None) 给出警告；原始 .sav、完整解析 JSON 与警告日志均已保留用于复核。',
  ],
}
await writeJson(join(stagingRoot, 'audit/migration-report.json'), migrationReport)
if (migrationReport.status !== 'verified') throw new Error('迁移校验失败，请检查 audit/migration-report.json')

// The base import is deliberately conservative. The ignored private overlay is
// the durable, hash-checked home for manually verified route/ending/UI work so
// a later rebuild cannot silently regress the pack to its pre-audit state.
const overlayManifest = await json(join(overlayRoot, 'overlay-manifest.json')).catch(error => {
  if (error?.code === 'ENOENT') return undefined
  throw error
})
let finalizedPack = await json(join(stagingRoot, 'pack.json'))
if (overlayManifest !== undefined) {
  if (overlayManifest.schemaVersion !== 1 || typeof overlayManifest.name !== 'string' || !overlayManifest.name || typeof overlayManifest.packVersion !== 'string' || !overlayManifest.packVersion || !Array.isArray(overlayManifest.files) || !overlayManifest.files.length) throw new Error('私人最终化覆盖层清单无效')
  if (!/^[a-f0-9]{64}$/u.test(String(overlayManifest.sourceSaveSha256).toLowerCase()) || String(overlayManifest.sourceSaveSha256).toLowerCase() !== continuity.source.sha256.toLowerCase()) throw new Error('私人最终化覆盖层不属于当前存档')
  const overlayTargets = new Set()
  for (const row of overlayManifest.files) {
    if (row === null || typeof row !== 'object' || Array.isArray(row) || typeof row.path !== 'string' || !/^[a-f0-9]{64}$/u.test(String(row.sha256).toLowerCase())) throw new Error('私人最终化覆盖层文件记录无效')
    const source = privateOverlayPath(overlayRoot, row.path)
    const target = privateOverlayPath(stagingRoot, row.path)
    if (overlayTargets.has(target)) throw new Error(`私人最终化覆盖层路径重复：${row.path}`)
    overlayTargets.add(target)
    const sourceHash = await sha256(source)
    if (sourceHash !== String(row.sha256).toLowerCase()) throw new Error(`私人最终化覆盖层哈希不匹配：${row.path}`)
    await mkdir(resolve(target, '..'), { recursive: true })
    await copyFile(source, target)
    if (await sha256(target) !== sourceHash) throw new Error(`私人最终化覆盖层复制校验失败：${row.path}`)
  }

  finalizedPack = await json(join(stagingRoot, 'pack.json'))
  const finalizedContinuity = await json(join(stagingRoot, 'continuity/continuity-save.json'))
  const finalizedCoverage = await json(join(stagingRoot, 'audit/episodes-1-8-coverage.json'))
  const finalizedUi = await json(join(stagingRoot, 'ui/story-ui.json'))
  const finalChecks = {
    pack_version_matches_overlay: finalizedPack.version === overlayManifest.packVersion,
    complete_choice_mapping: finalizedContinuity.import_mode === 'verified-save-with-complete-choice-mapping',
    episode_coverage_present: Array.isArray(finalizedCoverage.by_episode) && finalizedCoverage.by_episode.length > 0,
    all_actual_choices_have_official_bilingual_text: Number.isInteger(finalizedCoverage.counts?.actual_choices_total) && finalizedCoverage.counts.actual_choices_total > 0 && finalizedCoverage.counts.actual_choices_with_official_bilingual_text === finalizedCoverage.counts.actual_choices_total,
    ui_descriptor_present: finalizedUi.schemaVersion === 1 && Array.isArray(finalizedUi.participants) && finalizedUi.participants.length > 0 && Array.isArray(finalizedUi.channels) && finalizedUi.channels.length > 0,
  }
  if (!Object.values(finalChecks).every(Boolean)) throw new Error(`私人最终化覆盖层验收失败：${JSON.stringify(finalChecks)}`)
  migrationReport.finalization = { overlay: overlayManifest.name, pack_version: finalizedPack.version, checks: finalChecks }
  migrationReport.limitations = [
    '存档不是逐句字幕播放日志；实际路线与完整官方文本分别保存，不伪造逐句播放时间。',
    '解析器对未声明的 Struct(None) 给出警告；原始 .sav、完整解析 JSON 与警告日志均已保留用于复核。',
  ]
  await writeJson(join(stagingRoot, 'audit/migration-report.json'), migrationReport)
  await writeJson(join(stagingRoot, 'audit/rebuild-finalization-report.json'), {
    status: 'PASS', generated_at: new Date().toISOString(), overlay: overlayManifest.name,
    pack_version: finalizedPack.version, source_save_sha256: continuity.source.sha256,
    copied_files: overlayManifest.files.length, checks: finalChecks,
  })
}

await rm(outputRoot, { recursive: true, force: true })
await mkdir(resolve(outputRoot, '..'), { recursive: true })
await import('node:fs/promises').then(({ rename }) => rename(stagingRoot, outputRoot))
console.log(pretty({ outputRoot, status: migrationReport.status, packVersion: finalizedPack.version, ...(overlayManifest === undefined ? {} : { overlay: overlayManifest.name }), counts: actualCounts, saveVariables: saveVariables.length, scenes: scenes.length, parserWarnings: parserWarnings.length }))
