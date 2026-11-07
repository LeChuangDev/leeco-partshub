// server/repositories/location.repository.js
// 存储位置聚合：树形位置的持久化。删除位置时子位置上移，不级联删除库存批次。

import { kvGetJSON, kvPutJSON } from '../infrastructure/kv/index.js'
import { newLocation, nowISO } from '../domain/models.js'
import { idxAdd, idxGet, idxRemove, touchMeta } from './kv-index.js'

const INDEX = 'index:locations'

export async function listLocations(kv) {
  const ids = await idxGet(kv, INDEX)
  const items = []
  for (const id of ids) {
    const l = await kvGetJSON(kv, `location:${id}`)
    if (l) items.push(l)
  }
  return items
}

export async function createLocation(kv, input) {
  const loc = newLocation(input)
  await kvPutJSON(kv, `location:${loc.id}`, loc)
  await idxAdd(kv, INDEX, loc.id)
  await touchMeta(kv)
  return loc
}

export async function updateLocation(kv, id, patch) {
  const loc = await kvGetJSON(kv, `location:${id}`)
  if (!loc) return null
  const allowed = ['name', 'parentId', 'code', 'grid']
  for (const k of allowed) if (k in patch) loc[k] = patch[k]
  loc.updatedAt = nowISO()
  await kvPutJSON(kv, `location:${id}`, loc)
  return loc
}

export async function deleteLocation(kv, id) {
  const loc = await kvGetJSON(kv, `location:${id}`)
  if (!loc) return { ok: false, msg: '位置不存在' }
  const all = await listLocations(kv)
  const children = all.filter((l) => l.parentId === id)
  for (const c of children) await updateLocation(kv, c.id, { parentId: loc.parentId })
  // 批次上的 locationId 保留，前台展示时回退为「未知位置」，避免误删库存
  await kv.del(`location:${id}`)
  await idxRemove(kv, INDEX, id)
  await touchMeta(kv)
  return { ok: true }
}

export async function getLocation(kv, id) {
  return kvGetJSON(kv, `location:${id}`)
}
