// server/repositories/category.repository.js
// 分类聚合：树形分类的持久化与层级查询。业务规则（删除前校验、子级上移）留在这里，
// 保证任何入口（HTTP、导入、脚本）走同一套约束。

import { kvGetJSON, kvPutJSON, KV_BATCH, mapLimit } from '../infrastructure/kv/index.js'
import { newCategory, nowISO } from '../domain/models.js'
import { idxAdd, idxGet, idxRemove, touchMeta } from './kv-index.js'

const INDEX = 'index:categories'

export async function listCategories(kv) {
  const ids = await idxGet(kv, INDEX)
  const docs = await mapLimit(ids, KV_BATCH, (id) => kvGetJSON(kv, `category:${id}`))
  const items = docs.filter(Boolean)
  items.sort((a, b) => (a.order || 0) - (b.order || 0))
  return items
}

export async function getCategory(kv, id) {
  return kvGetJSON(kv, `category:${id}`)
}

export async function createCategory(kv, input) {
  const cat = newCategory(input)
  await kvPutJSON(kv, `category:${cat.id}`, cat)
  await idxAdd(kv, INDEX, cat.id)
  await touchMeta(kv)
  return cat
}

export async function updateCategory(kv, id, patch) {
  const cat = await kvGetJSON(kv, `category:${id}`)
  if (!cat) return null
  const allowed = ['name', 'parentId', 'order', 'paramTemplate']
  for (const k of allowed) {
    if (k in patch) cat[k] = patch[k]
  }
  cat.updatedAt = nowISO()
  await kvPutJSON(kv, `category:${id}`, cat)
  return cat
}

export async function deleteCategory(kv, id) {
  const cat = await kvGetJSON(kv, `category:${id}`)
  if (!cat) return { ok: false, msg: '分类不存在' }
  const all = await listCategories(kv)
  const children = all.filter((c) => c.parentId === id)
  const partsInCat = await idxGet(kv, `index:parts:cat:${id}`)
  if (partsInCat.length > 0) {
    return { ok: false, msg: `该分类下还有 ${partsInCat.length} 个元器件，请先移走或删除` }
  }
  // 有子分类则上移到当前分类的父级，避免树断裂
  for (const child of children) {
    await updateCategory(kv, child.id, { parentId: cat.parentId })
  }
  await kv.del(`category:${id}`)
  await idxRemove(kv, INDEX, id)
  await touchMeta(kv)
  return { ok: true }
}

/** 返回自身 + 全部后代分类 ID，供分类筛选下钻 */
export async function getCategoryDescendants(kv, rootId) {
  const all = await listCategories(kv)
  const result = new Set([rootId])
  let changed = true
  while (changed) {
    changed = false
    for (const c of all) {
      if (c.parentId && result.has(c.parentId) && !result.has(c.id)) {
        result.add(c.id)
        changed = true
      }
    }
  }
  return [...result]
}
