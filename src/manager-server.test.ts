import { afterEach, describe, expect, it } from 'vitest'
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { createManagerServer } from './manager-server.js'

let temporary = ''
let server: Server | undefined
afterEach(async () => {
  if (server) await new Promise<void>(resolveClose => server!.close(() => resolveClose()))
  if (temporary) await rm(temporary, { recursive: true, force: true })
  server = undefined; temporary = ''
})

describe('manager server', () => {
  it('serves the UI, validates, installs, and blocks foreign origins', async () => {
    temporary = await mkdtemp(join(tmpdir(), 'story-manager-'))
    const source = join(temporary, 'new-pack')
    await cp(resolve('packs/example'), source, { recursive: true })
    const manifestPath = join(source, 'pack.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    manifest.id = 'manager-test-pack'; manifest.name = '管理测试包'
    await writeFile(manifestPath, JSON.stringify(manifest), 'utf8')
    const installed = join(temporary, 'installed')
    server = createManagerServer({
      roots: [resolve('packs/example'), installed], installedRoot: installed,
      privateRoot: join(temporary, 'private'),
      presetsRoot: join(temporary, 'presets'), runtimeRoot: join(temporary, 'runtime'),
      pluginPath: resolve('dist/plugin.js'), staticRoot: resolve('manager'),
    })
    await new Promise<void>(resolveListen => server!.listen(0, '127.0.0.1', () => resolveListen()))
    const port = (server.address() as AddressInfo).port
    const base = `http://127.0.0.1:${port}`
    expect((await fetch(base)).status).toBe(200)
    const validate = await fetch(`${base}/api/validate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: source }) })
    expect(validate.status).toBe(200)
    const install = await fetch(`${base}/api/install`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: source }) })
    expect(install.status).toBe(201)
    const listed = await (await fetch(`${base}/api/packs`)).json() as { packs: Array<{ id: string }> }
    expect(listed.packs.some(pack => pack.id === 'manager-test-pack')).toBe(true)
    const blocked = await fetch(`${base}/api/sync-presets`, { method: 'POST', headers: { origin: 'https://evil.example' } })
    expect(blocked.status).toBe(400)
  })

  it('creates a private pack and its preset', async () => {
    temporary = await mkdtemp(join(tmpdir(), 'story-manager-create-'))
    const privateRoot = join(temporary, 'private')
    server = createManagerServer({
      roots: [privateRoot], installedRoot: join(temporary, 'installed'), privateRoot,
      presetsRoot: join(temporary, 'presets'), runtimeRoot: join(temporary, 'runtime'),
      pluginPath: resolve('dist/plugin.js'), staticRoot: resolve('manager'),
    })
    await new Promise<void>(resolveListen => server!.listen(0, '127.0.0.1', () => resolveListen()))
    const port = (server.address() as AddressInfo).port
    const response = await fetch(`http://127.0.0.1:${port}/api/create`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'ui-world', name: '界面世界', playerCharacter: '玩家', worldBackground: '背景', opening: '开场' }),
    })
    expect(response.status).toBe(201)
    const result = await response.json() as { created: boolean }
    expect(result.created).toBe(true)
  })
})
