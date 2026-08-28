import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { LoadedStoryPack } from './types.js'

function quote(value: string): string { return `'${value.replaceAll("'", "''")}'` }

export async function generatePreset(
  pack: LoadedStoryPack,
  presetsRoot: string,
  pluginPath: string,
  runtimeRoot: string,
): Promise<string> {
  const destination = resolve(presetsRoot, `story-${pack.manifest.id}`)
  await mkdir(destination, { recursive: true })
  const metadata = `name: ${quote(pack.manifest.name)}\ndescription: ${quote(pack.manifest.description ?? `由 DSH Story Engine 加载：${pack.manifest.name}`)}\norder: 30\n`
  const composition = `- id: persona\n  name: '@deepseek-ai/dsh-persona'\n  config:\n    text: ${quote('你是尊重玩家控制权、内容包事实与显式状态的互动文字游戏主持人。')}\n\n- id: story-engine\n  name: ${quote(resolve(pluginPath).replaceAll('\\', '/'))}\n  config:\n    packRoot: ${quote(pack.root.replaceAll('\\', '/'))}\n    runtimeRoot: ${quote(resolve(runtimeRoot).replaceAll('\\', '/'))}\n`
  await writeFile(join(destination, 'preset.yml'), metadata, 'utf8')
  await writeFile(join(destination, 'agent.cordis.yml'), composition, 'utf8')
  return destination
}
