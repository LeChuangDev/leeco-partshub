// shared/store.js
// 业务数据访问层：基于 KV 抽象实现全部 CRUD、索引维护、检索、库存出入与统计。
// 严格遵循需求中的键名命名规范：{业务前缀}:{唯一ID}，通过 index:* 前缀实现分类查询。
//
// 前缀定义：
//   meta:info                  系统元数据
//   category:{id}              分类
//   part:{id}                  元器件主数据
//   stock:{id}                 库存批次
//   location:{id}              存储位置
//   transaction:{id}           库存流水
//   index:categories           全量分类 ID 列表
//   index:parts                全量元器件 ID 列表
//   index:parts:cat:{catId}    某分类下元器件 ID 列表
//   index:parts:tag:{tag}      某标签下元器件 ID 列表
//   index:stock:part:{partId}  某元器件库存批次 ID 列表
//   index:locations            全量位置 ID 列表
//   index:transactions         全量流水 ID 列表
//   index:txn:part:{partId}    某元器件流水 ID 列表

import { kvGetJSON, kvPutJSON } from './kv.js'
import {
  newCategory, newPart, newStock, newLocation, newTransaction, nowISO
} from './models.js'
import {
  normalizePackage, normalizeParams, familyOfKey, parseSI,
  siVariants, eiaCode, expandSearchTokens, matchesTokens
} from './normalize.js'

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
  const next = arr.filter((x) => x !== id)
  if (next.length !== arr.length) await kvPutJSON(kv, key, next)
}

async function touchMeta(kv) {
  const meta = (await kvGetJSON(kv, 'meta:info')) || { version: 1 }
  meta.lastUpdated = nowISO()
  await kvPutJSON(kv, 'meta:info', meta)
}

/* ------------------------------- 分类 ------------------------------- */
export async function listCategories(kv) {
  const ids = await idxGet(kv, 'index:categories')
  const items = []
  for (const id of ids) {
    const c = await kvGetJSON(kv, `category:${id}`)
    if (c) items.push(c)
  }
  items.sort((a, b) => (a.order || 0) - (b.order || 0))
  return items
}

export async function getCategory(kv, id) {
  return kvGetJSON(kv, `category:${id}`)
}

export async function createCategory(kv, input) {
  const cat = newCategory(input)
  await kvPutJSON(kv, `category:${cat.id}`, cat)
  await idxAdd(kv, 'index:categories', cat.id)
  await touchMeta(kv)
  return cat
}

export async function updateCategory(kv, id, patch) {
  const cat = await kvGetJSON(kv, `category:${id}`)
  if (!cat) return null
  const allowed = ['name', 'parentId', 'order', 'paramTemplate']
  for (const k of allowed) {
    if (k in patch) cat[k] = patch[k]
  }
  cat.updatedAt = nowISO()
  await kvPutJSON(kv, `category:${id}`, cat)
  return cat
}

export async function deleteCategory(kv, id) {
  const cat = await kvGetJSON(kv, `category:${id}`)
  if (!cat) return { ok: false, msg: '分类不存在' }
  const all = await listCategories(kv)
  const children = all.filter((c) => c.parentId === id)
  const partsInCat = await idxGet(kv, `index:parts:cat:${id}`)
  if (partsInCat.length > 0) {
    return { ok: false, msg: `该分类下还有 ${partsInCat.length} 个元器件，请先移走或删除` }
  }
  // 有子分类则上移到当前分类的父级
  for (const child of children) {
    await updateCategory(kv, child.id, { parentId: cat.parentId })
  }
  await kv.del(`category:${id}`)
  await idxRemove(kv, 'index:categories', id)
  await touchMeta(kv)
  return { ok: true }
}

/* ------------------------------- 元器件主数据 ------------------------------- */
export async function listPartsRaw(kv) {
  const ids = await idxGet(kv, 'index:parts')
  const items = []
  for (const id of ids) {
    const p = await kvGetJSON(kv, `part:${id}`)
    if (p) items.push(p)
  }
  return items
}

export async function getPart(kv, id) {
  return kvGetJSON(kv, `part:${id}`)
}

