// server/http/routes/bom.routes.js
// /api/bom 齐套分析：匹配、领料、文本解析、模板。

import { json, readBody } from '../http-utils.js'
import { consumeBom, matchBom, parseBomText } from '../../application/bom.service.js'

export async function handleBom({ request, method, url, kv }) {
  const pathname = url.pathname
  if (method === 'POST' && pathname.endsWith('/bom/match')) {
    const body = await readBody(request)
    if (!body.rows || !Array.isArray(body.rows)) return json(400, {}, 'rows 必填')
    if (body.rows.length > 2000) return json(400, {}, '单次最多匹配 2000 行')
    return json(0, await matchBom(kv, body.rows))
  }
  if (method === 'POST' && pathname.endsWith('/bom/consume')) {
    const body = await readBody(request)
    const lines = body.lines || body.items
    if (!Array.isArray(lines) || !lines.length) return json(400, {}, 'lines 必填')
    return json(0, await consumeBom(kv, lines, {
      projectName: body.projectName,
      operator: body.operator || 'bom'
    }))
  }
  // 解析预览：把文本转成行，便于前端上传后直接调用
  if (method === 'POST' && pathname.endsWith('/bom/parse')) {
    const body = await readBody(request)
    if (typeof body.text !== 'string') return json(400, {}, 'text 必填')
    return json(0, parseBomText(body.text))
  }
  if (method === 'GET' && pathname.endsWith('/bom/template')) {
    return json(0, {
      columns: ['位号', '型号', '名称', '封装', '数量', '备注'],
      sample: 'R1,R2,R3,10kΩ,贴片电阻,0603,3,'
    })
  }
  return json(405, {}, 'Method Not Allowed', 405)
}
