// server/application/backup.service.js
// 备份与恢复：全量导出（含项目与项目 BOM）与清空重建索引。
// 恢复是显式的高风险操作，只允许 HTTP 层在鉴权后调用。

import { kvGetJSON, kvPutJSON } from '../infrastructure/kv/index.js'
import { nowISO } from '../domain/models.js'
import { appendAudit } from '../repositories/audit.repository.js'
import { listCategories } from '../repositories/category.repository.js'
import { idxAdd, idxReset, touchMeta } from '../repositories/kv-index.js'
import { listLocations } from '../repositories/location.repository.js'
import { listPartsRaw } from '../repositories/part.repository.js'
import { listStock } from '../repositories/stock.repository.js'
import { listTransactions } from '../repositories/transaction.repository.js'
import { exportAudits } from '../repositories/audit.repository.js'

export async function exportAll(kv) {
  const categories = await listCategories(kv)
  const parts = await listPartsRaw(kv)
  const locations = await listLocations(kv)
  const stocks = []
  for (const p of parts) {
    const batches = await listStock(kv, p.id)
    stocks.push(...batches)
  }
  const transactions = await listTransactions(kv, null, 100000)
  const audits = await exportAudits(kv)
  const meta = (await kvGetJSON(kv, 'meta:info')) || { version: 1 }
  // 项目与其 BOM 行一并备份，避免恢复后项目表丢失
  const projects = []
  const projectBoms = []
  const projectIds = (await kvGetJSON(kv, 'index:projects')) || []
  for (const pid of projectIds) {
    const project = await kvGetJSON(kv, `project:${pid}`)
    if (project) projects.push(project)
    const doc = await kvGetJSON(kv, `projectbom:${pid}`)
    if (doc) projectBoms.push(doc)
  }
  return {
    exportedAt: nowISO(),
    version: meta.version || 1,
    categories,
    parts,
    stocks,
    locations,
    transactions,
    audits,
    projects,
    projectBoms,
    meta
  }
}

/**
 * 全量恢复：先在内存算出完整目标状态，再一次性提交。
 * 提交前保存受影响键的原值，任一步失败即整体回退，避免「恢复一半」的脏库。
 * 审计日志是 append-only，不参与覆盖，恢复动作本身也会留痕。
 */
export async function importAll(kv, data) {
  const writes = new Map() // key -> value | null（null 表示删除）
  const put = (key, value) => writes.set(key, value)
  const drop = (key) => { if (!writes.has(key)) writes.set(key, null) }
  const index = new Map()
  const addIdx = (key, id) => {
    const arr = index.get(key) || []
    if (!arr.includes(id)) arr.push(id)
    index.set(key, arr)
  }

  // 清理可能残留的二级索引（原实现只重置固定索引，旧分类/标签索引会留下脏 ID）
  for (const prefix of ['index:parts:cat:', 'index:parts:tag:', 'index:stock:part:', 'index:txn:part:']) {
    for (const key of await listKeys(kv, prefix)) drop(key)
  }

  for (const c of data.categories || []) {
    put(`category:${c.id}`, c)
    addIdx('index:categories', c.id)
  }
  put('index:categories', index.get('index:categories') || [])

  for (const l of data.locations || []) {
    put(`location:${l.id}`, l)
    addIdx('index:locations', l.id)
  }
  put('index:locations', index.get('index:locations') || [])

  for (const p of data.parts || []) {
    put(`part:${p.id}`, p)
    addIdx('index:parts', p.id)
    if (p.categoryId) addIdx(`index:parts:cat:${p.categoryId}`, p.id)
    for (const t of p.tags || []) addIdx(`index:parts:tag:${t}`, p.id)
  }
  put('index:parts', index.get('index:parts') || [])

  for (const t of data.transactions || []) {
    put(`transaction:${t.id}`, t)
    addIdx('index:transactions', t.id)
    if (t.partId) addIdx(`index:txn:part:${t.partId}`, t.id)
  }
  put('index:transactions', index.get('index:transactions') || [])

  for (const s of data.stocks || []) {
    put(`stock:${s.id}`, s)
    addIdx(`index:stock:part:${s.partId}`, s.id)
  }

  for (const p of data.projects || []) {
    put(`project:${p.id}`, p)
    addIdx('index:projects', p.id)
  }
  put('index:projects', index.get('index:projects') || [])
  for (const doc of data.projectBoms || []) {
    if (doc && doc.projectId) put(`projectbom:${doc.projectId}`, doc)
  }

  // 二级索引中有值的一律覆盖掉上面的 drop
  for (const [key, ids] of index) {
    if (key !== 'index:categories' && key !== 'index:locations' && key !== 'index:parts' &&
        key !== 'index:transactions' && key !== 'index:projects') put(key, ids)
  }

  const meta = (await kvGetJSON(kv, 'meta:info')) || { version: 1 }
  put('meta:info', { ...meta, lastUpdated: nowISO() })

  const batch = [...writes.entries()].map(([key, value]) => ({ key, value }))
  const snapshot = []
  for (const w of batch) snapshot.push({ key: w.key, raw: await kv.get(w.key) })

  try {
    for (const w of batch) {
      if (w.value === null) await kv.del(w.key)
      else await kvPutJSON(kv, w.key, w.value)
    }
  } catch (e) {
    // 回滚已写入的键；失败时附加原因，便于排查存储适配器问题
    for (const item of snapshot) {
      try {
        if (item.raw == null) await kv.del(item.key)
        else await kv.put(item.key, item.raw)
      } catch (rollbackError) {
        console.error('[restore] rollback failed for', item.key, rollbackError)
      }
    }
    throw new Error(`恢复失败，已回滚到恢复前状态：${String((e && e.message) || e)}`)
  }

  const counts = {
    categories: (data.categories || []).length,
    parts: (data.parts || []).length,
    stocks: (data.stocks || []).length,
    locations: (data.locations || []).length,
    transactions: (data.transactions || []).length,
    projects: (data.projects || []).length
  }
  await appendAudit(kv, {
    action: 'backup.restore', source: 'restore',
    quantity: 0,
    detail: `覆盖恢复：${counts.parts} 器件 / ${counts.stocks} 批次 / ${counts.transactions} 流水`
  })
  return { ok: true, counts, keysWritten: batch.length }
}

