// shared/project.js
// 项目 BOM：项目主数据 + BOM 行（单套用量）+ 齐套分析 + 按项目领料。
// 与「BOM 齐套」页共用 bom.js 的解析与匹配能力，区别是项目 BOM 会持久化，
// 并支持按「投产套数」换算总需求、跟踪项目状态与领料流水。

import { kvGetJSON, kvPutJSON } from './kv.js'
import * as store from './store.js'
import { newProject, newProjectLine, nowISO, PROJECT_STATUS } from './models.js'
import { matchBom, summarizeBom, parseBomText, normalizeBomRow } from './bom.js'

const IDX = 'index:projects'
const docKey = (id) => `projectbom:${id}`

export const STATUS_LABEL = {
  design: '设计中',
  sample: '打样',
  pilot: '小批试产',
  mass: '量产',
  archived: '已归档'
}

/* ------------------------------- 索引辅助 ------------------------------- */
async function idxGet(kv, key) {
  const v = await kvGetJSON(kv, key)
  return Array.isArray(v) ? v : []
}
async function idxAdd(kv, key, id) {
  const arr = await idxGet(kv, key)
  if (!arr.includes(id)) {
    arr.push(id)
    await kvPutJSON(kv, key, arr)
  }
}
async function idxRemove(kv, key, id) {
  const arr = await idxGet(kv, key)
  await kvPutJSON(kv, key, arr.filter((x) => x !== id))
}

/* ------------------------------- 项目 CRUD ------------------------------- */
export async function listProjects(kv) {
  const ids = await idxGet(kv, IDX)
  const items = []
  for (const id of ids) {
    const p = await kvGetJSON(kv, `project:${id}`)
    if (p) items.push(p)
  }
  return items.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
}

export async function getProject(kv, id) {
  return kvGetJSON(kv, `project:${id}`)
}

export async function getProjectDoc(kv, id) {
  const project = await getProject(kv, id)
  if (!project) return null
  const doc = (await kvGetJSON(kv, docKey(id))) || {}
  return { project, lines: Array.isArray(doc.lines) ? doc.lines : [] }
}

export async function createProject(kv, input = {}) {
  if (!String(input.name || '').trim()) return { ok: false, msg: '项目名称必填' }
  const project = newProject({ ...input, name: String(input.name).trim() })
  await kvPutJSON(kv, `project:${project.id}`, project)
  await idxAdd(kv, IDX, project.id)
  let lines = []
  if (Array.isArray(input.lines) && input.lines.length) {
    const saved = await saveProjectLines(kv, project.id, input.lines)
    lines = saved.lines
    project.lineCount = lines.length
    await kvPutJSON(kv, `project:${project.id}`, project)
  }
  return { ok: true, project, lines }
}

export async function updateProject(kv, id, patch = {}) {
  const project = await getProject(kv, id)
  if (!project) return { ok: false, msg: '项目不存在' }
  const fields = ['name', 'code', 'version', 'status', 'owner', 'note']
  for (const f of fields) {
    if (patch[f] !== undefined) project[f] = String(patch[f] ?? '')
  }
  if (patch.status !== undefined && !PROJECT_STATUS.includes(project.status)) {
    project.status = 'design'
  }
  if (patch.buildQty !== undefined) {
    const n = Number(patch.buildQty)
    project.buildQty = Number.isFinite(n) && n > 0 ? Math.ceil(n) : 1
  }
  project.updatedAt = nowISO()
  await kvPutJSON(kv, `project:${id}`, project)
  return { ok: true, project }
}

export async function deleteProject(kv, id) {
  const project = await getProject(kv, id)
  if (!project) return { ok: false, msg: '项目不存在' }
  await kv.del(`project:${id}`)
  await kv.del(docKey(id))
  await idxRemove(kv, IDX, id)
  return { ok: true }
}

/* ------------------------------- BOM 行保存 ------------------------------- */
function toBomRow(line) {
  return {
    designators: line.designators,
    model: line.model || line.partModel || '',
    name: line.name || line.partName || '',
    package: line.package || line.partPackage || '',
    quantity: line.quantity,
    note: line.note
  }
}

/**
 * 覆盖保存项目 BOM。
 * 未绑定 partId 的行会尝试用型号/名称/封装匹配库存已有器件；匹配不到保留原样（待建档）。
 */
