import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PackAuthor } from './pack-author.js'

let temporary = ''
afterEach(async () => { if (temporary) await rm(temporary, { recursive: true, force: true }); temporary = '' })

describe('PackAuthor', () => {
  it('creates a valid private story pack atomically', async () => {
    temporary = await mkdtemp(join(tmpdir(), 'story-author-'))
    const pack = await new PackAuthor().create({
      id: 'new-world', name: '新世界', playerCharacter: '林舟',
      worldBackground: '一座漂浮在云海上的城市。', opening: '警报在清晨响起。',
      characters: [{ name: '岑夏', role: '维修师' }],
    }, temporary)
    expect(pack.manifest.id).toBe('new-world')
    expect(pack.documents.length).toBe(4)
    const characters = JSON.parse(await readFile(join(pack.root, 'characters/characters.json'), 'utf8'))
    expect(characters.some((character: { name: string; controlledBy: string }) => character.name === '林舟' && character.controlledBy === 'player')).toBe(true)
    await expect(new PackAuthor().create({
      id: 'new-world', name: '重复', playerCharacter: 'P', worldBackground: '背景', opening: '开场',
    }, temporary)).rejects.toThrow('已经存在')
  })
})
