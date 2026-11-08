// server/repositories/transaction.repository.js
// 库存流水聚合：只追加、不修改；同时维护全局索引与按元器件的二级索引。

import { kvGetJSON, kvPutJSON, KV_BATCH, mapLimit } from '../infrastructure/kv/index.js'
import { idxAdd, idxGet } from './kv-index.js'

const INDEX = 'index:transactions'

export async function listTransactions(kv, partId, limit = 200) {
  const ids = partId ? await idxGet(kv, `index:txn:part:${partId}`) : await idxGet(kv, INDEX)
  const docs = await mapLimit(ids, KV_BATCH, (id) => kvGetJSON(kv, `transaction:${id}`))
  const items = docs.filter(Boolean)
  items.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
  return items.slice(0, limit)
}

/** 写入一条流水及其索引；调用方负责构造 newTransaction 记录 */
export async function appendTransaction(kv, txn) {
  await kvPutJSON(kv, `transaction:${txn.id}`, txn)
  await idxAdd(kv, INDEX, txn.id)
  if (txn.partId) await idxAdd(kv, `index:txn:part:${txn.partId}`, txn.id)
  return txn
}
