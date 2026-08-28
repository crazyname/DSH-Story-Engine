import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, resolve } from 'node:path'
import { ContentPackLoader } from './content-pack.js'
import { PackInstaller } from './pack-installer.js'
import { PackRegistry } from './pack-registry.js'
import { generatePreset } from './preset-generator.js'
import { PackAuthor, type PackDraft } from './pack-author.js'

export interface ManagerOptions {
  host?: string
  port?: number
  projectRoot?: string
  roots?: string[]
  installedRoot?: string
  privateRoot?: string
  presetsRoot?: string
  pluginPath?: string
  runtimeRoot?: string
  staticRoot?: string
}

function send(response: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value, null, 2)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  response.end(body)
}

async function body(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk)
    size += buffer.length
    if (size > 64 * 1024) throw new Error('请求内容过大')
    chunks.push(buffer)
  }
  const value = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('请求必须是 JSON 对象')
  return value
}

export function createManagerServer(options: ManagerOptions = {}): Server {
  const project = resolve(options.projectRoot ?? resolve(import.meta.dirname, '..'))
  const installedRoot = resolve(options.installedRoot ?? resolve(project, 'packs/installed'))
  const privateRoot = resolve(options.privateRoot ?? resolve(project, 'packs/private'))
  const roots = options.roots ?? [resolve(project, 'packs/example'), installedRoot, privateRoot]
  const presetsRoot = resolve(options.presetsRoot ?? resolve(project, 'presets'))
  const pluginPath = resolve(options.pluginPath ?? resolve(project, 'dist/plugin.js'))
  const runtimeRoot = resolve(options.runtimeRoot ?? resolve(project, 'runtime'))
  const staticRoot = resolve(options.staticRoot ?? resolve(project, 'manager'))
  const registry = new PackRegistry()

  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`)
      if (request.method === 'POST' && request.headers.origin) {
        const expected = `http://${request.headers.host}`
        if (request.headers.origin !== expected) throw new Error('拒绝来自其他网页的管理请求')
      }
      if (request.method === 'GET' && url.pathname === '/api/packs') {
        const discovery = await registry.discover(roots)
        send(response, 200, {
          packs: discovery.packs.map(pack => ({
            id: pack.manifest.id, name: pack.manifest.name, version: pack.manifest.version,
            language: pack.manifest.language, license: pack.manifest.license,
            description: pack.manifest.description ?? '', documents: pack.documents.length,
            path: pack.root,
          })),
          diagnostics: discovery.diagnostics,
        })
        return
      }
      if (request.method === 'GET' && url.pathname === '/favicon.ico') {
        response.writeHead(204, { 'cache-control': 'public, max-age=86400' })
        response.end()
        return
      }
      if (request.method === 'POST' && url.pathname === '/api/validate') {
        const input = await body(request)
        if (typeof input.path !== 'string' || !input.path.trim()) throw new Error('请选择内容包目录')
        const pack = await new ContentPackLoader().load(resolve(input.path))
        send(response, 200, { valid: true, id: pack.manifest.id, name: pack.manifest.name, version: pack.manifest.version, documents: pack.documents.length })
        return
      }
      if (request.method === 'POST' && url.pathname === '/api/install') {
        const input = await body(request)
        if (typeof input.path !== 'string' || !input.path.trim()) throw new Error('请选择内容包目录')
        const candidate = await new ContentPackLoader().load(resolve(input.path))
        const existing = await registry.discover(roots)
        if (existing.packs.some(pack => pack.manifest.id === candidate.manifest.id)) throw new Error(`内容包已经存在：${candidate.manifest.id}`)
        const pack = await new PackInstaller().install(resolve(input.path), installedRoot)
        const preset = await generatePreset(pack, presetsRoot, pluginPath, runtimeRoot)
        send(response, 201, { installed: true, id: pack.manifest.id, name: pack.manifest.name, preset })
        return
      }
      if (request.method === 'POST' && url.pathname === '/api/create') {
        const input = await body(request) as unknown as PackDraft
        const existing = await registry.discover(roots)
        if (typeof input.id === 'string' && existing.packs.some(pack => pack.manifest.id === input.id)) throw new Error(`内容包已经存在：${input.id}`)
        const pack = await new PackAuthor().create(input, privateRoot)
        const preset = await generatePreset(pack, presetsRoot, pluginPath, runtimeRoot)
        send(response, 201, { created: true, id: pack.manifest.id, name: pack.manifest.name, path: pack.root, preset })
        return
      }
      if (request.method === 'POST' && url.pathname === '/api/sync-presets') {
        const discovery = await registry.discover(roots)
        if (discovery.diagnostics.length) throw new Error('存在无效或重复内容包，请先处理列表中的错误')
        const generated = []
        for (const pack of discovery.packs) generated.push(await generatePreset(pack, presetsRoot, pluginPath, runtimeRoot))
        send(response, 200, { synced: true, generated: generated.length })
        return
      }
      if (request.method === 'GET') {
        const files: Record<string, string> = { '/': 'index.html', '/index.html': 'index.html', '/app.js': 'app.js', '/styles.css': 'styles.css' }
        const file = files[url.pathname]
        if (file) {
          const content = await readFile(resolve(staticRoot, file))
          const mime = extname(file) === '.html' ? 'text/html; charset=utf-8' : extname(file) === '.css' ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8'
          response.writeHead(200, {
            'content-type': mime, 'content-length': content.length, 'cache-control': 'no-store',
            'x-content-type-options': 'nosniff',
            'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'",
          })
          response.end(content)
          return
        }
      }
      send(response, 404, { error: '未找到页面或接口' })
    } catch (error) {
      send(response, 400, { error: error instanceof Error ? error.message : String(error) })
    }
  })
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const host = '127.0.0.1'
  const port = Number(process.env.STORY_MANAGER_PORT ?? 3091)
  const server = createManagerServer({ host, port })
  server.listen(port, host, () => console.log(`Story Pack Manager: http://${host}:${port}`))
}
