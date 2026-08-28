// Reproduce the reported issue: after starting a NEW game (fresh save, fresh
// browser state), does the choice card appear when the model asks? Also covers
// the "reuse old session" hazard: with a stale dsh-story-ai-session in
// localStorage, a new game keeps talking to the old session.
// Run: node scripts/e2e-newgame-choice.mjs [port]
import { chromium } from 'file:///D:/DeepSeek-Harness/apps/web/node_modules/playwright/index.mjs'

const port = process.argv[2] ?? '3081'
const url = `http://127.0.0.1:${port}`
const mode = process.argv[3] ?? 'fresh' // 'fresh' clears session; 'stale' keeps it

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

step(`open ${url} (mode=${mode})`)
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
await page.waitForTimeout(5000)

// Seed a stale session id BEFORE loading if in stale mode (simulates a user
// who already played once).
if (mode === 'stale') {
  await page.evaluate(() => { if (!window.localStorage.getItem('dsh-story-ai-session')) window.localStorage.setItem('dsh-story-ai-session', 'stale-session-' + Date.now()) })
  console.log('seeded stale session:', await page.evaluate(() => window.localStorage.getItem('dsh-story-ai-session')))
} else {
  await page.evaluate(() => window.localStorage.removeItem('dsh-story-ai-session'))
  console.log('cleared session (fresh mode)')
}

step('enter game mode -> library')
await page.getByRole('button', { name: '文字游戏' }).first().click()
await page.waitForTimeout(4000)
console.log('library visible:', await page.getByRole('dialog', { name: '游戏库' }).count() > 0)

step('start a new game')
const newGame = page.getByRole('button', { name: '新游戏' })
console.log('new game buttons:', await newGame.count())
if (await newGame.count() === 0) { console.log('FATAL: no new game button'); await browser.close(); process.exit(1) }
await newGame.first().click()
await page.waitForTimeout(4000)
console.log('shell visible:', (await page.locator('body').innerText()).includes('私聊'))

step('send player input')
const input = page.getByRole('textbox', { name: /中输入/ })
await input.first().fill('雾潮来了，我该先做什么？')
await page.waitForTimeout(500)
await input.first().press('Enter')

step('wait for choice card (up to 240s)')
const card = page.getByRole('dialog', { name: '剧情选择' })
const started = Date.now()
let appeared = false
while (Date.now() - started < 240000) {
  if (await card.count() > 0) { appeared = true; break }
  await sleep(2500)
}
console.log('choice card appeared:', appeared, `after ${((Date.now() - started) / 1000).toFixed(1)}s`)
if (appeared) {
  console.log('card text:', (await card.innerText()).slice(0, 220))
}

step('console errors')
console.log(logs.filter((l) => l.startsWith('[console.error]') || l.startsWith('[pageerror]')).slice(-8).join('\n') || '(none)')

await browser.close()
console.log('\nNEWGAME CHOICE E2E DONE')
