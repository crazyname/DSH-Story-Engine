// E2E verification of the real-model S1E1 loop on the isolated DSH instance.
// Run: node scripts/e2e-story-loop.mjs [port]
// Steps: default chat -> sidebar 文字游戏 -> game shell -> send player input
// -> wait for real model reply -> dump messages -> verify host save API.
import { chromium } from 'file:///D:/DeepSeek-Harness/apps/web/node_modules/playwright/index.mjs'

const port = process.argv[2] ?? '3081'
const url = `http://127.0.0.1:${port}`
const SAVE_ID = 'lantern-demo-save'

const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:/Users/enze/AppData/Local/ms-playwright/chromium-1232/chrome-win64/chrome.exe',
  args: ['--no-sandbox'],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const logs = []
page.on('console', (msg) => { logs.push(`[console.${msg.type()}] ${msg.text().slice(0, 400)}`) })
page.on('pageerror', (err) => { logs.push(`[pageerror] ${String(err).slice(0, 400)}`) })

const step = (name) => console.log(`\n===== ${name} =====`)

step(`open ${url}`)
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
await page.waitForTimeout(5000)

// 1. Default ordinary chat visible, sidebar has 文字游戏 entry.
step('default chat + sidebar entry')
const defaultChat = await page.locator('body').innerText()
console.log('has 探索未至之境:', defaultChat.includes('探索未至之境'))
console.log('has 文字游戏:', defaultChat.includes('文字游戏'))

// 2. Click 文字游戏.
step('click 文字游戏')
await page.getByRole('button', { name: '文字游戏' }).first().click()
await page.waitForTimeout(3000)
const shellText = await page.locator('body').innerText()
console.log('game shell visible:', shellText.includes('第 1 季'))
console.log('has 返回普通聊天:', shellText.includes('返回普通聊天'))
console.log('has 生成中/发送:', /发送|生成中/.test(shellText))

// Dump the game shell DOM snapshot.
const snapshot = await page.locator('body').evaluate((el) => {
  function walk(node, depth) {
    const lines = []
    const role = node.getAttribute?.('role')
    const label = node.getAttribute?.('aria-label')
    const text = (node.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 80)
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
console.log('\n-- shell snapshot --')
console.log(snapshot.filter(l => l.includes('dialog') || l.includes('label=') || l.includes('私聊') || l.includes('群聊') || l.includes('现场') || l.includes('工作') || l.includes('系统') || l.includes('发送')).join('\n'))

await page.screenshot({ path: 'output/playwright/e2e-shell-open.png' })

// 3. Send a player input in the selected channel (私聊 鹤舟).
step('send player input')
const input = page.getByRole('textbox', { name: /鹤舟.*中输入|中输入/ })
const inputCount = await input.count()
console.log('input boxes found:', inputCount)
if (inputCount === 0) {
  console.log('FATAL: no game input box; dumping all textboxes')
  const boxes = await page.locator('textarea, input[type=text]').all()
  for (const b of boxes) console.log(' -', await b.getAttribute('aria-label'), '|', await b.getAttribute('placeholder'))
  await browser.close()
  process.exit(1)
}
const PLAYER_TEXT = '雾潮提前到了，我该先做什么？'
await input.first().fill(PLAYER_TEXT)
await page.waitForTimeout(500)
// Press Enter to submit (the game shell submits on Enter).
await input.first().press('Enter')
console.log('submitted:', PLAYER_TEXT)

// 4. Wait for the AI reply: the send button shows 生成中… then a reply message
//    from an NPC appears. Real model round may take 30-120s.
step('wait for real model reply (up to 240s)')
let reply = ''
const started = Date.now()
while (Date.now() - started < 240000) {
  const text = await page.locator('body').innerText()
  if (!text.includes('生成中')) {
    // find new NPC bubble: lines after the player message
    const lines = text.split('\n')
    const idx = lines.findIndex(l => l.includes(PLAYER_TEXT))
    const after = lines.slice(idx + 1).filter(l => l.trim().length > 0).slice(0, 8)
    if (after.length > 0 && !after.some(l => l.includes('发送') || l.includes('生成中') || l.includes('频道'))) {
      reply = after.join(' | ')
      break
    }
  }
  await page.waitForTimeout(3000)
}
console.log(`reply after ${((Date.now() - started) / 1000).toFixed(1)}s`)
console.log('AI reply text:', reply || '(none)')

await page.screenshot({ path: 'output/playwright/e2e-reply.png' })

// 5. Verify host save API has the new player message (revision bumped).
step('verify host save API')
const saveResp = await page.request.get(`${url}/story-engine/api/saves/${SAVE_ID}`)
console.log('save API status:', saveResp.status())
if (saveResp.status() === 200) {
  const save = await saveResp.json()
  console.log('revision:', save.revision)
  const lastMessages = save.messages.slice(-6).map((m) => `${m.senderId}[${m.kind}] ${m.content.slice(0, 40)}`)
  console.log('last messages:')
  for (const m of lastMessages) console.log(' -', m)
}

// 6. Console log tail.
step('console log tail')
console.log(logs.slice(-25).join('\n'))

await browser.close()
console.log('\nE2E DONE')
