// server/http/routes/transactions.routes.js
// /api/transactions 库存流水查询（只读）。

import { json } from '../http-utils.js'
import { listTransactions } from '../../repositories/transaction.repository.js'

export async function handleTransactions({ method, url, kv }) {
  if (method !== 'GET') return json(405, {}, 'Method Not Allowed', 405)
  const partId = url.searchParams.get('partId') || ''
  const limit = Number(url.searchParams.get('limit')) || 200
  return json(0, await listTransactions(kv, partId, limit))
}
