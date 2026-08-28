import { copyFile, mkdir, readdir, rename, rm, stat } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { ContentPackLoader } from './content-pack.js'
import type { LoadedStoryPack } from './types.js'

export interface InstallLimits { maxFiles: number; maxBytes: number }
const DEFAULT_LIMITS: InstallLimits = { maxFiles: 10_000, maxBytes: 100 * 1024 * 1024 }

async function safeCopy(source: string, destination: string, limits: InstallLimits): Promise<void> {
  let files = 0
  let bytes = 0
  async function visit(from: string, to: string): Promise<void> {
    const entries = await readdir(from, { withFileTypes: true })
    await mkdir(to, { recursive: true })
    for (const entry of entries) {
      if (entry.isSymbolicLink()) throw new Error(`内容包不能包含符号链接：${join(from, entry.name)}`)
      const sourcePath = join(from, entry.name)
      const destinationPath = join(to, entry.name)
      if (entry.isDirectory()) { await visit(sourcePath, destinationPath); continue }
      if (!entry.isFile()) throw new Error(`不支持的文件类型：${sourcePath}`)
      const info = await stat(sourcePath)
      files += 1
      bytes += info.size
      if (files > limits.maxFiles) throw new Error(`内容包文件数超过限制 ${limits.maxFiles}`)
      if (bytes > limits.maxBytes) throw new Error(`内容包大小超过限制 ${limits.maxBytes} 字节`)
      await mkdir(dirname(destinationPath), { recursive: true })
      await copyFile(sourcePath, destinationPath)
    }
  }
  await visit(source, destination)
}

export class PackInstaller {
  constructor(private readonly loader = new ContentPackLoader()) {}

  async install(source: string, installedRoot: string, limits = DEFAULT_LIMITS): Promise<LoadedStoryPack> {
    const sourceRoot = resolve(source)
    const pack = await this.loader.load(sourceRoot)
    const root = resolve(installedRoot)
    const destination = join(root, pack.manifest.id)
    try { await stat(destination); throw new Error(`内容包已经安装：${pack.manifest.id}`) } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    await mkdir(root, { recursive: true })
    const staging = join(root, `.staging-${pack.manifest.id}-${process.pid}-${Date.now()}`)
    try {
      await safeCopy(sourceRoot, staging, limits)
      await this.loader.load(staging)
      await rename(staging, destination)
      return await this.loader.load(destination)
    } catch (error) {
      await rm(staging, { recursive: true, force: true })
      throw error
    }
  }
}
