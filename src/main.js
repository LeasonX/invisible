'use strict'

const path = require('path')
const {app, BrowserWindow, ipcMain, globalShortcut, screen, shell, dialog, Menu} = require('electron')
const store = require('./lib/store')
const model = require('./lib/model')
const oss = require('./lib/oss')
const shortcuts = require('./lib/shortcuts')
const history = require('./lib/history')
const {captureScreen} = require('./lib/screenshot')

const isDev = process.argv.includes('--dev') || !app.isPackaged

let overlayWindow = null
let settingsWindow = null
let lastImage = null
let streaming = false
let clickThrough = false

function state() {
  return store.getAll()
}

function createOverlayWindow() {
  const settings = state().appearance
  const {width, height} = screen.getPrimaryDisplay().workAreaSize
  const bounds = resolveBounds(settings, width, height)
  const overlay = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    transparent: true,
    frame: false,
    resizable: true,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: settings.alwaysOnTop !== false,
    acceptFirstMouse: true,
    // macOS: NSPanel + NonactivatingPanel，点击可响应但不激活应用
    // Windows: 配合 focusable=false 达到相同效果
    type: 'panel',
    // 非激活面板：可接收点击，但不会把其他应用踢出前台
    focusable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  applyAppearance(overlay, state().appearance)
  overlay.loadFile(path.join(__dirname, 'renderer', 'index.html'))
  overlay.once('ready-to-show', () => overlay.showInactive())
  // 记录用户手动调整的窗口大小与位置
  const saveBounds = () => persistBounds(overlay)
  overlay.on('resized', saveBounds)
  overlay.on('moved', saveBounds)
  overlay.on('closed', () => {
    overlayWindow = null
  })
  overlayWindow = overlay
  return overlay
}

// 还原上次的窗口大小与位置，并确保窗口完整落在可见区域内
function resolveBounds(settings, displayWidth, displayHeight) {
  const width = Math.max(280, Math.min(1600, Number(settings.width) || Math.round(displayWidth / 3)))
  const height = Math.max(240, Math.min(displayHeight, Number(settings.height) || displayHeight))
  const area = screen.getDisplayMatching({
    x: Number(settings.x) || 0,
    y: Number(settings.y) || 0,
    width,
    height
  }).workArea
  const x = Math.max(area.x, Math.min(Number(settings.x) || area.x, area.x + area.width - width))
  const y = Math.max(area.y, Math.min(Number(settings.y) || area.y, area.y + area.height - height))
  return {width, height, x, y}
}

// 持久化窗口几何信息（防抖，避免拖动过程中频繁写盘）
let persistTimer = null
function persistBounds(win) {
  if (!win || win.isDestroyed()) {
    return
  }
  if (persistTimer) {
    clearTimeout(persistTimer)
  }
  persistTimer = setTimeout(() => {
    persistTimer = null
    if (!win || win.isDestroyed()) {
      return
    }
    const b = win.getBounds()
    const appearance = state().appearance
    if (appearance.width === b.width && appearance.height === b.height
      && appearance.x === b.x && appearance.y === b.y) {
      return
    }
    store.set({
      appearance: {
        ...appearance,
        width: b.width,
        height: b.height,
        x: b.x,
        y: b.y
      }
    })
  }, 250)
}

// 立即写入（用于程序化调整后立刻落盘）
function persistBoundsNow(win) {
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  if (!win || win.isDestroyed()) {
    return
  }
  const b = win.getBounds()
  const appearance = state().appearance
  if (appearance.width === b.width && appearance.height === b.height
    && appearance.x === b.x && appearance.y === b.y) {
    return
  }
  store.set({
    appearance: {
      ...appearance,
      width: b.width,
      height: b.height,
      x: b.x,
      y: b.y
    }
  })
}

