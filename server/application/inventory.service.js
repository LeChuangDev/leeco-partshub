// server/application/inventory.service.js
// 库存位置迁移用例：复用仓储的批次移动，并补充审计事件。
// 移动不改变数量、不产生出入库流水，但必须留下可回溯的位置变更记录。

import { getPart } from '../repositories/part.repository.js'
import { getLocation } from '../repositories/location.repository.js'
import { moveStock as moveStockRecords } from '../repositories/stock.repository.js'
import { appendAudit } from '../repositories/audit.repository.js'
import { normalizeSource } from '../domain/audit.js'

export async function moveStock(kv, input = {}) {
  const result = await moveStockRecords(kv, input)
  if (!result.ok || !result.moved) return result

  const [part, location] = await Promise.all([
    getPart(kv, input.partId),
    result.locationId ? getLocation(kv, result.locationId) : Promise.resolve(null)
  ])
  await appendAudit(kv, {
    action: 'stock.move',
    source: normalizeSource(input),
    partId: input.partId,
    partName: part?.name || '',
    quantity: 0,
    operator: input.operator || 'system',
    detail: `移动到 ${location?.name || '未指定位置'}（${result.moved} 个批次，数量不变）`
  })
  return result
}
