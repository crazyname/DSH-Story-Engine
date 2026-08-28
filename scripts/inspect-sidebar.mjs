// Inspect the DSH ordinary-chat sidebar: what does the 未分组 section show,
// and what is inside those conversations?
import { chromium } from 'file:///D:/DeepSeek-Harness/apps/web/node_modules/playwright/index.mjs'
const url = 'http://127.0.0.1:3080'
const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:/Users/enze/AppData/Local/ms-playwright/chromium-1232/chrome-win64/chrome.exe',
  args: ['--no-sandbox'],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
await page.waitForTimeout(6000)

console.log('=== sidebar tree text ===')
const tree = page.locator('[role=tree]')
console.log((await tree.innerText()).slice(0, 1500))

console.log('\n=== buttons in sidebar ===')
const buttons = await page.locator('aside button, [class*="sidebar"] button').all()
for (const b of buttons) {
  const t = (await b.innerText().catch(() => '')).trim()
  if (t) console.log('-', t.slice(0, 60))
}

console.log('\n=== body text (first 1200) ===')
console.log((await page.locator('body').innerText()).slice(0, 1200))

await page.screenshot({ path: 'output/playwright/dsh-sidebar.png' })
await browser.close()
console.log('\nDONE')
