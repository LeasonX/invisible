# unvisible

一个不留下痕迹的屏幕助手。截取屏幕内容，交给视觉模型处理，结果显示在一块**无法被截图和录屏捕获**的悬浮窗里。

## 特性

- **隐私窗口**：窗口内容被系统排除在截图和录屏之外（macOS `sharingType = none`，Windows `WDA_EXCLUDEFROMCAPTURE`）
- **不抢焦点**：悬浮窗与设置界面都是 non-activating panel，点击不会抢走当前应用的焦点
- **透明窗口**：窗口外围透明，面板使用与主界面一致的深色毛玻璃，透明度跟随外观设置同步
- **动态提示词**：提示词模板可在设置中自由增删改，切换即时生效
- **模板变量**：模板内用 `{变量名}` 引用任意自定义变量，变量可动态增删；内置 `{date}` `{time}` `{model}`
- **通用模型接入**：任何 OpenAI 兼容接口，视觉与文本模型可分别指定
- **可选 OSS**：截图可以先上传到阿里云 OSS 再以签名 URL 发送，或直接用 Data URL
- **本地代理**：支持 HTTP / SOCKS5 代理
- **完整外观定制**：主题色、透明度、字体、字号、Markdown / 纯文本预览
- **全局快捷键**：截图、请求、缩放、移动、显隐、打开设置均可自定义
- **窗口位置记忆**：窗口大小与位置自动保存，下次启动沿用上次状态
- **配置导入导出**：配置以 JSON 导出，默认脱敏密钥
- **Shoelace 组件库**：设置界面全部使用 Web Components 组件，无原生控件
- **沉浸式标题栏**：设置窗口隐藏系统标题栏，由页面自绘
- **设置窗口防截图**：配置界面同样被系统排除在截图和录屏之外
- **请求历史**：每次请求的提示词、响应、耗时与错误都会落盘，可搜索、筛选与清空

## 开发

```bash
npm install
npm start
```

## 打包

```bash
npm run dist
```

产物输出到 `release/`。

## 发版

推 tag 会触发 GitHub Actions 自动构建 macOS (dmg) 与 Windows (nsis) 安装包，并创建 Release：

```bash
npm run release          # patch: 0.1.1 -> 0.1.2
npm run release -- minor # minor: 0.1.1 -> 0.2.0
npm run release -- major # major: 0.1.1 -> 1.0.0
npm run release -- 0.2.0 # 指定版本
```

脚本会依次完成：检查工作区干净 → 更新 `package.json` 版本号 → 提交 → 打 tag → 推送到远程。
推送 tag 后约 2-3 分钟可在 [Releases](https://github.com/LeasonX/invisible/releases) 看到产物。

## 首次使用

1. 启动后按 `Command+,` 打开设置。
2. 在「模型」页填入接口地址、API Key 和视觉模型名称。
3. 在「提示词」页选择或新建提示词模板。
4. 按 `Command+H` 截图并请求模型，结果会显示在悬浮窗中。

## 模板变量

提示词模板中可用 `{变量名}` 引用变量，在「设置 → 提示词 → 模板变量」中动态增删：

```text
用 {language} 写一个 {level} 难度的算法，风格要 {style}
```

内置变量无需配置：`{date}` 当前日期、`{time}` 当前时间、`{model}` 本次使用的模型名。

未定义的占位符会原样保留在提示词中，方便发现拼写错误。

## 快捷键默认值

| 功能 | 默认 |
| --- | --- |
| 截图 | `Command+H` |
| 截图 + 请求模型 | `Command+Shift+H` |
| 仅请求模型 | `Command+Return` |
| 窗口放大 / 缩小 | `Command+=` / `Command+-` |
| 窗口移动 | `Command` + 方向键 |
| 窗口显隐 | `Command+/` |
| 打开设置 | `Command+,` |
| 退出应用 | `Command+Q` |

## 窗口位置记忆

悬浮窗的大小与位置会自动写入配置，下次启动时恢复：

- 拖动窗口、调整大小都会自动记录（250ms 防抖）
- 快捷键缩放（`⌘+` / `⌘-`）和移动（方向键）同样会保存
- 在「设置 → 外观」里可以直接编辑宽度、高度、X、Y 坐标
- 启动时会校验位置，超出屏幕范围的窗口会自动拉回可见区域

## 请求历史

每次触发（截图、请求模型、截图 + 请求）都会在用户数据目录的 `history/` 下按天写入 JSONL：

```text
history/requests-2026-10-26.jsonl
```

单条记录包含时间、状态、触发方式、所用模型、请求内容、响应、错误信息与耗时。失败和异常同样会被记录。

带截图的请求会同时把图片保存到 `history/shots/`，在历史列表中显示缩略图，展开后可见完整截图。清空历史会一并删除这些图片。

在「设置 → 历史」中可查看、展开详情、按成功/失败筛选、按内容搜索或一键清空。关闭「记录历史」后不再写入。

展开详情后截图支持自由调整大小：拖拽右下角手柄缩放、滚轮缩放、双击复位为适应宽度，下方显示当前缩放比例。

```text
history/
  requests-2026-10-26.jsonl
  shots/
    shot-1793024365452-3c39e282.png
```

## 安全说明

- API Key 与 OSS 密钥通过 Electron `safeStorage` 加密后存储在用户数据目录
- 配置导出默认不含密钥明文
- 截图只在发起请求时产生，不会静默采集

## 目录结构

```text
src/
  main.js            主进程：窗口、快捷键、IPC、请求编排
  preload.js         受限桥接层
  lib/
    defaults.js      默认配置与合并逻辑
    store.js         配置持久化 + 密钥加密
    model.js         OpenAI 兼容客户端
    oss.js           阿里云 OSS 上传
    proxy.js         代理 agent
    screenshot.js    屏幕捕获
    shortcuts.js     全局快捷键注册
    history.js       请求历史（JSONL 落盘）
  renderer/          悬浮窗界面
  settings/          设置窗口界面
    vendor/          Shoelace 组件与依赖（本地化，无 CDN 依赖）
```
