'use strict'

/**
 * 一键发版：
 *   1. 检查工作区是否干净
 *   2. bump package.json 版本号并提交
 *   3. 打 tag 并推送（tag 触发 GitHub Actions 自动构建并发布 Release）
 *
 * 用法：
 *   npm run release            # patch: 0.1.0 -> 0.1.1
 *   npm run release -- minor   # minor: 0.1.0 -> 0.2.0
 *   npm run release -- major   # major: 0.1.0 -> 1.0.0
 *   npm run release -- 0.2.0   # 指定具体版本
 */

const {execFileSync} = require('child_process')
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const PKG = path.join(ROOT, 'package.json')

function run(command, args, options = {}) {
  console.log(`$ ${command} ${args.join(' ')}`)
  return execFileSync(command, args, {
    cwd: ROOT,
    stdio: 'inherit',
    encoding: 'utf8',
    ...options
  })
}

function git(...args) {
  return execFileSync('git', args, {cwd: ROOT, encoding: 'utf8'}).trim()
}

// 1. 前置检查
const status = git('status', '--porcelain')
if (status) {
  console.error('\n工作区有未提交的改动，请先处理：\n')
  console.error(status)
  process.exit(1)
}

const branch = git('rev-parse', '--abbrev-ref', 'HEAD')
let upstream = ''
try {
  upstream = git('rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}')
} catch (e) {
  upstream = ''
}
// upstream 形如 origin/main，只比较分支名部分
const upstreamBranch = upstream.replace(/^[^/]+\//, '')
if (upstream && upstreamBranch !== branch) {
  console.error(`当前分支 ${branch} 未跟踪 ${upstream}，请先同步后再发版`)
  process.exit(1)
}

// 2. 确定目标版本
const arg = process.argv[2]
const pkg = JSON.parse(fs.readFileSync(PKG, 'utf8'))
const current = pkg.version

let next
if (arg && /^\d+\.\d+\.\d+$/.test(arg)) {
  next = arg
} else {
  const [major, minor, patch] = current.split('.').map(Number)
  if (arg === 'major') {
    next = `${major + 1}.0.0`
  } else if (arg === 'minor') {
    next = `${major}.${minor + 1}.0`
  } else {
    next = `${major}.${minor}.${patch + 1}`
  }
}

if (next === current) {
  console.error(`版本号未变化：${current}`)
  process.exit(1)
}

const tag = `v${next}`

// 确认该 tag 未被占用
const existing = git('tag', '-l', tag)
if (existing) {
  console.error(`tag ${tag} 已存在，请换一个版本`)
  process.exit(1)
}

// 3. 更新版本号
pkg.version = next
fs.writeFileSync(PKG, JSON.stringify(pkg, null, 2) + '\n', 'utf8')
console.log(`\n版本号: ${current} -> ${next}\n`)

// 4. 提交并打 tag
run('git', ['add', 'package.json'])
run('git', ['commit', '-m', `chore(release): v${next}`])
run('git', ['tag', tag, '-m', `unvisible v${next}`])

// 5. 推送
run('git', ['push', 'origin', branch])
// SSH 在传输完成后偶尔会断开并返回非零码，先确认远程是否真的拿到了
try {
  run('git', ['push', 'origin', tag])
} catch (e) {
  const remoteTags = git('ls-remote', '--tags', 'origin').split('\n')
  const pushed = remoteTags.some(line => line.includes('refs/tags/' + tag))
  if (!pushed) {
    throw e
  }
  console.log('（连接中断，但 tag 已成功推送到远程）')
}

console.log(`\n已推送 tag ${tag}`)
console.log('GitHub Actions 将自动构建 macOS / Windows 安装包并创建 Release：')
console.log(`  https://github.com/LeasonX/invisible/actions`)
console.log(`  https://github.com/LeasonX/invisible/releases/tag/${tag}\n`)
