// server/application/import.service.js
// 服务器端导入逻辑：根据归一化行做多级去重匹配，生成导入计划（预览），再提交写入。
// 匹配优先级：① 平台料号精确 → ② 原厂型号 + 封装 → ③ 参数 + 封装（疑似重复，提示用户确认）

import { kvGetJSON, kvPutJSON } from '../infrastructure/kv/index.js'
import { nowISO, uid } from '../domain/models.js'
import { listCategories } from '../repositories/category.repository.js'
import {
  createPart, deletePart, findPartByModelPackage, findPartBySupplier, listPartsRaw
} from '../repositories/part.repository.js'
import { idxAdd, idxGet, idxRemove } from '../repositories/kv-index.js'
import { appendAudit } from '../repositories/audit.repository.js'
import { stockIn } from './stock.service.js'
import {
  normalizePackage, normalizeParams, familyOfKey, parseSI,
  extractFromText, guessCategoryName
} from '../domain/normalize.js'
import { PLATFORM_SHORT } from '../domain/import-map.js'

// 服务端不信任入参：补齐归一化，保证直接调 API 与前端走同一套规则
function normalizeRow(r) {
  if (!r) return r
  const text = `${r.name || ''} ${r.manufacturerModel || ''}`
  const params = r.params && Object.keys(r.params).length
    ? normalizeParams(r.params)
    : extractFromText(text).params
  return {
    ...r,
    package: normalizePackage(r.package) || normalizePackage(extractFromText(text).package) || '',
    params,
    categoryName: r.categoryName || guessCategoryName(text)
  }
}

// 第三级：参数 + 封装模糊匹配，只提示、不自动合并
async function findSimilarPart(kv, row) {
  const pkg = normalizePackage(row.package)
  const params = row.params || {}
  const keys = Object.keys(params).filter((k) => familyOfKey(k) && params[k])
  if (!pkg || !keys.length) return null
  const all = await listPartsRaw(kv)
  let best = null
  for (const cand of all) {
    if (normalizePackage(cand.package) !== pkg) continue
    const candParams = cand.params || {}
    let hit = 0
    for (const k of keys) {
      const fam = familyOfKey(k)
      const a = parseSI(params[k], fam)
      const b = parseSI(candParams[k], fam)
      if (!a || !b) continue
      const diff = Math.abs(a.value - b.value)
      const tol = Math.max(Math.abs(a.value) * 0.01, 1e-15)
      if (diff <= tol) hit++
    }
    if (!hit) continue
    const score = hit / keys.length
    if (!best || score > best.score) {
      best = {
        partId: cand.id,
        partName: cand.name,
        score,
        matchedBy: '参数+封装',
        detail: `${pkg} · ${keys.map((k) => `${k}=${params[k]}`).join(' / ')}`
      }
    }
  }
  return best && best.score >= 0.5 ? best : null
}

// 生成导入计划（dryRun，不落库）
export async function planImport(kv, rows) {
  const items = []
  const cats = await listCategories(kv)
  const catByName = new Map(cats.map((c) => [c.name, c.id]))
  for (let i = 0; i < rows.length; i++) {
    const r = normalizeRow(rows[i])
    if (!r || (r.quantity || 0) <= 0) {
      items.push({ index: i, action: 'skip', reason: '数量无效', row: r })
      continue
    }
    let matched = null
    let matchedBy = ''
    if (r.platform && r.sku) { matched = await findPartBySupplier(kv, r.platform, r.sku); if (matched) matchedBy = '料号' }
    if (!matched && r.manufacturerModel) {
      matched = await findPartByModelPackage(kv, r.manufacturerModel, normalizePackage(r.package))
      if (matched) matchedBy = '型号+封装'
    }

    // 第三级仅在「不匹配任何现有料」时作为风险提示，不自动合并
    const similar = matched ? null : await findSimilarPart(kv, r)
    const categoryId = r.categoryId || catByName.get(r.categoryName) || null

    if (matched) {
      items.push({
        index: i,
        action: 'match',
        matchedBy,
        partId: matched.id,
        partName: matched.name,
        row: r
      })
    } else {
      items.push({
        index: i,
        action: 'create',
        partName: r.name,
        similar,
        partData: {
          name: r.name,
          manufacturerModel: r.manufacturerModel,
          package: r.package,
          params: r.params || {},
          suppliers: r.sku ? [{ platform: r.platform, sku: r.sku, url: r.url || '', price: r.unitPrice || 0 }] : [],
          categoryId,
          tags: r.tags || []
        },
        row: r
      })
    }
  }
  return { items, summary: summarize(items) }
}

function summarize(items) {
  const s = { total: items.length, match: 0, create: 0, skip: 0, similar: 0 }
  for (const it of items) {
    s[it.action] = (s[it.action] || 0) + 1
    if (it.similar) s.similar++
  }
  return s
}