export async function createPart(kv, input) {
  // 入库归一：封装统一为标准写法，参数统一为工程标准值（1000nF → 1µF）
  const normalized = {
    ...input,
    package: normalizePackage(input.package),
    params: normalizeParams(input.params || {})
  }
  const part = newPart(normalized)
  await kvPutJSON(kv, `part:${part.id}`, part)
  await idxAdd(kv, 'index:parts', part.id)
  if (part.categoryId) await idxAdd(kv, `index:parts:cat:${part.categoryId}`, part.id)
  for (const t of part.tags) await idxAdd(kv, `index:parts:tag:${t}`, part.id)
  await touchMeta(kv)
  return part
}

export async function updatePart(kv, id, patch) {
  const part = await kvGetJSON(kv, `part:${id}`)
  if (!part) return null
  const oldCat = part.categoryId
  const oldTags = part.tags || []
  const fields = [
    'internalNo', 'name', 'categoryId', 'package', 'description', 'brand',
    'manufacturerModel', 'alternates', 'suppliers', 'params', 'tags',
    'attachments', 'safetyStock'
  ]
  for (const f of fields) {
    if (f in patch) part[f] = patch[f]
  }
  if (typeof part.package === 'string') part.package = normalizePackage(part.package)
  if (part.params && typeof part.params === 'object') part.params = normalizeParams(part.params)
  part.updatedAt = nowISO()
  await kvPutJSON(kv, `part:${id}`, part)
  // 分类索引同步
  if (patch.categoryId !== undefined && patch.categoryId !== oldCat) {
    if (oldCat) await idxRemove(kv, `index:parts:cat:${oldCat}`, id)
    if (part.categoryId) await idxAdd(kv, `index:parts:cat:${part.categoryId}`, id)
  }
  // 标签索引同步
  const newTags = part.tags || []
  for (const t of oldTags) if (!newTags.includes(t)) await idxRemove(kv, `index:parts:tag:${t}`, id)
  for (const t of newTags) if (!oldTags.includes(t)) await idxAdd(kv, `index:parts:tag:${t}`, id)
  return part
}

export async function deletePart(kv, id) {
  const part = await kvGetJSON(kv, `part:${id}`)
  if (!part) return { ok: false, msg: '元器件不存在' }
  // 删除其库存批次
  const stockIds = await idxGet(kv, `index:stock:part:${id}`)
  for (const sid of stockIds) await kv.del(`stock:${sid}`)
  await kv.del(`index:stock:part:${id}`)
  // 从各索引移除
  await idxRemove(kv, 'index:parts', id)
  if (part.categoryId) await idxRemove(kv, `index:parts:cat:${part.categoryId}`, id)
  for (const t of part.tags || []) await idxRemove(kv, `index:parts:tag:${t}`, id)
  await kv.del(`part:${id}`)
  await touchMeta(kv)
  return { ok: true, removedStock: stockIds.length }
}

/* ------------------------------- 检索与筛选 ------------------------------- */
// 构建可检索文本：原始字段 + 参数归一化写法（10kΩ / 10000 / 103 都能命中）
function partSearchText(p, catName = '') {
  const parts = [
    p.name, p.internalNo, p.manufacturerModel, p.description, p.brand,
    p.package, normalizePackage(p.package), catName,
    (p.tags || []).join(' '),
    (p.suppliers || []).map((s) => `${s.platform} ${s.sku}`).join(' '),
    Object.values(p.params || {}).join(' ')
  ]
  for (const [k, v] of Object.entries(p.params || {})) {
    const fam = familyOfKey(k)
    if (!fam) continue
    const parsed = parseSI(v, fam)
    if (!parsed || !isFinite(parsed.value) || parsed.value <= 0) continue
    parts.push(...siVariants(parsed.value, fam))
    const code = eiaCode(parsed.value, fam)
    if (code) parts.push(code)
  }
  return parts.filter(Boolean).join(' ').toLowerCase()
}