export async function saveProjectLines(kv, projectId, rawLines = [], opts = {}) {
  const project = await getProject(kv, projectId)
  if (!project) return { ok: false, msg: '项目不存在' }

  const base = rawLines
    .map((l) => ({ ...l }))
    .filter((l) => l && (l.partId || l.model || l.name || l.designators))

  // 未绑定器件的行批量匹配（一次加载库存，避免逐行扫描）
  if (!opts.skipMatch) {
    const pending = base.filter((l) => !l.partId && (l.model || l.name))
    if (pending.length) {
      const matched = await matchBom(kv, pending.map(toBomRow))
      let cursor = 0
      for (const l of base) {
        if (l.partId || !(l.model || l.name)) continue
        const m = matched.lines[cursor++]
        if (m && m.partId) {
          l.partId = m.partId
          l.model = l.model || m.partModel
          l.name = l.name || m.partName
          l.package = l.package || m.partPackage
        }
      }
    }
  }

  // 补齐器件快照字段
  const parts = await store.listPartsRaw(kv)
  const byId = new Map(parts.map((p) => [p.id, p]))
  const lines = base.map((l) => {
    const part = l.partId ? byId.get(l.partId) : null
    const line = newProjectLine({
      partId: part ? part.id : null,
      designators: normalizeDesignators(l.designators),
      model: String(l.model || (part && part.manufacturerModel) || ''),
      name: String(l.name || (part && part.name) || ''),
      package: String(l.package || (part && part.package) || ''),
      quantity: l.quantity,
      note: String(l.note || '')
    })
    if (l.id) line.id = l.id
    return line
  })

  const now = nowISO()
  await kvPutJSON(kv, docKey(projectId), { projectId, lines, updatedAt: now })
  project.lineCount = lines.length
  project.updatedAt = now
  await kvPutJSON(kv, `project:${projectId}`, project)
  return { ok: true, lines, lineCount: lines.length }
}

function normalizeDesignators(v) {
  return String(v || '')
    .replace(/[，、;；]/g, ',')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .join(',')
}

/* ------------------------------- 文本导入 ------------------------------- */
/**
 * 从粘贴文本或原始行导入项目 BOM。
 * @param {'replace'|'append'} mode replace 覆盖 / append 追并（按 partId + 位号去重）
 */
export async function importProjectBom(kv, projectId, opts = {}) {
  const project = await getProject(kv, projectId)
  if (!project) return { ok: false, msg: '项目不存在' }

  let rows = []
  let headerDetected = false
  let skipped = 0
  if (typeof opts.text === 'string' && opts.text.trim()) {
    const parsed = parseBomText(opts.text)
    rows = parsed.rows
    headerDetected = parsed.headerDetected
    skipped = parsed.skipped
  } else if (Array.isArray(opts.rows)) {
    rows = opts.rows.map((r, i) => normalizeBomRow(r, i + 1))
  }
  if (!rows.length) return { ok: false, msg: '没有解析到有效的 BOM 行' }
  if (rows.length > 2000) return { ok: false, msg: '单次最多导入 2000 行' }

  const matched = await matchBom(kv, rows)
  const incoming = matched.lines.map((l) => ({
    partId: l.partId,
    designators: l.designators,
    model: l.model || l.partModel,
    name: l.name || l.partName,
    package: l.package || l.partPackage,
    quantity: l.required,
    note: l.note
  }))

  let lines = incoming
  if (opts.mode === 'append') {
    const doc = await getProjectDoc(kv, projectId)
    const seen = new Set((doc.lines || []).map((l) => `${l.partId || ''}|${l.designators || ''}`))
    const merged = (doc.lines || []).slice()
    for (const l of incoming) {
      const key = `${l.partId || ''}|${l.designators || ''}`
      if (l.partId && seen.has(key)) {
        // 同器件同位号：累加用量
        const hit = merged.find((x) => `${x.partId || ''}|${x.designators || ''}` === key)
        if (hit) hit.quantity = Number(hit.quantity || 0) + Number(l.quantity || 0)
        continue
      }
      seen.add(key)
      merged.push(l)
    }
    lines = merged
  }

  const saved = await saveProjectLines(kv, projectId, lines, { skipMatch: true })
  const analysis = await analyzeProject(kv, projectId, { buildQty: opts.buildQty })
  return {
    ok: true,
    imported: incoming.length,
    headerDetected,
    skipped,
    lines: saved.lines,
    analysis
  }
}

/* ------------------------------- 齐套分析 ------------------------------- */
/**
 * 项目齐套分析：需求 = 单套用量 × 套数；逐行给出库存、缺口与库位提示。
 */
