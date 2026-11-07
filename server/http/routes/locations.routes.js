// server/http/routes/locations.routes.js
// /api/locations 存储位置资源路由。

import { json, readBody } from '../http-utils.js'
import {
  createLocation, deleteLocation, getLocation, listLocations, updateLocation
} from '../../repositories/location.repository.js'

export async function handleLocations({ request, method, url, kv }) {
  const id = url.searchParams.get('id')
  if (method === 'GET') {
    if (id) {
      const location = await getLocation(kv, id)
      return location ? json(0, location) : json(404, {}, '位置不存在', 404)
    }
    return json(0, await listLocations(kv))
  }
  if (method === 'POST') {
    const body = await readBody(request)
    if (!body.name) return json(400, {}, 'name 必填')
    return json(0, await createLocation(kv, body), 'created')
  }
  if (method === 'PUT') {
    const body = await readBody(request)
    if (!body.id) return json(400, {}, 'id 必填')
    const updated = await updateLocation(kv, body.id, body)
    return updated ? json(0, updated) : json(404, {}, '位置不存在', 404)
  }
  if (method === 'DELETE') {
    if (!id) return json(400, {}, 'id 必填')
    const result = await deleteLocation(kv, id)
    return result.ok ? json(0, {}, 'deleted') : json(400, {}, result.msg)
  }
  return json(405, {}, 'Method Not Allowed', 405)
}
