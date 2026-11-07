// shared/import.js
// 服务器端导入逻辑：根据归一化行做多级去重匹配，生成导入计划（预览），再提交写入。
// 匹配优先级：① 平台料号精确 → ② 原厂型号 + 封装 → ③ 参数 + 封装（疑似重复，提示用户确认）

import {
  findPartBySupplier, findPartByModelPackage, createPart, stockIn, listPartsRaw, listCategories
} from './store.js'
import {
  normalizePackage, normalizeParams, familyOfKey, parseSI,
  extractFromText, guessCategoryName
} from './normalize.js'
import { PLATFORM_SHORT } from './import-map.js'

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
export async function commitImport(kv, items, opts = {}) {
  const operator = opts.operator || 'import'
  const created = []
  const matched = []
  const errors = []
  for (const it of items) {
    if (it.action === 'skip') continue
    const locId = it.locationId || opts.locationId || null
    const orderNo = it.row?.orderNo || opts.orderNo || ''
    const supplier = PLATFORM_SHORT[it.row?.platform] || it.row?.platform || ''
    const unitPrice = Number(it.row?.unitPrice) || 0
    const quantity = Number(it.row?.quantity) || 0
    try {
      if (it.action === 'match' && it.partId) {
        await stockIn(kv, it.partId, { locationId: locId, quantity, unitPrice, supplier, orderNo, operator })
        matched.push(it.partId)
      } else if (it.action === 'create') {
        const part = await createPart(kv, { ...(it.partData || {}), categoryId: it.categoryId || it.partData?.categoryId || null })
        await stockIn(kv, part.id, { locationId: locId, quantity, unitPrice, supplier, orderNo, operator })
        created.push(part.id)
      }
    } catch (e) {
      errors.push({ index: it.index, msg: String(e && e.message || e) })
    }
  }
  return { ok: errors.length === 0, created, matched, errors, summary: { created: created.length, matched: matched.length, errors: errors.length } }
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
