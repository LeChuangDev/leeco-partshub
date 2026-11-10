// server/http/routes/auth.routes.js
// /api/auth/* 鉴权状态查询（公开接口，用于登录页判断令牌是否有效）。
// 失败按 IP 计数，超过阈值返回 429，避免公网被持续撞库。

import { json } from '../http-utils.js'
import { checkAuth } from '../auth.js'
import { authFailureGuard, recordAuthFailure } from '../rate-limit.js'

export async function handleAuthCheck({ request, env, kv }) {
  const result = checkAuth(request, env)
  if (!result.ok) {
    const guard = await authFailureGuard(kv, request)
    if (guard.blocked) {
      const blocked = json(429, { authenticated: false, retryAfter: guard.retryAfter }, '尝试次数过多，请稍后再试', 429)
      blocked.headers.set('Retry-After', String(guard.retryAfter))
      return blocked
    }
    await recordAuthFailure(kv, guard)
    return json(401, { authenticated: false }, 'Unauthorized', 401)
  }
  return json(0, { authenticated: true, devBypass: result.devBypass || false })
}
