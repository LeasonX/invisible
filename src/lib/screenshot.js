'use strict'

const {desktopCapturer, screen} = require('electron')

async function captureScreen() {
  const display = screen.getPrimaryDisplay()
  const {width, height} = display.size
  let sources
  try {
    sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {width, height}
    })
  } catch (e) {
    const reason = e && e.message ? e.message : String(e)
    throw new Error(`无法获取屏幕画面：${reason}。请在系统设置中授予屏幕录制权限。`)
  }
  if (!sources || !sources.length) {
    throw new Error('没有找到可截取的屏幕源')
  }
  const thumbnail = sources[0].thumbnail
  if (!thumbnail || (typeof thumbnail.isEmpty === 'function' && thumbnail.isEmpty())) {
    throw new Error('截图为空，请检查系统录屏权限')
  }
  return thumbnail.toPNG()
}

module.exports = {captureScreen}
