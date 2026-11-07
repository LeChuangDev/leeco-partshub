// server/repositories/audit.repository.js
// 操作日志：只追加的审计事件，与业务流水分开存放。
// 备份恢复会重建业务数据，但不会清空审计索引，保证「谁在什么时候改了库存」可回溯。

import { kvGetJSON, kvPutJSON } from '../infrastructure/kv/index.js'
import { nowISO, uid } from '../domain/models.js'
import { idxAdd, idxGet } from './kv-index.js'

const INDEX = 'index:audit'

/**
 * 追加一条审计事件。
 * @param {object} event action / source / partId / partName / quantity / beforeQty / afterQty / batchId / operator / detail
 */
export async function appendAudit(kv, event = {}) {
  const record = {
    id: uid('audit'),
    action: String(event.action || 'unknown'),
    source: String(event.source || 'system'),
    partId: event.partId || null,
    partName: event.partName || '',
    quantity: Number(event.quantity) || 0,
    beforeQty: event.beforeQty == null ? null : Number(event.beforeQty),
    afterQty: event.afterQty == null ? null : Number(event.afterQty),
    batchId: event.batchId || null,
    orderNo: event.orderNo || '',
    reason: event.reason || '',
    operator: event.operator || 'system',
    detail: event.detail || '',
    createdAt: nowISO()
  }
  await kvPutJSON(kv, `audit:${record.id}`, record)
  await idxAdd(kv, INDEX, record.id)
  return record
}

/** 查询审计事件：支持按动作、来源、器件与关键词过滤，按时间倒序 */
export async function listAudits(kv, { limit = 200, action, source, partId, keyword } = {}) {
  const ids = await idxGet(kv, INDEX)
  const items = []
  for (const id of ids) {
    const record = await kvGetJSON(kv, `audit:${id}`)
    if (!record) continue
    if (action && record.action !== action) continue
    if (source && record.source !== source) continue
    if (partId && record.partId !== partId) continue
    if (keyword) {
      const q = String(keyword).toLowerCase()
      const hay = `${record.partName || ''} ${record.detail || ''} ${record.batchId || ''} ${record.orderNo || ''}`.toLowerCase()
      if (!hay.includes(q)) continue
    }
    items.push(record)
  }
  items.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
  return items.slice(0, Math.min(Math.max(Number(limit) || 200, 1), 2000))
}

/** 导出备份时附带审计记录（恢复时不覆盖已有日志） */
export async function exportAudits(kv, limit = 100000) {
  return listAudits(kv, { limit })
}
