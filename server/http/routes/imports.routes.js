// server/http/routes/imports.routes.js
// /api/import 多渠道订单导入：rows 生成预览计划，items 直接提交。

import { json, readBody } from '../http-utils.js'
import { commitImport, planImport } from '../../application/import.service.js'

export async function handleImports({ request, method, kv }) {
  if (method !== 'POST') return json(405, {}, 'Method Not Allowed', 405)
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
