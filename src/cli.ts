import { resolve } from 'node:path'
import { ContentPackLoader } from './content-pack.js'
import { PackInstaller } from './pack-installer.js'
import { PackRegistry } from './pack-registry.js'
import { generatePreset } from './preset-generator.js'

const project = resolve(import.meta.dirname, '..')
const installed = resolve(project, 'packs/installed')
const roots = [resolve(project, 'packs/example'), installed, resolve(project, 'packs/private')]

function usage(): never {
  console.error('用法：story-pack <list|validate PATH|install PATH|sync-presets>')
  process.exit(2)
}

async function main(): Promise<void> {
  const [command, argument] = process.argv.slice(2)
  if (command === 'validate') {
    if (!argument) usage()
    const pack = await new ContentPackLoader().load(resolve(argument))
    console.log(JSON.stringify({ valid: true, id: pack.manifest.id, name: pack.manifest.name, documents: pack.documents.length }, null, 2))
    return
  }
  if (command === 'install') {
    if (!argument) usage()
    const candidate = await new ContentPackLoader().load(resolve(argument))
    const existing = await new PackRegistry().discover(roots)
    if (existing.packs.some(pack => pack.manifest.id === candidate.manifest.id)) throw new Error(`内容包已经存在：${candidate.manifest.id}`)
    const pack = await new PackInstaller().install(resolve(argument), installed)
    console.log(JSON.stringify({ installed: true, id: pack.manifest.id, path: pack.root }, null, 2))
    return
  }
  const discovery = await new PackRegistry().discover(roots)
  if (command === 'list') {
    console.log(JSON.stringify({ packs: discovery.packs.map(pack => ({ id: pack.manifest.id, name: pack.manifest.name, version: pack.manifest.version, path: pack.root })), diagnostics: discovery.diagnostics }, null, 2))
    return
  }
  if (command === 'sync-presets') {
    if (discovery.diagnostics.length) throw new Error(`存在 ${discovery.diagnostics.length} 个内容包错误，请先运行 list`)
    const generated = []
    for (const pack of discovery.packs) {
      generated.push(await generatePreset(pack, resolve(project, 'presets'), resolve(project, 'dist/plugin.js'), resolve(project, 'runtime')))
    }
    console.log(JSON.stringify({ generated }, null, 2))
    return
  }
  usage()
}

main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1 })
