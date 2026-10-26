'use strict'

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const {safeStorage} = require('electron')
const {DEFAULT_SETTINGS, SECRET_FIELDS, mergeDefaults, clone} = require('./defaults')

const CONFIG_FILE = 'config.json'
const SECRETS_FILE = 'secrets.json'

function userDataPath(file) {
  return path.join(app.getPath('userData'), file)
}

let app

function init(electronApp) {
  app = electronApp
}

function readJson(file, fallback) {
  try {
    const raw = fs.readFileSync(userDataPath(file), 'utf8')
    return JSON.parse(raw)
  } catch (e) {
    return fallback
  }
}

function writeJson(file, data) {
  const target = userDataPath(file)
  fs.mkdirSync(path.dirname(target), {recursive: true})
  fs.writeFileSync(target, JSON.stringify(data, null, 2), 'utf8')
}

function encodeSecret(value) {
  if (!value) {
    return ''
  }
  // 已经是编码过的值，避免重复编码
  if (isEncoded(value)) {
    return value
  }
  if (safeStorage && safeStorage.isEncryptionAvailable()) {
    return 'enc:' + safeStorage.encryptString(value).toString('base64')
  }
  return 'plain:' + Buffer.from(value, 'utf8').toString('base64')
}

function isEncoded(value) {
  return typeof value === 'string' && (value.startsWith('enc:') || value.startsWith('plain:'))
}

function decodeSecret(value) {
  if (!value) {
    return ''
  }
  if (value.startsWith('enc:')) {
    const raw = Buffer.from(value.slice(4), 'base64')
    if (safeStorage && safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(raw)
    }
    return raw.toString('utf8')
  }
  if (value.startsWith('plain:')) {
    return Buffer.from(value.slice(6), 'base64').toString('utf8')
  }
  return value
}

function loadSecrets() {
  return readJson(SECRETS_FILE, {})
}

function saveSecrets(secrets) {
  const encoded = {}
  Object.entries(secrets || {}).forEach(([key, value]) => {
    encoded[key] = isEncoded(value) ? value : encodeSecret(value)
  })
  writeJson(SECRETS_FILE, encoded)
}

function getAll() {
  const raw = readJson(CONFIG_FILE, {})
  migrate(raw)
  const config = mergeDefaults(raw, DEFAULT_SETTINGS)
  const secrets = loadSecrets()
  const result = clone(config)
  Object.entries(SECRET_FIELDS).forEach(([group, fields]) => {
    fields.forEach(field => {
      const key = `${group}.${field}`
      if (secrets[key]) {
        result[group][field] = decodeSecret(secrets[key])
      }
    })
  })
  return result
}

function set(patch) {
  const current = getAll()
  const merged = {...current, ...patch}
  // 迁移要在 mergeDefaults 之前，否则默认变量会覆盖旧配置里的值
  migrate(merged)
  const next = mergeDefaults(merged, DEFAULT_SETTINGS)
  const secrets = loadSecrets()
  // 显式标记要清除的密钥，避免与“导入的脱敏配置”混淆
  const cleared = new Set(patch && patch.__clearSecrets ? patch.__clearSecrets : [])
  Object.entries(SECRET_FIELDS).forEach(([group, fields]) => {
    fields.forEach(field => {
      const key = `${group}.${field}`
      const incoming = patch && patch[group] ? patch[group][field] : undefined
      if (next[group] && typeof next[group][field] === 'string') {
        // 只有显式传入非空值才更新密钥；导入的脱敏配置保留原有密钥
        if (incoming) {
          secrets[key] = isEncoded(incoming) ? incoming : encodeSecret(incoming)
        } else if (cleared.has(key)) {
          delete secrets[key]
        }
        next[group][field] = ''
      }
    })
  })
  const plainConfig = clone(next)
  delete plainConfig.__clearSecrets
  Object.entries(SECRET_FIELDS).forEach(([group, fields]) => {
    fields.forEach(field => {
      plainConfig[group][field] = ''
    })
  })
  writeJson(CONFIG_FILE, plainConfig)
  saveSecrets(secrets)
  return getAll()
}

// 兼容旧配置：把 prompt.language 转成 variables 里的 language 变量
function migrate(config) {
  if (!config || !config.prompt) {
    return config
  }
  const promptConfig = config.prompt
  if (!Array.isArray(promptConfig.variables)) {
    promptConfig.variables = []
  }
  if (promptConfig.language !== undefined && promptConfig.language !== null) {
    const hasLanguage = promptConfig.variables.some(item => item.key === 'language')
    if (!hasLanguage) {
      promptConfig.variables.push({key: 'language', value: promptConfig.language})
    }
    delete promptConfig.language
  }
  return config
}

function exportConfig({includeSecrets = false} = {}) {
  const config = getAll()
  if (!includeSecrets) {
    Object.entries(SECRET_FIELDS).forEach(([group, fields]) => {
      fields.forEach(field => {
        config[group][field] = ''
      })
    })
  }
  return config
}

function importConfig(config) {
  if (!config || typeof config !== 'object') {
    throw new Error('配置文件格式不正确')
  }
  return set(config)
}

function fingerprint(value) {
  if (!value) {
    return ''
  }
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 8)
}

module.exports = {
  init,
  getAll,
  set,
  exportConfig,
  importConfig,
  fingerprint
}
