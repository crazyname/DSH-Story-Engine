import { describe, expect, it } from 'vitest'
import { INSTALLED_PACKS, cloneSave, createNewGame, groupSavesByPack, newSaveId, packsWithoutSaves } from '../src/client/game-library.ts'
import { createInitialProjection } from '../src/client/initial-projection.ts'
import type { SaveSummary } from '../src/client/host-persistence.ts'

function save(saveId: string, packId: string, updatedAt = '2026-08-28T10:00:00.000Z'): SaveSummary {
  return { saveId, packId, packTitle: '雾海灯塔站', revision: 3, updatedAt, sceneLabel: '灯室里的裂纹' }
}

describe('game library domain', () => {
  it('lists installed packs with ready status', () => {
    expect(INSTALLED_PACKS.length).toBeGreaterThan(0)
    expect(INSTALLED_PACKS[0]).toMatchObject({ packId: 'lantern-station', status: 'ready' })
    for (const pack of INSTALLED_PACKS) {
      expect(pack.title).toBeTruthy()
      expect(pack.author).toBeTruthy()
      expect(pack.version).toBeTruthy()
    }
  })

  it('groups saves by pack id', () => {
    const saves = [save('a', 'lantern-station'), save('b', 'lantern-station'), save('c', 'other-pack')]
    const grouped = groupSavesByPack(saves)
    expect(grouped.get('lantern-station')).toHaveLength(2)
    expect(grouped.get('other-pack')).toHaveLength(1)
    expect(grouped.has('missing')).toBe(false)
  })

  it('reports packs without any save for the new-game entry', () => {
    const grouped = groupSavesByPack([save('a', 'lantern-station')])
    expect(packsWithoutSaves(INSTALLED_PACKS, grouped)).toEqual([])
    const empty = groupSavesByPack([])
    expect(packsWithoutSaves(INSTALLED_PACKS, empty)).toEqual([...INSTALLED_PACKS])
  })

  it('mints unique, host-safe save ids', () => {
    const a = newSaveId('lantern-station')
    const b = newSaveId('lantern-station')
    expect(a).not.toBe(b)
    expect(a).toMatch(/^[a-zA-Z0-9_-]+$/)
    expect(a).toContain('lantern-station')
  })

  it('creates a new-game projection with the given save id', () => {
    const projection = createNewGame(INSTALLED_PACKS[0]!, 'lantern-station-abc123')
    expect(projection.saveId).toBe('lantern-station-abc123')
    expect(projection.packId).toBe('lantern-station')
    expect(projection.revision).toBe(0)
    expect(projection.messages.length).toBeGreaterThan(0)
  })

  it('clones a save under a new id with revision reset (save-as)', () => {
    const source = createInitialProjection()
    const advanced = { ...source, revision: 7, messages: [...source.messages.slice(0, 2)] }
    const copy = cloneSave(advanced, 'lantern-station-copy123')
    expect(copy.saveId).toBe('lantern-station-copy123')
    expect(copy.revision).toBe(0)
    expect(copy.messages).toEqual(advanced.messages)
    expect(copy.updatedAt).not.toBe(advanced.updatedAt)
    // Mutating the copy must not affect the source (deep clone).
    copy.messages.push(advanced.messages[0]!)
    expect(advanced.messages).toHaveLength(2)
  })
})