export async function getCategoryDescendants(kv, rootId) {
  const all = await listCategories(kv)
  const result = new Set([rootId])
  let changed = true
  while (changed) {
    changed = false
    for (const c of all) {
      if (c.parentId && result.has(c.parentId) && !result.has(c.id)) {
        result.add(c.id)
        changed = true
      }
    }
  }
  return [...result]
}

export async function listParts(kv, opts = {}) {
  const { categoryId, tag, search, expr, page = 1, pageSize = 50, sort = 'updatedAt' } = opts
  let candidateIds = null
  if (categoryId) {
    const desc = await getCategoryDescendants(kv, categoryId)
    const set = new Set()
    for (const cid of desc) {
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
  const items = []
  for (const id of candidateIds) {
    const p = await kvGetJSON(kv, `part:${id}`)
    if (p) items.push(p)
  }
  // 文本检索 + 工程表达式：统一按 token 归一化匹配（1000nF 命中 1µF、103 命中 10k）
  const query = [search, expr].filter((x) => x && String(x).trim()).join(' ').trim()
  if (query) {
    const tokenGroups = expandSearchTokens(query)
    const catMap = new Map((await listCategories(kv)).map((c) => [c.id, c.name]))
    const filtered = []
    for (const p of items) {
      const text = partSearchText(p, catMap.get(p.categoryId) || '')
      if (matchesTokens(text, tokenGroups)) filtered.push(p)
    }
    items.length = 0
    items.push(...filtered)
  }
  // 排序
  items.sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name, 'zh')
    if (sort === 'createdAt') return (b.createdAt || '').localeCompare(a.createdAt || '')
    return (b.updatedAt || '').localeCompare(a.updatedAt || '')
  })
  const total = items.length
  const start = (page - 1) * pageSize
  const list = items.slice(start, start + pageSize)
  // 列表附带库存合计与批次（按需计算，可用 withQuantity:false 关闭以节省 KV 读）
  if (opts.withQuantity !== false) {
    await Promise.all(list.map(async (p) => {
      const batches = await listStock(kv, p.id)
      p.stocks = batches
      p.totalQuantity = batches.reduce((s, b) => s + (Number(b.quantity) || 0), 0)
    }))
  }
  return { total, page, pageSize, list }
}

/* ------------------------------- 库存批次 ------------------------------- */
export async function listStock(kv, partId) {
  const ids = await idxGet(kv, `index:stock:part:${partId}`)
  const items = []
  for (const id of ids) {
    const s = await kvGetJSON(kv, `stock:${id}`)
    if (s) items.push(s)
  }
  items.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''))
  return items
}

export async function getAllStock(kv) {
  // 用于统计：扫描 stock 索引代价较高，个人规模可接受；优化可改为维护总索引
  const ids = await idxGet(kv, 'index:stock:part:__all__').catch(() => [])
  const items = []
  for (const id of ids) {
    const s = await kvGetJSON(kv, `stock:${id}`)
    if (s) items.push(s)
  }
  return items
}

export async function createStock(kv, input) {
  const stock = newStock(input)
  await kvPutJSON(kv, `stock:${stock.id}`, stock)
  await idxAdd(kv, `index:stock:part:${stock.partId}`, stock.id)
  await touchMeta(kv)
  return stock
}

// 入库：创建批次 + 写流水
export async function stockIn(kv, partId, input) {
  const part = await getPart(kv, partId)
  if (!part) return { ok: false, msg: '元器件不存在' }
  const qty = Number(input.quantity)
  if (!isFinite(qty) || qty <= 0) return { ok: false, msg: '入库数量必须大于 0' }
  const price = Number(input.unitPrice)
  const stock = await createStock(kv, {
    ...input,
    partId,
    quantity: qty,
    unitPrice: isFinite(price) && price > 0 ? price : 0
  })
  const total = await partTotalQuantity(kv, partId)
  const txn = newTransaction({
    partId, stockId: stock.id, type: 'in', quantity: stock.quantity,
    balance: total, reason: input.reason || '入库', orderNo: stock.orderNo,
    note: stock.note || '', operator: input.operator || 'system'
  })
  await kvPutJSON(kv, `transaction:${txn.id}`, txn)
  await idxAdd(kv, 'index:transactions', txn.id)
  await idxAdd(kv, `index:txn:part:${partId}`, txn.id)
  await touchMeta(kv)
  return { ok: true, stock, transaction: txn }
}

