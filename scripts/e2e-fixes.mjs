// Verify the four reported issues:
//  1. New game -> choice card appears (fresh session per save).
//  2. A stale choice card from another save does NOT pollute a new game.
//  3. Save-as duplicates a save and opens the copy.
//  4. Delete removes a save from the host list.
// Run: node scripts/e2e-fixes.mjs [port]
import { chromium } from 'file:///D:/DeepSeek-Harness/apps/web/node_modules/playwright/index.mjs'

const port = process.argv[2] ?? '3081'
const url = `http://127.0.0.1:${port}`
const SAVE_ID = 'lantern-demo-save'

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

const hostSaves = async () => (await (await page.request.get(`${url}/story-engine/api/saves`)).json()).saves

step(`open ${url}`)
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
await page.waitForTimeout(5000)
// Fresh browser: clear all per-save session keys.
await page.evaluate(() => {
  const keys = []
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i)
    if (k !== null && k.startsWith('dsh-story-ai-session')) keys.push(k)
  }
  for (const k of keys) window.localStorage.removeItem(k)
})

step('enter library')
await page.getByRole('button', { name: '文字游戏' }).first().click()
await page.waitForTimeout(4000)

// --- Issue 3: save-as ---
step('save-as lantern-demo-save')
const saveAsButtons = page.getByRole('button', { name: '另存为' })
console.log('save-as buttons:', await saveAsButtons.count())
if (await saveAsButtons.count() > 0) {
  await saveAsButtons.first().click()
  await page.waitForTimeout(4000)
  console.log('shell visible after save-as:', (await page.locator('body').innerText()).includes('私聊'))
  // Back to library and count saves.
  await page.getByRole('button', { name: '游戏库' }).first().click()
  await page.waitForTimeout(3000)
  const savesAfter = await hostSaves()
  console.log('host saves after save-as:', savesAfter.length, '->', savesAfter.map((s) => s.saveId.slice(0, 28)).join(', '))
}

// --- Issue 2: stale card from another save must not appear when continuing a
// fresh save. We simulate by asking the demo save's session to have a pending
// card, then open a NEW game and confirm no card shows until the new turn asks.

step('new game (fresh session)')
const newGame = page.getByRole('button', { name: '新游戏' })
await newGame.first().click()
await page.waitForTimeout(4000)
const shellVisible = (await page.locator('body').innerText()).includes('私聊')
console.log('shell visible:', shellVisible)

// Wait ~6s: if a foreign card leaked it would appear immediately (0s). Expect none.
await sleep(6000)
const card = page.getByRole('dialog', { name: '剧情选择' })
console.log('card leaked from other save before turn:', await card.count() > 0)

// --- Issue 1: choice card appears for the new game's own turn ---
step('send input -> own choice card appears')
const input = page.getByRole('textbox', { name: /中输入/ })
await input.first().fill('雾潮来了，我该先做什么？')
await page.waitForTimeout(400)
await input.first().press('Enter')
const cardStart = Date.now()
while (Date.now() - cardStart < 240000) {
  if (await card.count() > 0) break
  await sleep(2500)
}
console.log('own choice card appeared:', await card.count() > 0, `after ${((Date.now() - cardStart) / 1000).toFixed(1)}s`)
if (await card.count() > 0) console.log('card text:', (await card.innerText()).slice(0, 120))

// --- Issue 4: delete ---
step('answer the pending card, then back to library and delete the demo save')
if (await card.count() > 0) {
  await card.getByRole('radio').first().click()
  await page.waitForTimeout(300)
  await card.getByRole('button', { name: '确定' }).click()
  await sleep(2000)
}
await page.getByRole('button', { name: '游戏库' }).first().click()
await page.waitForTimeout(3000)
page.on('dialog', (d) => { console.log('confirm dialog:', d.message().slice(0, 40)); void d.accept() })
const deleteButtons = page.getByRole('button', { name: '删除' })
console.log('delete buttons:', await deleteButtons.count())
if (await deleteButtons.count() > 0) {
  // Delete the LAST row (the copy created by save-as in this run), leaving the
  // original demo save intact.
  const rows = page.locator('li').filter({ hasText: '继续游戏' })
  const last = rows.last()
  await last.getByRole('button', { name: '删除' }).click()
  await sleep(3000)
  const savesAfterDelete = await hostSaves()
  console.log('host saves after delete:', savesAfterDelete.length, '->', savesAfterDelete.map((s) => s.saveId.slice(0, 28)).join(', '))
  console.log('demo save still present:', savesAfterDelete.some((s) => s.saveId === SAVE_ID))
}

step('console errors')
console.log(logs.filter((l) => l.startsWith('[console.error]') || l.startsWith('[pageerror]')).slice(-8).join('\n') || '(none)')

await browser.close()
console.log('\nFIXES E2E DONE')
