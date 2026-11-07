// src/shared/api/endpoints/system.api.ts
// 系统级接口：统计、备份恢复、批量导入、全局搜索。

import { request, toQuery } from '../http'
import type { SearchResult, Stats } from '../types'

export const systemApi = {
  stats: (period = 'week') => request<Stats>(`/stats${toQuery({ period })}`),
  exportAll: () => request('/export/all'),
  restoreDryRun: (data: unknown) =>
    request<{ dryRun: boolean; counts: Record<string, number>; warnings: string[] }>('/export/restore?dryRun=1', 'POST', data),
  restore: (data: unknown) => request('/export/restore', 'POST', data),
  importPlan: (rows: unknown[]) => request('/import/batch', 'POST', { rows, dryRun: true }),
  importCommit: (items: unknown[]) => request('/import/batch', 'POST', { items }),
  search: (q: string, limit = 8) => request<SearchResult>(`/search${toQuery({ q, limit })}`)
}
