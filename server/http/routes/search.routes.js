// server/http/routes/search.routes.js
// /api/search 全局搜索（命令面板）：一次返回器件、位置、分类。

import { json } from '../http-utils.js'
import { searchAll } from '../../application/bom.service.js'

export async function handleSearch({ url, kv }) {
  const q = url.searchParams.get('q')
  const limit = Number(url.searchParams.get('limit')) || 8
  return json(0, await searchAll(kv, q, limit))
}
