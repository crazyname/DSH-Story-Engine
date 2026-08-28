import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { StoryStateStore } from './state-store.js'

let directory = ''
afterEach(async () => { if (directory) await rm(directory, { recursive: true, force: true }); directory = '' })

describe('StoryStateStore', () => {
  it('isolates sessions and protects engine metadata', async () => {
    directory = await mkdtemp(join(tmpdir(), 'story-state-'))
    const store = new StoryStateStore(directory, 'test-pack', { campaign: { scene: 'opening', turn: 0 }, flags: {} })
    const initial = await store.read('one')
    expect(initial._engine.stateVersion).toBe(0)
    const next = await store.commit('one', 0, { flags: { met: true } }, 'met someone')
    expect(next._engine.stateVersion).toBe(1)
    await expect(store.commit('one', 0, { flags: {} }, 'stale')).rejects.toThrow('版本冲突')
    await expect(store.commit('one', 1, { _engine: {} }, 'bad')).rejects.toThrow('保护字段')
    expect((await store.read('two'))._engine.stateVersion).toBe(0)
  })

  it('checkpoints before advancing a scene', async () => {
    directory = await mkdtemp(join(tmpdir(), 'story-state-'))
    const store = new StoryStateStore(directory, 'test-pack', { campaign: { scene: 'opening', turn: 0 } })
    const advanced = await store.advanceScene('one', 0, 'workshop', '进入维修间')
    expect(advanced.campaign.scene).toBe('workshop')
    expect(advanced._engine.stateVersion).toBe(1)
    expect((await store.checkpoints('one'))).toHaveLength(1)
    await expect(store.advanceScene('one', 0, 'bad', 'stale')).rejects.toThrow('版本冲突')
    expect((await store.checkpoints('one'))).toHaveLength(1)
  })
})
