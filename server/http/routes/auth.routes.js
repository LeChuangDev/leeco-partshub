// server/http/routes/auth.routes.js
// /api/auth/* 鉴权状态查询（公开接口，用于登录页判断令牌是否有效）。

import { json } from '../http-utils.js'
import { checkAuth } from '../auth.js'

export async function handleAuthCheck({ request, env }) {
  const result = checkAuth(request, env)
  if (!result.ok) return json(401, { authenticated: false }, 'Unauthorized', 401)
  return json(0, { authenticated: true, devBypass: result.devBypass || false })
}