function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    // 用 showInactive 而不是 show()，避免把当前前台应用顶掉
    settingsWindow.showInactive()
    return settingsWindow
  }
  const settings = new BrowserWindow({
    width: 900,
    height: 720,
    minWidth: 760,
    minHeight: 560,
    title: 'unvisible 设置',
    // 沉浸式标题栏：隐藏系统标题栏，由页面自绘
    titleBarStyle: 'hiddenInset',
    // 页面有 10px 外边距，红绿灯需内移到面板范围内
    trafficLightPosition: {x: 24, y: 24},
    // 透明背景，由页面自行绘制面板
    transparent: true,
    backgroundColor: '#00000000',
    autoHideMenuBar: true,
    show: false,
    // 与悬浮窗一致：non-activating panel，点击不会激活应用
    type: 'panel',
    focusable: false,
    acceptFirstMouse: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  // 设置窗口同样禁止被截图 / 录屏捕获
  settings.setContentProtection(true)
  settings.setFocusable(false)
  settings.setAlwaysOnTop(true, 'floating', 1)
  // 透明度与主窗口保持一致
  const appearance = state().appearance
  settings.setOpacity(Math.min(1, Math.max(0.2, Number(appearance.opacity || 0.8))))
  settings.loadFile(path.join(__dirname, 'settings', 'index.html'))
  settings.once('ready-to-show', () => settings.showInactive())
  settings.on('closed', () => {
    settingsWindow = null
  })
  settingsWindow = settings
  return settings
}

function applyAppearance(win, appearance) {
  if (!win || win.isDestroyed()) {
    return
  }
  // 主窗口需要处理尺寸/位置与鼠标穿透，设置窗口不需要
  if (win === overlayWindow) {
    applyOverlayAppearance(win, appearance)
  } else {
    applySettingsAppearance(win, appearance)
  }
}

function applyOverlayAppearance(win, appearance) {
  win.setAlwaysOnTop(appearance.alwaysOnTop !== false, 'floating', 1)
  win.setOpacity(Math.min(1, Math.max(0.2, Number(appearance.opacity || 0.8))))
  win.setContentProtection(appearance.contentProtection !== false)
  win.setSkipTaskbar(appearance.hideFromTaskbar !== false)
  win.setFocusable(false)
  updateMousePassthrough()
  const bounds = win.getBounds()
  const width = Math.max(280, Number(appearance.width) || bounds.width)
  const height = Math.max(240, Number(appearance.height) || bounds.height)
  const x = Number.isFinite(Number(appearance.x)) ? Number(appearance.x) : bounds.x
  const y = Number.isFinite(Number(appearance.y)) ? Number(appearance.y) : bounds.y
  if (bounds.width !== width || bounds.height !== height || bounds.x !== x || bounds.y !== y) {
    win.setBounds({x, y, width, height})
  }
}

function applySettingsAppearance(win, appearance) {
  if (!win || win.isDestroyed()) {
    return
  }
  win.setAlwaysOnTop(true, 'floating', 1)
  win.setOpacity(Math.min(1, Math.max(0.2, Number(appearance.opacity || 0.8))))
  win.setContentProtection(appearance.contentProtection !== false)
  win.setFocusable(false)
}

function updateMousePassthrough() {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    return
  }
  overlayWindow.setIgnoreMouseEvents(clickThrough, {forward: true})
}

function broadcast(channel, payload) {
  const targets = [overlayWindow, settingsWindow]
  targets.forEach(win => {
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, payload)
    }
  })
}

async function prepareImage(settings) {
  const buffer = await captureScreen()
  lastImage = buffer
  if (oss.isEnabled(settings.oss)) {
    const uploaded = await oss.uploadBuffer(settings.oss, buffer, 'png')
    return {url: uploaded.url, key: uploaded.key, buffer}
  }
  return {url: `data:image/png;base64,${buffer.toString('base64')}`, key: null, buffer}
}

async function runRequest({withImage = false, promptOverride = null} = {}) {
  if (streaming) {
    return {ok: false, error: '上一次请求还在进行中'}
  }
  const settings = state()
  const startedAt = Date.now()
  const prompt = model.resolvePrompt(settings)
  streaming = true
  broadcast('request:start', {})
  // 截图信息需要在 catch 中也能取到，因此提到 try 之外
  let imageSize = null
  let ossKey = null
  let shot = null
  try {
    let imageUrl = null
    if (withImage) {
      const prepared = await prepareImage(settings)
      imageUrl = prepared.url
      imageSize = prepared.buffer.length
      ossKey = prepared.key
      shot = history.saveShot(prepared.buffer, startedAt)
      broadcast('request:image', {size: prepared.buffer.length})
    }
    const result = await model.request(settings, {
      imageUrl,
      promptOverride,
      stream: true,
      onDelta: (delta, full) => broadcast('request:delta', {delta, full})
    })
    history.append({
      timestamp: startedAt,
      status: 'success',
      trigger: withImage ? 'screenshot+request' : 'request',
      promptId: result.meta.promptId,
      promptName: result.meta.promptName,
      model: result.meta.model,
      withImage,
      imageSize,
      ossKey,
      shot,
      request: {system: result.meta.system, text: result.meta.text, hasImage: result.meta.hasImage},
      response: result.content,
      durationMs: Date.now() - startedAt
    })
    broadcast('request:done', {})
    return {ok: true}
  } catch (e) {
    const message = e.message || String(e)
    history.append({
      timestamp: startedAt,
      status: 'error',
      trigger: withImage ? 'screenshot+request' : 'request',
      promptId: prompt.id || null,
      promptName: prompt.name || null,
      model: settings.model.textModel,
      withImage,
      imageSize,
      ossKey,
      shot,
      request: {system: prompt.system || '', text: prompt.template || ''},
      response: '',
      error: message,
      durationMs: Date.now() - startedAt
    })
    broadcast('request:error', {error: message})
    return {ok: false, error: message}
  } finally {
    streaming = false
  }
}

