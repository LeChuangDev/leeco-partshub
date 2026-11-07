// server/http/routes/categories.routes.js
// /api/categories 资源路由：列表、单条、创建、更新、删除。

import { json, readBody } from '../http-utils.js'
import {
  createCategory, deleteCategory, getCategory, listCategories, updateCategory
} from '../../repositories/category.repository.js'

export async function handleCategories({ request, method, url, kv }) {
  const id = url.searchParams.get('id')
  if (method === 'GET') {
    if (id) {
      const category = await getCategory(kv, id)
      return category ? json(0, category) : json(404, {}, '分类不存在', 404)
    }
    return json(0, await listCategories(kv))
  }
  if (method === 'POST') {
    const body = await readBody(request)
    if (!body.name) return json(400, {}, 'name 必填')
    return json(0, await createCategory(kv, body), 'created')
  }
  if (method === 'PUT') {
    const body = await readBody(request)
    if (!body.id) return json(400, {}, 'id 必填')
    const updated = await updateCategory(kv, body.id, body)
    return updated ? json(0, updated) : json(404, {}, '分类不存在', 404)
  }
  if (method === 'DELETE') {
    if (!id) return json(400, {}, 'id 必填')
    const result = await deleteCategory(kv, id)
    return result.ok ? json(0, {}, 'deleted') : json(400, {}, result.msg)
  }
  return json(405, {}, 'Method Not Allowed', 405)
}
