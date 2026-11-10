// src/shared/api/endpoints/system.api.ts
// 系统级接口：统计、备份恢复、批量导入、全局搜索。

import { request, toQuery } from '../http'
import type { AuditEvent, ImportBatch, SearchResult, Stats } from '../types'

export const systemApi = {
  stats: (period = 'week') => request<Stats>(`/stats${toQuery({ period })}`),
  exportAll: () => request('/export/all'),
  restoreDryRun: (data: unknown) =>
    request<{ dryRun: boolean; counts: Record<string, number>; warnings: string[] }>('/export/restore?dryRun=1', 'POST', data),
  restore: (data: unknown) => request('/export/restore', 'POST', data),
  importPlan: (rows: unknown[]) => request('/import/batch', 'POST', { rows, dryRun: true }),
  importCommit: (items: unknown[]) => request('/import/batch', 'POST', { items }),
  search: (q: string, limit = 8) => request<SearchResult>(`/search${toQuery({ q, limit })}`),
  // 操作日志
  auditList: (query: Record<string, unknown> = {}) => request<AuditEvent[]>(`/audit${toQuery(query)}`),
  // 导入批次与撤销
  importBatches: (limit = 20) => request<ImportBatch[]>(`/import/batches${toQuery({ limit })}`),
  importUndo: (batchId: string) => request<{ ok: boolean; batchId: string; removed: Record<string, number> }>(
    '/import/undo', 'POST', { batchId }
  ),
  // 索引自检与重建
  indexCheck: () => request<{
    healthy: boolean
    checkedAt: string
    counts: Record<string, number>
    issues: string[]
  }>('/maintenance/index-check'),
  reindex: (dryRun = false) => request<{
    dryRun: boolean
    written: number
    removed: number
    unchanged: number
    changes: { key: string; action: string }[]
  }>(`/maintenance/reindex${toQuery({ dryRun: dryRun ? 1 : '' })}`, 'POST')
}
