// Browser E2E: verify the story_present_choice card now renders INSIDE the
// game shell and that clicking an option answers it (no API respond needed).
// Run: node scripts/e2e-choice-ui.mjs [port]
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

step(`open ${url}`)
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
await page.waitForTimeout(5000)

step('enter game shell')
await page.getByRole('button', { name: '文字游戏' }).first().click()
await page.waitForTimeout(3000)
console.log('shell visible:', (await page.locator('body').innerText()).includes('第 1 季'))

step('send player input')
const input = page.getByRole('textbox', { name: /中输入/ })
await input.first().fill('雾潮提前到了，我该先做什么？')
await page.waitForTimeout(500)
await input.first().press('Enter')
console.log('submitted')

step('wait for choice card inside the shell (up to 240s)')
const started = Date.now()
let sawCard = false
let answered = false
while (Date.now() - started < 240000) {
  const dialog = page.getByRole('dialog', { name: '剧情选择' })
  if (await dialog.count() > 0) {
    sawCard = true
    console.log(`choice card visible after ${((Date.now() - started) / 1000).toFixed(1)}s`)
    const cardText = await dialog.innerText()
    console.log('card text:', cardText.slice(0, 300))
    // Click the first option like a real player.
    const option = dialog.getByRole('radio').first()
    const optionText = await option.innerText()
    console.log('clicking option:', optionText.slice(0, 40))
    await option.click()
    await page.waitForTimeout(500)
    const confirm = dialog.getByRole('button', { name: '确定' })
    await confirm.click()
    answered = true
    console.log('option submitted')
    break
  }
  await sleep(2000)
}
console.log('saw card:', sawCard, 'answered:', answered)

await page.screenshot({ path: 'output/playwright/e2e-choice-card.png' })

step('wait for AI turn to finish and reply to land')
let reply = ''
const replyStart = Date.now()
while (Date.now() - replyStart < 240000) {
  const body = await page.locator('body').innerText()
  const hasGenerating = body.includes('生成中')
  const hasNarration = body.includes('裂纹') || body.includes('透镜') || body.includes('鹤舟')
  const noCard = (await page.getByRole('dialog', { name: '剧情选择' }).count()) === 0
  if (!hasGenerating && hasNarration && noCard) {
    const lines = body.split('\n').map((l) => l.trim()).filter(Boolean)
    const idx = lines.findIndex((l) => l.includes('雾潮提前到了'))
    reply = idx >= 0 ? lines.slice(idx + 1).filter((l) => l.length > 8).slice(0, 5).join(' | ') : '(player line not found)'
    break
  }
  await sleep(3000)
}
console.log(`AI reply after ${((Date.now() - replyStart) / 1000).toFixed(1)}s`)
console.log('reply lines:', reply || '(none)')

step('verify host save')
const saveResp = await page.request.get(`${url}/story-engine/api/saves/${SAVE_ID}`)
if (saveResp.status() === 200) {
  const save = await saveResp.json()
  console.log('revision:', save.revision)
  const tail = save.messages.slice(-6).map((m) => `${m.senderId}[${m.kind}] ${m.content.slice(0, 45)}`)
  for (const m of tail) console.log(' -', m)
} else {
  console.log('save status:', saveResp.status())
}

step('console errors')
console.log(logs.filter((l) => l.startsWith('[console.error]') || l.startsWith('[pageerror]')).slice(-8).join('\n') || '(none)')

await browser.close()
console.log('\nCHOICE UI E2E DONE')
