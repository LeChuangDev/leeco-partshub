// server/http/routes/maintenance.routes.js
// /api/maintenance/*：索引一致性检查与重建（只由登录用户手动触发）。

import { json } from '../http-utils.js'
import { checkIndexes, rebuildIndexes } from '../../application/maintenance.service.js'

export async function handleMaintenance({ method, url, kv, seg }) {
  const action = seg[1] || ''
  if (action === 'index-check' && method === 'GET') {
    return json(0, await checkIndexes(kv))
  }
  if (action === 'reindex' && method === 'POST') {
    const dryRun = url.searchParams.get('dryRun') === '1'
    return json(0, await rebuildIndexes(kv, { dryRun }))
  }
  return json(405, {}, `Unsupported maintenance action: ${action || '(empty)'}`, 405)
}
