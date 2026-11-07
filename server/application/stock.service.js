// server/application/stock.service.js
// 出入库用例：校验 → 批次变更 → 写流水 → 回写主数据 → 记审计日志。
// 库存批次本身的持久化在 repositories/stock.repository.js，此处只做编排与业务约束。

import { kvPutJSON } from '../infrastructure/kv/index.js'
import { newTransaction, nowISO } from '../domain/models.js'
import { normalizeSource } from '../domain/audit.js'
import { getPart } from '../repositories/part.repository.js'
import { createStock, listStock, partTotalQuantity } from '../repositories/stock.repository.js'
import { appendTransaction } from '../repositories/transaction.repository.js'
import { appendAudit } from '../repositories/audit.repository.js'
import { touchMeta } from '../repositories/kv-index.js'

const auditBase = (part, input) => ({
  source: normalizeSource(input),
  partId: part.id,
  partName: part.name || '',
  batchId: input.batchId || null,
  orderNo: input.orderNo || '',
  reason: input.reason || '',
  operator: input.operator || 'system'
})

/**
 * 入库：创建批次（或合并到同位置同单价批次）+ 写流水 + 审计。
 * input.merge=true 时用于扫码连续入库，避免产生大量 quantity=1 的碎片批次。
 */
export async function stockIn(kv, partId, input) {
  const part = await getPart(kv, partId)
  if (!part) return { ok: false, msg: '元器件不存在' }
  const qty = Number(input.quantity)
  if (!isFinite(qty) || qty <= 0) return { ok: false, msg: '入库数量必须大于 0' }
  const price = Number(input.unitPrice)
  const unitPrice = isFinite(price) && price > 0 ? price : 0
  const beforeQty = await partTotalQuantity(kv, partId)

  let stock
  let merged = false
  if (input.merge) {
    const batches = await listStock(kv, partId)
    const locationId = input.locationId || null
    const target = batches.find((b) =>
      (b.locationId || null) === locationId &&
      Number(b.unitPrice || 0) === unitPrice &&
      Number(b.quantity) > 0
    )
    if (target) {
      target.quantity = Number(target.quantity) + qty
      target.updatedAt = nowISO()
      await kvPutJSON(kv, `stock:${target.id}`, target)
      stock = target
      merged = true
    }
  }
  if (!stock) {
    stock = await createStock(kv, { ...input, partId, quantity: qty, unitPrice })
  }

  const total = await partTotalQuantity(kv, partId)
  const source = normalizeSource(input)
  const txn = newTransaction({
    partId, stockId: stock.id, type: 'in', quantity: qty,
    balance: total, reason: input.reason || '入库', orderNo: stock.orderNo,
    note: stock.note || '', operator: input.operator || 'system',
    source, batchId: input.batchId || null, beforeQty, afterQty: total
  })
  await appendTransaction(kv, txn)
  await appendAudit(kv, {
    ...auditBase(part, input),
    action: 'stock.in', source,
    quantity: qty, beforeQty, afterQty: total,
    detail: merged ? `合并入库到既有批次 ${stock.id}` : `新建批次 ${stock.id}`
  })
  await touchMeta(kv)
  return { ok: true, stock, transaction: txn, merged }
}

// 出库：支持指定批次或跨批次 FIFO；逐批写流水；更新 lastOutAt
export async function stockOut(kv, partId, input) {
  const part = await getPart(kv, partId)
  if (!part) return { ok: false, msg: '元器件不存在' }
  const need = Number(input.quantity)
  if (!need || need <= 0) return { ok: false, msg: '出库数量必须大于 0' }
  const total = await partTotalQuantity(kv, partId)
  if (total < need) return { ok: false, msg: `库存不足：现有 ${total}，需 ${need}` }

  const source = normalizeSource(input)
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
    const beforeQty = await partTotalQuantity(kv, partId)
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
      projectId: input.projectId || null, projectName: input.projectName || '',
      source, batchId: input.batchId || null, beforeQty, afterQty: balance
    })
    await appendTransaction(kv, txn)
    txns.push(txn)
  }
  part.lastOutAt = nowISO()
  await kvPutJSON(kv, `part:${partId}`, part)
  await appendAudit(kv, {
    ...auditBase(part, input),
    action: 'stock.out', source,
    quantity: need, beforeQty: total, afterQty: total - need,
    detail: txns.length > 1 ? `按 FIFO 跨 ${txns.length} 个批次扣减` : ''
  })
  await touchMeta(kv)
  return { ok: true, transactions: txns, remaining: 0 }
}
