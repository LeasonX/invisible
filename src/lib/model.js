'use strict'

const {OpenAI} = require('openai')
const {buildAgent} = require('./proxy')

function buildClient(settings) {
  const modelConfig = settings.model || {}
  const agent = buildAgent(settings.proxy)
  return new OpenAI({
    apiKey: modelConfig.apiKey || 'sk-placeholder',
    baseURL: modelConfig.baseUrl || 'https://api.openai.com/v1',
    httpAgent: agent,
    dangerouslyAllowBrowser: true,
    timeout: Number(modelConfig.requestTimeout || 120000),
    maxRetries: 2
  })
}

function resolvePrompt(settings) {
  const promptConfig = settings.prompt || {}
  const list = promptConfig.prompts || []
  const active = list.find(item => item.id === promptConfig.activeId) || list[0]
  if (!active) {
    return {system: '', template: '', outputFormat: 'markdown'}
  }
  return active
}

function buildUserContent(prompt, settings, imageUrl) {
  const promptConfig = settings.prompt || {}
  const parts = []
  const template = resolveTemplate(prompt.template || '', promptConfig.variables || [], {
    model: settings.model ? (imageUrl ? settings.model.visionModel : settings.model.textModel) : ''
  })
  const context = promptConfig.extraContext
  const text = [template, context ? `\n\n补充要求：\n${context}` : ''].filter(Boolean).join('')

  if (promptConfig.includeImage !== false && imageUrl) {
    parts.push({type: 'text', text})
    parts.push({type: 'image_url', image_url: {url: imageUrl}})
  } else {
    parts.push({type: 'text', text})
  }
  return parts
}

// 内置变量，无需配置即可使用
function builtinVariables(extra = {}) {
  const now = new Date()
  const pad = n => String(n).padStart(2, '0')
  return {
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    ...extra
  }
}

// 把模板中的 {key} 替换为变量值；未定义的占位符原样保留
function resolveTemplate(template, variables = [], extra = {}) {
  const table = {...builtinVariables(extra)}
  variables.forEach(item => {
    if (item && item.key) {
      table[item.key] = item.value === undefined || item.value === null ? '' : String(item.value)
    }
  })
  return (template || '').replace(/\{([a-zA-Z0-9_.\-]+)\}/g, (match, key) => {
    return Object.prototype.hasOwnProperty.call(table, key) ? table[key] : match
  })
}

async function request(settings, {imageUrl, promptOverride, stream = true, onDelta} = {}) {
  const modelConfig = settings.model || {}
  const prompt = promptOverride || resolvePrompt(settings)
  const model = imageUrl ? modelConfig.visionModel : modelConfig.textModel
  const client = buildClient(settings)
  const streamEnabled = stream && modelConfig.stream !== false
  const userContent = buildUserContent(prompt, settings, imageUrl)

  const requestBody = {
    model,
    messages: [
      {role: 'system', content: prompt.system || ''},
      {role: 'user', content: userContent}
    ]
  }
  if (typeof modelConfig.temperature === 'number') {
    requestBody.temperature = modelConfig.temperature
  }
  if (typeof modelConfig.maxTokens === 'number') {
    requestBody.max_tokens = modelConfig.maxTokens
  }

  const meta = {
    model,
    promptId: prompt.id || null,
    promptName: prompt.name || null,
    system: prompt.system || '',
    text: userContent
      .filter(part => part.type === 'text')
      .map(part => part.text)
      .join('\n'),
    hasImage: userContent.some(part => part.type === 'image_url')
  }

  if (!streamEnabled) {
    const response = await client.chat.completions.create(requestBody)
    const content = response?.choices?.[0]?.message?.content || ''
    if (onDelta) {
      onDelta(content)
    }
    return {content, meta}
  }

  const completion = await client.chat.completions.create({...requestBody, stream: true})
  let full = ''
  for await (const chunk of completion) {
    const delta = chunk?.choices?.[0]?.delta?.content
    if (!delta) {
      continue
    }
    full += delta
    if (onDelta) {
      onDelta(delta, full)
    }
  }
  return {content: full, meta}
}

module.exports = {request, resolvePrompt, buildClient, resolveTemplate}
