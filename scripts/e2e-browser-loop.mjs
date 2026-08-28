// Full browser E2E: player input -> real model turn -> structured messages in
// the game channel. While the model turn runs, this script answers any
// story_present_choice question card via the DSH respond API so the turn can
// finish, then verifies the AI messages landed in the game UI and host save.
// Run: node scripts/e2e-browser-loop.mjs [port]
import { chromium } from 'file:///D:/DeepSeek-Harness/apps/web/node_modules/playwright/index.mjs'

const port = process.argv[2] ?? '3081'
const url = `http://127.0.0.1:${port}`
const MUX = `ws://127.0.0.1:${port}/api/events.mux`
const SAVE_ID = 'lantern-demo-save'

const step = (s) => console.log(`\n===== ${s} =====`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function respond(sessionId, rpcIdForAnswer, firstQuestion) {
  const selectedLabel = firstQuestion.options?.[0]?.label
  const body = {
    type: 'client-response',
    rpcId: rpcIdForAnswer,
    result: { ok: true, value: { sessionId, answer: { answers: [{ id: firstQuestion.id, selected: [selectedLabel] }] } } },
  }
  const res = await fetch(`${url}/api/respond`, {
    method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify(body),
  })
  const json = await res.json()
  return { accepted: json.accepted === true, label: selectedLabel }
}

const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:/Users/enze/AppData/Local/ms-playwright/chromium-1232/chrome-win64/chrome.exe',
  args: ['--no-sandbox'],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const logs = []
page.on('console', (msg) => { logs.push(`[console.${msg.type()}] ${msg.text().slice(0, 300)}`) })
page.on('pageerror', (err) => { logs.push(`[pageerror] ${String(err).slice(0, 300)}`) })

// Watch the mux for question cards on any story session.
const ws = new WebSocket(MUX)
const pendingQuestions = []
ws.addEventListener('message', (event) => {
  try {
    const frame = JSON.parse(String(event.data))
    if (frame.payload?.type === 'question/requested') pendingQuestions.push(frame)
  } catch { /* ignore */ }
})
await new Promise((resolve) => { ws.addEventListener('open', resolve, { once: true }); setTimeout(resolve, 2000) })

step(`open ${url}`)
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
await page.waitForTimeout(5000)

step('click 文字游戏')
await page.getByRole('button', { name: '文字游戏' }).first().click()
await page.waitForTimeout(3000)
const shellText = await page.locator('body').innerText()
console.log('game shell visible:', shellText.includes('第 1 季'))

// Fresh save id to avoid revision conflicts from previous runs.
const freshSave = `e2e-${Date.now().toString(36)}`
console.log('using fresh save:', freshSave)
// The shell hardcodes lantern-demo-save; we instead drive the same hidden
// session the bridge uses and verify through the UI after reload with the
// fresh save pre-seeded. Simplest: run against the default save after clearing
// it is NOT possible from here, so we accept the shared default save but note
// the revision will be read by the UI from the host store.

step('send player input')
const input = page.getByRole('textbox', { name: /中输入/ })
const PLAYER_TEXT = '雾潮提前到了，我该先做什么？'
await input.first().fill(PLAYER_TEXT)
await page.waitForTimeout(500)
await input.first().press('Enter')
console.log('submitted:', PLAYER_TEXT)

// The bridge uses a hidden session id from localStorage; capture it so we can
// answer questions against it.
const sessionId = await page.evaluate(() => window.localStorage.getItem('dsh-story-ai-session'))
console.log('bridge session id:', sessionId)

step('wait for AI turn (answer question cards; up to 300s)')
const started = Date.now()
let answered = []
while (Date.now() - started < 300000) {
  // Answer any pending question card once.
  while (pendingQuestions.length > 0) {
    const frame = pendingQuestions.shift()
    const q = frame.payload.questions?.[0]
    if (q && sessionId) {
      const r = await respond(sessionId, frame.rpcId, q).catch((e) => ({ accepted: false, error: String(e) }))
      answered.push({ id: q.id, option: r.label ?? r.error })
      console.log('answered question:', q.id, '->', r.label ?? r.error)
    }
  }
  const body = await page.locator('body').innerText()
  const hasGenerating = body.includes('生成中')
  if (!hasGenerating) {
    // find any NPC bubble that is not the player's own line
    const lines = body.split('\n').map((l) => l.trim()).filter(Boolean)
    const idx = lines.findIndex((l) => l.includes(PLAYER_TEXT))
    const after = idx >= 0 ? lines.slice(idx + 1).filter((l) => !/^(发送|生成中|频道|私聊|群聊|现场|工作|系统|雾海灯塔站)$/.test(l)).slice(0, 6) : []
    if (after.length > 0) {
      console.log('UI reply lines after player message:', after.join(' | '))
      break
    }
  }
  await sleep(2500)
}
console.log(`turn window: ${((Date.now() - started) / 1000).toFixed(1)}s, answered: ${answered.length}`)

await page.screenshot({ path: 'output/playwright/e2e-browser-reply.png' })

step('verify host save')
const saveResp = await page.request.get(`${url}/story-engine/api/saves/${SAVE_ID}`)
if (saveResp.status() === 200) {
  const save = await saveResp.json()
  console.log('revision:', save.revision)
  const tail = save.messages.slice(-8).map((m) => `${m.senderId}[${m.kind}] ${m.content.slice(0, 50)}`)
  for (const m of tail) console.log(' -', m)
} else {
  console.log('save status:', saveResp.status())
}

step('console tail')
console.log(logs.slice(-20).join('\n'))

ws.close()
await browser.close()
console.log('\nBROWSER E2E DONE')
