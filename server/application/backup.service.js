// server/application/backup.service.js
// 备份与恢复：全量导出（含项目与项目 BOM）与清空重建索引。
// 恢复是显式的高风险操作，只允许 HTTP 层在鉴权后调用。

import { kvGetJSON, kvPutJSON } from '../infrastructure/kv/index.js'
import { nowISO } from '../domain/models.js'
import { listCategories } from '../repositories/category.repository.js'
import { idxAdd, idxReset, touchMeta } from '../repositories/kv-index.js'
import { listLocations } from '../repositories/location.repository.js'
import { listPartsRaw } from '../repositories/part.repository.js'
import { listStock } from '../repositories/stock.repository.js'
import { listTransactions } from '../repositories/transaction.repository.js'

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
    projects,
    projectBoms,
    meta
  }
}

/** 全量恢复：清空对应索引后按记录重建；不做增量合并，调用方需确认覆盖语义 */
export async function importAll(kv, data) {
  const rebuild = async (list, prefix, indexKey, idKey = 'id') => {
    await idxReset(kv, indexKey)
    for (const item of list || []) {
      await kvPutJSON(kv, `${prefix}:${item[idKey]}`, item)
      await idxAdd(kv, indexKey, item[idKey])
    }
  }
  await rebuild(data.categories, 'category', 'index:categories')
  await rebuild(data.locations, 'location', 'index:locations')

  // parts 及其分类/标签索引
  await idxReset(kv, 'index:parts')
  for (const p of data.parts || []) {
    await kvPutJSON(kv, `part:${p.id}`, p)
    await idxAdd(kv, 'index:parts', p.id)
    if (p.categoryId) await idxAdd(kv, `index:parts:cat:${p.categoryId}`, p.id)
    for (const t of p.tags || []) await idxAdd(kv, `index:parts:tag:${t}`, p.id)
  }

  await idxReset(kv, 'index:transactions')
  for (const t of data.transactions || []) {
    await kvPutJSON(kv, `transaction:${t.id}`, t)
    await idxAdd(kv, 'index:transactions', t.id)
    await idxAdd(kv, `index:txn:part:${t.partId}`, t.id)
  }

  // stocks 及其按 part 索引
  for (const p of data.parts || []) await idxReset(kv, `index:stock:part:${p.id}`)
  for (const s of data.stocks || []) {
    await kvPutJSON(kv, `stock:${s.id}`, s)
    await idxAdd(kv, `index:stock:part:${s.partId}`, s.id)
  }

  // 项目与项目 BOM
  await idxReset(kv, 'index:projects')
  for (const p of data.projects || []) {
    await kvPutJSON(kv, `project:${p.id}`, p)
    await idxAdd(kv, 'index:projects', p.id)
  }
  for (const doc of data.projectBoms || []) {
    if (doc && doc.projectId) await kvPutJSON(kv, `projectbom:${doc.projectId}`, doc)
  }
  await touchMeta(kv)
  return {
    ok: true,
    counts: {
      categories: (data.categories || []).length,
      parts: (data.parts || []).length,
      stocks: (data.stocks || []).length,
      locations: (data.locations || []).length,
      transactions: (data.transactions || []).length,
      projects: (data.projects || []).length
    }
  }
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
