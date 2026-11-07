// shared/auth.js
// 令牌鉴权：请求头 X-Auth-Token 必须等于环境变量 AUTH_TOKEN。
// 生产环境必须配置 AUTH_TOKEN；本地开发服务端默认注入一个开发令牌（见 dev/server.mjs），
// 以便真实走通鉴权链路。若未配置 AUTH_TOKEN 则放行并标记 devBypass（仅用于未部署场景）。

export function checkAuth(request, env = {}) {
  // 开发免鉴权：仅本地 dev 服务端设置 AUTH_DISABLED=1 时生效，
  // 生产边缘函数不会注入该变量，令牌鉴权照常强制。
  if (env && env.AUTH_DISABLED === '1') {
    return { ok: true, devBypass: true }
  }
  const expected = (env && env.AUTH_TOKEN) || ''
  if (!expected) {
    return { ok: true, devBypass: true }
  }
  const token = request.headers.get('X-Auth-Token') || ''
  if (token === expected) return { ok: true }
  return { ok: false }
}

export const DEV_TOKEN = 'dev-leeco-token'
