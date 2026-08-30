/**
 * Thin client-bundle adapter for the out-of-tree Story Engine plugin.
 *
 * It reproduces exactly the artifact contract the DSH module loader expects
 * (see DSH's packages/client/tsdown.client.ts, which stays untouched):
 *  - lib/index.js: ESM node half (empty apply) the host loader imports.
 *  - lib/client.js: CJS browser bundle wrapped as
 *    window.__ModuleLoader__.load({ id, factory: (require) => {...} }),
 *    with the shell's baseline module table kept external
 *    (react, react/jsx-runtime, react-dom, cordis, ui-slots, ui-primitives,
 *    runtime/client) and everything else inlined.
 *  - CSS Modules are compiled with lightningcss into an inlined style tag
 *    plus a hashed class map, mirroring DSH's virtual loader.
 */
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, relative as relativePath, resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transform } from 'lightningcss'

const ID = 'dsh-story-client'

/** Shell-seeded module table rows — implicit externals for every dynamic bundle. */
const PLATFORM_MODULES = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
]

/** Dynamic rows whose factories arrive before shell boot. */
const PRELOADED_CLIENT_EXTERNALS = ['@deepseek-ai/dsh-client-runtime/client']

const EXTERNALS = new Set([...PLATFORM_MODULES, ...PRELOADED_CLIENT_EXTERNALS])

const CSS_VIRTUAL_PREFIX = '\0dsh-css:'
const CSS_VIRTUAL_SUFFIX = '.mjs'

const pkgRoot = dirname(fileURLToPath(import.meta.url))

/** Stable POSIX-like id so CSS output does not depend on the checkout path. */
function cssModuleId(absolutePath) {
  const relative = relativePath(pkgRoot, absolutePath).replaceAll('\\', '/')
  if (!relative || relative === '..' || relative.startsWith('../')) throw new Error(`CSS Module 必须位于客户端包内：${absolutePath}`)
  return relative
}

/** Emit one plugin-owned style injector plus the CSS Modules class map. */
function styleInjectionModule(css, classMap, tagId) {
  return [
    `const css = ${JSON.stringify(css)};`,
    `const tagId = ${JSON.stringify(tagId)};`,
    "if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css=' + JSON.stringify(tagId) + ']') === null) {",
    "  const tag = document.createElement('style');",
    `  tag.dataset.plugin = ${JSON.stringify(ID)};`,
    '  tag.dataset.pluginCss = tagId;',
    '  tag.textContent = css;',
    '  document.head.appendChild(tag);',
    '}',
    `export default ${JSON.stringify(classMap)};`,
  ].join('\n')
}

/** Node half: empty apply, no runtime imports — nothing to externalize. */
const nodeConfig = {
  name: `${ID}/node`,
  entry: { index: 'src/index.ts' },
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: true,
}

/** Browser half: closure-factory bundle keyed into the module table. */
const clientConfig = {
  name: `${ID}/client`,
  entry: { client: 'src/client/index.ts' },
  outDir: 'lib',
  format: ['cjs'],
  platform: 'browser',
  target: 'es2024',
  dts: false,
  sourcemap: true,
  clean: false,
  deps: {
    neverBundle: specifier => EXTERNALS.has(specifier),
    alwaysBundle: specifier => !EXTERNALS.has(specifier),
  },
  plugins: [
    {
      name: 'story-css-modules-inline',
      resolveId(source, importer) {
        if (!source.endsWith('.module.css')) return null
        const abs = importer !== undefined
          ? resolvePath(dirname(importer), source)
          : resolvePath(pkgRoot, source)
        return CSS_VIRTUAL_PREFIX + cssModuleId(abs) + CSS_VIRTUAL_SUFFIX
      },
      async load(virtualId) {
        if (!virtualId.startsWith(CSS_VIRTUAL_PREFIX)) return null
        const stableId = virtualId.slice(CSS_VIRTUAL_PREFIX.length, -CSS_VIRTUAL_SUFFIX.length)
        const fileId = resolvePath(pkgRoot, stableId)
        this.addWatchFile(fileId)
        const source = await readFile(fileId)
        const { code, exports: cssExports } = transform({
          filename: `/dsh-story-client/${stableId}`,
          code: source,
          cssModules: { pattern: '[hash]_[local]' },
          minify: true,
        })
        const classMap = {}
        // lightningcss does not guarantee export-object enumeration order.
        // Sort by local class name before serializing so identical sources
        // produce byte-for-byte identical client bundles across repeated builds.
        const entries = Object.entries(cssExports ?? {}).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        for (const [local, exp] of entries) classMap[local] = exp.name
        // Every CSS Module needs its own tag identity. Reusing one package-wide
        // id lets the first imported module suppress all later style blocks.
        const styleId = `${ID}/${createHash('sha256').update(stableId).digest('hex').slice(0, 12)}.css`
        return styleInjectionModule(code.toString(), classMap, styleId)
      },
      generateBundle(_options, bundle) {
        const ids = []
        for (const output of Object.values(bundle)) {
          if (output.type !== 'chunk') continue
          for (const match of output.code.matchAll(/dsh-story-client\/[a-f0-9]{12}\.css/g)) {
            ids.push(match[0])
          }
        }
        if (new Set(ids).size !== ids.length) {
          this.error(`duplicate inline CSS tag id detected: ${ids.join(', ')}`)
        }
      },
    },
  ],
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(ID)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
}

export default () => [nodeConfig, clientConfig]
