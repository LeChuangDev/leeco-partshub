// server/http/routes/backup.routes.js
// /api/export 全量导出与恢复。恢复会覆盖现有数据，仅鉴权后可用。
// 恢复前必须通过结构校验；支持 ?dryRun=1 只预演、不落库。

import { json, readBody } from '../http-utils.js'
import { countBackup, exportAll, importAll, validateBackup } from '../../application/backup.service.js'

export async function handleExport({ request, method, url, kv }) {
  const pathname = url.pathname
  if (method === 'GET' && pathname.endsWith('/export/all')) {
    return json(0, await exportAll(kv))
  }
  if (method === 'POST' && pathname.endsWith('/export/restore')) {
    const body = await readBody(request)
    const check = validateBackup(body)
    if (check.errors.length) {
      return json(400, { errors: check.errors, warnings: check.warnings }, check.errors[0], 400)
    }
    const dryRun = url.searchParams.get('dryRun') === '1'
    if (dryRun) {
      return json(0, { dryRun: true, counts: countBackup(body), warnings: check.warnings })
    }
    const result = await importAll(kv, body)
    return json(0, { ...result, warnings: check.warnings })
  }
  return json(405, {}, 'Method Not Allowed', 405)
}
