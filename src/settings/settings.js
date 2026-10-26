'use strict'

const api = window.unvisible

const SECTIONS = [
  {id: 'model', title: '模型', desc: '配置视觉与文本模型服务'},
  {id: 'oss', title: 'OSS', desc: '截图上传到对象存储'},
  {id: 'prompt', title: '提示词', desc: '动态 prompt 模板管理'},
  {id: 'appearance', title: '外观', desc: '主题、字体与窗口行为'},
  {id: 'shortcuts', title: '快捷键', desc: '全局快捷键绑定'},
  {id: 'proxy', title: '代理', desc: '本地网络代理'},
  {id: 'history', title: '历史', desc: '请求与响应记录'}
]

const SHORTCUT_LABELS = {
  screenshot: '截图',
  request: '请求模型',
  screenshotAndRequest: '截图 + 请求模型',
  zoomIn: '窗口放大',
  zoomOut: '窗口缩小',
  moveUp: '窗口上移',
  moveDown: '窗口下移',
  moveLeft: '窗口左移',
  moveRight: '窗口右移',
  toggleVisibility: '窗口显隐',
  toggleSettings: '打开设置',
  toggleClickThrough: '鼠标穿透开关',
  quit: '退出应用'
}

const state = {
  settings: null,
  editingPromptId: null,
  history: [],
  expandedHistoryId: null
}

const el = id => document.getElementById(id)

function buildNav() {
  const nav = el('nav')
  nav.innerHTML = ''
  SECTIONS.forEach(section => {
    const button = document.createElement('sl-button')
    button.className = 'nav-item'
    button.textContent = section.title
    button.dataset.target = section.id
    button.variant = 'text'
    button.addEventListener('click', () => showSection(section.id))
    nav.appendChild(button)
  })
}

function showSection(id) {
  SECTIONS.forEach(section => {
    const panel = document.querySelector(`[data-panel="${section.id}"]`)
    if (panel) {
      panel.hidden = section.id !== id
    }
    const item = document.querySelector(`.nav-item[data-target="${section.id}"]`)
    if (item) {
      item.classList.toggle('active', section.id === id)
    }
  })
  const current = SECTIONS.find(section => section.id === id)
  el('page-title').textContent = current.title
  el('page-desc').textContent = current.desc
  if (id === 'history') {
    loadHistory()
  }
}

function fillModelPanel(settings) {
  el('baseUrl').value = settings.model.baseUrl || ''
  el('apiKey').value = settings.model.apiKey || ''
  el('visionModel').value = settings.model.visionModel || ''
  el('textModel').value = settings.model.textModel || ''
  el('timeout').value = settings.model.requestTimeout ?? 120000
  el('temperature').value = settings.model.temperature ?? 0.2
  el('maxTokens').value = settings.model.maxTokens ?? 4096
  el('stream').checked = settings.model.stream !== false
}

function fillOssPanel(settings) {
  el('ossEnabled').checked = Boolean(settings.oss.enabled)
  el('ossRegion').value = settings.oss.region || ''
  el('ossBucket').value = settings.oss.bucket || ''
  el('ossEndpoint').value = settings.oss.endpoint || ''
  el('ossAk').value = settings.oss.accessKeyId || ''
  el('ossSk').value = settings.oss.accessKeySecret || ''
  el('ossPrefix').value = settings.oss.objectPrefix || ''
  el('ossExpiry').value = settings.oss.signExpirySeconds ?? 3600
}

function fillPromptPanel(settings) {
  setSelectOptions(el('activePrompt'), (settings.prompt.prompts || []).map(prompt => ({
    value: prompt.id,
    label: prompt.name
  })), settings.prompt.activeId || '')
  renderPromptList()
  loadPromptIntoEditor()
  renderVariables()
  el('includeImage').checked = settings.prompt.includeImage !== false
  el('extraContext').value = settings.prompt.extraContext || ''
}

