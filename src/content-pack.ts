import { readdir, readFile } from 'node:fs/promises'
import { extname, relative, resolve, sep } from 'node:path'
import type { ContentDocument, LoadedStoryPack, StoryPackManifest } from './types.js'

const PACK_ID = /^[a-z0-9][a-z0-9-]{1,63}$/
const CONTENT_KEYS = ['world', 'characters', 'lore', 'mechanics', 'story'] as const

function object(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${field} 必须是对象`)
  return value as Record<string, unknown>
}

function inside(root: string, candidate: string): string {
  const base = resolve(root)
  const target = resolve(base, candidate)
  if (target !== base && !target.startsWith(`${base}${sep}`)) throw new Error(`内容路径越界：${candidate}`)
  return target
}

function jsonLineId(line: string, lineNumber: number): string {
  try {
    const value = JSON.parse(line) as Record<string, unknown>
    for (const key of ['record_id', 'choice_id', 'hero_id', 'character_id', 'event_id', 'id', 'name']) {
      const candidate = value?.[key]
      if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
    }
  } catch {
    // The loader reports the exact malformed line below, with its file location.
  }
  return `line-${lineNumber}`
}

export function validateManifest(value: unknown): StoryPackManifest {
  const data = object(value, 'pack.json')
  if (data.schemaVersion !== 1) throw new Error('仅支持 schemaVersion: 1')
  if (typeof data.id !== 'string' || !PACK_ID.test(data.id)) throw new Error('id 必须是 2–64 位小写字母、数字或连字符')
  for (const key of ['name', 'version', 'language', 'license'] as const) {
    if (typeof data[key] !== 'string' || !data[key].trim()) throw new Error(`${key} 不能为空`)
  }
  const player = object(data.player, 'player')
  if (!Array.isArray(player.controlledCharacters) || !player.controlledCharacters.every(item => typeof item === 'string' && item.trim())) {
    throw new Error('player.controlledCharacters 必须是非空名字数组')
  }
  if (player.controlledCharacters.length === 0) throw new Error('至少需要一个玩家控制角色')
  if (typeof player.aiMayControlPlayer !== 'boolean') throw new Error('player.aiMayControlPlayer 必须是布尔值')
  const content = object(data.content, 'content')
  if (typeof content.initialState !== 'string' || !content.initialState) throw new Error('content.initialState 不能为空')
  object(data.modules, 'modules')
  return data as unknown as StoryPackManifest
}

export class ContentPackLoader {
  async load(root: string): Promise<LoadedStoryPack> {
    const absoluteRoot = resolve(root)
    const manifest = validateManifest(JSON.parse(await readFile(inside(absoluteRoot, 'pack.json'), 'utf8')))
    const initialState = object(JSON.parse(await readFile(inside(absoluteRoot, manifest.content.initialState), 'utf8')), 'initialState')
    const documents: ContentDocument[] = []
    for (const kind of CONTENT_KEYS) {
      const path = manifest.content[kind]
      if (path) documents.push(...await this.readDocuments(absoluteRoot, path, kind))
    }
    if (manifest.content.gameMasterPrompt) {
      documents.push(...await this.readDocuments(absoluteRoot, manifest.content.gameMasterPrompt, 'prompt'))
    }
    return { root: absoluteRoot, manifest, initialState, documents }
  }

  private async readDocuments(root: string, path: string, kind: ContentDocument['kind']): Promise<ContentDocument[]> {
    const target = inside(root, path)
    const statEntries = await readdir(target, { withFileTypes: true }).catch(async error => {
      if ((error as NodeJS.ErrnoException).code !== 'ENOTDIR') throw error
      return null
    })
    const files = statEntries === null
      ? [target]
      : (await Promise.all(statEntries.map(async entry => entry.isDirectory()
          ? (await this.readDocuments(root, relative(root, resolve(target, entry.name)), kind)).map(item => inside(root, item.relativePath))
          : [resolve(target, entry.name)]))).flat()
    const unique = [...new Set(files)]
    const documents: ContentDocument[] = []
    for (const file of unique.sort()) {
      const extension = extname(file).toLowerCase()
      if (!['.md', '.json', '.jsonl', '.ndjson', '.txt'].includes(extension)) continue
      const relativePath = relative(root, file).replaceAll('\\', '/')
      const text = await readFile(file, 'utf8')
      if (extension === '.jsonl' || extension === '.ndjson') {
        const lines = text.split(/\r?\n/u)
        for (let index = 0; index < lines.length; index += 1) {
          const line = lines[index].trim()
          if (!line) continue
          try { JSON.parse(line) } catch { throw new Error(`JSONL 格式错误：${relativePath}:${index + 1}`) }
          const recordId = jsonLineId(line, index + 1)
          documents.push({
            id: `${kind}:${relativePath}#${recordId}`,
            kind,
            relativePath: `${relativePath}#L${index + 1}`,
            mediaType: 'application/x-ndjson',
            text: line,
          })
        }
        continue
      }
      documents.push({
        id: `${kind}:${relativePath}`,
        kind,
        relativePath,
        mediaType: extension === '.md' ? 'text/markdown' : extension === '.json' ? 'application/json' : 'text/plain',
        text,
      })
    }
    return documents
  }
}
