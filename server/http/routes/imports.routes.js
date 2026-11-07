// server/http/routes/imports.routes.js
// /api/import 多渠道订单导入：rows 生成预览计划、items 提交入库、batches/undo 支持 10 分钟内撤销。

import { json, readBody } from '../http-utils.js'
import {
  commitImport, listImportBatches, planImport, undoImport
} from '../../application/import.service.js'

export async function handleImports({ request, method, url, kv }) {
  const pathname = url.pathname

  if (method === 'GET' && pathname.endsWith('/import/batches')) {
    const limit = Number(url.searchParams.get('limit')) || 20
    return json(0, await listImportBatches(kv, limit))
  }

  if (method !== 'POST') return json(405, {}, 'Method Not Allowed', 405)

  if (pathname.endsWith('/import/undo')) {
    const body = await readBody(request)
    const result = await undoImport(kv, body.batchId)
    return result.ok ? json(0, result) : json(400, {}, result.msg, 400)
  }

  const body = await readBody(request)
  if (body.items && Array.isArray(body.items)) {
    const result = await commitImport(kv, body.items, {
      operator: body.operator || 'import',
      locationId: body.locationId,
      orderNo: body.orderNo
    })
    return json(0, result)
  }
  if (body.rows && Array.isArray(body.rows)) {
    return json(0, await planImport(kv, body.rows))
  }
  return json(400, {}, '需要 items 或 rows')
}
