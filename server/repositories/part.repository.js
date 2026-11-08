// server/repositories/part.repository.js
// 元器件主数据聚合：CRUD、分类/标签索引同步、供应商料号与原厂型号匹配。
// 库存数量不在此处计算——那是 stock 聚合的职责，由 application/catalog.service.js 组合。

import { kvGetJSON, kvPutJSON, KV_BATCH, mapLimit } from '../infrastructure/kv/index.js'
import { newPart, nowISO } from '../domain/models.js'
import { normalizeParams, normalizePackage } from '../domain/normalize.js'
import { idxAdd, idxGet, idxRemove, touchMeta } from './kv-index.js'

const INDEX = 'index:parts'

export async function listPartsRaw(kv) {
  const ids = await idxGet(kv, INDEX)
  const docs = await mapLimit(ids, KV_BATCH, (id) => kvGetJSON(kv, `part:${id}`))
  return docs.filter(Boolean)
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

/**
 * 批量导入等场景会逐行调用匹配：调用方可先 listPartsRaw 一次并传入 parts，
 * 避免每行都重新扫描整张主数据表。
 */
export async function findPartBySupplier(kv, platform, sku, parts = null) {
  if (!platform || !sku) return null
  const skuLower = String(sku).toLowerCase()
  const list = parts || (await listPartsRaw(kv))
  for (const p of list) {
    const hit = (p.suppliers || []).some(
      (s) => String(s.platform).toLowerCase() === String(platform).toLowerCase() && String(s.sku).toLowerCase() === skuLower
    )
    if (hit) return p
  }
  return null
}

export async function findPartByModelPackage(kv, model, pkg, parts = null) {
  if (!model) return null
  const list = parts || (await listPartsRaw(kv))
  const modelLower = String(model).toLowerCase()
  for (const p of list) {
    const modelHit = String(p.manufacturerModel || '').toLowerCase() === modelLower
    const pkgHit = !pkg || String(p.package || '').toLowerCase() === String(pkg).toLowerCase()
    if (modelHit && pkgHit) return p
  }
  return null
}
