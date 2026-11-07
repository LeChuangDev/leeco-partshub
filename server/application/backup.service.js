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
