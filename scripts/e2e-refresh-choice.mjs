// Refresh-recovery E2E: the card the player left unanswered must reappear
// after a page refresh (mux replay). Simulates: send input -> model asks
// choice -> do NOT answer -> reload page -> card must show again.
// Run: node scripts/e2e-refresh-choice.mjs [port]
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

step('open + enter game')
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
await page.waitForTimeout(5000)
await page.getByRole('button', { name: '文字游戏' }).first().click()
await page.waitForTimeout(3000)

// Clear any stale session so we start fresh.
await page.evaluate(() => window.localStorage.removeItem('dsh-story-ai-session'))

step('send input and wait for choice card (do not answer)')
const input = page.getByRole('textbox', { name: /中输入/ })
await input.first().fill('雾潮来了，我该先做什么？')
await page.waitForTimeout(500)
await input.first().press('Enter')

const card = page.getByRole('dialog', { name: '剧情选择' })
const cardStart = Date.now()
while (Date.now() - cardStart < 240000) {
  if (await card.count() > 0) break
  await sleep(2000)
}
console.log('card appeared:', await card.count() > 0, `after ${((Date.now() - cardStart) / 1000).toFixed(1)}s`)
if (await card.count() > 0) {
  console.log('card text:', (await card.innerText()).slice(0, 200))
}

// Capture the session id and the pending rpcId (via page console or mux), then reload.
const sessionId = await page.evaluate(() => window.localStorage.getItem('dsh-story-ai-session'))
console.log('session id:', sessionId)

step('RELOAD page while card is pending')
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForTimeout(6000)

step('re-enter game shell')
await page.getByRole('button', { name: '文字游戏' }).first().click()
await page.waitForTimeout(4000)

step('check card reappears after refresh (mux replay)')
const card2 = page.getByRole('dialog', { name: '剧情选择' })
const replayStart = Date.now()
while (Date.now() - replayStart < 60000) {
  if (await card2.count() > 0) break
  await sleep(1500)
}
console.log('card reappeared after refresh:', await card2.count() > 0, `within ${((Date.now() - replayStart) / 1000).toFixed(1)}s`)
if (await card2.count() > 0) {
  console.log('replayed card text:', (await card2.innerText()).slice(0, 200))
  await page.screenshot({ path: 'output/playwright/e2e-refresh-replay.png' })
}

// Answer it to prove the replayed card is live.
if (await card2.count() > 0) {
  step('answer the replayed card')
  await card2.getByRole('radio').first().click()
  await page.waitForTimeout(300)
  await card2.getByRole('button', { name: '确定' }).click()
  console.log('answered replayed card')
  await sleep(3000)
}

step('console errors')
console.log(logs.filter((l) => l.startsWith('[console.error]') || l.startsWith('[pageerror]')).slice(-8).join('\n') || '(none)')

await browser.close()
console.log('\nREFRESH RECOVERY E2E DONE')
