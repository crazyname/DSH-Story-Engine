// Continue the S1E1 loop to completion: enter the dawn scene, answer the
// second choice, and produce the episode summary via story_record_episode_summary.
// Run: node scripts/e2e-episode-finish.mjs [sessionId] [port]
const sessionId = process.argv[2]
const port = process.argv[3] ?? '3081'
const BASE = `http://127.0.0.1:${port}`
const MUX = `ws://127.0.0.1:${port}/api/events.mux`

if (!sessionId) { console.error('usage: node scripts/e2e-episode-finish.mjs <sessionId> [port]'); process.exit(1) }

const step = (s) => console.log(`\n===== ${s} =====`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function call(method, payload, timeoutMs = 30000) {
  const body = { type: 'client-request', rpcId: `finish-${Date.now().toString(36)}`, method, payload }
  const res = await fetch(`${BASE}/api/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const json = await res.json()
  if (!json.result?.ok) throw new Error(`${method} failed: ${JSON.stringify(json.result?.error ?? json)}`)
  return json.result.value
}

const ws = new WebSocket(MUX)
const pendingQuestions = []
ws.addEventListener('message', (event) => {
  try {
    const frame = JSON.parse(String(event.data))
    if (frame.payload?.type === 'question/requested') pendingQuestions.push(frame)
  } catch { /* ignore */ }
})
await new Promise((resolve) => { ws.addEventListener('open', resolve, { once: true }); setTimeout(resolve, 2000) })

async function answerPending() {
  let count = 0
  while (pendingQuestions.length > 0) {
    const frame = pendingQuestions.shift()
    const q = frame.payload.questions?.[0]
    if (!q) continue
    const label = q.options?.length ? q.options[0].label : undefined
    const body = {
      type: 'client-response', rpcId: frame.rpcId,
      result: { ok: true, value: { sessionId, answer: { answers: [{ id: q.id, selected: label ? [label] : [], ...(label ? {} : { custom: '先各自复检裂纹，再一起决定是否上报。' }) }] } } },
    }
    const res = await fetch(`${BASE}/api/respond`, { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify(body) })
    const json = await res.json()
    count += 1
    console.log(`answered "${q.id}" ->`, label ?? 'custom')
  }
  return count
}

// Prompt the model to finish the episode: enter the dawn scene, resolve the
// second decision, then write the episode summary.
step('continue episode to completion')
const before = await call('session.history', { sessionId, maxMessages: 2 })
const baseline = Math.max(-1, ...before.events.map((x) => Number(x.event?.seq ?? -1)))
console.log('baseline seq:', baseline)

const prompt = '值守简报已完成，雾潮暂时稳住。请继续推进剧情：进入黎明前的场景，与鹤舟复检裂纹、确认金属粉末线索，然后向玩家呈现第二项选择（如何处理证据）。玩家回答后，调用 story_record_episode_summary 完成本集总结，并以 JSON 消息输出收尾。'
const accepted = await call('session.prompt', { sessionId, mode: 'queue', content: [{ type: 'text', text: prompt }], clientTimeZone: 'Asia/Shanghai' })
console.log('prompt accepted:', JSON.stringify(accepted))

step('wait for turn end (answer question cards; up to 300s)')
const started = Date.now()
let lastEvents = []
while (Date.now() - started < 300000) {
  await answerPending()
  const history = await call('session.history', { sessionId, maxMessages: 60 })
  const events = history.events.map((x) => x.event)
  lastEvents = events
  const turnEnd = events.some((e) => e.type === 'turn/end' && Number(e.seq) > baseline)
  if (turnEnd) { console.log(`turn ended after ${((Date.now() - started) / 1000).toFixed(1)}s`); break }
  await sleep(3000)
}

step('extract results')
function assistantText(events, afterSeq) {
  const messages = events.filter((e) => e?.type === 'assistant/message' && Number(e.seq) > afterSeq)
  const last = messages.at(-1)
  const blocks = last?.data?.message?.content
  if (!Array.isArray(blocks)) return undefined
  return blocks.filter((b) => b?.type === 'text' && typeof b.text === 'string').map((b) => b.text).join('\n').trim() || undefined
}
const raw = assistantText(lastEvents, baseline)
console.log('raw tail:', (raw ?? '(none)').slice(-1200))

const tools = lastEvents.filter((e) => e.type === 'tool/call' && Number(e.seq) > baseline).map((e) => e.data.name)
console.log('new tool calls:', tools.join(' -> ') || '(none)')
const errors = lastEvents.filter((e) => e.type === 'tool/result' && e.error !== undefined && Number(e.seq) > baseline)
console.log('tool errors:', errors.length ? errors.map((e) => e.error?.code).join('; ') : '(none)')

step('verify runtime state')
const fs = await import('node:fs/promises')
const statePath = `D:/DSH-Story-Engine/runtime/lantern-station/${sessionId}/state.json`
try {
  const state = JSON.parse(await fs.readFile(statePath, 'utf8'))
  console.log('stateVersion:', state._engine.stateVersion)
  console.log('currentSceneId:', state.playedCanon?.currentSceneId)
  const summaries = Object.keys(state.playedCanon?.episodeSummaries ?? {})
  console.log('episodeSummaries:', summaries.length ? summaries.join(', ') : '(none)')
  const summary = state.playedCanon?.episodeSummaries?.['s1e1-fog-arrives']
  if (summary) {
    console.log('summary chosen:', JSON.stringify(summary.chosen))
    console.log('summary declined:', JSON.stringify(summary.declined))
    console.log('summary freeInputs:', JSON.stringify(summary.freeInputs))
    console.log('summary consequences:', JSON.stringify(summary.consequences))
  }
  console.log('choices:', (state.playedCanon?.choices ?? []).length)
  console.log('events:', (state.playedCanon?.events ?? []).map((e) => e.type).join(', '))
} catch (e) {
  console.log('state read failed:', e.message)
}

ws.close()
console.log('\nEPISODE FINISH DONE')
