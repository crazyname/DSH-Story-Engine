// Game library E2E: entering game mode shows the library (packs + saves),
// continue loads an existing save, back returns to the library, and new game
// creates a fresh save and opens the shell.
// Run: node scripts/e2e-library.mjs [port]
import { chromium } from 'file:///D:/DeepSeek-Harness/apps/web/node_modules/playwright/index.mjs'

const port = process.argv[2] ?? '3081'
const url = `http://127.0.0.1:${port}`

const step = (s) => console.log(`\n===== ${s} =====`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:/Users/enze/AppData/Local/ms-playwright/chromium-1232/chrome-win64/chrome.exe',
  args: ['--no-sandbox'],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const logs = []
page.on('console', (msg) => { logs.push(`[console.${msg.type()}] ${msg.text().slice(0, 300)}`) })
page.on('pageerror', (err) => { logs.push(`[pageerror] ${String(err).slice(0, 300)}`) })

step(`open ${url}`)
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
await page.waitForTimeout(5000)

step('enter game mode -> expect library, not the shell')
await page.getByRole('button', { name: '文字游戏' }).first().click()
await page.waitForTimeout(4000)
const library = page.getByRole('dialog', { name: '游戏库' })
console.log('library visible:', await library.count() > 0)
const libraryText = await page.locator('body').innerText()
console.log('has pack title 雾海灯塔站:', libraryText.includes('雾海灯塔站'))
console.log('has 新游戏:', libraryText.includes('新游戏'))
console.log('has 继续游戏:', libraryText.includes('继续游戏'))
await page.screenshot({ path: 'output/playwright/e2e-library.png' })

step('continue the existing save')
const continueButtons = page.getByRole('button', { name: /继续游戏/ })
console.log('continue buttons:', await continueButtons.count())
if (await continueButtons.count() > 0) {
  await continueButtons.first().click()
  await page.waitForTimeout(4000)
  const shell = page.getByRole('dialog', { name: '文字游戏' })
  const shellVisible = await shell.count() > 0
  const text = await page.locator('body').innerText()
  console.log('shell visible after continue:', shellVisible)
  console.log('has channel 私聊:', text.includes('私聊'))
  console.log('has 游戏库 button (back):', text.includes('游戏库'))
  await page.screenshot({ path: 'output/playwright/e2e-library-continue.png' })
} else {
  console.log('WARNING: no continue buttons (no saves on this instance)')
}

step('back to library')
const back = page.getByRole('button', { name: '游戏库' })
if (await back.count() > 0) {
  await back.first().click()
  await page.waitForTimeout(3000)
  console.log('library again:', await page.getByRole('dialog', { name: '游戏库' }).count() > 0)
}

step('start a new game')
const newGame = page.getByRole('button', { name: '新游戏' })
console.log('new game buttons:', await newGame.count())
if (await newGame.count() > 0) {
  await newGame.first().click()
  await page.waitForTimeout(4000)
  const text = await page.locator('body').innerText()
  console.log('shell visible after new game:', text.includes('私聊'))
  console.log('has 返回普通聊天:', text.includes('返回普通聊天'))
  await page.screenshot({ path: 'output/playwright/e2e-library-newgame.png' })
}

step('verify host save list grew')
const listResp = await page.request.get(`${url}/story-engine/api/saves`)
if (listResp.status() === 200) {
  const body = await listResp.json()
  console.log('host save list:', JSON.stringify(body.saves.map((s) => `${s.saveId} v${s.revision}`)))
} else {
  console.log('list status:', listResp.status())
}

step('console errors')
console.log(logs.filter((l) => l.startsWith('[console.error]') || l.startsWith('[pageerror]')).slice(-8).join('\n') || '(none)')

await browser.close()
console.log('\nLIBRARY E2E DONE')
