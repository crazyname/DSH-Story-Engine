import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { PackInstaller } from './pack-installer.js'
import { PackRegistry } from './pack-registry.js'
import { generatePreset } from './preset-generator.js'

let temporary = ''
afterEach(async () => { if (temporary) await rm(temporary, { recursive: true, force: true }); temporary = '' })

describe('pack management', () => {
  it('discovers valid packs and reports duplicate ids', async () => {
    const example = resolve('packs/example')
    const discovery = await new PackRegistry().discover([example, example])
    expect(discovery.packs).toHaveLength(1)
    expect(discovery.diagnostics[0]?.message).toContain('ID 重复')
  })

  it('installs atomically and refuses overwrite', async () => {
    temporary = await mkdtemp(join(tmpdir(), 'story-install-'))
    const installer = new PackInstaller()
    const pack = await installer.install(resolve('packs/example'), temporary)
    expect(pack.manifest.id).toBe('lantern-station')
    await expect(installer.install(resolve('packs/example'), temporary)).rejects.toThrow('已经安装')
  })

  it('generates a DSH preset outside the source pack', async () => {
    temporary = await mkdtemp(join(tmpdir(), 'story-preset-'))
    const discovery = await new PackRegistry().discover([resolve('packs/example')])
    const destination = await generatePreset(discovery.packs[0]!, temporary, resolve('dist/plugin.js'), resolve('runtime'))
    const composition = await readFile(join(destination, 'agent.cordis.yml'), 'utf8')
    expect(composition).toContain('dist/plugin.js')
    expect(composition).toContain('packs/example')
  })
})
