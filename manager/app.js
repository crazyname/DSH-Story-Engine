const packs = document.querySelector('#packs')
const diagnostics = document.querySelector('#diagnostics')
const message = document.querySelector('#message')
const pathInput = document.querySelector('#pack-path')
const buttons = [...document.querySelectorAll('button')]

function setBusy(value) { buttons.forEach(button => { button.disabled = value }) }
function tell(text, error = false) { message.textContent = text; message.classList.toggle('error', error) }
async function api(path, options) {
  const response = await fetch(path, options)
  const value = await response.json()
  if (!response.ok) throw new Error(value.error || '操作失败')
  return value
}
function escapeHtml(value) { const span=document.createElement('span'); span.textContent=String(value); return span.innerHTML }

async function refresh() {
  setBusy(true)
  try {
    const result = await api('/api/packs')
    packs.innerHTML = result.packs.length ? result.packs.map(pack => `
      <article class="card">
        <div class="card-top"><div><span class="step">${escapeHtml(pack.id)}</span><h2>${escapeHtml(pack.name)}</h2></div><span class="badge">v${escapeHtml(pack.version)}</span></div>
        <p>${escapeHtml(pack.description || '这个内容包没有填写说明。')}</p>
        <div class="meta"><span>${escapeHtml(pack.language)}</span><span>${escapeHtml(pack.license)}</span><span>${pack.documents} 份资料</span></div>
      </article>`).join('') : '<div class="empty">还没有可用内容包。</div>'
    diagnostics.hidden = !result.diagnostics.length
    diagnostics.innerHTML = result.diagnostics.map(item => `<div><strong>${escapeHtml(item.path)}</strong><br>${escapeHtml(item.message)}</div>`).join('<hr>')
  } catch (error) { tell(error.message, true) } finally { setBusy(false) }
}
async function post(endpoint) {
  const path = pathInput.value.trim()
  if (!path) { tell('请先填写内容包文件夹。', true); return }
  setBusy(true); tell('正在处理，请稍候……')
  try {
    const result = await api(endpoint, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ path }) })
    tell(endpoint.endsWith('validate') ? `校验通过：${result.name}，共 ${result.documents} 份资料。` : `安装成功：${result.name}。重启 DSH 后即可选择。`)
    if (result.installed) await refresh()
  } catch (error) { tell(error.message, true) } finally { setBusy(false) }
}

document.querySelector('#refresh').addEventListener('click', refresh)
document.querySelector('#create').addEventListener('click', async () => {
  const lines = document.querySelector('#create-characters').value.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  const payload = {
    name: document.querySelector('#create-name').value.trim(),
    id: document.querySelector('#create-id').value.trim(),
    playerCharacter: document.querySelector('#create-player').value.trim(),
    worldBackground: document.querySelector('#create-world').value.trim(),
    opening: document.querySelector('#create-opening').value.trim(),
    characters: lines.map(line => { const [name, ...role] = line.split('|'); return { name: name.trim(), role: role.join('|').trim() } }),
  }
  setBusy(true); tell('正在创建游戏……')
  try {
    const result = await api('/api/create', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(payload) })
    tell(`创建成功：${result.name}。重启 DSH 后即可开始游戏。`)
    await refresh()
  } catch(error) { tell(error.message, true) } finally { setBusy(false) }
})
document.querySelector('#validate').addEventListener('click', () => post('/api/validate'))
document.querySelector('#install').addEventListener('click', () => post('/api/install'))
document.querySelector('#sync').addEventListener('click', async () => {
  setBusy(true); tell('正在重新生成游戏入口……')
  try { const result=await api('/api/sync-presets',{method:'POST'}); tell(`已生成 ${result.generated} 个游戏入口，请重启 DSH。`) }
  catch(error){ tell(error.message,true) } finally { setBusy(false) }
})
refresh()
