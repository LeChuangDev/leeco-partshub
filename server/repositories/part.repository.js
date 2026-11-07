// server/repositories/part.repository.js
// 元器件主数据聚合：CRUD、分类/标签索引同步、供应商料号与原厂型号匹配。
// 库存数量不在此处计算——那是 stock 聚合的职责，由 application/catalog.service.js 组合。

import { kvGetJSON, kvPutJSON } from '../infrastructure/kv/index.js'
import { newPart, nowISO } from '../domain/models.js'
import { normalizeParams, normalizePackage } from '../domain/normalize.js'
import { idxAdd, idxGet, idxRemove, touchMeta } from './kv-index.js'

const INDEX = 'index:parts'

export async function listPartsRaw(kv) {
  const ids = await idxGet(kv, INDEX)
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
  await idxAdd(kv, INDEX, part.id)
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
  // 级联删除库存批次，避免留下孤儿批次被统计读到
  const stockIds = await idxGet(kv, `index:stock:part:${id}`)
  for (const sid of stockIds) await kv.del(`stock:${sid}`)
  await kv.del(`index:stock:part:${id}`)
  await idxRemove(kv, INDEX, id)
  if (part.categoryId) await idxRemove(kv, `index:parts:cat:${part.categoryId}`, id)
  for (const t of part.tags || []) await idxRemove(kv, `index:parts:tag:${t}`, id)
  await kv.del(`part:${id}`)
  await touchMeta(kv)
  return { ok: true, removedStock: stockIds.length }
}

export async function findPartBySupplier(kv, platform, sku) {
  if (!platform || !sku) return null
  const skuLower = String(sku).toLowerCase()
  const ids = await idxGet(kv, INDEX)
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
  const ids = await idxGet(kv, INDEX)
  for (const id of ids) {
    const p = await kvGetJSON(kv, `part:${id}`)
    if (!p) continue
    const modelHit = String(p.manufacturerModel || '').toLowerCase() === String(model).toLowerCase()
    const pkgHit = !pkg || String(p.package || '').toLowerCase() === String(pkg).toLowerCase()
    if (modelHit && pkgHit) return p
  }
  return null
}
