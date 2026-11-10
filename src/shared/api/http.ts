// src/shared/api/http.ts
// 传输层：相对路径 /api、令牌注入、统一信封 { code, data, msg } 解析、401 兜底。
// 与业务无关——具体接口按资源放在 endpoints/ 下。

import { clearToken, getToken } from './token'

export class ApiError extends Error {
  code: number
  constructor(message: string, code = -1) {
    super(message)
    this.name = 'ApiError'
    this.code = code
  }
}

type UnauthorizedHandler = () => void

let unauthorizedHandler: UnauthorizedHandler | null = null

/** 由应用启动层注册：令牌失效时清理登录态，避免 shared 层反向依赖业务 store */
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  unauthorizedHandler = handler
}

export async function request<T = unknown>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const headers: Record<string, string> = {}
  const token = getToken()
  if (token) headers['X-Auth-Token'] = token
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  })

  if (res.status === 401) {
    clearToken()
    unauthorizedHandler?.()
    throw new ApiError('未授权，请重新输入令牌', 401)
  }
  if (res.status === 429) {
    const payload = await res.json().catch(() => null)
    throw new ApiError(payload?.msg || '尝试次数过多，请稍后再试', 429)
  }

  const payload = await res.json().catch(() => ({ code: -1, data: {}, msg: '响应解析失败' }))
  if (payload.code !== 0) {
    throw new ApiError(payload.msg || '请求失败', payload.code)
  }
  return payload.data as T
}

/** 查询串构造：自动忽略 undefined / null / 空字符串 */
export function toQuery(params: Record<string, unknown>): string {
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') qs.set(key, String(value))
  }
  const text = qs.toString()
  return text ? `?${text}` : ''
}
