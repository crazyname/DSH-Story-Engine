// E2E probe: open the isolated DSH instance and dump UI state without
// triggering any real model call. Run with:
//   node scripts/e2e-probe.mjs [port]
import { chromium } from 'file:///D:/DeepSeek-Harness/apps/web/node_modules/playwright/index.mjs'

const port = process.argv[2] ?? '3081'
const url = `http://127.0.0.1:${port}`

function dump(root, depth = 0) {
  const lines = []
  const role = root.getAttribute('role')
  const label = root.getAttribute('aria-label')
  const name = root.getAttribute('aria-labelledby')
  const tag = root.tagName.toLowerCase()
  const text = (root.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60)
  const parts = [tag]
  if (role) parts.push(`role=${role}`)
  if (label) parts.push(`label=${label}`)
  if (name) parts.push(`labelledby=${name}`)
  if (text && !role) parts.push(`"${text}"`)
  lines.push('  '.repeat(depth) + parts.join(' '))
  for (const child of root.children) lines.push(...dump(child, depth + 1))
  return lines
}

const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:/Users/enze/AppData/Local/ms-playwright/chromium-1232/chrome-win64/chrome.exe',
  args: ['--no-sandbox'],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const consoleLogs = []
page.on('console', (msg) => { consoleLogs.push(`[console.${msg.type()}] ${msg.text().slice(0, 300)}`) })
page.on('pageerror', (err) => { consoleLogs.push(`[pageerror] ${String(err).slice(0, 300)}`) })

console.log(`== opening ${url} ==`)
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
await page.waitForTimeout(4000)

console.log('\n== body text (first 2000 chars) ==')
const bodyText = (await page.locator('body').innerText()).slice(0, 2000)
console.log(bodyText)

console.log('\n== buttons with text ==')
const buttons = await page.locator('button').all()
for (const b of buttons) {
  const t = (await b.innerText().catch(() => '')).trim()
  if (t) console.log(`- button: ${t.slice(0, 50)}`)
}

console.log('\n== tree snapshot ==')
const tree = await page.locator('body').evaluate((el) => {
  function walk(node, depth) {
    const lines = []
    const role = node.getAttribute?.('role')
    const label = node.getAttribute?.('aria-label')
    const text = (node.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 50)
    if (node.tagName && (role || label || (text && node.children.length === 0))) {
      const parts = [node.tagName.toLowerCase()]
      if (role) parts.push(`role=${role}`)
      if (label) parts.push(`label=${label}`)
      if (text && !role) parts.push(`"${text}"`)
      lines.push('  '.repeat(depth) + parts.join(' '))
    }
    for (const child of node.children) lines.push(...walk(child, depth + 1))
    return lines
  }
  return walk(el, 0)
})
console.log(tree.slice(0, 200).join('\n'))

console.log('\n== console log ==')
console.log(consoleLogs.slice(0, 30).join('\n'))

await page.screenshot({ path: 'output/playwright/e2e-probe-default.png', fullPage: false })
await browser.close()
console.log('\nDONE')
