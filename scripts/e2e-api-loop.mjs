// Real-model E2E verification driver (API level, no browser UI needed for the
// AI turn itself). It drives the same calls the client ai-bridge makes, but
// also answers the story_present_choice question card so the model turn can
// finish. Run: node scripts/e2e-api-loop.mjs [port]
const port = process.argv[2] ?? '3081'
const BASE = `http://127.0.0.1:${port}`
const MUX = `ws://127.0.0.1:${port}/api/events.mux`

let rpcSeq = 0
function rpcId(tag) { return `${tag}-${++rpcSeq}-${Date.now().toString(36)}` }

async function call(method, payload, timeoutMs = 30000) {
  const body = { type: 'client-request', rpcId: rpcId(method.replace(/\W/g, '-')), method, payload }
  const res = await fetch(`${BASE}/api/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const json = await res.json()
  if (!json.result?.ok) throw new Error(`${method} failed: ${JSON.stringify(json.result?.error ?? json)}`)
  return json.result.value
}

async function respond(payloadValue, rpcIdForAnswer) {
  const body = { type: 'client-response', rpcId: rpcIdForAnswer, result: { ok: true, value: payloadValue } }
  const res = await fetch(`${BASE}/api/respond`, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  })
  const json = await res.json()
  if (json.accepted === true) return { accepted: true }
  if (!json.result?.ok) throw new Error(`respond failed: ${JSON.stringify(json.result?.error ?? json)}`)
  return json.result.value
}

const step = (s) => console.log(`\n===== ${s} =====`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 1. Create the story session exactly like the client ai-bridge does.
step('create session')
const sessionId = crypto.randomUUID()
console.log('sessionId:', sessionId)
const created = await call('session.create', { sessionId, cwd: 'D:/DSH-Story-Engine', agentPreset: 'story-lantern-station' })
console.log('created:', JSON.stringify(created))

// 2. Archive it (the bridge archives right after creation so the session
//    does not show in the ordinary chat list).
await call('workspace.archiveSession', { sessionId })
console.log('archived')

// 3. Open the mux stream to receive the question/requested frame.
step('open mux for question frames')
const ws = new WebSocket(MUX)
const questionFrames = []
ws.addEventListener('message', (event) => {
  try {
    const frame = JSON.parse(String(event.data))
    const payload = frame.payload
    if (payload && payload.type === 'question/requested') {
      questionFrames.push(frame)
      console.log('GOT question/requested rpcId=', frame.rpcId, 'questions=', JSON.stringify(payload.questions ?? []).slice(0, 500))
    }
  } catch { /* ignore non-frame messages */ }
})
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true })
  ws.addEventListener('error', reject, { once: true })
  setTimeout(resolve, 2000) // tolerate slow open
})

// 4. Read baseline history.
const before = await call('session.history', { sessionId, maxMessages: 2 })
const baseline = Math.max(-1, ...before.events.map((x) => Number(x.event?.seq ?? -1)))
console.log('baseline seq:', baseline)

// 5. Prompt with the same text the client bridge sends.
step('prompt (real model round)')
const PLAYER_INPUT = '雾潮提前到了，我该先做什么？'
const prompt = `当前文字游戏频道：鹤舟（私聊）。当前进度：第 1 季 第 1 集 灯室里的裂纹。玩家输入：${PLAYER_INPUT}。可用发送者：p-player, p-hezhou，旁白和系统也可使用。请推进剧情并调用必要的 story_* 工具。最终仅输出 JSON：{"messages":[{"senderId":"人物ID","kind":"dialogue|narration|action|system|work-dispatch|relationship|episode-summary","content":"内容"}]}。不得替玩家角色发言或决定。`
const accepted = await call('session.prompt', { sessionId, mode: 'queue', content: [{ type: 'text', text: prompt }], clientTimeZone: 'Asia/Shanghai' })
console.log('prompt accepted:', JSON.stringify(accepted))

// 6. Poll until the turn ends OR a question card arrives; answer it.
step('wait for turn end / question card')
const started = Date.now()
let answered = false
let lastEvents = []
while (Date.now() - started < 300000) {
  // Answer any pending question card.
  if (questionFrames.length > 0 && !answered) {
    const frame = questionFrames[0]
    const questions = frame.payload.questions ?? []
    const first = questions[0]
    if (first && first.options?.length > 0) {
      const selectedLabel = first.options[0].label
      console.log(`answering question "${first.question?.slice(0, 40)}" with option "${selectedLabel?.slice(0, 30)}"`)
      await respond({ sessionId, answer: { answers: [{ id: first.id, selected: [selectedLabel] }] } }, frame.rpcId)
      answered = true
    }
  }
  const history = await call('session.history', { sessionId, maxMessages: 40 })
  const events = history.events.map((x) => x.event)
  lastEvents = events
  const turnEnd = events.some((e) => e.type === 'turn/end' && Number(e.seq) > baseline)
  if (turnEnd) { console.log(`turn ended after ${((Date.now() - started) / 1000).toFixed(1)}s`); break }
  await sleep(3000)
}
if (!lastEvents.some((e) => e.type === 'turn/end')) {
  console.log('WARNING: turn did not end within 300s')
}

// 7. Extract the assistant final text and the tool chain summary.
step('extract results')
function assistantText(events, afterSeq) {
  const messages = events.filter((e) => e?.type === 'assistant/message' && Number(e.seq) > afterSeq)
  const last = messages.at(-1)
  const blocks = last?.data?.message?.content
  if (!Array.isArray(blocks)) return undefined
  return blocks.filter((b) => b?.type === 'text' && typeof b.text === 'string').map((b) => b.text).join('\n').trim() || undefined
}
const raw = assistantText(lastEvents, baseline)
console.log('assistant raw text tail:', (raw ?? '(none)').slice(-1500))

const tools = lastEvents.filter((e) => e.type === 'tool/call').map((e) => e.data.name)
console.log('tool call chain:', tools.join(' -> '))
const toolErrors = lastEvents.filter((e) => e.type === 'tool/result' && e.error !== undefined).map((e) => `${e.data?.message?.source?.callId ?? '?'}: ${e.error?.code ?? e.error}`)
console.log('tool errors:', toolErrors.length ? toolErrors.join('; ') : '(none)')
const usage = lastEvents.filter((e) => e.type === 'assistant/chunk' && e.data?.chunk?.type === 'usage').map((e) => e.data.chunk.usage).at(-1)
console.log('usage:', JSON.stringify(usage))

// 8. Try to parse the final JSON messages block.
step('parse JSON messages')
let parsed = null
if (raw) {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/u)?.[1] ?? raw
  try {
    const value = JSON.parse(fenced)
    if (Array.isArray(value.messages)) {
      parsed = value.messages
      console.log('PARSED messages:', JSON.stringify(parsed, null, 2).slice(0, 2000))
    } else {
      console.log('JSON parsed but no messages array; keys:', Object.keys(value))
    }
  } catch (e) {
    console.log('JSON parse failed:', e.message)
    console.log('raw head:', (raw ?? '').slice(0, 800))
  }
}

// 9. Verify runtime state on disk.
step('verify runtime state')
const fs = await import('node:fs/promises')
const statePath = `D:/DSH-Story-Engine/runtime/lantern-station/${sessionId}/state.json`
try {
  const state = JSON.parse(await fs.readFile(statePath, 'utf8'))
  console.log('stateVersion:', state._engine.stateVersion)
  console.log('currentSceneId:', state.playedCanon?.currentSceneId)
  console.log('currentEpisodeId:', state.playedCanon?.currentEpisodeId)
  console.log('events:', (state.playedCanon?.events ?? []).map((e) => e.type).join(', '))
  console.log('choices:', (state.playedCanon?.choices ?? []).length)
} catch (e) {
  console.log('state read failed:', e.message)
}

ws.close()
console.log('\nE2E API LOOP DONE')
