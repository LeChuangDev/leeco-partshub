// server/application/bom.service.js
// BOM 齐套用例：与库存匹配（型号/料号/封装/名称多级）→ 缺口汇总 → 一键出库。
// 解析规则已下沉到 domain/bom/parser.js，本层只编排库存与流水。

import { KV_BATCH, mapLimit } from '../infrastructure/kv/index.js'
import { listCategories } from '../repositories/category.repository.js'
import { listLocations } from '../repositories/location.repository.js'
import { listPartsRaw } from '../repositories/part.repository.js'
import { listStock } from '../repositories/stock.repository.js'
import { stockOut } from './stock.service.js'
import { listParts } from './catalog.service.js'
import { parseBomText, normalizeBomRow } from '../domain/bom/parser.js'
import { summarizeBom } from '../domain/bom/summary.js'
import { cleanName, normalizePackage, expandSearchTokens, matchesTokens } from '../domain/normalize.js'

export { parseBomText, normalizeBomRow } from '../domain/bom/parser.js'
export { summarizeBom, METRIC_LABELS } from '../domain/bom/summary.js'

/* ------------------------------- 匹配打分 ------------------------------- */
const SCORE = {
  supplierSku: 100,
  internalNo: 96,
  modelExactPkg: 94,
  modelExact: 88,
  modelPrefix: 72,
  nameExact: 68,
  fuzzy: 46
}

function supplierHit(part, row) {
  if (!row.sku) return false
  const sku = row.sku.toLowerCase()
  return (part.suppliers || []).some((s) => String(s.sku || '').toLowerCase() === sku)
}

function modelAffinity(a, b) {
  // 去除常见包装后缀后再比（STM32F103C8T6 vs STM32F103C8T6TR）
  const strip = (s) => s.replace(/(tr|ta|tR|rl|reel|tube|ct|nopb)$/i, '')
  if (!a || !b) return 0
  if (a === b) return 3
  if (strip(a) === strip(b)) return 2
  if (a.length >= 6 && b.length >= 6 && (a.includes(b) || b.includes(a))) return 1
  return 0
}

function scorePart(part, row) {
  let score = 0
  if (supplierHit(part, row)) score = SCORE.supplierSku

  const rowModel = row.model.toLowerCase()
  const partModel = String(part.manufacturerModel || '').toLowerCase()
  const pkgSame = Boolean(row.package && part.package && row.package === part.package)
  const pkgConflict = Boolean(row.package && part.package && row.package !== part.package)

  if (rowModel) {
    if (part.internalNo && String(part.internalNo).toLowerCase() === rowModel) {
      score = Math.max(score, SCORE.internalNo)
    }
    const aff = modelAffinity(rowModel, partModel)
    if (aff === 3) score = Math.max(score, pkgSame ? SCORE.modelExactPkg : pkgConflict ? SCORE.modelExact - 20 : SCORE.modelExact)
    else if (aff === 2) score = Math.max(score, pkgSame ? SCORE.modelExact - 2 : SCORE.modelExact - 16)
    else if (aff === 1) score = Math.max(score, pkgConflict ? SCORE.modelPrefix - 10 : SCORE.modelPrefix)
  }

  const rowName = cleanName(row.name).toLowerCase()
  if (rowName && rowName.length >= 2) {
    const pn = cleanName(part.name).toLowerCase()
    if (pn === rowName) score = Math.max(score, pkgConflict ? SCORE.nameExact - 12 : SCORE.nameExact)
  }
  return score
}

// 模糊候选：型号或名称 token 命中，仅在无强匹配时作为提示
function fuzzyCandidates(parts, row, limit = 3) {
  const query = [row.model, row.name].filter(Boolean).join(' ').trim()
  if (!query) return []
  const groups = expandSearchTokens(query)
  if (!groups.length) return []
  const hits = []
  for (const p of parts) {
    const text = [p.name, p.manufacturerModel, p.package, p.brand, ...Object.values(p.params || {})]
      .filter(Boolean).join(' ').toLowerCase()
    if (matchesTokens(text, groups)) {
      const score = scorePart(p, row) || SCORE.fuzzy
      hits.push({ part: p, score })
    }
  }
  hits.sort((a, b) => b.score - a.score)
  return hits.slice(0, limit).map((h) => h.part)
}

function buildLocationIndex(locations) {
  const byId = new Map(locations.map((l) => [l.id, l]))
  const pathOf = (id) => {
    const names = []
    let cur = byId.get(id)
    let guard = 0
    while (cur && guard++ < 12) {
      names.unshift(cur.name)
      cur = cur.parentId ? byId.get(cur.parentId) : null
    }
    return names.join(' / ')
  }
  return { byId, pathOf }
}

/**
 * BOM 与库存匹配。
 * @param {object} kv
 * @param {object[]} rawRows 已归一或原始行
 * @returns {Promise<{lines:object[], summary:object}>}
 */
