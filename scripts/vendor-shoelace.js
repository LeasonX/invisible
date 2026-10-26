'use strict'

/**
 * 把 Shoelace 及其依赖复制到 src/settings/vendor，供离线加载。
 * Electron 运行时不支持外部 import map，浏览器也不认裸模块说明符，
 * 因此这些 ESM 依赖必须以相对路径形式落地到源码树里。
 *
 * 用法：npm run vendor
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const SRC = path.join(ROOT, 'node_modules', '@shoelace-style', 'shoelace', 'dist')
const MODULES = path.join(ROOT, 'node_modules')
const OUT = path.join(ROOT, 'src', 'settings', 'vendor')

const COPY_DIRS = [
  ['@shoelace-style/shoelace/dist/chunks', 'chunks'],
  ['@shoelace-style/shoelace/dist/components', 'components'],
  ['@shoelace-style/shoelace/dist/internal', 'internal'],
  ['@shoelace-style/shoelace/dist/themes', 'themes'],
  ['lit', 'lit'],
  ['lit-html', 'lit-html'],
  ['lit-element', 'lit-element'],
  ['@lit/reactive-element', '@lit/reactive-element'],
  ['@lit-labs/ssr-dom-shim', '@lit-labs/ssr-dom-shim'],
  ['@floating-ui/dom', '@floating-ui/dom'],
  ['@floating-ui/core', '@floating-ui/core'],
  ['@floating-ui/utils', '@floating-ui/utils'],
  ['@ctrl/tinycolor', '@ctrl/tinycolor'],
  ['@shoelace-style/animations', '@shoelace-style/animations'],
  ['@shoelace-style/localize', '@shoelace-style/localize'],
  ['composed-offset-position', 'composed-offset-position']
]

function copy(from, to) {
  if (!fs.existsSync(from)) {
    console.warn(`  跳过（不存在）: ${path.relative(ROOT, from)}`)
    return
  }
  fs.mkdirSync(path.dirname(to), {recursive: true})
  fs.cpSync(from, to, {recursive: true})
}

// 清理旧产物
if (fs.existsSync(OUT)) {
  fs.rmSync(OUT, {recursive: true, force: true})
}
fs.mkdirSync(OUT, {recursive: true})

console.log('复制 Shoelace 组件...')
copy(path.join(SRC, 'chunks'), path.join(OUT, 'chunks'))
copy(path.join(SRC, 'components'), path.join(OUT, 'components'))
copy(path.join(SRC, 'internal'), path.join(OUT, 'internal'))
copy(path.join(SRC, 'themes'), path.join(OUT, 'themes'))

console.log('复制 ESM 依赖...')
COPY_DIRS.slice(3).forEach(([from, to]) => {
  copy(path.join(MODULES, from), path.join(OUT, 'modules', to))
})

// 精简：移除类型定义与 sourcemap
function prune(dir) {
  fs.readdirSync(dir, {withFileTypes: true}).forEach(entry => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'development' || entry.name === 'node') {
        fs.rmSync(full, {recursive: true, force: true})
        return
      }
      prune(full)
      return
    }
    if (/\.(d\.ts|d\.ts\.map|map)$/.test(entry.name)) {
      fs.unlinkSync(full)
    }
  })
}
prune(OUT)

console.log('生成 import map...')
const importMap = {imports: {}}

function scanBareSpecifiers(dir, acc) {
  fs.readdirSync(dir, {withFileTypes: true}).forEach(entry => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      scanBareSpecifiers(full, acc)
      return
    }
    if (!entry.name.endsWith('.js')) {
      return
    }
    const content = fs.readFileSync(full, 'utf8')
    const re = /(?:from|import)\s*"([^"]+)"/g
    let match
    while ((match = re.exec(content)) !== null) {
      const spec = match[1]
      if (!spec || spec.startsWith('.') || spec.includes(' ')) {
        continue
      }
      acc.add(spec)
    }
  })
}

const bare = new Set()
scanBareSpecifiers(OUT, bare)

const PKG_DIRS = {
  lit: 'lit',
  'lit-html': 'lit-html',
  'lit-element': 'lit-element',
  '@lit/reactive-element': '@lit/reactive-element',
  '@lit-labs/ssr-dom-shim': '@lit-labs/ssr-dom-shim',
  '@floating-ui/dom': '@floating-ui/dom',
  '@floating-ui/core': '@floating-ui/core',
  '@floating-ui/utils': '@floating-ui/utils',
  '@ctrl/tinycolor': '@ctrl/tinycolor',
  '@shoelace-style/animations': '@shoelace-style/animations',
  '@shoelace-style/localize': '@shoelace-style/localize',
  'composed-offset-position': 'composed-offset-position'
}

function packageOf(spec) {
  return spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]
}

function pickCondition(value) {
  if (typeof value === 'string') {
    return value
  }
  if (value && typeof value === 'object') {
    for (const key of ['browser', 'import', 'module', 'default']) {
      if (key in value) {
        const picked = pickCondition(value[key])
        if (picked) {
          return picked
        }
      }
    }
  }
  return null
}

// 依据包自身的 exports 字段解析子路径
function resolveFromExports(pkg, sub) {
  const dir = PKG_DIRS[pkg]
  if (!dir) {
    return null
  }
  const pj = path.join(OUT, 'modules', dir, 'package.json')
  if (!fs.existsSync(pj)) {
    return null
  }
  const data = JSON.parse(fs.readFileSync(pj, 'utf8'))
  const exp = data.exports
  let rel = null
  if (exp) {
    const key = sub ? './' + sub : '.'
    const entry = exp[key] !== undefined ? exp[key] : (sub ? undefined : exp['.'])
    rel = pickCondition(entry)
  }
  if (!rel) {
    // 老式子包：只有 module / main 字段
    const subDir = path.join(OUT, 'modules', dir, sub)
    if (sub && fs.existsSync(path.join(subDir, 'package.json'))) {
      const subPkg = JSON.parse(fs.readFileSync(path.join(subDir, 'package.json'), 'utf8'))
      rel = subPkg.module || subPkg.main || null
      if (rel) {
        const full = path.join(subDir, rel)
        if (!fs.existsSync(full)) {
          rel = null
        } else {
          const relPath = path.relative(path.join(ROOT, 'src', 'settings'), full)
          return './' + relPath.split(path.sep).join('/')
        }
      }
    }
  }
  if (!rel) {
    return null
  }
  const full = path.join(OUT, 'modules', dir, rel)
  if (!fs.existsSync(full)) {
    return null
  }
  const relPath = path.relative(path.join(ROOT, 'src', 'settings'), full)
  return './' + relPath.split(path.sep).join('/')
}

function resolveBare(spec) {
  const pkg = packageOf(spec)
  const dir = PKG_DIRS[pkg]
  if (!dir) {
    return null
  }
  const sub = spec === pkg ? '' : spec.slice(pkg.length + 1)

  const viaExports = resolveFromExports(pkg, sub)
  if (viaExports) {
    return viaExports
  }

  const base = path.join(OUT, 'modules', dir, sub)
  const candidates = [
    base,
    base + '.js',
    base + '.mjs',
    path.join(base, 'index.js'),
    path.join(base, 'index.mjs')
  ]
  // 包内可能用带点的扁平文件名，例如 floating-ui.utils.dom.mjs
  if (fs.existsSync(base) && fs.statSync(base).isDirectory()) {
    const flat = fs.readdirSync(base).filter(name => name.endsWith('.mjs') || name.endsWith('.js'))
    flat.forEach(name => {
      const stem = name.replace(/\.(m?js)$/, '')
      if (stem.endsWith(sub.replace(/\//g, '.')) || stem.endsWith(sub.split('/').pop())) {
        candidates.push(path.join(base, name))
      }
    })
  }
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      const rel = path.relative(path.join(ROOT, 'src', 'settings'), candidate)
      return './' + rel.split(path.sep).join('/')
    }
  }
  return null
}

// 包根入口：即使没有直接引用，也需要登记（包内部会按根名互相引用）
const PKG_ROOT_FILES = {
  lit: 'lit/index.js',
  'lit-html': 'lit-html/lit-html.js',
  'lit-element': 'lit-element/index.js',
  '@lit/reactive-element': '@lit/reactive-element/reactive-element.js',
  '@lit-labs/ssr-dom-shim': '@lit-labs/ssr-dom-shim/index.js',
  '@floating-ui/dom': '@floating-ui/dom/dist/floating-ui.dom.mjs',
  '@floating-ui/core': '@floating-ui/core/dist/floating-ui.core.mjs',
  '@floating-ui/utils': '@floating-ui/utils/dist/floating-ui.utils.mjs',
  '@ctrl/tinycolor': '@ctrl/tinycolor/dist/module/public_api.js',
  '@shoelace-style/animations': '@shoelace-style/animations/dist/index.js',
  '@shoelace-style/localize': '@shoelace-style/localize/dist/index.js',
  'composed-offset-position': 'composed-offset-position/dist/composed-offset-position.browser.mjs'
}
// 少数子包用老式结构（无 exports），显式登记
const EXTRA_SUBPATHS = {
  '@floating-ui/utils/dom': '@floating-ui/utils/dom/floating-ui.utils.dom.esm.js',
  '@floating-ui/utils': '@floating-ui/utils/dist/floating-ui.utils.mjs'
}
Object.entries(EXTRA_SUBPATHS).forEach(([spec, rel]) => {
  const full = path.join(OUT, 'modules', rel)
  if (fs.existsSync(full)) {
    const relPath = path.relative(path.join(ROOT, 'src', 'settings'), full)
    importMap.imports[spec] = './' + relPath.split(path.sep).join('/')
  }
})

Object.entries(PKG_ROOT_FILES).forEach(([pkg, rel]) => {
  const full = path.join(OUT, 'modules', rel)
  if (fs.existsSync(full)) {
    const relPath = path.relative(path.join(ROOT, 'src', 'settings'), full)
    importMap.imports[pkg] = './' + relPath.split(path.sep).join('/')
  }
})

const unresolved = []
bare.forEach(spec => {
  if (importMap.imports[spec]) {
    return
  }
  const resolved = resolveBare(spec)
  if (resolved) {
    importMap.imports[spec] = resolved
  } else {
    unresolved.push(spec)
  }
})
if (unresolved.length) {
  console.warn('未解析的模块说明符（React/QR 相关，未使用）:', unresolved.join(', '))
}
for (const dir of ['class-map', 'if-defined', 'live', 'map', 'range', 'ref', 'style-map', 'unsafe-html', 'when']) {
  importMap.imports[`lit/directives/${dir}.js`] = `./vendor/modules/lit/directives/${dir}.js`
}

fs.writeFileSync(
  path.join(OUT, 'importmap.json'),
  JSON.stringify(importMap, null, 2) + '\n',
  'utf8'
)

// 内联 import map 到 settings/index.html
const htmlPath = path.join(ROOT, 'src', 'settings', 'index.html')
let html = fs.readFileSync(htmlPath, 'utf8')
const block = `  <script type="importmap">\n    ${JSON.stringify(importMap, null, 2).replace(/\n/g, '\n    ')}\n  </script>\n`
if (/<script type="importmap">[\s\S]*?<\/script>/.test(html)) {
  html = html.replace(/  <script type="importmap">[\s\S]*?<\/script>\n/, block)
} else {
  html = html.replace(/(  <title>[^<]*<\/title>\n)/, `$1${block}`)
}
// 修正主题与 loader 的相对路径
html = html.replace(/vendor\/shoelace\//g, 'vendor/')
fs.writeFileSync(htmlPath, html, 'utf8')

console.log(`完成 -> ${path.relative(ROOT, OUT)}`)
