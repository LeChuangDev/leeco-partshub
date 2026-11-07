// shared/seed.js
// 首次运行时写入默认分类模板（需求内置 9 大类，含参数模板，支持树形嵌套）。
import { DEFAULT_CATEGORIES } from './models.js'
import { listCategories, createCategory } from './store.js'

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
  const existing = await listCategories(kv)
  if (existing.length > 0) return { seeded: false, count: existing.length }
  let order = 0
  for (const c of DEFAULT_CATEGORIES) {
    await seedNode(kv, c, null, order++)
  }
  return { seeded: true, count: DEFAULT_CATEGORIES.length }
}
