// server/infrastructure/seed.js
// 首次运行时写入默认分类模板（需求内置 9 大类，含参数模板，支持树形嵌套）。
import { kvGetJSON, kvPutJSON } from './kv/index.js'
import { DEFAULT_CATEGORIES } from '../domain/models.js'
import { createCategory, listCategories, updateCategory } from '../repositories/category.repository.js'
import { idxGet } from '../repositories/kv-index.js'

// 内置参数模板版本：升级后会给已有分类补齐缺失的内置字段（只增不减）
const TEMPLATE_VERSION = 2

function collectDefaultTemplates(nodes, out = new Map()) {
  for (const node of nodes) {
    out.set(node.name, node.paramTemplate || [])
    if (node.children) collectDefaultTemplates(node.children, out)
  }
  return out
}

const DEFAULT_TEMPLATES = collectDefaultTemplates(DEFAULT_CATEGORIES)

/** 给已有的内置分类补齐新版默认字段（例如电容的「精度」），一次性执行 */
async function upgradeDefaultTemplates(kv) {
  const categories = await listCategories(kv)
  let changed = 0
  for (const cat of categories) {
    const defaults = DEFAULT_TEMPLATES.get(cat.name)
    if (!defaults || !defaults.length) continue
    const current = Array.isArray(cat.paramTemplate) ? cat.paramTemplate : []
    const missing = defaults.filter((f) => !current.some((x) => x.key === f.key))
    if (!missing.length) continue
    // 按默认模板顺序合并：已有字段保留用户改动，缺失字段插到默认位置，自定义字段排在最后
    const byKey = new Map(current.map((f) => [f.key, f]))
    const merged = defaults.map((f) => byKey.get(f.key) || { ...f })
    const extras = current.filter((f) => !defaults.some((d) => d.key === f.key))
    await updateCategory(kv, cat.id, { paramTemplate: [...merged, ...extras] })
    changed++
  }
  return changed
}

async function markTemplatesCurrent(kv) {
  const meta = (await kvGetJSON(kv, 'meta:info')) || { version: 1 }
  await kvPutJSON(kv, 'meta:info', { ...meta, templateVersion: TEMPLATE_VERSION })
}

// 递归写入分类树：父先于子，子通过 parentId 挂接。
async function seedNode(kv, node, parentId, order) {
  const created = await createCategory(kv, {
    name: node.name,
    parentId,
    order,
    paramTemplate: node.paramTemplate || []
  })
  if (node.children && node.children.length) {
    let i = 0
    for (const child of node.children) {
      await seedNode(kv, child, created.id, i++)
    }
  }
  return created
}

export async function seedIfEmpty(kv) {
  // 每个请求都会调用：模板版本已是当前值就只花 1 次读直接返回
  const meta = await kvGetJSON(kv, 'meta:info')
  if (meta && Number(meta.templateVersion || 1) >= TEMPLATE_VERSION) {
    return { seeded: false }
  }

  const ids = await idxGet(kv, 'index:categories')
  if (ids.length > 0) {
    // 已有数据：仅补齐内置分类新增的参数模板字段，不重建任何分类
    const upgraded = await upgradeDefaultTemplates(kv)
    await markTemplatesCurrent(kv)
    return { seeded: false, count: ids.length, upgraded }
  }

  let order = 0
  for (const c of DEFAULT_CATEGORIES) {
    await seedNode(kv, c, null, order++)
  }
  await markTemplatesCurrent(kv)
  return { seeded: true, count: DEFAULT_CATEGORIES.length }
}
