// shared/router.js
// 统一 API 路由分发。仅依赖 Web 标准 Request/Response/URL，可在 EdgeOne 边缘函数
// 与本地 Node 服务端复用同一份逻辑。所有接口统一返回 { code, data, msg }。
//
// 鉴权：除 /api/auth/check 外，所有接口要求请求头 X-Auth-Token，校验失败返回 401。

import { createKV, kvGetJSON } from './kv.js'
import { checkAuth } from './auth.js'
import { seedIfEmpty } from './seed.js'
import * as store from './store.js'
import { planImport, commitImport, placeholderPartInfo } from './import.js'
import { matchBom, consumeBom, searchAll, parseBomText } from './bom.js'
import {
  listProjects, createProject, updateProject, deleteProject,
  saveProjectLines, importProjectBom, analyzeProject, consumeProject
} from './project.js'

function json(code, data = {}, msg = 'success', status = 200) {
  return new Response(JSON.stringify({ code, data, msg }), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  })
}

async function readBody(request) {
  try {
    const text = await request.text()
    if (!text) return {}
    return JSON.parse(text)
  } catch {
    return {}
  }
}

async function requireAuth(request, env) {
  const a = checkAuth(request, env)
  if (!a.ok) return json(401, {}, 'Unauthorized', 401)
  return null
}

const PUBLIC_PREFIX = '/api/auth/'

export async function handleApi(request, env, url) {
  const kv = createKV(env)
  await seedIfEmpty(kv)

  const path = url.pathname.replace(/\/api\/?/, '/')
  const method = request.method.toUpperCase()

  // 公开接口
  if (path === '/auth/check' || path.startsWith('/auth/')) {
    const a = checkAuth(request, env)
    if (!a.ok) return json(401, { authenticated: false }, 'Unauthorized', 401)
    return json(0, { authenticated: true, devBypass: a.devBypass || false })
  }

  const authErr = await requireAuth(request, env)
  if (authErr) return authErr

  const seg = path.split('/').filter(Boolean) // e.g. ['categories'] | ['parts','info','lcsc','C1']
  const root = seg[0] || ''

  try {
    switch (root) {
      case 'categories':
        return await categories(request, method, url, kv)
      case 'parts':
        return await parts(request, method, url, kv, seg)
      case 'stock':
        return await stock(request, method, kv, seg)
      case 'locations':
        return await locations(request, method, url, kv)
      case 'projects':
        return await projects(request, method, url, kv)
      case 'import':
        return await importRoute(request, method, kv)
      case 'bom':
        return await bomRoute(request, method, url, kv)
      case 'search':
        return json(0, await searchAll(kv, url.searchParams.get('q'), Number(url.searchParams.get('limit')) || 8))
      case 'export':
        return await exportRoute(request, method, kv)
      case 'transactions':
        return await transactions(request, method, url, kv)
      case 'stats':
        return json(0, await store.getStats(kv, { period: url.searchParams.get('period') || 'week' }))
      case 'meta':
        return json(0, await store.getMeta(kv))
      default:
        return json(404, {}, `Unknown route: ${path}`, 404)
    }
  } catch (e) {
    return json(500, {}, String((e && e.message) || e), 500)
  }
}

/* ------------------------------- 分类 ------------------------------- */
async function categories(request, method, url, kv) {
  const id = url.searchParams.get('id')
  if (method === 'GET') {
    if (id) {
      const c = await store.getCategory(kv, id)
      return c ? json(0, c) : json(404, {}, '分类不存在', 404)
    }
    return json(0, await store.listCategories(kv))
  }
  if (method === 'POST') {
    const body = await readBody(request)
    if (!body.name) return json(400, {}, 'name 必填')
    return json(0, await store.createCategory(kv, body), 'created')
  }
  if (method === 'PUT') {
    const body = await readBody(request)
    if (!body.id) return json(400, {}, 'id 必填')
    const r = await store.updateCategory(kv, body.id, body)
    return r ? json(0, r) : json(404, {}, '分类不存在', 404)
  }
  if (method === 'DELETE') {
    if (!id) return json(400, {}, 'id 必填')
    const r = await store.deleteCategory(kv, id)
    return r.ok ? json(0, {}, 'deleted') : json(400, {}, r.msg)
  }
  return json(405, {}, 'Method Not Allowed', 405)
}

