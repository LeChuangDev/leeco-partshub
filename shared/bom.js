// shared/bom.js
// BOM 齐套分析：文本/表格解析 → 行归一 → 与库存匹配（型号/料号/封装/名称多级）→ 缺口汇总 → 一键出库。
// 纯逻辑，不依赖运行环境；前端粘贴解析与后端匹配共用同一套归一规则。

import { kvGetJSON } from './kv.js'
import * as store from './store.js'
import { cleanName, normalizePackage, expandSearchTokens, matchesTokens } from './normalize.js'

/* ------------------------------- 表头识别 ------------------------------- */
// 别名全部小写、去空白与常见分隔符后比较
const HEADER_ALIASES = {
  designators: [
    '位号', '位号列表', '元件位号', '元件标号', '标号', '位置号', 'designator', 'designators',
    'refdes', 'ref', 'refs', 'reference', 'references', 'part ref', 'component'
  ],
  model: [
    '型号', '规格型号', '厂家型号', '制造商型号', '厂商型号', '物料型号', '料号', '物料编码',
    'mpn', 'mfrpart', 'mfr part', 'partnumber', 'part number', 'partno', 'part no', 'pn',
    'model', 'model no', 'manufacturer part', 'manufacturerpart'
  ],
  name: [
    '名称', '器件名称', '物料名称', '描述', '元件描述', '规格', '值', '参数',
    'name', 'description', 'desc', 'comment', 'value', 'val'
  ],
  package: [
    '封装', '封装规格', '封装形式', 'footprint', 'package', 'case', 'case package', 'pcb footprint'
  ],
  quantity: [
    '数量', '用量', '单板用量', '需求数量', 'qty', 'quantity', 'pcs', 'count', 'amount'
  ],
  sku: [
    '商品编号', '商品料号', '立创编号', '立创料号', '供应商料号', '渠道料号',
    'sku', 'lcsc', 'lcsc part', 'lcsc part #', 'supplier part', 'supplierpart', 'supplier sku'
  ],
  note: ['备注', '说明', 'note', 'notes', 'remark', 'remarks', 'memo']
}

const HEADER_LOOKUP = (() => {
  const m = new Map()
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    for (const a of aliases) m.set(normHeader(a), field)
  }
  return m
})()

function normHeader(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[\s_\-./#()[\]（）【】:：]/g, '')
    .trim()
}

function pickField(cell) {
  const key = normHeader(cell)
  if (!key) return null
  if (HEADER_LOOKUP.has(key)) return HEADER_LOOKUP.get(key)
  // 宽松匹配：表头里带关键词（如「元件型号(MPN)」）
  for (const [alias, field] of HEADER_LOOKUP) {
    if (alias.length >= 3 && key.includes(alias)) return field
  }
  return null
}

/* ------------------------------- 文本解析 ------------------------------- */
// 按行解析 CSV（支持双引号包裹与转义）
function splitCSVLine(line) {
  const out = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++ } else quoted = false
      } else cur += ch
    } else if (ch === '"') {
      quoted = true
    } else if (ch === ',') {
      out.push(cur.trim()); cur = ''
    } else cur += ch
  }
  out.push(cur.trim())
  return out
}

function splitLine(line) {
  if (line.includes('\t')) return line.split('\t').map((s) => s.trim())
  if (line.includes(',')) return splitCSVLine(line)
  if (line.includes(';')) return line.split(';').map((s) => s.trim())
  if (line.includes('|')) return line.split('|').map((s) => s.trim())
  // 兜底：两个以上空格视为分列（保留「10 kΩ 1%」这类单空格内容）
  return line.split(/\s{2,}/).map((s) => s.trim())
}

function looksNumeric(s) {
  return /^\d+(\.\d+)?$/.test(String(s || '').trim())
}

/**
 * 解析粘贴的 BOM 文本。
 * @returns {{ rows: object[], headerDetected: boolean, fields: string[], skipped: number }}
 */