/** 按前缀列出键（兼容不同 KV 实现的分页游标） */
async function listKeys(kv, prefix) {
  const keys = []
  let cursor = null
  for (let page = 0; page < 20; page++) {
    const res = await kv.list(prefix, { limit: 1000, cursor: cursor || undefined })
    keys.push(...(res.keys || []))
    if (res.done || !res.cursor) break
    cursor = res.cursor
  }
  return [...new Set(keys)]
}

/* --------------------------- 恢复前校验与预演 --------------------------- */

const BACKUP_ARRAYS = ['categories', 'parts', 'stocks', 'locations', 'transactions', 'projects', 'projectBoms']

/** 校验一个集合的元素形状与 id 唯一性，返回 id 集合 */
function checkIdList(list, name, errors) {
  const seen = new Set()
  for (let i = 0; i < list.length; i++) {
    const item = list[i]
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      errors.push(`${name}[${i}] 必须是对象`)
      continue
    }
    const id = item.id
    if (!id || typeof id !== 'string') {
      errors.push(`${name}[${i}] 缺少字符串 id`)
      continue
    }
    if (seen.has(id)) {
      errors.push(`${name} 存在重复 id：${id}`)
      continue
    }
    seen.add(id)
  }
  return seen
}

/**
 * 恢复前校验：只做结构与引用完整性检查，不写库。
 * errors 会阻断恢复；warnings 仅提示（例如历史流水引用了已删除的器件）。
 */
export function validateBackup(data) {
  const errors = []
  const warnings = []
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { errors: ['备份文件顶层必须是 JSON 对象'], warnings }
  }
  for (const key of BACKUP_ARRAYS) {
    if (data[key] == null) continue
    if (!Array.isArray(data[key])) errors.push(`字段 ${key} 必须是数组`)
  }
  if (!Array.isArray(data.parts)) errors.push('缺少 parts 数组')
  if (errors.length) return { errors, warnings }
  if (!data.parts.length) warnings.push('备份中没有任何器件，恢复后将清空现有库存')

  const partIds = checkIdList(data.parts, 'parts', errors)
  const locationIds = data.locations ? checkIdList(data.locations, 'locations', errors) : new Set()
  const projectIds = data.projects ? checkIdList(data.projects, 'projects', errors) : new Set()
  if (data.categories) checkIdList(data.categories, 'categories', errors)
  if (data.stocks) checkIdList(data.stocks, 'stocks', errors)
  if (data.transactions) checkIdList(data.transactions, 'transactions', errors)
  if (errors.length) return { errors, warnings }

  for (const s of data.stocks || []) {
    if (s.partId && !partIds.has(s.partId)) warnings.push(`库存批次 ${s.id} 引用了不存在的器件 ${s.partId}`)
    if (s.locationId && locationIds.size && !locationIds.has(s.locationId)) warnings.push(`库存批次 ${s.id} 引用了不存在的库位 ${s.locationId}`)
  }
  for (const t of data.transactions || []) {
    if (t.partId && !partIds.has(t.partId)) warnings.push(`流水 ${t.id} 引用了不存在的器件 ${t.partId}`)
  }
  for (const doc of data.projectBoms || []) {
    if (doc && doc.projectId && projectIds.size && !projectIds.has(doc.projectId)) {
      warnings.push(`项目 BOM 引用了不存在的项目 ${doc.projectId}`)
    }
  }
  if (warnings.length > 20) {
    const rest = warnings.length - 20
    warnings.length = 20
    warnings.push(`…另有 ${rest} 条引用警告`)
  }
  return { errors, warnings }
}

/** 仅统计备份包含的记录数，供恢复前预览 */
export function countBackup(data) {
  return {
    categories: (data.categories || []).length,
    parts: (data.parts || []).length,
    stocks: (data.stocks || []).length,
    locations: (data.locations || []).length,
    transactions: (data.transactions || []).length,
    projects: (data.projects || []).length
  }
}
