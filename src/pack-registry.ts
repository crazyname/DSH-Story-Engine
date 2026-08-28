import { readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { ContentPackLoader } from './content-pack.js'
import type { LoadedStoryPack } from './types.js'

export interface PackDiagnostic { path: string; severity: 'error'; message: string }
export interface PackDiscovery { packs: LoadedStoryPack[]; diagnostics: PackDiagnostic[] }

async function candidates(root: string): Promise<string[]> {
  const absolute = resolve(root)
  const entries = await readdir(absolute, { withFileTypes: true }).catch(error => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  })
  if (entries.some(entry => entry.isFile() && entry.name === 'pack.json')) return [absolute]
  return entries.filter(entry => entry.isDirectory() && !entry.isSymbolicLink()).map(entry => resolve(absolute, entry.name))
}

export class PackRegistry {
  constructor(private readonly loader = new ContentPackLoader()) {}

  async discover(roots: readonly string[]): Promise<PackDiscovery> {
    const packs: LoadedStoryPack[] = []
    const diagnostics: PackDiagnostic[] = []
    const seen = new Map<string, string>()
    for (const root of roots) {
      for (const candidate of await candidates(root)) {
        try {
          const pack = await this.loader.load(candidate)
          const previous = seen.get(pack.manifest.id)
          if (previous) {
            diagnostics.push({ path: candidate, severity: 'error', message: `内容包 ID 重复：${pack.manifest.id}；已由 ${previous} 提供` })
            continue
          }
          seen.set(pack.manifest.id, candidate)
          packs.push(pack)
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT' && !(await readdir(candidate).catch(() => [])).some(entry => entry === 'pack.json')) continue
          diagnostics.push({ path: candidate, severity: 'error', message: error instanceof Error ? error.message : String(error) })
        }
      }
    }
    return { packs: packs.sort((a, b) => a.manifest.name.localeCompare(b.manifest.name)), diagnostics }
  }
}
