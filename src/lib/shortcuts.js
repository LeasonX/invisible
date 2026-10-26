'use strict'

const {globalShortcut} = require('electron')

const ACTIONS = {
  screenshot: 'screenshot',
  request: 'request',
  screenshotAndRequest: 'screenshotAndRequest',
  zoomIn: 'zoomIn',
  zoomOut: 'zoomOut',
  moveUp: 'moveUp',
  moveDown: 'moveDown',
  moveLeft: 'moveLeft',
  moveRight: 'moveRight',
  toggleVisibility: 'toggleVisibility',
  toggleSettings: 'toggleSettings',
  toggleClickThrough: 'toggleClickThrough',
  quit: 'quit'
}

let handlers = {}

function register(shortcuts, dispatch) {
  globalShortcut.unregisterAll()
  handlers = dispatch
  const conflicts = []
  Object.entries(shortcuts || {}).forEach(([action, accelerator]) => {
    if (!accelerator) {
      return
    }
    try {
      const ok = globalShortcut.register(accelerator, () => {
        handlers(action)
      })
      if (!ok) {
        conflicts.push({action, accelerator})
      }
    } catch (e) {
      conflicts.push({action, accelerator, error: e.message})
    }
  })
  return conflicts
}

function unregisterAll() {
  globalShortcut.unregisterAll()
  handlers = {}
}

module.exports = {register, unregisterAll, ACTIONS}
