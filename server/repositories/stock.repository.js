// server/repositories/stock.repository.js
// 库存批次聚合：批次持久化、按元器件汇总、位置迁移。
// 出入库属于跨聚合用例（批次 + 流水 + 主数据回写），放在 application/stock.service.js。

import { kvGetJSON, kvPutJSON, KV_BATCH, mapLimit } from '../infrastructure/kv/index.js'
import { newStock, nowISO } from '../domain/models.js'
import { idxAdd, idxGet, touchMeta } from './kv-index.js'
import { getPart } from './part.repository.js'

export async function listStock(kv, partId) {
  const ids = await idxGet(kv, `index:stock:part:${partId}`)
  const docs = await mapLimit(ids, KV_BATCH, (id) => kvGetJSON(kv, `stock:${id}`))
  const items = docs.filter(Boolean)
  items.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''))
  return items
}

/** 统计用全量批次；个人规模下逐条读取可接受，超大库应改为维护总索引 */
export async function getAllStock(kv) {
  const ids = await idxGet(kv, 'index:stock:part:__all__').catch(() => [])
  const docs = await mapLimit(ids, KV_BATCH, (id) => kvGetJSON(kv, `stock:${id}`))
  return docs.filter(Boolean)
}

export async function createStock(kv, input) {
  const stock = newStock(input)
  await kvPutJSON(kv, `stock:${stock.id}`, stock)
  await idxAdd(kv, `index:stock:part:${stock.partId}`, stock.id)
  await touchMeta(kv)
  return stock
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
