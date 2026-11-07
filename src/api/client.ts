// src/api/client.ts
// 统一 API 客户端：相对路径 /api，注入 X-Auth-Token，统一解析 { code, data, msg }。
import { useAuth } from '../stores/auth'
import type {
  Category, Location, Stats, Transaction, BomMatchResult, SearchResult,
  Project, ProjectAnalysis, ProjectConsumeResult
} from './types'

const TOKEN_KEY = 'leeco_token'

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) || ''
}
export function setToken(t: string) {
  localStorage.setItem(TOKEN_KEY, t)
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

export class ApiError extends Error {
  code: number
  constructor(msg: string, code = -1) {
    super(msg)
    this.code = code
  }
}

async function request<T = any>(path: string, method = 'GET', body?: any): Promise<T> {
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
    const auth = useAuth()
    auth.logout()
    throw new ApiError('未授权，请重新输入令牌', 401)
  }
  const json = await res.json().catch(() => ({ code: -1, data: {}, msg: '响应解析失败' }))
  if (json.code !== 0) {
    throw new ApiError(json.msg || '请求失败', json.code)
  }
  return json.data as T
}

export const api = {
  authCheck: () => request('/auth/check'),
  // 分类
  listCategories: () => request<Category[]>('/categories'),
  createCategory: (b: any) => request('/categories', 'POST', b),
  updateCategory: (b: any) => request('/categories', 'PUT', b),
  deleteCategory: (id: string) => request(`/categories?id=${id}`, 'DELETE'),
  // 元器件
  listParts: (q: Record<string, any> = {}) => {
    const qs = new URLSearchParams()
    Object.entries(q).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') qs.set(k, String(v)) })
    return request(`/parts?${qs.toString()}`)
  },
  getPart: (id: string) => request(`/parts?id=${id}`),
  createPart: (b: any) => request('/parts', 'POST', b),
  updatePart: (b: any) => request('/parts', 'PUT', b),
  deletePart: (id: string) => request(`/parts?id=${id}`, 'DELETE'),
  // 库存
  listStock: (partId: string) => request(`/stock?partId=${partId}`),
  stockIn: (b: any) => request('/stock/in', 'POST', b),
  stockOut: (b: any) => request('/stock/out', 'POST', b),
  moveStock: (b: { partId: string; locationId: string | null; stockId?: string }) =>
    request<{ ok: boolean; moved: number; unchanged?: boolean; locationId: string | null }>('/stock/move', 'POST', b),
  listTransactions: (partId: string) => request<Transaction[]>(`/transactions?partId=${partId}`),
  // 位置
  listLocations: () => request<Location[]>('/locations'),
  createLocation: (b: any) => request('/locations', 'POST', b),
  updateLocation: (b: any) => request('/locations', 'PUT', b),
  deleteLocation: (id: string) => request(`/locations?id=${id}`, 'DELETE'),
  // 统计 / 导出备份
  stats: (period = 'week') => request<Stats>(`/stats?period=${period}`),
  exportAll: () => request('/export/all'),
  restore: (data: any) => request('/export/restore', 'POST', data),
  // 导入
  importPlan: (rows: any[]) => request('/import/batch', 'POST', { rows, dryRun: true }),
  importCommit: (items: any[]) => request('/import/batch', 'POST', { items }),
  // 第三方器件信息代理（占位）
  partInfo: (platform: string, sku: string) => request(`/parts/info/${platform}/${sku}`),
  // BOM 齐套
  bomMatch: (rows: any[]) => request<BomMatchResult>('/bom/match', 'POST', { rows }),
  bomConsume: (lines: any[], projectName: string) =>
    request<{ ok: boolean; totalOut: number; success: any[]; failed: any[]; projectName: string }>(
      '/bom/consume', 'POST', { lines, projectName }
    ),
  // 全局搜索（命令面板）
  search: (q: string, limit = 8) =>
    request<SearchResult>(`/search?q=${encodeURIComponent(q)}&limit=${limit}`),

  // 项目 BOM
  listProjects: () => request<Project[]>('/projects'),
  getProject: (id: string, buildQty?: number) =>
    request<ProjectAnalysis>(`/projects/${id}${buildQty ? `?buildQty=${buildQty}` : ''}`),
  createProject: (b: any) => request<{ project: Project; lines: any[] }>('/projects', 'POST', b),
  updateProject: (id: string, b: any) => request<{ project: Project }>(`/projects/${id}`, 'PUT', b),
  deleteProject: (id: string) => request(`/projects/${id}`, 'DELETE'),
  saveProjectBom: (id: string, lines: any[], buildQty?: number) =>
    request(`/projects/${id}/bom`, 'PUT', { lines, buildQty }),
  importProjectBom: (id: string, b: { text?: string; rows?: any[]; mode?: 'replace' | 'append'; buildQty?: number }) =>
    request<any>(`/projects/${id}/import`, 'POST', b),
  consumeProject: (id: string, b: { buildQty?: number } = {}) =>
    request<ProjectConsumeResult>(`/projects/${id}/consume`, 'POST', b)
}
