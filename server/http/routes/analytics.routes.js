// server/http/routes/analytics.routes.js
// /api/stats 与 /api/meta：看板统计与系统元信息。

import { json } from '../http-utils.js'
import { getStats } from '../../application/analytics.service.js'
import { getMeta } from '../../repositories/kv-index.js'

export async function handleStats({ url, kv }) {
  const period = url.searchParams.get('period') || 'week'
  return json(0, await getStats(kv, { period }))
}

export async function handleMeta({ kv }) {
  return json(0, await getMeta(kv))
}
