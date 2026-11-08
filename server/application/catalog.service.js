// server/application/catalog.service.js
// 元器件查询用例：分类/标签/关键词/工程表达式筛选 + 库存合计。
// 组合 part、category、stock 三个仓储，仓储之间不互相依赖。

import { kvGetJSON, KV_BATCH, mapLimit } from '../infrastructure/kv/index.js'
import {
  eiaCode, expandSearchTokens, familyOfKey, matchesTokens,
  normalizePackage, parseSI, siVariants
} from '../domain/normalize.js'
import { getCategoryDescendants, listCategories } from '../repositories/category.repository.js'
import { idxGet } from '../repositories/kv-index.js'
import { listStock } from '../repositories/stock.repository.js'

// 构建可检索文本：原始字段 + 参数归一化写法（10kΩ / 10000 / 103 都能命中）
function buildPartSearchText(part, categoryName = '') {
  const pieces = [
    part.name, part.internalNo, part.manufacturerModel, part.description, part.brand,
    part.package, normalizePackage(part.package), categoryName,
    (part.tags || []).join(' '),
    (part.suppliers || []).map((s) => `${s.platform} ${s.sku}`).join(' '),
    Object.values(part.params || {}).join(' ')
  ]
  for (const [key, value] of Object.entries(part.params || {})) {
    const family = familyOfKey(key)
    if (!family) continue
    const parsed = parseSI(value, family)
    if (!parsed || !isFinite(parsed.value) || parsed.value <= 0) continue
    pieces.push(...siVariants(parsed.value, family))
    const code = eiaCode(parsed.value, family)
    if (code) pieces.push(code)
  }
  return pieces.filter(Boolean).join(' ').toLowerCase()
}

export async function listParts(kv, opts = {}) {
  const { categoryId, tag, search, expr, page = 1, pageSize = 50, sort = 'updatedAt' } = opts
  let candidateIds = null
  if (categoryId) {
    const descendants = await getCategoryDescendants(kv, categoryId)
    const set = new Set()
    for (const cid of descendants) {
      for (const pid of await idxGet(kv, `index:parts:cat:${cid}`)) set.add(pid)
    }
    candidateIds = set
  }
  if (tag) {
    const tagSet = new Set(await idxGet(kv, `index:parts:tag:${tag}`))
    candidateIds = candidateIds ? new Set([...candidateIds].filter((x) => tagSet.has(x))) : tagSet
  }
  if (candidateIds === null) {
    candidateIds = new Set(await idxGet(kv, 'index:parts'))
  }
  const docs = await mapLimit([...candidateIds], KV_BATCH, (id) => kvGetJSON(kv, `part:${id}`))
  const items = docs.filter(Boolean)
  // 文本检索 + 工程表达式：统一按 token 归一化匹配（1000nF 命中 1µF、103 命中 10k）
  const query = [search, expr].filter((x) => x && String(x).trim()).join(' ').trim()
  if (query) {
    const tokenGroups = expandSearchTokens(query)
    const catMap = new Map((await listCategories(kv)).map((c) => [c.id, c.name]))
    const filtered = []
    for (const p of items) {
      const text = buildPartSearchText(p, catMap.get(p.categoryId) || '')
      if (matchesTokens(text, tokenGroups)) filtered.push(p)
    }
    items.length = 0
    items.push(...filtered)
  }
  items.sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name, 'zh')
    if (sort === 'createdAt') return (b.createdAt || '').localeCompare(a.createdAt || '')
    return (b.updatedAt || '').localeCompare(a.updatedAt || '')
  })
  const total = items.length
  const start = (page - 1) * pageSize
  const list = items.slice(start, start + pageSize)
  // 列表附带库存合计与批次（可用 withQuantity:false 关闭以节省 KV 读）
  if (opts.withQuantity !== false) {
    await mapLimit(list, KV_BATCH, async (p) => {
      const batches = await listStock(kv, p.id)
      p.stocks = batches
      p.totalQuantity = batches.reduce((s, b) => s + (Number(b.quantity) || 0), 0)
    })
  }
  return { total, page, pageSize, list }
}
