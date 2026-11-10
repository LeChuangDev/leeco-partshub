// server/http/rate-limit.js
// 登录失败限流：同一来源 IP 在窗口内失败次数过多时返回 429。
// 计数落在 KV（auth:fail:<ip>），只对失败的鉴权请求产生一次读写；成功请求不产生额外开销。

import { kvGetJSON, kvPutJSON } from '../infrastructure/kv/index.js'

export const AUTH_FAIL_WINDOW_MS = 15 * 60 * 1000
export const AUTH_FAIL_LIMIT = 8

/** 取客户端 IP：Cloudflare / EdgeOne / 反向代理的常见头依次回退 */
export function clientIp(request) {
  const headers = request && request.headers
  if (!headers) return 'unknown'
  const direct = headers.get('cf-connecting-ip') || headers.get('x-real-ip')
  if (direct) return direct.trim()
  const forwarded = headers.get('x-forwarded-for') || ''
  const first = forwarded.split(',')[0].trim()
  return first || 'unknown'
}

/** 判断当前请求是否已被限流；未限流时返回可用于记录失败的上下文 */
export async function authFailureGuard(kv, request) {
  const ip = clientIp(request)
  const key = `auth:fail:${ip}`
  const rec = (await kvGetJSON(kv, key)) || {}
  const now = Date.now()
  const count = Number(rec.count) || 0
  const firstAt = Number(rec.firstAt) || 0
  const expired = !count || now - firstAt > AUTH_FAIL_WINDOW_MS
  if (expired) return { blocked: false, key, count: 0, firstAt: now }
  if (count >= AUTH_FAIL_LIMIT) {
    return {
      blocked: true,
      key,
      retryAfter: Math.max(1, Math.ceil((AUTH_FAIL_WINDOW_MS - (now - firstAt)) / 1000))
    }
  }
  return { blocked: false, key, count, firstAt }
}

/** 记录一次失败；同窗口内累加，过期后重新计数 */
export async function recordAuthFailure(kv, guard) {
  const now = Date.now()
  await kvPutJSON(kv, guard.key, {
    count: (guard.count || 0) + 1,
    firstAt: guard.firstAt || now,
    at: now
  })
}