export async function analyzeProject(kv, projectId, opts = {}) {
  const doc = await getProjectDoc(kv, projectId)
  if (!doc) return null
  const { project, lines } = doc
  const rawQty = Number(opts.buildQty ?? project.buildQty)
  const multiple = Number.isFinite(rawQty) && rawQty > 0
    ? Math.ceil(rawQty)
    : Math.max(1, Math.ceil(Number(project.buildQty) || 1))

  const parts = await store.listPartsRaw(kv)
  const byId = new Map(parts.map((p) => [p.id, p]))
  const locations = await store.listLocations(kv)
  const locById = new Map(locations.map((l) => [l.id, l]))
  const pathOf = (id) => {
    const names = []
    let cur = locById.get(id)
    let guard = 0
    while (cur && guard++ < 12) {
      names.unshift(cur.name)
      cur = cur.parentId ? locById.get(cur.parentId) : null
    }
    return names.join(' / ')
  }

  // 批量读取库存
  const stockMap = new Map()
  const CHUNK = 24
  const ids = [...new Set(lines.map((l) => l.partId).filter(Boolean))]
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK)
    await Promise.all(slice.map(async (pid) => {
      stockMap.set(pid, await store.listStock(kv, pid))
    }))
  }
  const qtyOf = (pid) => (stockMap.get(pid) || []).reduce((s, b) => s + (Number(b.quantity) || 0), 0)

  const out = lines.map((l) => {
    const part = l.partId ? byId.get(l.partId) : null
    const required = Math.max(0, Number(l.quantity) || 0) * multiple
    const available = part ? qtyOf(l.partId) : 0
    const shortage = Math.max(0, required - available)
    const batches = (part && stockMap.get(l.partId)) || []
    const locAgg = new Map()
    for (const b of batches) {
      const qty = Number(b.quantity) || 0
      if (qty <= 0 || !b.locationId) continue
      locAgg.set(b.locationId, (locAgg.get(b.locationId) || 0) + qty)
    }
    return {
      ...l,
      lineId: l.id,
      partId: part ? l.partId : null,
      partName: part ? part.name : l.name,
      partModel: part ? (part.manufacturerModel || '') : l.model,
      partPackage: part ? (part.package || '') : l.package,
      unit: '个',
      multiple,
      required,
      available,
      shortage,
      status: !part ? 'unlinked' : available >= required ? 'ok' : available > 0 ? 'short' : 'empty',
      locations: [...locAgg.entries()].map(([id, qty]) => ({ id, path: pathOf(id) || '未命名位置', quantity: qty }))
        .sort((a, b) => b.quantity - a.quantity)
    }
  })

  const summary = summarizeBom(out)
  summary.multiple = multiple
  summary.unlinkedLines = out.filter((l) => l.status === 'unlinked').length
  summary.buildQty = multiple
  return { project, lines: out, summary, buildQty: multiple }
}

/* ------------------------------- 项目领料 ------------------------------- */
/**
 * 按项目齐套结果出库。仅对库存充足的行出库，不足与未建档行原样回报。
 */
export async function consumeProject(kv, projectId, opts = {}) {
  const analysis = await analyzeProject(kv, projectId, { buildQty: opts.buildQty })
  if (!analysis) return { ok: false, msg: '项目不存在' }
  const { project } = analysis
  const operator = String(opts.operator || 'project')

  const grouped = new Map()
  const failed = []
  for (const l of analysis.lines) {
    if (!l.partId) {
      failed.push({ partId: null, name: l.partName || l.name, model: l.partModel, quantity: l.required, msg: '未绑定器件' })
      continue
    }
    if (l.status !== 'ok') {
      failed.push({
        partId: l.partId, name: l.partName, model: l.partModel,
        quantity: l.required, shortage: l.shortage,
        msg: l.status === 'empty' ? '库存为零' : `库存不足，缺 ${l.shortage}`
      })
      continue
    }
    const cur = grouped.get(l.partId) || { partId: l.partId, name: l.partName, model: l.partModel, quantity: 0, designators: [] }
    cur.quantity += l.required
    if (l.designators) cur.designators.push(l.designators)
    grouped.set(l.partId, cur)
  }

  if (!grouped.size) {
    return { ok: false, msg: '没有可出库的行，请先补齐库存', totalOut: 0, success: [], failed, projectName: project.name }
  }

  const success = []
  let totalOut = 0
  for (const g of grouped.values()) {
    const r = await store.stockOut(kv, g.partId, {
      quantity: g.quantity,
      reason: `项目领料 · ${project.name}`,
      operator,
      note: g.designators.join(','),
      projectId: project.id,
      projectName: project.name
    })
    if (!r.ok) {
      failed.push({ ...g, msg: r.msg })
      continue
    }
    totalOut += g.quantity
    success.push({ ...g, transactions: r.transactions?.length || 0 })
  }

  if (success.length) {
    project.lastConsumedAt = nowISO()
    project.updatedAt = project.lastConsumedAt
    await kvPutJSON(kv, `project:${project.id}`, project)
  }
  return {
    ok: failed.length === 0,
    totalOut,
    success,
    failed,
    projectName: project.name,
    partial: success.length > 0 && failed.length > 0
  }
}
