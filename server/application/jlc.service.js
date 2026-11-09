// server/application/jlc.service.js
// 嘉立创开放平台查询编排：把第三方返回整理成本系统统一的器件信息结构。
// 说明：开放平台各业务接口需要在控制台创建应用并申请权限，接口路径以下发的 API 文档为准，
// 因此路径通过 JLC_COMPONENT_PATH 配置，避免把未经验证的路径写死。

import { jlcConfigured, jlcPost } from '../infrastructure/jlc/client.js'

const DEFAULT_COMPONENT_PATH = ''

function firstOf(source, keys) {
  for (const key of keys) {
    const value = source?.[key]
    if (value !== undefined && value !== null && value !== '') return value
  }
  return ''
}

/** 从常见返回结构中取器件条目：data / data.list / data.records / data.items / result.data */
function pickItem(payload) {
  const root = payload?.data ?? payload?.result?.data ?? payload
  if (!root || typeof root !== 'object') return null
  for (const key of ['list', 'records', 'items', 'rows']) {
    if (Array.isArray(root[key]) && root[key].length) return root[key][0]
  }
  if (Array.isArray(root) && root.length) return root[0]
  return root
}

/** 统一成前端可直接展示的结构；字段名做多别名兼容，适配不同业务接口 */
export function normalizeComponent(raw, sku = '') {
  if (!raw || typeof raw !== 'object') return null
  const name = firstOf(raw, ['name', 'productName', 'componentName', 'goodsName', 'title'])
  const model = firstOf(raw, ['productModel', 'model', 'manufacturerModel', 'partNumber', 'spec'])
  const brand = firstOf(raw, ['brandName', 'brand', 'manufacturer', 'vendorName'])
  const pkg = firstOf(raw, ['package', 'encapsulation', 'footprint', 'packageName'])
  const stock = firstOf(raw, ['stockNumber', 'stock', 'inventory', 'availableStock'])
  const price = firstOf(raw, ['price', 'salePrice', 'unitPrice', 'goodsPrice'])
  const datasheet = firstOf(raw, ['datasheetUrl', 'pdfUrl', 'datasheet', 'fileUrl'])
  const code = firstOf(raw, ['productCode', 'componentCode', 'sku', 'goodsId']) || sku
  if (!name && !model && !brand && !code) return null
  return {
    sku: String(code),
    name: String(name || model || code),
    model: String(model),
    brand: String(brand),
    package: String(pkg),
    stock: stock === '' ? null : Number(stock) || stock,
    price: price === '' ? null : Number(price) || price,
    datasheetUrl: String(datasheet),
    params: (raw.params || raw.attributes || raw.properties || null)
  }
}

/**
 * 查询器件信息。
 * - 未配置密钥：返回配置指引，不抛错
 * - 未配置接口路径：返回提示（开放平台需按应用权限授予具体接口）
 * - 调用失败：返回明确错误（含 HTTP 状态与 trace id，便于找官方客服定位）
 */
export async function queryComponent(env = {}, sku = '', deps = {}) {
  if (!jlcConfigured(env)) {
    return {
      configured: false,
      ok: false,
      message: '未配置嘉立创开放平台密钥：请设置 JLC_APP_ID / JLC_ACCESS_KEY / JLC_SECRET_KEY'
    }
  }
  const path = String(env.JLC_COMPONENT_PATH || DEFAULT_COMPONENT_PATH).trim()
  if (!path) {
    return {
      configured: true,
      ok: false,
      message: '已配置密钥，但尚未设置 JLC_COMPONENT_PATH：请按开放平台下发的接口文档填写器件查询路径'
    }
  }
  try {
    const result = await jlcPost(path, { productCode: sku, componentCode: sku }, env, deps)
    const item = normalizeComponent(pickItem(result.data), sku)
    const businessOk = result.status === 200 && !(result.data && result.data.code && Number(result.data.code) !== 0)
    return {
      configured: true,
      ok: businessOk,
      status: result.status,
      traceId: result.traceId,
      item,
      message: businessOk
        ? (item ? '' : '接口返回成功，但未识别到器件字段')
        : (result.data?.message || `调用失败（HTTP ${result.status}）`)
    }
  } catch (e) {
    return {
      configured: true,
      ok: false,
      message: `调用嘉立创接口失败：${String((e && e.message) || e)}`
    }
  }
}
