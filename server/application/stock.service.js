// server/application/stock.service.js
// 出入库用例：校验 → 批次变更 → 写流水 → 回写主数据。
// 库存批次本身的持久化在 repositories/stock.repository.js，此处只做编排与业务约束。

import { kvPutJSON } from '../infrastructure/kv/index.js'
import { newTransaction, nowISO } from '../domain/models.js'
import { getPart } from '../repositories/part.repository.js'
import { createStock, listStock, partTotalQuantity } from '../repositories/stock.repository.js'
import { appendTransaction } from '../repositories/transaction.repository.js'
import { touchMeta } from '../repositories/kv-index.js'

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
  await appendTransaction(kv, txn)
  await touchMeta(kv)
  return { ok: true, stock, transaction: txn }
}

// 出库：支持指定批次或跨批次 FIFO；逐批写流水；更新 lastOutAt
export async function stockOut(kv, partId, input) {
  const part = await getPart(kv, partId)
  if (!part) return { ok: false, msg: '元器件不存在' }
  const need = Number(input.quantity)
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
    await appendTransaction(kv, txn)
    txns.push(txn)
  }
  part.lastOutAt = nowISO()
  await kvPutJSON(kv, `part:${partId}`, part)
  await touchMeta(kv)
  return { ok: true, transactions: txns, remaining: 0 }
}
