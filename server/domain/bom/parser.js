// server/domain/bom/parser.js
// BOM 文本/表格解析与行归一（纯函数）。
// 前端粘贴预览与服务端匹配共用同一套规则，不依赖 KV、HTTP 或任何运行环境。

import { normalizePackage } from '../normalize.js'

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
