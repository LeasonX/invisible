'use strict'

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const HISTORY_DIR = 'history'
const SHOTS_DIR = 'shots'
const MAX_ENTRIES_PER_FILE = 500
const MAX_FILES = 30

let app
let enabled = true

function init(electronApp) {
  app = electronApp
}

function setEnabled(value) {
  enabled = value !== false
}

function historyDir() {
  return path.join(app.getPath('userData'), HISTORY_DIR)
}

function ensureDir() {
  const dir = historyDir()
  fs.mkdirSync(dir, {recursive: true})
  return dir
}

function shotsDir() {
  return path.join(ensureDir(), SHOTS_DIR)
}

function saveShot(buffer, timestamp) {
  if (!buffer || !buffer.length) {
    return null
  }
  try {
    const dir = shotsDir()
    fs.mkdirSync(dir, {recursive: true})
    const name = `shot-${timestamp || Date.now()}-${crypto.randomBytes(4).toString('hex')}.png`
    fs.writeFileSync(path.join(dir, name), buffer)
    return name
  } catch (e) {
    console.error('[unvisible] 保存截图失败:', e.message)
    return null
  }
}

function readShot(name) {
  if (!name || name.includes('/') || name.includes('\\') || name.includes('..')) {
    return null
  }
  try {
    const file = path.join(shotsDir(), name)
    const data = fs.readFileSync(file)
    return `data:image/png;base64,${data.toString('base64')}`
  } catch (e) {
    return null
  }
}

function dateKey(timestamp) {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function fileFor(key) {
  return path.join(ensureDir(), `requests-${key}.jsonl`)
}

function listFiles() {
  try {
    return fs.readdirSync(ensureDir())
      .filter(name => name.startsWith('requests-') && name.endsWith('.jsonl'))
      .sort()
  } catch (e) {
    return []
  }
}

function prune() {
  const files = listFiles()
  if (files.length <= MAX_FILES) {
    return
  }
  files.slice(0, files.length - MAX_FILES).forEach(name => {
    try {
      fs.unlinkSync(path.join(historyDir(), name))
    } catch (e) {
      // 忽略删除失败
    }
  })
}

function createId() {
  return crypto.randomBytes(8).toString('hex')
}

function append(entry) {
  if (!enabled) {
    return null
  }
  try {
    const timestamp = entry.timestamp || Date.now()
    const record = {
      id: createId(),
      timestamp,
      status: entry.status || 'unknown',
      trigger: entry.trigger || 'unknown',
      promptId: entry.promptId || null,
      promptName: entry.promptName || null,
      model: entry.model || null,
      withImage: Boolean(entry.withImage),
      imageSize: entry.imageSize || null,
      ossKey: entry.ossKey || null,
      shot: entry.shot || null,
      request: entry.request || null,
      response: entry.response || '',
      error: entry.error || null,
      durationMs: typeof entry.durationMs === 'number' ? entry.durationMs : null
    }
    fs.appendFileSync(fileFor(dateKey(timestamp)), JSON.stringify(record) + '\n', 'utf8')
    prune()
    return record
  } catch (e) {
    console.error('[unvisible] 写入历史记录失败:', e.message)
    return null
  }
}

function readAll({limit = 200, status = 'all', search = ''} = {}) {
  const files = listFiles().reverse()
  const result = []
  const keyword = search.trim().toLowerCase()

  for (const name of files) {
    let lines
    try {
      lines = fs.readFileSync(path.join(historyDir(), name), 'utf8').split('\n').filter(Boolean)
    } catch (e) {
      continue
    }
    for (let i = lines.length - 1; i >= 0; i--) {
      let record
      try {
        record = JSON.parse(lines[i])
      } catch (e) {
        continue
      }
      if (status !== 'all' && record.status !== status) {
        continue
      }
      if (keyword) {
        const haystack = [
          record.promptName,
          record.model,
          record.response,
          record.error,
          record.request && record.request.text
        ].filter(Boolean).join(' ').toLowerCase()
        if (!haystack.includes(keyword)) {
          continue
        }
      }
      result.push(record)
      if (result.length >= limit) {
        return result
      }
    }
  }
  return result
}

function clear() {
  listFiles().forEach(name => {
    try {
      fs.unlinkSync(path.join(historyDir(), name))
    } catch (e) {
      // 忽略删除失败
    }
  })
  try {
    const dir = shotsDir()
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, {recursive: true, force: true})
    }
  } catch (e) {
    // 忽略删除失败
  }
  return true
}

function stats() {
  const files = listFiles()
  let total = 0
  files.forEach(name => {
    try {
      const raw = fs.readFileSync(path.join(historyDir(), name), 'utf8')
      total += raw.split('\n').filter(Boolean).length
    } catch (e) {
      // 忽略读取失败
    }
  })
  return {files: files.length, entries: total}
}

module.exports = {init, append, readAll, clear, stats, setEnabled, saveShot, readShot}