// 模板变量编辑器：key/value 动态增删
function renderVariables() {
  const list = el('variableList')
  list.innerHTML = ''
  const variables = state.settings.prompt.variables || []

  variables.forEach((item, index) => {
    const row = document.createElement('div')
    row.className = 'var-row'

    const keyInput = document.createElement('sl-input')
    keyInput.className = 'var-key'
    keyInput.placeholder = '变量名'
    keyInput.value = item.key || ''
    keyInput.addEventListener('sl-input', event => {
      variables[index].key = event.target.value.trim()
    })

    const valueInput = document.createElement('sl-input')
    valueInput.className = 'var-value'
    valueInput.placeholder = '变量值'
    valueInput.value = item.value === undefined || item.value === null ? '' : String(item.value)
    valueInput.addEventListener('sl-input', event => {
      variables[index].value = event.target.value
    })

    const remove = document.createElement('sl-button')
    remove.className = 'var-remove'
    remove.size = 'small'
    remove.variant = 'text'
    remove.textContent = '×'
    remove.title = '删除该变量'
    remove.addEventListener('click', () => {
      variables.splice(index, 1)
      renderVariables()
    })

    row.appendChild(keyInput)
    row.appendChild(valueInput)
    row.appendChild(remove)
    list.appendChild(row)
  })

  el('varCount').textContent = variables.length ? `${variables.length} 个变量` : '暂无变量'
}

// sl-select 的选项需要使用 sl-option 元素，且赋值要等组件完成初始化
function setSelectOptions(select, options, value) {
  select.innerHTML = ''
  options.forEach(item => {
    const option = document.createElement('sl-option')
    option.value = item.value
    option.textContent = item.label
    select.appendChild(option)
  })
  const apply = () => {
    select.value = value
  }
  if (select.updateComplete) {
    select.updateComplete.then(apply).catch(apply)
  } else {
    setTimeout(apply, 0)
  }
}

function renderPromptList() {
  const list = el('promptList')
  list.innerHTML = ''
  ;(state.settings.prompt.prompts || []).forEach(prompt => {
    const row = document.createElement('div')
    row.className = 'list-row' + (prompt.id === state.settings.prompt.activeId ? ' active' : '')
    row.innerHTML = `<span class="list-name"></span><span class="list-tag"></span>`
    row.querySelector('.list-name').textContent = prompt.name
    row.querySelector('.list-tag').textContent = prompt.builtin ? '内置' : '自定义'
    row.addEventListener('click', () => {
      state.editingPromptId = prompt.id
      renderPromptList()
      loadPromptIntoEditor()
    })
    list.appendChild(row)
  })
}

// 截图查看器：拖拽手柄调整大小、滚轮缩放、双击复位
function bindShotViewer(viewer, img, handle, zoomLabel) {
  const MIN_WIDTH = 120
  const MAX_WIDTH = 1600
  let width = 0

  const applyWidth = value => {
    width = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(value)))
    viewer.style.setProperty('--shot-width', width + 'px')
    if (img.naturalWidth) {
      zoomLabel.textContent = `${Math.round((width / img.naturalWidth) * 100)}%`
    }
  }

  const reset = () => {
    if (!img.naturalWidth) {
      return
    }
    // 默认适应容器宽度，不超出面板
    const containerWidth = viewer.parentElement
      ? viewer.parentElement.clientWidth - 2
      : img.naturalWidth
    applyWidth(Math.min(img.naturalWidth, containerWidth || img.naturalWidth, MAX_WIDTH))
  }

  // 拖拽手柄改变宽度
  handle.addEventListener('mousedown', event => {
    event.preventDefault()
    event.stopPropagation()
    const startX = event.clientX
    const startWidth = width || viewer.getBoundingClientRect().width
    let dragging = false
    const onMove = moveEvent => {
      dragging = true
      applyWidth(startWidth + (moveEvent.clientX - startX))
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.classList.remove('resizing-shot')
      if (dragging) {
        // 拖拽结束后的 click 不能冒泡到历史行，否则会重建详情区导致图片丢失
        const swallowClick = clickEvent => {
          clickEvent.stopPropagation()
          clickEvent.preventDefault()
          document.removeEventListener('click', swallowClick, true)
        }
        document.addEventListener('click', swallowClick, true)
        setTimeout(() => document.removeEventListener('click', swallowClick, true), 0)
      }
    }
    document.body.classList.add('resizing-shot')
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  })

  // 滚轮缩放
  viewer.addEventListener('wheel', event => {
    event.preventDefault()
    const current = width || viewer.getBoundingClientRect().width
    applyWidth(current + (event.deltaY > 0 ? -40 : 40))
  }, {passive: false})

  // 双击复位为原始宽度
  img.addEventListener('dblclick', event => {
    event.preventDefault()
    reset()
  })

  handle.addEventListener('dblclick', event => {
    event.preventDefault()
    event.stopPropagation()
    reset()
  })

  img.addEventListener('load', () => {
    reset()
  })
}