// 出库：支持指定批次或跨批次 FIFO；写流水；更新 lastOutAt
export async function stockOut(kv, partId, input) {
  const part = await getPart(kv, partId)
  if (!part) return { ok: false, msg: '元器件不存在' }
  const need = input.quantity
  if (!need || need <= 0) return { ok: false, msg: '出库数量必须大于 0' }
  const total = await partTotalQuantity(kv, partId)
  if (total < need) return { ok: false, msg: `库存不足：现有 ${total}，需 ${need}` }

  let remaining = need
  const batches = await listStock(kv, partId)
  if (input.stockId) {
    batches.sort((a, b) => (a.id === input.stockId ? -1 : 1))
  } else {
    batches.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || '')) // FIFO
  }
  const txns = []
  for (const b of batches) {
    if (remaining <= 0) break
    if (b.quantity <= 0) continue
    const take = Math.min(b.quantity, remaining)
    b.quantity -= take
    b.lastOutAt = nowISO()
    await kvPutJSON(kv, `stock:${b.id}`, b)
    remaining -= take
    const balance = await partTotalQuantity(kv, partId)
    const txn = newTransaction({
      partId, stockId: b.id, type: 'out', quantity: take, balance,
      reason: input.reason || '出库', orderNo: input.orderNo || '',
      note: input.note || '', operator: input.operator || 'system',
      projectId: input.projectId || null, projectName: input.projectName || ''
    })
    await kvPutJSON(kv, `transaction:${txn.id}`, txn)
    await idxAdd(kv, 'index:transactions', txn.id)
    await idxAdd(kv, `index:txn:part:${partId}`, txn.id)
    txns.push(txn)
  }
  part.lastOutAt = nowISO()
  await kvPutJSON(kv, `part:${partId}`, part)
  await touchMeta(kv)
  return { ok: true, transactions: txns, remaining: 0 }
}

export async function partTotalQuantity(kv, partId) {
  const batches = await listStock(kv, partId)
  return batches.reduce((s, b) => s + (Number(b.quantity) || 0), 0)
}

// 移动库存位置：整颗料（全部批次）或指定批次迁移到目标位置。
// 只改批次归属，不产生出入库流水，库存数量保持不变。
export async function moveStock(kv, input = {}) {
  const partId = input.partId
  if (!partId) return { ok: false, msg: 'partId 必填' }
  const part = await getPart(kv, partId)
  if (!part) return { ok: false, msg: '元器件不存在' }

  const locationId = input.locationId || null
  if (locationId) {
    const loc = await kvGetJSON(kv, `location:${locationId}`)
    if (!loc) return { ok: false, msg: '目标位置不存在' }
  }

  const batches = await listStock(kv, partId)
  const targets = input.stockId ? batches.filter((b) => b.id === input.stockId) : batches
  if (!targets.length) return { ok: false, msg: input.stockId ? '库存批次不存在' : '该元器件还没有库存批次' }
  if (targets.every((b) => (b.locationId || null) === locationId)) {
    return { ok: true, moved: 0, unchanged: true, locationId, stockIds: targets.map((b) => b.id) }
  }

  const at = nowISO()
  for (const b of targets) {
    b.locationId = locationId
    b.updatedAt = at
    await kvPutJSON(kv, `stock:${b.id}`, b)
  }
  await touchMeta(kv)
  return { ok: true, moved: targets.length, locationId, stockIds: targets.map((b) => b.id) }
}

/* ------------------------------- 存储位置 ------------------------------- */
export async function listLocations(kv) {
  const ids = await idxGet(kv, 'index:locations')
  const items = []
  for (const id of ids) {
    const l = await kvGetJSON(kv, `location:${id}`)
    if (l) items.push(l)
  }
  return items
}

