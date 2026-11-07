// server/http/routes/stock.routes.js
// /api/stock 库存动作路由：入库、出库、移动位置、按元器件查询批次。

import { json, readBody } from '../http-utils.js'
import { stockIn, stockOut } from '../../application/stock.service.js'
import { listStock } from '../../repositories/stock.repository.js'
import { moveStock } from '../../application/inventory.service.js'

export async function handleStock({ request, method, url, kv, seg }) {
  if (seg[1] === 'in' && method === 'POST') {
    const body = await readBody(request)
    if (!body.partId) return json(400, {}, 'partId 必填')
    const result = await stockIn(kv, body.partId, body)
    return result.ok ? json(0, result) : json(400, {}, result.msg)
  }
  if (seg[1] === 'move' && method === 'POST') {
    const body = await readBody(request)
    if (!body.partId) return json(400, {}, 'partId 必填')
    const result = await moveStock(kv, body)
    return result.ok ? json(0, result) : json(400, {}, result.msg)
  }
  if (seg[1] === 'out' && method === 'POST') {
    const body = await readBody(request)
    if (!body.partId) return json(400, {}, 'partId 必填')
    const result = await stockOut(kv, body.partId, body)
    return result.ok ? json(0, result) : json(400, {}, result.msg)
  }
  if (method === 'GET') {
    const partId = url.searchParams.get('partId')
    if (!partId) return json(400, {}, 'partId 必填')
    return json(0, await listStock(kv, partId))
  }
  return json(405, {}, 'Method Not Allowed', 405)
}
