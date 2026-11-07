// server/http/router.js
// API 网关：路由表 + 鉴权 + 统一错误边界。
// 仅依赖 Web 标准 Request/Response/URL，EdgeOne 边缘函数与本地 Node 服务端复用同一份逻辑。

import { createKV } from '../infrastructure/kv/index.js'
import { seedIfEmpty } from '../infrastructure/seed.js'
import { checkAuth } from './auth.js'
import { json } from './http-utils.js'
import { handleAuthCheck } from './routes/auth.routes.js'
import { handleCategories } from './routes/categories.routes.js'
import { handleParts } from './routes/parts.routes.js'
import { handleStock } from './routes/stock.routes.js'
import { handleLocations } from './routes/locations.routes.js'
import { handleTransactions } from './routes/transactions.routes.js'
import { handleProjects } from './routes/projects.routes.js'
import { handleImports } from './routes/imports.routes.js'
import { handleBom } from './routes/bom.routes.js'
import { handleSearch } from './routes/search.routes.js'
import { handleExport } from './routes/backup.routes.js'
import { handleMeta, handleStats } from './routes/analytics.routes.js'
import { handleAudit } from './routes/audit.routes.js'

/** 资源前缀 → 处理器。新增模块只需在此登记。 */
const ROUTES = {
  categories: handleCategories,
  parts: handleParts,
  stock: handleStock,
  locations: handleLocations,
  transactions: handleTransactions,
  projects: handleProjects,
  import: handleImports,
  bom: handleBom,
  search: handleSearch,
  export: handleExport,
  stats: handleStats,
  audit: handleAudit,
  meta: handleMeta
}

export async function handleApi(request, env, url) {
  const method = request.method.toUpperCase()
  const path = url.pathname.replace(/\/api\/?/, '/')

  try {
    const kv = createKV(env)
    await seedIfEmpty(kv)

    // 公开接口：仅鉴权状态查询
    if (path === '/auth/check' || path.startsWith('/auth/')) {
      return await handleAuthCheck({ request, env })
    }

    const auth = checkAuth(request, env)
    if (!auth.ok) return json(401, {}, 'Unauthorized', 401)

    const seg = path.split('/').filter(Boolean) // ['parts'] | ['parts','info','lcsc','C1']
    const handler = ROUTES[seg[0] || '']
    if (!handler) return json(404, {}, `Unknown route: ${path}`, 404)

    return await handler({ request, method, url, kv, seg, env })
  } catch (e) {
    // 统一错误边界：不把堆栈返回给客户端，只在服务端日志侧保留
    console.error('[api] unhandled error', e)
    return json(500, {}, String((e && e.message) || e), 500)
  }
}
