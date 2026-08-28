import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { ContentPackLoader, validateManifest } from './content-pack.js'
import type { LoadedStoryPack, StoryPackManifest } from './types.js'

export interface CharacterDraft { name: string; role?: string }
export interface PackDraft {
  id: string
  name: string
  description?: string
  language?: string
  license?: string
  playerCharacter: string
  worldBackground: string
  opening: string
  characters?: CharacterDraft[]
}

function text(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} 不能为空`)
  const result = value.trim()
  if (result.length > max) throw new Error(`${field} 不能超过 ${max} 个字符`)
  return result
}

export class PackAuthor {
  constructor(private readonly loader = new ContentPackLoader()) {}

  async create(draft: PackDraft, privateRoot: string): Promise<LoadedStoryPack> {
    const id = text(draft.id, '内容包 ID', 64)
    const name = text(draft.name, '游戏名称', 100)
    const player = text(draft.playerCharacter, '玩家角色', 100)
    const world = text(draft.worldBackground, '世界背景', 20_000)
    const opening = text(draft.opening, '开场', 20_000)
    const description = (draft.description ?? '').trim().slice(0, 500)
    const language = (draft.language ?? 'zh-CN').trim() || 'zh-CN'
    const license = (draft.license ?? 'Private-Use-Only').trim() || 'Private-Use-Only'
    const characters = (draft.characters ?? []).slice(0, 100).map((character, index) => ({
      id: `character-${index + 1}`,
      name: text(character.name, `人物 ${index + 1} 名称`, 100),
      role: (character.role ?? '').trim().slice(0, 200),
      controlledBy: character.name.trim() === player ? 'player' : 'ai',
    }))
    if (!characters.some(character => character.name === player)) {
      characters.unshift({ id: 'player', name: player, role: '玩家角色', controlledBy: 'player' })
    }
    const manifest: StoryPackManifest = {
      schemaVersion: 1, id, name, version: '0.1.0', language, license, description,
      player: { controlledCharacters: [player], aiMayControlPlayer: false },
      modules: { relationships: true },
      content: {
        world: 'world', characters: 'characters', story: 'story',
        initialState: 'runtime/initial-state.json', gameMasterPrompt: 'prompts/game-master.md',
      },
    }
    validateManifest(manifest)
    const root = resolve(privateRoot)
    const destination = join(root, id)
    try { await stat(destination); throw new Error(`内容包已经存在：${id}`) } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    await mkdir(root, { recursive: true })
    const staging = join(root, `.staging-${id}-${process.pid}-${Date.now()}`)
    try {
      for (const directory of ['world', 'characters', 'story', 'runtime', 'prompts']) await mkdir(join(staging, directory), { recursive: true })
      await Promise.all([
        writeFile(join(staging, 'pack.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8'),
        writeFile(join(staging, 'world', 'overview.md'), `# ${name}\n\n${world}\n`, 'utf8'),
        writeFile(join(staging, 'characters', 'characters.json'), `${JSON.stringify(characters, null, 2)}\n`, 'utf8'),
        writeFile(join(staging, 'story', 'opening.md'), `# 开场\n\n${opening}\n`, 'utf8'),
        writeFile(join(staging, 'prompts', 'game-master.md'), `玩家只控制${player}。AI 控制世界与其他人物，不替${player}决定、说话、行动或描述内心。内容包未明确的事实应标记为即时创作。\n`, 'utf8'),
        writeFile(join(staging, 'runtime', 'initial-state.json'), `${JSON.stringify({
          campaign: { scene: 'opening', turn: 0 }, world: { location: '', knownFacts: [], createdFacts: [] },
          relationships: {}, activeMissions: [], openThreads: [], flags: {}, history: [],
        }, null, 2)}\n`, 'utf8'),
      ])
      await this.loader.load(staging)
      await rename(staging, destination)
      return await this.loader.load(destination)
    } catch (error) {
      await rm(staging, { recursive: true, force: true })
      throw error
    }
  }
}
