// server/http/routes/audit.routes.js
// /api/audit 操作日志（只读）：按时间 / 动作 / 来源 / 器件 / 关键词过滤。

import { json } from '../http-utils.js'
import { listAudits } from '../../repositories/audit.repository.js'

export async function handleAudit({ url, kv }) {
  const options = {
    limit: Number(url.searchParams.get('limit')) || 200,
    action: url.searchParams.get('action') || undefined,
    source: url.searchParams.get('source') || undefined,
    partId: url.searchParams.get('partId') || undefined,
    keyword: url.searchParams.get('q') || undefined
  }
  return json(0, await listAudits(kv, options))
}
