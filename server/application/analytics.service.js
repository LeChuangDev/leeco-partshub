// server/application/analytics.service.js
// 看板统计用例：库存总量/货值、安全库存预警、缺货、呆滞、趋势与分布。
// 只读聚合，不写任何键。

import { KV_BATCH, mapLimit } from '../infrastructure/kv/index.js'
import { listCategories } from '../repositories/category.repository.js'
import { idxGet } from '../repositories/kv-index.js'
import { listPartsRaw } from '../repositories/part.repository.js'
import { listStock } from '../repositories/stock.repository.js'
import { listTransactions } from '../repositories/transaction.repository.js'

// 按周期聚合出入库流水（week=近7天/月，month=近30天，year=近12个月）
function buildTrend(transactions, period = 'week') {
  const now = new Date()
  const buckets = []
  const keyOf = (d) => {
    if (period === 'year') return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  if (period === 'year') {
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      buckets.push({ key: keyOf(d), label: `${d.getMonth() + 1}月`, in: 0, out: 0 })
    }
  } else {
    const days = period === 'month' ? 30 : 7
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
      buckets.push({ key: keyOf(d), label: `${d.getMonth() + 1}/${d.getDate()}`, in: 0, out: 0 })
    }
  }
  const map = Object.fromEntries(buckets.map((b) => [b.key, b]))
  for (const t of transactions) {
    if (!t || !t.createdAt) continue
    const b = map[keyOf(new Date(t.createdAt))]
    if (!b) continue
    const q = Number(t.quantity) || 0
    if (t.type === 'in') b.in += q
    else if (t.type === 'out') b.out += q
  }
  return {
    period,
    labels: buckets.map((b) => b.label),
    in: buckets.map((b) => b.in),
    out: buckets.map((b) => b.out)
  }
}

// 统计分布：返回 [{ name, value }]，按数量降序，空值归入占位文案
function topLevelName(catMap, catId) {
  let c = catMap[catId]
  if (!c) return '未分类'
  while (c.parentId && catMap[c.parentId]) c = catMap[c.parentId]
  return c.name
}

function buildDistribution(records, keyFn, emptyLabel = '未填写', topN = 10) {
  const acc = new Map()
  for (const r of records) {
    const raw = keyFn(r)
    const name = raw && String(raw).trim() ? String(raw).trim() : emptyLabel
    acc.set(name, (acc.get(name) || 0) + 1)
  }
  const arr = [...acc.entries()].map(([name, value]) => ({ name, value }))
  arr.sort((a, b) => b.value - a.value)
  if (arr.length > topN) {
    const shown = arr.slice(0, topN)
    const rest = arr.slice(topN).reduce((s, x) => s + x.value, 0)
    shown.push({ name: '其他', value: rest })
    return shown
  }
  return arr
}

export async function getStats(kv, { period = 'week', staleDays = 180 } = {}) {
  // 四组读取互不依赖，一次并发；器件与其批次在同一任务里读取，避免 N 次串行往返
  const [categories, partData, transactions, locationIds] = await Promise.all([
    listCategories(kv),
    (async () => {
      const all = await listPartsRaw(kv)
      const batches = new Map(await mapLimit(all, KV_BATCH, async (p) => [p.id, await listStock(kv, p.id)]))
      return { all, batches }
    })(),
    listTransactions(kv, null, 100000),
    idxGet(kv, 'index:locations')
  ])
  const parts = partData.all
  const batchesByPart = partData.batches
  const catMap = Object.fromEntries(categories.map((c) => [c.id, c]))

  let totalQuantity = 0
  let totalValue = 0
  const lowStock = [] // 低于安全库存
  const shortage = [] // 完全缺货
  const stale = []
  const now = Date.now()

  for (const p of parts) {
    const batches = batchesByPart.get(p.id) || []
    const qty = batches.reduce((s, b) => s + (Number(b.quantity) || 0), 0)
    const value = batches.reduce((s, b) => s + (Number(b.quantity) || 0) * (Number(b.unitPrice) || 0), 0)
    totalQuantity += qty
    totalValue += value
    if (p.safetyStock && qty < p.safetyStock) {
      lowStock.push({ partId: p.id, name: p.name, quantity: qty, safetyStock: p.safetyStock })
    }
    if (qty === 0) {
      shortage.push({ partId: p.id, name: p.name })
    }
    const neverOut = batches.every((b) => !b.lastOutAt)
    const allOld = batches.every((b) => {
      const last = b.lastOutAt ? new Date(b.lastOutAt).getTime() : new Date(b.createdAt).getTime()
      return now - last > staleDays * 86400000
    })
    if (qty > 0 && neverOut && allOld) {
      stale.push({ partId: p.id, name: p.name, quantity: qty, lastOutAt: batches[0]?.lastOutAt || null })
    }
  }

  return {
    categoriesCount: categories.length,
    partsCount: parts.length,
    locationsCount: locationIds.length,
    transactionsCount: transactions.length,
    totalQuantity,
    totalValue: Math.round(totalValue * 100) / 100,
    lowStockCount: lowStock.length,
    shortageCount: shortage.length,
    shortage,
    lowStock,
    stale,
    projectsCount: 0, // 项目数由项目模块单独提供，避免统计层反向依赖项目聚合
    trend: buildTrend(transactions, period),
    byCategory: buildDistribution(parts, (p) => topLevelName(catMap, p.categoryId)),
    byBrand: buildDistribution(parts, (p) => p.brand),
    byPackage: buildDistribution(parts, (p) => p.package)
  }
}
