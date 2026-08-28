// Probe: does the 3080 mux stream replay the pending question for the user's
// stuck session? This is what the choice bridge consumes to show the card.
// Run: node scripts/probe-mux.mjs <port> <sessionId>
const port = process.argv[2] ?? '3080'
const sessionId = process.argv[3]
const MUX = `ws://127.0.0.1:${port}/api/events.mux`

const ws = new WebSocket(MUX)
const seen = []
ws.addEventListener('message', (event) => {
  try {
    const frame = JSON.parse(String(event.data))
    const type = frame.payload?.type ?? frame.type
    const line = `${type} sessionId=${frame.payload?.sessionId ?? frame.sessionId ?? '?'}`
    seen.push(line)
    console.log('FRAME:', line)
    if (type === 'question/requested') {
      console.log('  questions:', JSON.stringify(frame.payload.questions ?? frame.questions ?? []).slice(0, 400))
    }
  } catch { /* ignore */ }
})
await new Promise((resolve) => { ws.addEventListener('open', resolve, { once: true }) })
console.log('mux opened, listening for replay...')
await new Promise((resolve) => setTimeout(resolve, 8000))
console.log('\n--- frames for target session ---')
const target = seen.filter((l) => l.includes(sessionId ?? '___none___'))
console.log(target.length ? target.join('\n') : '(none)')
console.log(`\nsessionId target: ${sessionId}`)
ws.close()
process.exit(0)
