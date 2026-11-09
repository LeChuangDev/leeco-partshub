// server/infrastructure/jlc/client.js
// 嘉立创开放平台（JOP）HTTP 客户端：签名与请求。
// 文档：https://open.jlc.com/develop-guide
//   - 仅支持 HTTPS + POST + JSON
//   - 签名串：method\npath\ntimestamp\nnonce\nbody\n
//   - HmacSHA256(SecretKey) → Base64，放入 Authorization: JOP appid=...,accesskey=...,nonce=...,timestamp=...,signature=...
// 只依赖 Web 标准 API（fetch / WebCrypto / TextEncoder），EdgeOne、Cloudflare、Node 均可运行。

const DEFAULT_BASE = 'https://open-api.jlc.com'
const NONCE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

function base64(bytes) {
  let text = ''
  for (const byte of bytes) text += String.fromCharCode(byte)
  return btoa(text)
}

/** 32 位随机串（字母 + 数字），用于 JOP nonce */
export function createNonce() {
  const buffer = new Uint8Array(32)
  crypto.getRandomValues(buffer)
  let out = ''
  for (const byte of buffer) out += NONCE_CHARS[byte % NONCE_CHARS.length]
  return out
}

/** 构造待签名串；换行必须与文档一致（含最后一行） */
export function buildStringToSign({ method, path, timestamp, nonce, body }) {
  return `${method}\n${path}\n${timestamp}\n${nonce}\n${body}\n`
}

/** HmacSHA256 + Base64 */
export async function signString(secretKey, text) {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secretKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(text))
  return base64(new Uint8Array(signature))
}

/** 是否已配置嘉立创密钥 */
export function jlcConfigured(env = {}) {
  return Boolean(env.JLC_APP_ID && env.JLC_ACCESS_KEY && env.JLC_SECRET_KEY)
}

/**
 * 调用嘉立创开放平台接口。
 * @param {string} path 形如 /order/v1/createOrder
 * @param {object} payload 请求体（会被 JSON.stringify，并参与签名）
 * @param {object} env 环境变量（JLC_*）
 * @param {{ fetchImpl?: Function, now?: () => number, nonce?: string }} [deps] 便于测试注入
 */
export async function jlcPost(path, payload, env = {}, deps = {}) {
  const base = String(env.JLC_BASE_URL || DEFAULT_BASE).replace(/\/+$/, '')
  const body = JSON.stringify(payload ?? {})
  const timestamp = Math.floor((deps.now ? deps.now() : Date.now()) / 1000)
  const nonce = deps.nonce || createNonce()
  const signature = await signString(
    env.JLC_SECRET_KEY,
    buildStringToSign({ method: 'POST', path, timestamp, nonce, body })
  )
  const authorization = [
    'JOP',
    `appid="${env.JLC_APP_ID}",`,
    `accesskey="${env.JLC_ACCESS_KEY}",`,
    `nonce="${nonce}",`,
    `timestamp="${timestamp}",`,
    `signature="${signature}"`
  ].join('')

  const fetchImpl = deps.fetchImpl || fetch
  const response = await fetchImpl(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization },
    body
  })
  const text = await response.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = null }
  return {
    status: response.status,
    traceId: response.headers.get('J-Trace-ID') || '',
    data,
    text
  }
}
