'use strict'

const api = window.unvisible

const state = {
  settings: null,
  text: '',
  streaming: false
}

const el = id => document.getElementById(id)

const FONT_FAMILIES = {
  system: '-apple-system, "SF Pro Text", "PingFang SC", sans-serif',
  serif: 'Georgia, "Songti SC", serif',
  mono: '"SF Mono", "JetBrains Mono", Menlo, monospace',
  rounded: '"SF Pro Rounded", "PingFang SC", sans-serif'
}

function applyAppearance(appearance) {
  const root = document.documentElement
  root.dataset.theme = appearance.theme === 'light' ? 'light' : 'dark'
  root.style.setProperty('--accent', appearance.accentColor || '#4f8cff')
  root.style.setProperty('--font-size', `${appearance.fontSize || 15}px`)
  root.style.setProperty('--font-family', FONT_FAMILIES[appearance.fontFamily] || FONT_FAMILIES.system)
  el('bar').hidden = appearance.showToolbar === false
}

function currentPrompt() {
  const config = state.settings && state.settings.prompt
  if (!config) {
    return null
  }
  const list = config.prompts || []
  return list.find(item => item.id === config.activeId) || list[0]
}

function refreshChrome() {
  const prompt = currentPrompt()
  el('prompt-tag').textContent = prompt ? prompt.name : '未选择'
  const mode = (state.settings && state.settings.appearance.previewMode) || 'markdown'
  el('content').dataset.mode = mode
}

function setStatus(text, busy) {
  el('status-text').textContent = text
  el('spinner').hidden = !busy
  state.streaming = busy
}

function render(text) {
  const content = el('content')
  const mode = (state.settings && state.settings.appearance.previewMode) || 'markdown'
  if (!text) {
    content.innerHTML = ''
    el('empty').hidden = false
    return
  }
  el('empty').hidden = true
  if (mode === 'text') {
    content.textContent = text
    return
  }
  content.innerHTML = window.marked.parse(text, {breaks: true, gfm: true})
}

function bindEvents() {
  el('btn-request').addEventListener('click', () => api.runRequest({withImage: false}))
  el('btn-shot').addEventListener('click', () => api.runRequest({withImage: true}))
  el('btn-settings').addEventListener('click', () => api.openSettings())

  api.on('request:start', () => {
    setStatus('正在请求模型…', true)
    state.text = ''
    render('')
  })
  api.on('request:image', payload => {
    setStatus(`截图完成 (${Math.round((payload.size || 0) / 1024)} KB)，请求中…`, true)
  })
  api.on('request:delta', payload => {
    state.text = payload.full !== undefined ? payload.full : state.text + (payload.delta || '')
    render(state.text)
  })
  api.on('request:done', () => setStatus('完成', false))
  api.on('request:error', payload => setStatus(`失败：${payload.error}`, false))
  api.on('click-through:changed', payload => {
    setStatus(payload.enabled ? '鼠标穿透已开启' : '鼠标穿透已关闭', false)
  })
  api.on('settings:changed', settings => {
    state.settings = settings
    applyAppearance(settings.appearance)
    refreshChrome()
  })
}

async function init() {
  state.settings = await api.getSettings()
  applyAppearance(state.settings.appearance)
  refreshChrome()
  bindEvents()
  setStatus('等待指令', false)
}

init()