export function parseBomText(text) {
  const raw = String(text || '').replace(/\r\n?/g, '\n')
  const lines = raw.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
  if (!lines.length) return { rows: [], headerDetected: false, fields: [], skipped: 0 }

  const firstCells = splitLine(lines[0])
  const firstMap = firstCells.map(pickField)
  const hitCount = firstMap.filter(Boolean).length
  // 首行至少命中 2 个已知表头，或命中「型号/名称」且另一列是数量，才认为是表头
  const headerDetected = hitCount >= 2 && (firstMap.includes('model') || firstMap.includes('name') || firstMap.includes('designators'))

  let rows = []
  let skipped = 0

  if (headerDetected) {
    const fields = firstMap
    for (let i = 1; i < lines.length; i++) {
      const cells = splitLine(lines[i])
      const row = {}
      cells.forEach((c, idx) => {
        const f = fields[idx]
        if (f && c !== '' && row[f] === undefined) row[f] = c
      })
      if (!row.model && !row.name) { skipped++; continue }
      rows.push(row)
    }
  } else {
    // 无表头：按列数推断 [位号, 型号, 封装, 数量] / [型号, 封装, 数量] / [型号, 数量]
    for (const line of lines) {
      const cells = splitLine(line)
      if (!cells.length) continue
      let row = {}
      const numericIdx = cells.map((c, i) => (looksNumeric(c) ? i : -1)).filter((i) => i > 0)
      const qtyIdx = numericIdx.length ? numericIdx[numericIdx.length - 1] : -1
      if (cells.length >= 4) {
        row = { designators: cells[0], model: cells[1], package: cells[2], quantity: qtyIdx > 0 ? cells[qtyIdx] : '1' }
      } else if (cells.length === 3) {
        if (qtyIdx === 2) row = { designators: cells[0], model: cells[1], quantity: cells[2] }
        else row = { model: cells[0], package: cells[1], quantity: cells[2] }
      } else if (cells.length === 2) {
        row = qtyIdx === 1 ? { model: cells[0], quantity: cells[1] } : { designators: cells[0], model: cells[1], quantity: '1' }
      } else {
        row = { model: cells[0], quantity: '1' }
      }
      if (!row.model) { skipped++; continue }
      rows.push(row)
    }
  }

  const normalized = rows.map((r, i) => normalizeBomRow(r, i + 1)).filter((r) => r.model || r.name)
  return {
    rows: normalized,
    headerDetected,
    fields: headerDetected ? firstMap.filter(Boolean) : [],
    skipped
  }
}

/** 单行归一：数量取正整数，封装标准写法，型号去掉多余空白 */
export function normalizeBomRow(row = {}, lineNo = 0) {
  const model = String(row.model || row.mpn || '').replace(/\s+/g, ' ').trim()
  const name = String(row.name || row.description || '').trim()
  const designators = String(row.designators || row.ref || row.reference || '')
    .replace(/[，、]/g, ',')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .join(',')
  const pkg = normalizePackage(row.package || row.footprint || '')
  let qty = Number(row.quantity ?? row.qty ?? row.required ?? 1)
  if (!isFinite(qty) || qty <= 0) qty = 1
  qty = Math.ceil(qty)
  return {
    lineNo: lineNo || Number(row.lineNo) || 0,
    designators,
    model,
    name,
    package: pkg || '',
    required: qty,
    sku: String(row.sku || '').trim(),
    platform: String(row.platform || '').trim(),
    note: String(row.note || '').trim()
  }
}

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
  const parts = await store.listPartsRaw(kv)
  const locations = await store.listLocations(kv)
  const { pathOf } = buildLocationIndex(locations)

  // 批量读取库存（分批并发，避免一次打爆 KV）
  const batchesByPart = new Map()
  const CHUNK = 24
  for (let i = 0; i < parts.length; i += CHUNK) {
    const slice = parts.slice(i, i + CHUNK)
    await Promise.all(slice.map(async (p) => {
      const batches = await store.listStock(kv, p.id)
      batchesByPart.set(p.id, batches)
    }))
  }
  const qtyOf = (partId) => (batchesByPart.get(partId) || []).reduce((s, b) => s + (Number(b.quantity) || 0), 0)

  const lines = rows.map((row) => {
    const scored = parts
      .map((p) => ({ p, score: scorePart(p, row) }))
      .filter((x) => x.score >= SCORE.fuzzy)
      .sort((a, b) => b.score - a.score)

    const best = scored[0]
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
      result.candidates = fuzzyCandidates(parts, row).map((p) => ({
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

export function summarizeBom(lines = []) {
  const matched = lines.filter((l) => l.partId)
  const kindSet = new Set(matched.map((l) => l.partId))
  const sum = (arr, key) => arr.reduce((s, x) => s + (Number(x[key]) || 0), 0)
  const requiredQty = sum(lines, 'required')
  const shortageQty = sum(lines, 'shortage')
  const readyQty = lines.reduce((s, l) => s + Math.min(Number(l.required) || 0, Number(l.available) || 0), 0)
  return {
    lineCount: lines.length,
    partKinds: kindSet.size,
    matchedLines: matched.length,
    missingLines: lines.length - matched.length,
    okLines: lines.filter((l) => l.status === 'ok').length,
    shortLines: lines.filter((l) => l.status === 'short').length,
    emptyLines: lines.filter((l) => l.status === 'empty').length,
    requiredQty,
    shortageQty,
    readyQty,
    coverage: lines.length ? Math.round((matched.length / lines.length) * 100) : 0,
    completeness: requiredQty ? Math.round((readyQty / requiredQty) * 100) : 0
  }
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
    const r = await store.stockOut(kv, g.partId, {
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
  const res = await store.listParts(kv, { search: query, pageSize: limit })
  const allLoc = await store.listLocations(kv)
  const allCat = await store.listCategories(kv)
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
