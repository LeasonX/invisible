'use strict'

const DEFAULT_PROMPTS = [
  {
    id: 'general',
    name: '通用解读',
    builtin: true,
    system: '你是一个严谨、简洁的助手。',
    template: '请识别并说明图片中的内容。',
    outputFormat: 'markdown'
  },
  {
    id: 'code',
    name: '算法题解',
    builtin: true,
    system: '你是一个编程高手。',
    template: [
      '帮我识别图片中的算法题，并给出代码答案。',
      '### 时间复杂度',
      '`{时间复杂度}`',
      '### 数据结构 + 算法',
      '`{数据结构、算法}`',
      '---',
      '```{language} 带简单行注释的代码```'
    ].join('\n'),
    outputFormat: 'markdown'
  },
  {
    id: 'translate',
    name: '翻译',
    builtin: true,
    system: '你是一个专业译者，输出保持原文结构。',
    template: '请把图片中的文字翻译成中文，保留原有排版结构。',
    outputFormat: 'markdown'
  }
]

const DEFAULT_SETTINGS = {
  model: {
    provider: 'openai-compatible',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiKey: '',
    visionModel: 'qwen2.5-vl-72b-instruct',
    textModel: 'qwen2.5-72b-instruct',
    requestTimeout: 120000,
    temperature: 0.2,
    maxTokens: 4096,
    stream: true
  },
  oss: {
    enabled: false,
    region: 'oss-cn-beijing',
    bucket: '',
    endpoint: '',
    accessKeyId: '',
    accessKeySecret: '',
    objectPrefix: 'unvisible',
    signExpirySeconds: 3600
  },
  prompt: {
    activeId: 'general',
    prompts: DEFAULT_PROMPTS,
    // 模板变量：模板中用 {key} 引用，可动态增删
    variables: [
      {key: 'language', value: 'Java'}
    ],
    includeImage: true,
    extraContext: ''
  },
  appearance: {
    theme: 'dark',
    accentColor: '#4f8cff',
    opacity: 0.8,
    fontFamily: 'system',
    fontSize: 15,
    previewMode: 'markdown',
    showToolbar: true,
    contentProtection: true,
    alwaysOnTop: true,
    hideFromTaskbar: true,
    width: 420,
    height: 560,
    // 窗口位置记忆
    x: 70,
    y: 0
  },
  shortcuts: {
    screenshot: 'CommandOrControl+H',
    request: 'CommandOrControl+Return',
    screenshotAndRequest: 'CommandOrControl+Shift+H',
    zoomIn: 'CommandOrControl+=',
    zoomOut: 'CommandOrControl+-',
    moveUp: 'CommandOrControl+Up',
    moveDown: 'CommandOrControl+Down',
    moveLeft: 'CommandOrControl+Left',
    moveRight: 'CommandOrControl+Right',
    toggleVisibility: 'CommandOrControl+/',
    toggleSettings: 'CommandOrControl+,',
    toggleClickThrough: 'CommandOrControl+D',
    quit: 'CommandOrControl+Q'
  },
  proxy: {
    enabled: false,
    type: 'http',
    host: '127.0.0.1',
    port: 7890,
    bypass: 'localhost,127.0.0.1'
  },
  history: {
    enabled: true,
    maxEntries: 200
  }
}

const SECRET_FIELDS = {
  model: ['apiKey'],
  oss: ['accessKeyId', 'accessKeySecret']
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function mergeDefaults(target, defaults) {
  const result = clone(defaults)
  if (!target || typeof target !== 'object') {
    return result
  }
  Object.keys(result).forEach(key => {
    const incoming = target[key]
    if (incoming === undefined || incoming === null) {
      return
    }
    if (Array.isArray(result[key])) {
      result[key] = Array.isArray(incoming) ? incoming : result[key]
      return
    }
    if (result[key] && typeof result[key] === 'object') {
      result[key] = mergeDefaults(incoming, result[key])
      return
    }
    result[key] = incoming
  })
  return result
}

module.exports = {
  DEFAULT_SETTINGS,
  DEFAULT_PROMPTS,
  SECRET_FIELDS,
  mergeDefaults,
  clone
}
