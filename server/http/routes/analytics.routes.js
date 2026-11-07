// server/http/routes/analytics.routes.js
// /api/stats 与 /api/meta：看板统计与系统元信息。

import { json } from '../http-utils.js'
import { getStats } from '../../application/analytics.service.js'
import { getMeta, idxGet } from '../../repositories/kv-index.js'

export async function handleStats({ url, kv }) {
  const period = url.searchParams.get('period') || 'week'
  const stats = await getStats(kv, { period })
  // 项目数由项目索引在 HTTP 层补齐：统计层不反向依赖项目聚合，但对外字段应是真实值
  stats.projectsCount = (await idxGet(kv, 'index:projects')).length
  return json(0, stats)
}

export async function handleMeta({ kv }) {
  return json(0, await getMeta(kv))
}
