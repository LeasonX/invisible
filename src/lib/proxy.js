'use strict'

const ProxyAgent = require('proxy-agent')

const PROTOCOL_MAP = {
  http: 'http',
  https: 'https',
  socks: 'socks',
  socks4: 'socks4',
  socks5: 'socks5',
  socks5h: 'socks5h'
}

function buildAgent(proxyConfig) {
  if (!proxyConfig || !proxyConfig.enabled) {
    return undefined
  }
  const host = (proxyConfig.host || '').trim()
  const port = Number(proxyConfig.port || 0)
  if (!host || !port) {
    return undefined
  }
  const type = proxyConfig.type || 'http'
  const protocol = PROTOCOL_MAP[type] || 'http'
  const url = `${protocol}://${host}:${port}`
  return new ProxyAgent({protocol, host, port})
}

module.exports = {buildAgent}