/* ------------------------------- 元器件 ------------------------------- */
async function parts(request, method, url, kv, seg) {
  // /api/parts/info/:platform/:sku
  if (seg[1] === 'info' && seg[2] && seg[3]) {
    return json(0, placeholderPartInfo(seg[2], seg[3]))
  }
  const id = url.searchParams.get('id')
  if (method === 'GET') {
    if (id) {
      const p = await store.getPart(kv, id)
      if (!p) return json(404, {}, '元器件不存在', 404)
      const stocks = await store.listStock(kv, id)
      const total = stocks.reduce((s, b) => s + (Number(b.quantity) || 0), 0)
      return json(0, { ...p, stocks, totalQuantity: total })
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
    return json(0, await store.listParts(kv, opts))
  }
  if (method === 'POST') {
    const body = await readBody(request)
    if (!body.name) return json(400, {}, 'name 必填')
    return json(0, await store.createPart(kv, body), 'created')
  }
  if (method === 'PUT') {
    const body = await readBody(request)
    if (!body.id) return json(400, {}, 'id 必填')
    const r = await store.updatePart(kv, body.id, body)
    return r ? json(0, r) : json(404, {}, '元器件不存在', 404)
  }
  if (method === 'DELETE') {
    if (!id) return json(400, {}, 'id 必填')
    const r = await store.deletePart(kv, id)
    return r.ok ? json(0, r, 'deleted') : json(400, {}, r.msg)
  }
  return json(405, {}, 'Method Not Allowed', 405)
}

/* ------------------------------- 库存 ------------------------------- */
async function stock(request, method, kv, seg) {
  // /api/stock/in  | /api/stock/out  | /api/stock/move
  if (seg[1] === 'in' && method === 'POST') {
    const body = await readBody(request)
    if (!body.partId) return json(400, {}, 'partId 必填')
    const r = await store.stockIn(kv, body.partId, body)
    return r.ok ? json(0, r) : json(400, {}, r.msg)
  }
  if (seg[1] === 'move' && method === 'POST') {
    const body = await readBody(request)
    if (!body.partId) return json(400, {}, 'partId 必填')
    const r = await store.moveStock(kv, body)
    return r.ok ? json(0, r) : json(400, {}, r.msg)
  }
  if (seg[1] === 'out' && method === 'POST') {
    const body = await readBody(request)
    if (!body.partId) return json(400, {}, 'partId 必填')
    const r = await store.stockOut(kv, body.partId, body)
    return r.ok ? json(0, r) : json(400, {}, r.msg)
  }
  if (method === 'GET') {
    const partId = new URL(request.url).searchParams.get('partId')
    if (!partId) return json(400, {}, 'partId 必填')
    return json(0, await store.listStock(kv, partId))
  }
  return json(405, {}, 'Method Not Allowed', 405)
}

/* ------------------------------- 出入库流水 ------------------------------- */
async function transactions(request, method, url, kv) {
  if (method !== 'GET') return json(405, {}, 'Method Not Allowed', 405)
  const partId = url.searchParams.get('partId') || ''
  const limit = Number(url.searchParams.get('limit')) || 200
  const list = await store.listTransactions(kv, partId, limit)
  return json(0, list)
}

/* ------------------------------- 位置 ------------------------------- */
async function locations(request, method, url, kv) {
  const id = url.searchParams.get('id')
  if (method === 'GET') {
    if (id) {
      const loc = await kvGetJSON(kv, `location:${id}`)
      return loc ? json(0, loc) : json(404, {}, '位置不存在', 404)
    }
    return json(0, await store.listLocations(kv))
  }
  if (method === 'POST') {
    const body = await readBody(request)
    if (!body.name) return json(400, {}, 'name 必填')
    return json(0, await store.createLocation(kv, body), 'created')
  }
  if (method === 'PUT') {
    const body = await readBody(request)
    if (!body.id) return json(400, {}, 'id 必填')
    const r = await store.updateLocation(kv, body.id, body)
    return r ? json(0, r) : json(404, {}, '位置不存在', 404)
  }
  if (method === 'DELETE') {
    if (!id) return json(400, {}, 'id 必填')
    const r = await store.deleteLocation(kv, id)
    return r.ok ? json(0, {}, 'deleted') : json(400, {}, r.msg)
  }
  return json(405, {}, 'Method Not Allowed', 405)
}

/* ------------------------------- 项目 BOM ------------------------------- */
// GET    /api/projects                       项目列表
// POST   /api/projects                       新建项目（可带 lines）
// GET    /api/projects/:id                   项目详情 + 齐套分析（?buildQty=）
// PUT    /api/projects/:id                   更新项目元信息
// DELETE /api/projects/:id                   删除项目
// PUT    /api/projects/:id/bom               覆盖保存 BOM 行
// POST   /api/projects/:id/import            从文本/行导入 BOM
// GET    /api/projects/:id/analyze           仅重新分析
// POST   /api/projects/:id/consume           按项目领料出库
async function projects(request, method, url, kv) {
  const seg = url.pathname.replace(/\/api\/?/, '/').split('/').filter(Boolean)
  const id = seg[1] || ''

  if (!id) {
    if (method === 'GET') return json(0, await listProjects(kv))
    if (method === 'POST') {
      const body = await readBody(request)
      const r = await createProject(kv, body)
      return r.ok ? json(0, { project: r.project, lines: r.lines }, 'created') : json(400, {}, r.msg)
    }
    return json(405, {}, 'Method Not Allowed', 405)
  }

  if (seg.length === 2) {
    if (method === 'GET') {
      const qty = url.searchParams.get('buildQty')
      const r = await analyzeProject(kv, id, qty ? { buildQty: Number(qty) } : {})
      return r ? json(0, r) : json(404, {}, '项目不存在', 404)
    }
    if (method === 'PUT') {
      const body = await readBody(request)
      const r = await updateProject(kv, id, body)
      return r.ok ? json(0, r) : json(404, {}, r.msg, 404)
    }
    if (method === 'DELETE') {
      const r = await deleteProject(kv, id)
      return r.ok ? json(0, {}, 'deleted') : json(404, {}, r.msg, 404)
    }
  }

  if (seg[2] === 'bom' && method === 'PUT') {
    const body = await readBody(request)
    if (!Array.isArray(body.lines)) return json(400, {}, 'lines 必填')
    const saved = await saveProjectLines(kv, id, body.lines)
    if (!saved.ok) return json(404, {}, saved.msg, 404)
    const analysis = await analyzeProject(kv, id, { buildQty: body.buildQty })
    return json(0, { ...saved, analysis })
  }

  if (seg[2] === 'import' && method === 'POST') {
    const body = await readBody(request)
    const r = await importProjectBom(kv, id, body)
    return r.ok ? json(0, r) : json(400, {}, r.msg)
  }

  if (seg[2] === 'analyze' && method === 'GET') {
    const qty = url.searchParams.get('buildQty')
    const r = await analyzeProject(kv, id, qty ? { buildQty: Number(qty) } : {})
    return r ? json(0, r) : json(404, {}, '项目不存在', 404)
  }

  if (seg[2] === 'consume' && method === 'POST') {
    const body = await readBody(request)
    const r = await consumeProject(kv, id, body)
    return r.ok || r.partial ? json(0, r) : json(400, {}, r.msg || '领料失败')
  }

  return json(405, {}, 'Method Not Allowed', 405)
}

/* ------------------------------- 导入 ------------------------------- */
async function importRoute(request, method, kv) {
  if (method !== 'POST') return json(405, {}, 'Method Not Allowed', 405)
  const body = await readBody(request)
  // 提交：body.items 存在 -> 直接提交；否则 body.rows -> 生成计划（预览）
  if (body.items && Array.isArray(body.items)) {
    const r = await commitImport(kv, body.items, { operator: body.operator || 'import', locationId: body.locationId, orderNo: body.orderNo })
    return json(0, r)
  }
  if (body.rows && Array.isArray(body.rows)) {
    const plan = await planImport(kv, body.rows)
    return json(0, plan)
  }
  return json(400, {}, '需要 items 或 rows')
}

/* ------------------------------- BOM 齐套 ------------------------------- */
async function bomRoute(request, method, url, kv) {
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
      projectName: body.projectName, operator: body.operator || 'bom'
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

/* ------------------------------- 导出 / 备份 ------------------------------- */
async function exportRoute(request, method, kv) {
  const pathname = new URL(request.url).pathname
  if (method === 'GET' && pathname.endsWith('/export/all')) {
    return json(0, await store.exportAll(kv))
  }
  if (method === 'POST' && pathname.endsWith('/export/restore')) {
    const body = await readBody(request)
    if (!body || !body.parts) return json(400, {}, '无效的备份文件')
    const r = await store.importAll(kv, body)
    return json(0, r)
  }
  return json(405, {}, 'Method Not Allowed', 405)
}