export async function createLocation(kv, input) {
  const loc = newLocation(input)
  await kvPutJSON(kv, `location:${loc.id}`, loc)
  await idxAdd(kv, 'index:locations', loc.id)
  await touchMeta(kv)
  return loc
}

export async function updateLocation(kv, id, patch) {
  const loc = await kvGetJSON(kv, `location:${id}`)
  if (!loc) return null
  const allowed = ['name', 'parentId', 'code', 'grid']
  for (const k of allowed) if (k in patch) loc[k] = patch[k]
  loc.updatedAt = nowISO()
  await kvPutJSON(kv, `location:${id}`, loc)
  return loc
}

export async function deleteLocation(kv, id) {
  const loc = await kvGetJSON(kv, `location:${id}`)
  if (!loc) return { ok: false, msg: '位置不存在' }
  const all = await listLocations(kv)
  const children = all.filter((l) => l.parentId === id)
  for (const c of children) await updateLocation(kv, c.id, { parentId: loc.parentId })
  // 解除引用该位置的库存批次
  // （位置被删后，批次 locationId 保留但指向不存在的位置；前台展示时回退显示）
  await kv.del(`location:${id}`)
  await idxRemove(kv, 'index:locations', id)
  await touchMeta(kv)
  return { ok: true }
}

/* ------------------------------- 流水 ------------------------------- */
export async function listTransactions(kv, partId, limit = 200) {
  let ids
  if (partId) ids = await idxGet(kv, `index:txn:part:${partId}`)
  else ids = await idxGet(kv, 'index:transactions')
  const items = []
  for (const id of ids) {
    const t = await kvGetJSON(kv, `transaction:${id}`)
    if (t) items.push(t)
  }
  items.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
  return items.slice(0, limit)
}

/* ------------------------------- 统计看板 ------------------------------- */
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

// 统计分布：返回 [{ name, value }]，按数量降序，空值归入「未填写」
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
  const catIds = await idxGet(kv, 'index:categories')
  const partIds = await idxGet(kv, 'index:parts')
  const locIds = await idxGet(kv, 'index:locations')
  const txnIds = await idxGet(kv, 'index:transactions')

  const categories = []
  for (const id of catIds) {
    const c = await kvGetJSON(kv, `category:${id}`)
    if (c) categories.push(c)
  }
  const catMap = Object.fromEntries(categories.map((c) => [c.id, c]))

  const parts = []
  for (const id of partIds) {
    const p = await kvGetJSON(kv, `part:${id}`)
    if (p) parts.push(p)
  }

  const transactions = []
  for (const id of txnIds) {
    const t = await kvGetJSON(kv, `transaction:${id}`)
    if (t) transactions.push(t)
  }

  let totalQuantity = 0
  let totalValue = 0
  const lowStock = [] // 低于安全库存
  const shortage = [] // 完全缺货
  const stale = []
  const now = Date.now()

  for (const p of parts) {
    const batches = await listStock(kv, p.id)
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
    locationsCount: locIds.length,
    transactionsCount: transactions.length,
    totalQuantity,
    totalValue: Math.round(totalValue * 100) / 100,
    lowStockCount: lowStock.length,
    shortageCount: shortage.length,
    shortage,
    lowStock,
    stale,
    projectsCount: 0, // 首版未含项目管理模块
    trend: buildTrend(transactions, period),
    byCategory: buildDistribution(parts, (p) => topLevelName(catMap, p.categoryId)),
    byBrand: buildDistribution(parts, (p) => p.brand),
    byPackage: buildDistribution(parts, (p) => p.package)
  }
}

/* ------------------------------- 导入匹配辅助 ------------------------------- */
export async function findPartBySupplier(kv, platform, sku) {
  if (!platform || !sku) return null
  const skuLower = String(sku).toLowerCase()
  const ids = await idxGet(kv, 'index:parts')
  for (const id of ids) {
    const p = await kvGetJSON(kv, `part:${id}`)
    if (!p) continue
    const hit = (p.suppliers || []).some(
      (s) => String(s.platform).toLowerCase() === String(platform).toLowerCase() && String(s.sku).toLowerCase() === skuLower
    )
    if (hit) return p
  }
  return null
}

