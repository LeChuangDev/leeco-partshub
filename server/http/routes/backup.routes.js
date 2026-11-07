// server/http/routes/backup.routes.js
// /api/export 全量导出与恢复。恢复会覆盖现有数据，仅鉴权后可用。

import { json, readBody } from '../http-utils.js'
import { exportAll, importAll } from '../../application/backup.service.js'

export async function handleExport({ request, method, url, kv }) {
  const pathname = url.pathname
  if (method === 'GET' && pathname.endsWith('/export/all')) {
    return json(0, await exportAll(kv))
  }
  if (method === 'POST' && pathname.endsWith('/export/restore')) {
    const body = await readBody(request)
    if (!body || !body.parts) return json(400, {}, '无效的备份文件')
    return json(0, await importAll(kv, body))
  }
  return json(405, {}, 'Method Not Allowed', 405)
}