export async function matchBom(kv, rawRows = []) {
  const rows = rawRows.map((r, i) => normalizeBomRow(r, i + 1))
  const [parts, locations] = await Promise.all([listPartsRaw(kv), listLocations(kv)])
  const { pathOf } = buildLocationIndex(locations)

  // 先在内存里完成打分，再只对命中/候选器件读取批次：
  // BOM 行通常只引用少量料号，没必要把整库批次都读一遍。
  const scoredRows = rows.map((row) => {
    const scored = parts
      .map((p) => ({ p, score: scorePart(p, row) }))
      .filter((x) => x.score >= SCORE.fuzzy)
      .sort((a, b) => b.score - a.score)
    const best = scored[0]
    return { row, scored, best, fuzzy: best ? [] : fuzzyCandidates(parts, row) }
  })

  const neededIds = new Set()
  for (const { scored, best, fuzzy } of scoredRows) {
    if (best) {
      neededIds.add(best.p.id)
      for (const x of scored.slice(1, 4)) if (best.score - x.score < 40) neededIds.add(x.p.id)
    } else {
      for (const p of fuzzy) neededIds.add(p.id)
    }
  }
  const pairs = await mapLimit([...neededIds], KV_BATCH, async (id) => [id, await listStock(kv, id)])
  const batchesByPart = new Map(pairs)
  const qtyByPart = new Map(pairs.map(([id, batches]) => [
    id,
    batches.reduce((s, b) => s + (Number(b.quantity) || 0), 0)
  ]))
  const qtyOf = (partId) => qtyByPart.get(partId) || 0

  const lines = scoredRows.map(({ row, scored, best, fuzzy }) => {
    const result = {
      ...row,
      status: 'missing',
      partId: null,
      partName: '',
      partModel: '',
      partPackage: '',
      available: 0,
      shortage: row.required,
      locations: [],
      candidates: [],
      score: 0,
      needCreate: true
    }

    if (!best) {
      result.candidates = fuzzy.map((p) => ({
        partId: p.id, name: p.name, model: p.manufacturerModel || '', package: p.package || '', available: qtyOf(p.id)
      }))
      return result
    }

    const part = best.p
    const available = qtyOf(part.id)
    const batches = batchesByPart.get(part.id) || []
    const locAgg = new Map()
    for (const b of batches) {
      const qty = Number(b.quantity) || 0
      if (qty <= 0 || !b.locationId) continue
      const key = b.locationId
      locAgg.set(key, (locAgg.get(key) || 0) + qty)
    }
    result.partId = part.id
    result.partName = part.name
    result.partModel = part.manufacturerModel || ''
    result.partPackage = part.package || ''
    result.available = available
    result.shortage = Math.max(0, row.required - available)
    result.score = best.score
    result.needCreate = false
    result.locations = [...locAgg.entries()].map(([id, qty]) => ({
      id, path: pathOf(id) || '未命名位置', quantity: qty
    })).sort((a, b) => b.quantity - a.quantity)
    result.status = available >= row.required ? 'ok' : available > 0 ? 'short' : 'empty'
    // 备选：分数接近且不是同一颗的其它器件（替代料参考）
    result.candidates = scored.slice(1, 4)
      .filter((x) => best.score - x.score < 40)
      .map((x) => ({
        partId: x.p.id, name: x.p.name, model: x.p.manufacturerModel || '', package: x.p.package || '', available: qtyOf(x.p.id)
      }))
    return result
  })

  return { lines, summary: summarizeBom(lines) }
}

/**
 * BOM 一键出库：同一器件多行合并，按 FIFO 扣减；不足的行整体不出。
 * @returns {{ok:boolean, totalOut:number, success:object[], failed:object[]}}
 */
export async function consumeBom(kv, lines = [], opts = {}) {
  const projectName = String(opts.projectName || '未命名项目').trim()
  const operator = String(opts.operator || 'bom')
  const grouped = new Map()
  for (const l of lines) {
    const partId = l.partId
    const qty = Number(l.required || l.quantity) || 0
    if (!partId || qty <= 0) continue
    const cur = grouped.get(partId) || { partId, quantity: 0, designators: [], lineNos: [] }
    cur.quantity += qty
    if (l.designators) cur.designators.push(l.designators)
    cur.lineNos.push(l.lineNo)
    grouped.set(partId, cur)
  }

  const success = []
  const failed = []
  let totalOut = 0
  for (const g of grouped.values()) {
    const r = await stockOut(kv, g.partId, {
      quantity: g.quantity,
      reason: `BOM 出库 · ${projectName}`,
      operator,
      note: g.designators.join(',')
    })
    if (!r.ok) {
      failed.push({ ...g, msg: r.msg })
      continue
    }
    totalOut += g.quantity
    success.push({ ...g, transactions: r.transactions?.length || 0 })
  }
  return { ok: failed.length === 0, totalOut, success, failed, projectName }
}

/* ------------------------------- 全局搜索 ------------------------------- */
export async function searchAll(kv, q, limit = 8) {
  const query = String(q || '').trim()
  if (!query) return { parts: [], locations: [], categories: [], total: 0 }
  const res = await listParts(kv, { search: query, pageSize: limit })
  const allLoc = await listLocations(kv)
  const allCat = await listCategories(kv)
  const lower = query.toLowerCase()
  const locations = allLoc
    .filter((l) => `${l.name} ${l.code || ''}`.toLowerCase().includes(lower))
    .slice(0, 6)
    .map((l) => ({ id: l.id, name: l.name, code: l.code || '', parentId: l.parentId }))
  const categories = allCat
    .filter((c) => c.name.toLowerCase().includes(lower))
    .slice(0, 6)
    .map((c) => ({ id: c.id, name: c.name, parentId: c.parentId }))
  return {
    parts: (res.list || []).map((p) => ({
      id: p.id, name: p.name, model: p.manufacturerModel || '', package: p.package || '',
      quantity: p.totalQuantity ?? 0, safetyStock: p.safetyStock || 0, categoryId: p.categoryId
    })),
    locations,
    categories,
    total: res.total || 0
  }
}