// 提交导入：items 来自 planImport 的结果（用户可编辑 locationId / categoryId / 是否勾选）
// 每次提交生成 batchId，记录本次创建的器件 / 批次 / 流水，供 10 分钟内一键撤销。
export async function commitImport(kv, items, opts = {}) {
  const operator = opts.operator || 'import'
  const batchId = uid('batch')
  const created = []
  const createdPartIds = []
  const createdStockIds = []
  const createdTransactionIds = []
  const matched = []
  const errors = []
  for (const it of items) {
    if (it.action === 'skip') continue
    const locId = it.locationId || opts.locationId || null
    const orderNo = it.row?.orderNo || opts.orderNo || ''
    const supplier = PLATFORM_SHORT[it.row?.platform] || it.row?.platform || ''
    const unitPrice = Number(it.row?.unitPrice) || 0
    const quantity = Number(it.row?.quantity) || 0
    const inOpts = {
      locationId: locId, quantity, unitPrice, supplier, orderNo, operator,
      source: 'import', batchId
    }
    try {
      if (it.action === 'match' && it.partId) {
        const r = await stockIn(kv, it.partId, inOpts)
        if (!r.ok) throw new Error(r.msg || '入库失败')
        matched.push(it.partId)
        if (r.stock?.id) createdStockIds.push(r.stock.id)
        if (r.transaction?.id) createdTransactionIds.push(r.transaction.id)
      } else if (it.action === 'create') {
        const part = await createPart(kv, { ...(it.partData || {}), categoryId: it.categoryId || it.partData?.categoryId || null })
        const r = await stockIn(kv, part.id, inOpts)
        if (!r.ok) throw new Error(r.msg || '入库失败')
        created.push(part.id)
        createdPartIds.push(part.id)
        if (r.stock?.id) createdStockIds.push(r.stock.id)
        if (r.transaction?.id) createdTransactionIds.push(r.transaction.id)
      }
    } catch (e) {
      errors.push({ index: it.index, msg: String(e && e.message || e) })
    }
  }

  const batch = {
    id: batchId,
    createdAt: nowISO(),
    operator,
    itemCount: items.filter((i) => i.action !== 'skip').length,
    createdPartIds,
    createdStockIds,
    createdTransactionIds,
    undone: false
  }
  await kvPutJSON(kv, `importbatch:${batchId}`, batch)
  await idxAdd(kv, 'index:importbatches', batchId)
  await appendAudit(kv, {
    action: 'import.commit', source: 'import', batchId, operator,
    quantity: 0,
    detail: `导入 ${batch.itemCount} 行：新建 ${createdPartIds.length} 个器件、${createdStockIds.length} 个批次，失败 ${errors.length} 行`
  })

  return {
    ok: errors.length === 0, created, matched, errors, batchId,
    summary: { created: created.length, matched: matched.length, errors: errors.length }
  }
}

export const UNDO_WINDOW_MS = 10 * 60 * 1000

/** 列出最近的导入批次，供前端展示「撤销本次导入」 */
export async function listImportBatches(kv, limit = 20) {
  const ids = await idxGet(kv, 'index:importbatches')
  const out = []
  for (const id of ids.slice(-Math.min(limit, 100))) {
    const doc = await kvGetJSON(kv, `importbatch:${id}`)
    if (doc) out.push({ ...doc, undoable: !doc.undone && Date.now() - new Date(doc.createdAt).getTime() <= UNDO_WINDOW_MS })
  }
  return out.reverse()
}

/**
 * 撤销一次导入：删除本次新建的批次、流水与器件，并从索引中摘除。
 * 只回滚「本批次新建」的对象，不会误删导入前已存在的库存；超过 10 分钟拒绝执行。
 */
export async function undoImport(kv, batchId) {
  if (!batchId) return { ok: false, msg: '缺少 batchId' }
  const doc = await kvGetJSON(kv, `importbatch:${batchId}`)
  if (!doc) return { ok: false, msg: '找不到该导入批次' }
  if (doc.undone) return { ok: false, msg: '该批次已撤销' }
  if (Date.now() - new Date(doc.createdAt).getTime() > UNDO_WINDOW_MS) {
    return { ok: false, msg: '超过 10 分钟，已不可撤销' }
  }

  let removedTransactions = 0
  for (const txnId of doc.createdTransactionIds || []) {
    const txn = await kvGetJSON(kv, `transaction:${txnId}`)
    await kv.del(`transaction:${txnId}`)
    await idxRemove(kv, 'index:transactions', txnId)
    if (txn?.partId) await idxRemove(kv, `index:txn:part:${txn.partId}`, txnId)
    removedTransactions++
  }

  let removedStocks = 0
  for (const stockId of doc.createdStockIds || []) {
    const stock = await kvGetJSON(kv, `stock:${stockId}`)
    await kv.del(`stock:${stockId}`)
    if (stock?.partId) await idxRemove(kv, `index:stock:part:${stock.partId}`, stockId)
    removedStocks++
  }

  let removedParts = 0
  for (const partId of doc.createdPartIds || []) {
    const r = await deletePart(kv, partId)
    if (r.ok) removedParts++
  }

  await kvPutJSON(kv, `importbatch:${batchId}`, {
    ...doc, undone: true, undoneAt: nowISO()
  })
  await appendAudit(kv, {
    action: 'import.undo', source: 'import', batchId,
    operator: doc.operator || 'import',
    quantity: 0,
    detail: `撤销导入：删除 ${removedParts} 个器件、${removedStocks} 个批次、${removedTransactions} 条流水`
  })
  return {
    ok: true, batchId,
    removed: { parts: removedParts, stocks: removedStocks, transactions: removedTransactions }
  }
}

// 第三方器件信息代理占位（模块 3.3）：仅做结构占位，真实接口联调时补充。
// 返回标准结构，前端据此展示「暂无数据 / 待联调」。
export function placeholderPartInfo(platform, sku) {
  return {
    platform,
    sku,
    status: 'unavailable',
    message: '第三方器件信息代理尚未联调（占位实现）。部署后可接入各平台公开接口。',
    data: null
  }
}
