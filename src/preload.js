'use strict'

const {contextBridge, ipcRenderer} = require('electron')

contextBridge.exposeInMainWorld('unvisible', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: patch => ipcRenderer.invoke('settings:update', patch),
  exportSettings: () => ipcRenderer.invoke('settings:export'),
  importSettings: () => ipcRenderer.invoke('settings:import'),
  runRequest: options => ipcRenderer.invoke('request:run', options),
  listHistory: options => ipcRenderer.invoke('history:list', options),
  clearHistory: () => ipcRenderer.invoke('history:clear'),
  historyStats: () => ipcRenderer.invoke('history:stats'),
  readHistoryShot: name => ipcRenderer.invoke('history:shot', name),
  toggleHistory: enabled => ipcRenderer.invoke('history:toggle', enabled),
  takeScreenshot: () => ipcRenderer.invoke('screenshot:run'),
  applyAppearance: appearance => ipcRenderer.invoke('window:appearance', appearance),
  getWindowBounds: () => ipcRenderer.invoke('window:getBounds'),
  setClickThrough: enabled => ipcRenderer.invoke('window:clickThrough', enabled),
  setWindowVisible: visible => ipcRenderer.invoke('window:setVisible', visible),
  openSettings: () => ipcRenderer.invoke('window:openSettings'),
  checkShortcuts: () => ipcRenderer.invoke('shortcuts:list'),
  quitApp: () => ipcRenderer.invoke('app:quit'),
  on: (channel, handler) => {
    const allowed = [
      'request:start',
      'request:delta',
      'request:done',
      'request:error',
      'request:image',
      'settings:changed',
      'click-through:changed',
      'history:changed'
    ]
    if (!allowed.includes(channel)) {
      return
    }
    ipcRenderer.on(channel, (_event, payload) => handler(payload))
  }
})