async function takeScreenshotOnly() {
  const startedAt = Date.now()
  const settings = state()
  try {
    const prepared = await prepareImage(settings)
    const shot = history.saveShot(prepared.buffer, startedAt)
    history.append({
      timestamp: startedAt,
      status: 'success',
      trigger: 'screenshot',
      withImage: true,
      imageSize: prepared.buffer.length,
      ossKey: prepared.key,
      shot,
      request: {text: '仅截图，未发起模型请求'},
      response: '',
      durationMs: Date.now() - startedAt
    })
    broadcast('request:image', {size: prepared.buffer.length})
    broadcast('request:done', {})
    return {ok: true, size: prepared.buffer.length}
  } catch (e) {
    const message = e.message || String(e)
    history.append({
      timestamp: startedAt,
      status: 'error',
      trigger: 'screenshot',
      withImage: true,
      request: {text: '仅截图，未发起模型请求'},
      response: '',
      error: message,
      durationMs: Date.now() - startedAt
    })
    broadcast('request:error', {error: message})
    return {ok: false, error: message}
  }
}

function dispatchShortcut(action) {
  const overlay = overlayWindow
  switch (action) {
    case shortcuts.ACTIONS.screenshot:
      takeScreenshotOnly()
      break
    case shortcuts.ACTIONS.screenshotAndRequest:
      runRequest({withImage: true})
      break
    case shortcuts.ACTIONS.request:
      runRequest({withImage: false})
      break
    case shortcuts.ACTIONS.zoomIn:
    case shortcuts.ACTIONS.zoomOut: {
      if (!overlay) {
        return
      }
      const delta = action === shortcuts.ACTIONS.zoomIn ? 40 : -40
      const bounds = overlay.getBounds()
      const width = Math.max(280, Math.min(1600, bounds.width + delta))
      overlay.setBounds({...bounds, width})
      persistBoundsNow(overlay)
      break
    }
    case shortcuts.ACTIONS.moveUp:
    case shortcuts.ACTIONS.moveDown:
    case shortcuts.ACTIONS.moveLeft:
    case shortcuts.ACTIONS.moveRight: {
      if (!overlay) {
        return
      }
      const bounds = overlay.getBounds()
      const step = 60
      const dx = action === shortcuts.ACTIONS.moveLeft ? -step : action === shortcuts.ACTIONS.moveRight ? step : 0
      const dy = action === shortcuts.ACTIONS.moveUp ? -step : action === shortcuts.ACTIONS.moveDown ? step : 0
      overlay.setPosition(bounds.x + dx, bounds.y + dy)
      persistBoundsNow(overlay)
      break
    }
    case shortcuts.ACTIONS.toggleVisibility: {
      if (!overlay) {
        return
      }
      if (overlay.isVisible()) {
        overlay.hide()
      } else {
        overlay.showInactive()
      }
      break
    }
    case shortcuts.ACTIONS.toggleSettings:
      createSettingsWindow()
      break
    case shortcuts.ACTIONS.toggleClickThrough:
      clickThrough = !clickThrough
      updateMousePassthrough()
      broadcast('click-through:changed', {enabled: clickThrough})
      break
    case shortcuts.ACTIONS.quit:
      app.quit()
      break
    default:
      break
  }
}

function registerShortcuts() {
  const settings = state()
  return shortcuts.register(settings.shortcuts, dispatchShortcut)
}

