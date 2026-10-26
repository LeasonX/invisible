'use strict'

const crypto = require('crypto')
const OSS = require('ali-oss')

function isEnabled(ossConfig) {
  return Boolean(ossConfig && ossConfig.enabled && ossConfig.bucket && ossConfig.accessKeyId && ossConfig.accessKeySecret)
}

function buildClient(ossConfig) {
  const endpoint = (ossConfig.endpoint || '').trim() || `https://oss-${ossConfig.region}.aliyuncs.com`
  return new OSS({
    accessKeyId: ossConfig.accessKeyId,
    accessKeySecret: ossConfig.accessKeySecret,
    region: ossConfig.region,
    bucket: ossConfig.bucket,
    endpoint,
    authorizationV4: true,
    timeout: '120s'
  })
}

function objectName(ossConfig, extension = 'png') {
  const prefix = (ossConfig.objectPrefix || '').replace(/^\/+|\/+$/g, '')
  const name = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${extension}`
  return prefix ? `${prefix}/${name}` : name
}

async function uploadBuffer(ossConfig, buffer, extension = 'png') {
  const client = buildClient(ossConfig)
  const key = objectName(ossConfig, extension)
  const result = await client.put(key, buffer, {mime: `image/${extension}`})
  const expiry = Math.max(60, Number(ossConfig.signExpirySeconds || 3600))
  const url = await client.signatureUrlV4('GET', expiry, {headers: {}}, key)
  return {url, key, name: result.name || key}
}

module.exports = {isEnabled, uploadBuffer, buildClient}
