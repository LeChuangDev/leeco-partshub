// server/infrastructure/easyeda/client.js
// 嘉立创 EDA 公开器件库客户端（无需密钥）。
// 用途：立创商城料号（C 开头）→ 名称 / 品牌 / 封装 / 参数值 / 价格 / 库存 / 商品链接。
// 该接口是嘉立创 EDA 编辑器自身使用的公开数据源，只读、无鉴权；若官方调整结构，只改本文件。

const API_BASE = 'https://easyeda.com/api/products'
const TIMEOUT_MS = 8000

/** 是否为立创商城料号（C + 数字） */
export function isLcscCode(code = '') {
  return /^C\d{3,}$/i.test(String(code).trim())
}

/**
 * 按料号读取器件详情。
 * @returns {Promise<object|null>} 原始 JSON 的 result 字段；不存在时返回 null
 */
export async function fetchByLcscCode(code, deps = {}) {
  const id = String(code).trim().toUpperCase()
  if (!isLcscCode(id)) return null
  const fetchImpl = deps.fetchImpl || fetch
  const response = await fetchImpl(`${API_BASE}/${encodeURIComponent(id)}/components`, {
    headers: { accept: 'application/json' }
  })
  if (!response.ok) return null
  const payload = await response.json().catch(() => null)
  return payload?.result || null
}

export { API_BASE, TIMEOUT_MS }
