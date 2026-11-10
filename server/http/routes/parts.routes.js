// server/http/routes/parts.routes.js
// /api/parts 资源路由。列表查询支持分类下钻、标签、关键词与工程表达式。

import { json, readBody } from '../http-utils.js'
import { listParts } from '../../application/catalog.service.js'
import { placeholderPartInfo } from '../../application/import.service.js'
import { queryComponent } from '../../application/component-info.service.js'
import {
  createPart, deletePart, getPart, updatePart
} from '../../repositories/part.repository.js'
import { listStock } from '../../repositories/stock.repository.js'

export async function handleParts({ request, method, url, kv, seg, env }) {
  // /api/parts/info/:platform/:sku —— 第三方器件信息（公开库免密钥，官方开放平台可选）
  if (seg[1] === 'info' && seg[2] && seg[3]) {
    if (seg[2] === 'lcsc' || seg[2] === 'jlc') {
      return json(0, await queryComponent(env, decodeURIComponent(seg[3])))
    }
    return json(0, placeholderPartInfo(seg[2], seg[3]))
  }
  const id = url.searchParams.get('id')
  if (method === 'GET') {
    if (id) {
      const part = await getPart(kv, id)
      if (!part) return json(404, {}, '元器件不存在', 404)
      const stocks = await listStock(kv, id)
      const total = stocks.reduce((s, b) => s + (Number(b.quantity) || 0), 0)
      return json(0, { ...part, stocks, totalQuantity: total })
    }
    const opts = {
      categoryId: url.searchParams.get('categoryId') || undefined,
      tag: url.searchParams.get('tag') || undefined,
      search: url.searchParams.get('search') || undefined,
      expr: url.searchParams.get('expr') || undefined,
      page: parseInt(url.searchParams.get('page') || '1', 10),
      pageSize: Math.min(parseInt(url.searchParams.get('pageSize') || '50', 10), 2000),
      sort: url.searchParams.get('sort') || 'updatedAt',
      withQuantity: url.searchParams.get('withQuantity') !== '0'
    }
    return json(0, await listParts(kv, opts))
  }
  if (method === 'POST') {
    const body = await readBody(request)
    if (!body.name) return json(400, {}, 'name 必填')
    return json(0, await createPart(kv, body), 'created')
  }
  if (method === 'PUT') {
    const body = await readBody(request)
    if (!body.id) return json(400, {}, 'id 必填')
    const updated = await updatePart(kv, body.id, body)
    return updated ? json(0, updated) : json(404, {}, '元器件不存在', 404)
  }
  if (method === 'DELETE') {
    if (!id) return json(400, {}, 'id 必填')
    const result = await deletePart(kv, id)
    return result.ok ? json(0, result, 'deleted') : json(400, {}, result.msg)
  }
  return json(405, {}, 'Method Not Allowed', 405)
}
