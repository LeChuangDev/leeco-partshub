// server/http/routes/projects.routes.js
// /api/projects 项目 BOM 路由。
// GET    /api/projects                       项目列表
// POST   /api/projects                       新建项目（可带 lines）
// GET    /api/projects/:id                   项目详情 + 齐套分析（?buildQty=）
// PUT    /api/projects/:id                   更新项目元信息
// DELETE /api/projects/:id                   删除项目
// PUT    /api/projects/:id/bom               覆盖保存 BOM 行
// POST   /api/projects/:id/import            从文本/行导入 BOM
// GET    /api/projects/:id/analyze           仅重新分析
// POST   /api/projects/:id/consume           按项目领料出库

import { json, readBody } from '../http-utils.js'
import {
  analyzeProject, consumeProject, createProject, deleteProject, importProjectBom,
  listProjects, saveProjectLines, updateProject
} from '../../application/project.service.js'

export async function handleProjects({ request, method, url, kv, seg }) {
  const id = seg[1] || ''

  if (!id) {
    if (method === 'GET') return json(0, await listProjects(kv))
    if (method === 'POST') {
      const body = await readBody(request)
      const result = await createProject(kv, body)
      return result.ok ? json(0, { project: result.project, lines: result.lines }, 'created') : json(400, {}, result.msg)
    }
    return json(405, {}, 'Method Not Allowed', 405)
  }

  if (seg.length === 2) {
    if (method === 'GET') {
      const qty = url.searchParams.get('buildQty')
      const result = await analyzeProject(kv, id, qty ? { buildQty: Number(qty) } : {})
      return result ? json(0, result) : json(404, {}, '项目不存在', 404)
    }
    if (method === 'PUT') {
      const body = await readBody(request)
      const result = await updateProject(kv, id, body)
      return result.ok ? json(0, result) : json(404, {}, result.msg, 404)
    }
    if (method === 'DELETE') {
      const result = await deleteProject(kv, id)
      return result.ok ? json(0, {}, 'deleted') : json(404, {}, result.msg, 404)
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
    const result = await importProjectBom(kv, id, body)
    return result.ok ? json(0, result) : json(400, {}, result.msg)
  }

  if (seg[2] === 'analyze' && method === 'GET') {
    const qty = url.searchParams.get('buildQty')
    const result = await analyzeProject(kv, id, qty ? { buildQty: Number(qty) } : {})
    return result ? json(0, result) : json(404, {}, '项目不存在', 404)
  }

  if (seg[2] === 'consume' && method === 'POST') {
    const body = await readBody(request)
    const result = await consumeProject(kv, id, body)
    return result.ok || result.partial ? json(0, result) : json(400, {}, result.msg || '领料失败')
  }

  return json(405, {}, 'Method Not Allowed', 405)
}
