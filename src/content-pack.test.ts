import { afterEach, describe, expect, it } from 'vitest'
import { resolve, join } from 'node:path'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { ContentIndex } from './content-index.js'
import { ContentPackLoader, validateManifest } from './content-pack.js'

let temporary = ''
afterEach(async () => { if (temporary) await rm(temporary, { recursive: true, force: true }); temporary = '' })

describe('ContentPackLoader', () => {
  it('loads the bundled original example pack', async () => {
    const pack = await new ContentPackLoader().load(resolve('packs/example'))
    expect(pack.manifest.id).toBe('lantern-station')
    expect(pack.documents.length).toBeGreaterThan(2)
    const result = new ContentIndex(pack.documents).search('雾潮')
    expect(result.length).toBeGreaterThan(0)
  })

  it('rejects invalid ids and path traversal', async () => {
    expect(() => validateManifest({ schemaVersion: 1, id: '../bad' })).toThrow('id')
    temporary = await mkdtemp(join(tmpdir(), 'story-pack-'))
    const manifest = {
      schemaVersion: 1, id: 'bad-pack', name: 'bad', version: '1', language: 'zh-CN', license: 'test',
      player: { controlledCharacters: ['P'], aiMayControlPlayer: false }, modules: {},
      content: { initialState: '../outside.json' },
    }
    await writeFile(join(temporary, 'pack.json'), JSON.stringify(manifest), 'utf8')
    const loader = new ContentPackLoader()
    await expect(loader.load(temporary)).rejects.toThrow('路径越界')
  })

  it('loads JSONL as individually retrievable, untruncated records', async () => {
    temporary = await mkdtemp(join(tmpdir(), 'story-pack-'))
    await import('node:fs/promises').then(({ mkdir }) => mkdir(join(temporary, 'lore'), { recursive: true }))
    const manifest = {
      schemaVersion: 1, id: 'records-pack', name: 'records', version: '1', language: 'zh-CN', license: 'test',
      player: { controlledCharacters: ['P'], aiMayControlPlayer: false }, modules: {},
      content: { lore: 'lore', initialState: 'state.json' },
    }
    await writeFile(join(temporary, 'pack.json'), JSON.stringify(manifest), 'utf8')
    await writeFile(join(temporary, 'state.json'), '{}', 'utf8')
    await writeFile(join(temporary, 'lore', 'records.jsonl'), `${JSON.stringify({ record_id: 'alpha', text: '完整原文' })}\n${JSON.stringify({ id: 'beta', text: '第二条' })}\n`, 'utf8')
    const pack = await new ContentPackLoader().load(temporary)
    expect(pack.documents).toHaveLength(2)
    const index = new ContentIndex(pack.documents)
    const result = index.search('完整原文')
    expect(result[0].id).toContain('#alpha')
    expect(index.get(result[0].id).text).toContain('完整原文')
  })
})