export async function findPartByModelPackage(kv, model, pkg) {
  if (!model) return null
  const ids = await idxGet(kv, 'index:parts')
  for (const id of ids) {
    const p = await kvGetJSON(kv, `part:${id}`)
    if (!p) continue
    const modelHit = String(p.manufacturerModel || '').toLowerCase() === String(model).toLowerCase()
    const pkgHit = !pkg || String(p.package || '').toLowerCase() === String(pkg).toLowerCase()
    if (modelHit && pkgHit) return p
  }
  return null
}

export async function getMeta(kv) {
  return (await kvGetJSON(kv, 'meta:info')) || { version: 1 }
}

/* ------------------------------- 全量导出 ------------------------------- */
export async function exportAll(kv) {
  const cats = await listCategories(kv)
  const parts = await listPartsRaw(kv)
  const locs = await listLocations(kv)
  const stocks = []
  for (const p of parts) {
    const s = await listStock(kv, p.id)
    stocks.push(...s)
  }
  const txns = await listTransactions(kv, null, 100000)
  const meta = await getMeta(kv)
  // 项目与其 BOM 行一并备份，避免恢复后项目表丢失
  const projects = []
  const projectBoms = []
  const projectIds = (await kvGetJSON(kv, 'index:projects')) || []
  for (const pid of projectIds) {
    const p = await kvGetJSON(kv, `project:${pid}`)
    if (p) projects.push(p)
    const doc = await kvGetJSON(kv, `projectbom:${pid}`)
    if (doc) projectBoms.push(doc)
  }
  return {
    exportedAt: nowISO(),
    version: meta.version || 1,
    categories: cats,
    parts,
    stocks,
    locations: locs,
    transactions: txns,
    projects,
    projectBoms,
    meta
  }
}

/* 全量导入（备份恢复）：清空并写入 */
export async function importAll(kv, data) {
  // 简化实现：直接写入各记录并重建索引
  const rebuild = async (list, prefix, idxKey, idKey = 'id') => {
    await kv.del(idxKey)
    for (const item of list || []) {
      await kvPutJSON(kv, `${prefix}:${item[idKey]}`, item)
      await idxAdd(kv, idxKey, item[idKey])
    }
  }
  await rebuild(data.categories, 'category', 'index:categories')
  await rebuild(data.locations, 'location', 'index:locations')
  // parts 及其库存索引
  await kv.del('index:parts')
  for (const p of data.parts || []) {
    await kvPutJSON(kv, `part:${p.id}`, p)
    await idxAdd(kv, 'index:parts', p.id)
    if (p.categoryId) await idxAdd(kv, `index:parts:cat:${p.categoryId}`, p.id)
    for (const t of p.tags || []) await idxAdd(kv, `index:parts:tag:${t}`, p.id)
  }
  await kv.del('index:transactions')
  for (const t of data.transactions || []) {
    await kvPutJSON(kv, `transaction:${t.id}`, t)
    await idxAdd(kv, 'index:transactions', t.id)
    await idxAdd(kv, `index:txn:part:${t.partId}`, t.id)
  }
  // stocks 及其按 part 索引
  for (const p of data.parts || []) await kv.del(`index:stock:part:${p.id}`)
  for (const s of data.stocks || []) {
    await kvPutJSON(kv, `stock:${s.id}`, s)
    await idxAdd(kv, `index:stock:part:${s.partId}`, s.id)
  }
  // 项目与项目 BOM
  await kv.del('index:projects')
  for (const p of data.projects || []) {
    await kvPutJSON(kv, `project:${p.id}`, p)
    await idxAdd(kv, 'index:projects', p.id)
  }
  for (const doc of data.projectBoms || []) {
    if (doc && doc.projectId) await kvPutJSON(kv, `projectbom:${doc.projectId}`, doc)
  }
  await touchMeta(kv)
  return { ok: true, counts: { categories: (data.categories||[]).length, parts: (data.parts||[]).length, stocks: (data.stocks||[]).length, locations: (data.locations||[]).length, transactions: (data.transactions||[]).length, projects: (data.projects||[]).length } }
}
