// server/domain/param-template.js
// 分类参数模板 key 生成：纯函数，前后端与单测共用。
// 规则：保留中文与字母数字，其余折叠为连字符；已有 key 优先沿用，冲突自动编号。

export function buildParamTemplate(list = []) {
  const used = new Set()
  const rows = Array.isArray(list) ? list : []
  return rows
    .filter((p) => p && String(p.label || '').trim())
    .map((p) => {
      const label = String(p.label).trim()
      const base = label
        .toLowerCase()
        .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'param'
      let key = String(p.key || '').trim()
      if (!key || used.has(key)) {
        key = base
        let n = 2
        while (used.has(key)) key = `${base}_${n++}`
      }
      used.add(key)
      const out = { key, label, type: p.type || 'text' }
      if (p.unit) out.unit = String(p.unit).trim()
      if (Array.isArray(p.options) && p.options.length) out.options = p.options.filter(Boolean)
      return out
    })
}