function loadPromptIntoEditor() {
  const editor = el('promptEditor')
  const prompt = (state.settings.prompt.prompts || []).find(item => item.id === state.editingPromptId)
  if (!prompt) {
    editor.hidden = true
    return
  }
  editor.hidden = false
  el('promptName').value = prompt.name
  el('promptSystem').value = prompt.system || ''
  el('promptTemplate').value = prompt.template || ''
  el('promptFormat').value = prompt.outputFormat || 'markdown'
}

function fillAppearancePanel(settings) {
  el('theme').value = settings.appearance.theme || 'dark'
  el('accentColor').value = settings.appearance.accentColor || '#4f8cff'
  el('opacity').value = settings.appearance.opacity ?? 0.8
  el('opacityValue').textContent = Number(settings.appearance.opacity ?? 0.8).toFixed(2)
  el('fontFamily').value = settings.appearance.fontFamily || 'system'
  el('fontSize').value = settings.appearance.fontSize ?? 15
  el('fontSizeValue').textContent = `${settings.appearance.fontSize ?? 15}px`
  el('previewMode').value = settings.appearance.previewMode || 'markdown'
  el('showToolbar').checked = settings.appearance.showToolbar !== false
  el('contentProtection').checked = settings.appearance.contentProtection !== false
  el('alwaysOnTop').checked = settings.appearance.alwaysOnTop !== false
  el('hideFromTaskbar').checked = settings.appearance.hideFromTaskbar !== false
  el('winWidth').value = settings.appearance.width ?? 420
  el('winHeight').value = settings.appearance.height ?? 560
  el('winX').value = settings.appearance.x ?? 70
  el('winY').value = settings.appearance.y ?? 0
}

function fillHistoryPanel(settings) {
  el('historyEnabled').checked = settings.history ? settings.history.enabled !== false : true
}

function renderShortcutList() {
  const list = el('shortcutList')
  list.innerHTML = ''
  Object.entries(state.settings.shortcuts || {}).forEach(([action, accelerator]) => {
    const row = document.createElement('div')
    row.className = 'list-row shortcut'
    row.innerHTML = `<span class="list-name"></span><sl-button class="key-btn" size="small"></sl-button>`
    row.querySelector('.list-name').textContent = SHORTCUT_LABELS[action] || action
    const button = row.querySelector('.key-btn')
    button.textContent = formatAccelerator(accelerator)
    button.dataset.accelerator = accelerator || ''
    button.addEventListener('click', () => recordShortcut(button, action))
    list.appendChild(row)
  })
}

function formatAccelerator(accelerator) {
  if (!accelerator) {
    return '未设置'
  }
  const isMac = navigator.platform.toLowerCase().includes('mac')
  const parts = accelerator.split('+')
  const key = parts.pop() || ''
  const mods = parts.map(mod => {
    if (mod === 'CommandOrControl' || mod === 'CmdOrCtrl') {
      return isMac ? '⌘' : 'Ctrl'
    }
    if (mod === 'Command' || mod === 'Cmd') {
      return '⌘'
    }
    if (mod === 'Control' || mod === 'Ctrl') {
      return isMac ? '⌃' : 'Ctrl'
    }
    if (mod === 'Alt' || mod === 'Option') {
      return isMac ? '⌥' : 'Alt'
    }
    if (mod === 'Shift') {
      return isMac ? '⇧' : 'Shift'
    }
    return mod
  })
  const keyLabel = {
    Return: '↩',
    Enter: '↩',
    Space: 'Space',
    Up: '↑',
    Down: '↓',
    Left: '←',
    Right: '→',
    Escape: 'Esc'
  }[key] || key
  return [...mods, keyLabel].join(isMac ? '' : '+')
}

function recordShortcut(button, action) {
  const original = button.dataset.accelerator || ''
  button.textContent = '按下组合键…'
  button.classList.add('recording')
  const onKeyDown = event => {
    event.preventDefault()
    const accelerator = toAccelerator(event)
    document.removeEventListener('keydown', onKeyDown, true)
    button.classList.remove('recording')
    if (!accelerator) {
      button.textContent = formatAccelerator(original)
      return
    }
    button.textContent = formatAccelerator(accelerator)
    button.dataset.accelerator = accelerator
    state.settings.shortcuts[action] = accelerator
  }
  document.addEventListener('keydown', onKeyDown, true)
}

