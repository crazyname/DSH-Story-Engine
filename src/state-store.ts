import { copyFile, mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

type JsonObject = Record<string, any>
const PROTECTED_ROOTS = new Set(['_engine', 'playerControl'])

function merge(target: JsonObject, patch: JsonObject): JsonObject {
  const result = { ...target }
  for (const [key, value] of Object.entries(patch)) {
    result[key] = value && typeof value === 'object' && !Array.isArray(value)
      && result[key] && typeof result[key] === 'object' && !Array.isArray(result[key])
      ? merge(result[key], value)
      : value
  }
  return result
}

export class StoryStateStore {
  constructor(
    private readonly runtimeRoot: string,
    private readonly packId: string,
    private readonly initialState: JsonObject,
  ) {}

  private safe(value: string): string {
    return basename(value.replace(/[^a-zA-Z0-9_-]/g, '_')).slice(0, 100) || 'default'
  }

  private directory(sessionId: string): string { return join(this.runtimeRoot, this.safe(this.packId), this.safe(sessionId)) }
  private statePath(sessionId: string): string { return join(this.directory(sessionId), 'state.json') }

  async read(sessionId: string): Promise<JsonObject> {
    const path = this.statePath(sessionId)
    try { return JSON.parse(await readFile(path, 'utf8')) as JsonObject } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      const state: JsonObject = structuredClone(this.initialState)
      state._engine = { schemaVersion: 1, stateVersion: 0, packId: this.packId, createdAt: new Date().toISOString() }
      state.playerControl ??= {}
      await this.atomicWrite(path, state)
      return state
    }
  }

  async commit(sessionId: string, expectedVersion: number, changes: JsonObject, reason: string): Promise<JsonObject> {
    const forbidden = Object.keys(changes).filter(key => PROTECTED_ROOTS.has(key))
    if (forbidden.length) throw new Error(`禁止修改引擎保护字段：${forbidden.join(', ')}`)
    const state = await this.read(sessionId)
    const metadata = state._engine as JsonObject
    const current = Number(metadata.stateVersion ?? 0)
    if (current !== expectedVersion) throw new Error(`状态版本冲突：当前 ${current}，提交基于 ${expectedVersion}`)
    for (const [key, value] of Object.entries(changes)) {
      state[key] = value && typeof value === 'object' && !Array.isArray(value)
        ? merge((state[key] as JsonObject) ?? {}, value)
        : value
    }
    metadata.stateVersion = current + 1
    metadata.updatedAt = new Date().toISOString()
    const history = Array.isArray(state.history) ? state.history : []
    history.push({ version: metadata.stateVersion, reason, at: metadata.updatedAt })
    state.history = history
    await this.atomicWrite(this.statePath(sessionId), state)
    return state
  }

  async advanceScene(sessionId: string, expectedVersion: number, scene: string, summary: string): Promise<JsonObject> {
    if (!scene.trim()) throw new Error('scene 不能为空')
    const before = await this.read(sessionId)
    const current = Number((before._engine as JsonObject).stateVersion ?? 0)
    if (current !== expectedVersion) throw new Error(`状态版本冲突：当前 ${current}，提交基于 ${expectedVersion}`)
    await this.checkpoint(sessionId, `before_${scene}`)
    const campaign: JsonObject = { ...((before.campaign as JsonObject) ?? {}), scene }
    campaign.turn = Number(campaign.turn ?? 0) + 1
    return await this.commit(sessionId, expectedVersion, { campaign }, `advance_scene: ${summary}`)
  }

  async checkpoint(sessionId: string, label: string): Promise<{ id: string; path: string }> {
    const source = this.statePath(sessionId)
    await this.read(sessionId)
    const id = `${Date.now()}_${this.safe(label).slice(0, 50)}`
    const target = join(this.directory(sessionId), 'checkpoints', `${id}.json`)
    await mkdir(dirname(target), { recursive: true })
    await copyFile(source, target)
    return { id, path: target }
  }

  async checkpoints(sessionId: string): Promise<Array<{ id: string }>> {
    const directory = join(this.directory(sessionId), 'checkpoints')
    const names = await readdir(directory).catch(error => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    })
    return names.filter(name => name.endsWith('.json')).sort().reverse().map(name => ({ id: name.slice(0, -5) }))
  }

  private async atomicWrite(path: string, state: JsonObject): Promise<void> {
    await mkdir(dirname(path), { recursive: true })
    const temporary = `${path}.${process.pid}.tmp`
    await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
    await rename(temporary, path)
  }
}