function registerIpc() {
  ipcMain.handle('settings:get', () => state())
  ipcMain.handle('settings:update', (_event, patch) => {
    const payload = {...(patch || {})}
    // 设置窗口中把空字符串视为“清除该密钥”
    const cleared = []
    const secretGroups = {model: ['apiKey'], oss: ['accessKeyId', 'accessKeySecret']}
    Object.entries(secretGroups).forEach(([group, fields]) => {
      if (!payload[group]) {
        return
      }
      fields.forEach(field => {
        if (payload[group][field] === '' && store.getAll()[group][field]) {
          cleared.push(`${group}.${field}`)
        }
      })
    })
    if (cleared.length) {
      payload.__clearSecrets = cleared
    }
    const next = store.set(payload)
    applyAppearance(overlayWindow, next.appearance)
    // 设置窗口同步外观（透明度等）
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      applyAppearance(settingsWindow, next.appearance)
    }
    registerShortcuts()
    if (next.history) {
      history.setEnabled(next.history.enabled !== false)
    }
    broadcast('settings:changed', next)
    return next
  })
  ipcMain.handle('settings:export', async () => {
    const config = store.exportConfig({includeSecrets: false})
    const {canceled, filePath} = await dialog.showSaveDialog({
      title: '导出配置',
      defaultPath: `unvisible-config-${Date.now()}.json`,
      filters: [{name: 'JSON', extensions: ['json']}]
    })
    if (canceled || !filePath) {
      return {ok: false}
    }
    require('fs').writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf8')
    return {ok: true, filePath}
  })
  ipcMain.handle('settings:import', async () => {
    const {canceled, filePaths} = await dialog.showOpenDialog({
      title: '导入配置',
      properties: ['openFile'],
      filters: [{name: 'JSON', extensions: ['json']}]
    })
    if (canceled || !filePaths || !filePaths.length) {
      return {ok: false}
    }
    const raw = require('fs').readFileSync(filePaths[0], 'utf8')
    const parsed = JSON.parse(raw)
    const next = store.importConfig(parsed)
    applyAppearance(overlayWindow, next.appearance)
    registerShortcuts()
    broadcast('settings:changed', next)
    return {ok: true, settings: next}
  })
  ipcMain.handle('request:run', (_event, options) => runRequest(options || {}))
  ipcMain.handle('history:list', (_event, options) => history.readAll(options || {}))
  ipcMain.handle('history:clear', () => {
    history.clear()
    broadcast('history:changed', {})
    return true
  })
  ipcMain.handle('history:stats', () => history.stats())
  ipcMain.handle('history:shot', (_event, name) => history.readShot(name))
  ipcMain.handle('history:toggle', (_event, value) => {
    history.setEnabled(value !== false)
    return history.setEnabled(value !== false)
  })
  ipcMain.handle('screenshot:run', async () => {
    try {
      const prepared = await prepareImage(state())
      return {ok: true, size: prepared.buffer.length}
    } catch (e) {
      return {ok: false, error: e.message}
    }
  })
  ipcMain.handle('window:getBounds', () => {
    if (!overlayWindow || overlayWindow.isDestroyed()) {
      return null
    }
    const b = overlayWindow.getBounds()
    return {width: b.width, height: b.height, x: b.x, y: b.y}
  })
  ipcMain.handle('window:appearance', (_event, appearance) => {
    applyAppearance(overlayWindow, appearance)
    return true
  })
  ipcMain.handle('window:clickThrough', (_event, enabled) => {
    clickThrough = Boolean(enabled)
    updateMousePassthrough()
    return true
  })
  ipcMain.handle('window:setVisible', (_event, visible) => {
    if (!overlayWindow) {
      return false
    }
    if (visible) {
      overlayWindow.showInactive()
    } else {
      overlayWindow.hide()
    }
    return overlayWindow.isVisible()
  })
  ipcMain.handle('window:openSettings', () => {
    createSettingsWindow()
    return true
  })
  ipcMain.handle('shortcuts:list', () => {
    return {
      registered: globalShortcut.isRegistered(),
      conflicts: registerShortcuts()
    }
  })
  ipcMain.handle('app:quit', () => {
    app.quit()
    return true
  })
}

app.whenReady().then(() => {
  store.init(app)
  history.init(app)
  history.setEnabled(state().history && state().history.enabled !== false)
  if (process.platform === 'darwin') {
    app.dock.hide()
  }
  Menu.setApplicationMenu(null)
  registerIpc()
  createOverlayWindow()
  const conflicts = registerShortcuts()
  if (conflicts.length) {
    console.warn('[unvisible] 快捷键注册冲突:', conflicts)
  }
  app.on('activate', () => {
    if (!overlayWindow) {
      createOverlayWindow()
    }
  })
})

app.on('window-all-closed', () => {
  app.quit()
})

app.on('before-quit', () => {
  globalShortcut.unregisterAll()
})

process.on('uncaughtException', error => {
  console.error('[unvisible] 未捕获异常:', error)
})

module.exports = {runRequest, state, isDev}