function toAccelerator(event) {
  const parts = []
  if (event.metaKey || event.ctrlKey) {
    parts.push('CommandOrControl')
  }
  if (event.altKey) {
    parts.push('Alt')
  }
  if (event.shiftKey) {
    parts.push('Shift')
  }
  const key = event.key
  if (!key || ['Meta', 'Control', 'Alt', 'Shift'].includes(key)) {
    return ''
  }
  if (key === ' ') {
    parts.push('Space')
  } else if (key.length === 1) {
    parts.push(key.toUpperCase())
  } else {
    parts.push(key)
  }
  return parts.join('+')
}

function fillProxyPanel(settings) {
  el('proxyEnabled').checked = Boolean(settings.proxy.enabled)
  el('proxyType').value = settings.proxy.type || 'http'
  el('proxyHost').value = settings.proxy.host || ''
  el('proxyPort').value = settings.proxy.port ?? 7890
  el('proxyBypass').value = settings.proxy.bypass || ''
}

function formatTime(timestamp) {
  const date = new Date(timestamp)
  const pad = n => String(n).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function formatDuration(ms) {
  if (typeof ms !== 'number') {
    return '-'
  }
  if (ms < 1000) {
    return `${ms}ms`
  }
  return `${(ms / 1000).toFixed(1)}s`
}

const TRIGGER_LABELS = {
  screenshot: '截图',
  request: '请求模型',
  'screenshot+request': '截图 + 请求'
}

function renderHistory() {
  const list = el('historyList')
  list.innerHTML = ''
  const entries = state.history
  el('historyEmpty').hidden = entries.length > 0

  entries.forEach(entry => {
    const row = document.createElement('div')
    row.className = 'history-item' + (entry.status === 'error' ? ' failed' : '')

    const head = document.createElement('div')
    head.className = 'history-head'
    head.innerHTML = `
      <span class="status-dot"></span>
      <span class="history-time"></span>
      <span class="history-tag"></span>
      <span class="history-model"></span>
      <span class="history-duration"></span>
    `
    head.querySelector('.history-time').textContent = formatTime(entry.timestamp)
    head.querySelector('.history-tag').textContent = TRIGGER_LABELS[entry.trigger] || entry.trigger
    head.querySelector('.history-model').textContent = entry.model || '-'
    head.querySelector('.history-duration').textContent = formatDuration(entry.durationMs)
    row.appendChild(head)

    const summary = document.createElement('div')
    summary.className = 'history-summary'
    summary.textContent = entry.error || entry.promptName || (entry.request && entry.request.text) || '（无内容）'
    row.appendChild(summary)

    if (entry.shot) {
      const thumb = document.createElement('div')
      thumb.className = 'history-shot'
      const img = document.createElement('img')
      img.alt = '截图'
      img.dataset.shot = entry.shot
      thumb.appendChild(img)
      row.appendChild(thumb)
      api.readHistoryShot(entry.shot).then(dataUrl => {
        if (dataUrl) {
          img.src = dataUrl
          thumb.classList.add('loaded')
        }
      })
    }

    if (state.expandedHistoryId === entry.id) {
      const values = [
        entry.request && (entry.request.text || entry.request.system),
        entry.request && entry.request.system,
        entry.response,
        entry.error
      ]
      const labels = ['请求内容', '系统提示', '响应', '错误']
      const detail = document.createElement('div')
      detail.className = 'history-detail'
      if (entry.shot) {
        const full = document.createElement('div')
        full.className = 'detail-block shot-block'
        const label = document.createElement('div')
        label.className = 'detail-label'
        label.textContent = '截图'

        const viewer = document.createElement('div')
        viewer.className = 'shot-viewer'
        const img = document.createElement('img')
        img.className = 'detail-shot'
        img.alt = '完整截图'
        img.draggable = false
        const handle = document.createElement('div')
        handle.className = 'shot-handle'
        handle.title = '拖拽调整大小，滚轮缩放，双击复位'
        const zoomLabel = document.createElement('div')
        zoomLabel.className = 'shot-zoom-label'

        viewer.appendChild(img)
        viewer.appendChild(handle)
        full.appendChild(label)
        full.appendChild(viewer)
        full.appendChild(zoomLabel)
        detail.appendChild(full)

        bindShotViewer(viewer, img, handle, zoomLabel)

        api.readHistoryShot(entry.shot).then(dataUrl => {
          if (dataUrl) {
            img.src = dataUrl
          }
        })
      }
      values.forEach((value, index) => {
        if (!value) {
          return
        }
        const block = document.createElement('div')
        block.className = 'detail-block'
        const label = document.createElement('div')
        label.className = 'detail-label'
        label.textContent = labels[index]
        const body = document.createElement('pre')
        body.className = 'detail-body'
        body.textContent = value
        block.appendChild(label)
        block.appendChild(body)
        detail.appendChild(block)
      })
      row.appendChild(detail)
    }

    row.addEventListener('click', () => {
      state.expandedHistoryId = state.expandedHistoryId === entry.id ? null : entry.id
      renderHistory()
    })
    list.appendChild(row)
  })

  el('historyStats').textContent = `共 ${entries.length} 条记录`
}

async function loadHistory() {
  const search = el('historySearch').value
  const status = el('historyFilter').value
  const limit = (state.settings && state.settings.history && state.settings.history.maxEntries) || 200
  state.history = await api.listHistory({limit, status, search})
  renderHistory()
}

function collect() {
  const settings = state.settings
  settings.model = {
    ...settings.model,
    baseUrl: el('baseUrl').value.trim(),
    apiKey: el('apiKey').value.trim(),
    visionModel: el('visionModel').value.trim(),
    textModel: el('textModel').value.trim(),
    requestTimeout: Number(el('timeout').value) || 120000,
    temperature: Number(el('temperature').value),
    maxTokens: Number(el('maxTokens').value) || 4096,
    stream: el('stream').checked
  }
  settings.oss = {
    ...settings.oss,
    enabled: el('ossEnabled').checked,
    region: el('ossRegion').value.trim(),
    bucket: el('ossBucket').value.trim(),
    endpoint: el('ossEndpoint').value.trim(),
    accessKeyId: el('ossAk').value.trim(),
    accessKeySecret: el('ossSk').value.trim(),
    objectPrefix: el('ossPrefix').value.trim(),
    signExpirySeconds: Number(el('ossExpiry').value) || 3600
  }
  settings.prompt = {
    ...settings.prompt,
    activeId: el('activePrompt').value,
    variables: (state.settings.prompt.variables || []).map(item => ({
      key: (item.key || '').trim(),
      value: item.value === undefined || item.value === null ? '' : String(item.value)
    })).filter(item => item.key),
    includeImage: el('includeImage').checked,
    extraContext: el('extraContext').value
  }
  const editing = (settings.prompt.prompts || []).find(item => item.id === state.editingPromptId)
  if (editing) {
    editing.name = el('promptName').value.trim() || editing.name
    editing.system = el('promptSystem').value
    editing.template = el('promptTemplate').value
    editing.outputFormat = el('promptFormat').value
  }
  settings.appearance = {
    ...settings.appearance,
    theme: el('theme').value,
    accentColor: el('accentColor').value,
    opacity: Number(el('opacity').value),
    fontFamily: el('fontFamily').value,
    fontSize: Number(el('fontSize').value) || 15,
    previewMode: el('previewMode').value,
    showToolbar: el('showToolbar').checked,
    contentProtection: el('contentProtection').checked,
    alwaysOnTop: el('alwaysOnTop').checked,
    hideFromTaskbar: el('hideFromTaskbar').checked,
    width: Number(el('winWidth').value) || 420,
    height: Number(el('winHeight').value) || 560,
    x: Number(el('winX').value) || 0,
    y: Number(el('winY').value) || 0
  }
  settings.proxy = {
    ...settings.proxy,
    enabled: el('proxyEnabled').checked,
    type: el('proxyType').value,
    host: el('proxyHost').value.trim(),
    port: Number(el('proxyPort').value) || 0,
    bypass: el('proxyBypass').value.trim()
  }
  settings.history = {
    ...(settings.history || {}),
    enabled: el('historyEnabled').checked
  }
  return settings
}

function flashSaved() {
  const badge = el('saved')
  badge.hidden = false
  setTimeout(() => {
    badge.hidden = true
  }, 1600)
}

function bindEvents() {
  el('btn-save').addEventListener('click', async () => {
    const next = await api.updateSettings(collect())
    state.settings = next
    fillModelPanel(next)
    fillOssPanel(next)
    fillAppearancePanel(next)
    fillProxyPanel(next)
    fillHistoryPanel(next)
    flashSaved()
  })
  el('btn-export').addEventListener('click', () => api.exportSettings())
  el('btn-import').addEventListener('click', async () => {
    const result = await api.importSettings()
    if (result && result.ok) {
      state.settings = result.settings
      fillAll()
      flashSaved()
    }
  })
  el('activePrompt').addEventListener('sl-change', event => {
    state.settings.prompt.activeId = event.target.value
    state.editingPromptId = event.target.value
    renderPromptList()
    loadPromptIntoEditor()
  })
  el('opacity').addEventListener('sl-input', event => {
    el('opacityValue').textContent = Number(event.target.value).toFixed(2)
  })
  el('fontSize').addEventListener('sl-input', event => {
    el('fontSizeValue').textContent = `${event.target.value}px`
  })
  el('historySearch').addEventListener('sl-input', () => {
    loadHistory()
  })
  el('historyFilter').addEventListener('sl-change', () => {
    loadHistory()
  })
  el('historyEnabled').addEventListener('sl-change', event => {
    api.toggleHistory(event.target.checked)
  })
  el('btn-add-prompt').addEventListener('click', () => {
    const id = `prompt-${Date.now()}`
    state.settings.prompt.prompts.push({
      id,
      name: '新建提示词',
      builtin: false,
      system: '你是一个严谨、简洁的助手。',
      template: '请识别并说明图片中的内容。',
      outputFormat: 'markdown'
    })
    state.settings.prompt.activeId = id
    state.editingPromptId = id
    setSelectOptions(el('activePrompt'), state.settings.prompt.prompts.map(prompt => ({
      value: prompt.id,
      label: prompt.name
    })), id)
    renderPromptList()
    loadPromptIntoEditor()
  })
  el('btn-del-prompt').addEventListener('click', () => {
    const prompts = state.settings.prompt.prompts
    const target = prompts.find(item => item.id === state.editingPromptId)
    if (!target || target.builtin) {
      return
    }
    prompts.splice(prompts.indexOf(target), 1)
    state.editingPromptId = state.settings.prompt.activeId
    setSelectOptions(el('activePrompt'), prompts.map(prompt => ({
      value: prompt.id,
      label: prompt.name
    })), state.settings.prompt.activeId)
    renderPromptList()
    loadPromptIntoEditor()
  })
  el('btn-add-var').addEventListener('click', () => {
    if (!state.settings.prompt.variables) {
      state.settings.prompt.variables = []
    }
    state.settings.prompt.variables.push({key: '', value: ''})
    renderVariables()
    // 聚焦到最后一行的变量名输入框
    const rows = el('variableList').querySelectorAll('.var-key')
    const last = rows[rows.length - 1]
    if (last && last.focus) {
      last.focus()
    }
  })
  el('btn-clear-history').addEventListener('click', async () => {
    await api.clearHistory()
    state.expandedHistoryId = null
    await loadHistory()
  })
}

function fillAll() {
  fillModelPanel(state.settings)
  fillOssPanel(state.settings)
  fillPromptPanel(state.settings)
  fillAppearancePanel(state.settings)
  renderShortcutList()
  fillProxyPanel(state.settings)
  fillHistoryPanel(state.settings)
}

async function init() {
  buildNav()
  state.settings = await api.getSettings()
  state.editingPromptId = state.settings.prompt.activeId
  fillAll()
  bindEvents()
  showSection('model')
  await refreshLiveBounds()
}

// 用窗口实际状态刷新尺寸/位置输入框，避免配置与实际不一致
async function refreshLiveBounds() {
  const bounds = await api.getWindowBounds()
  if (!bounds) {
    return
  }
  state.settings.appearance = {
    ...state.settings.appearance,
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y
  }
  el('winWidth').value = bounds.width
  el('winHeight').value = bounds.height
  el('winX').value = bounds.x
  el('winY').value = bounds.y
}

init()
