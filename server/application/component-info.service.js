// server/application/component-info.service.js
// 器件信息查询编排：优先官方开放平台（需授权），否则回退到嘉立创 EDA 公开器件库（按 C 料号，无需密钥）。
// 两条通道都只读，且都不会把密钥返回给前端。

import { jlcConfigured } from '../infrastructure/jlc/client.js'
import { jlcPost } from '../infrastructure/jlc/client.js'
import { fetchByLcscCode, isLcscCode } from '../infrastructure/easyeda/client.js'
import { normalizePackage } from '../domain/normalize.js'

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

/** 官方接口字段归一化：字段名做多别名兼容 */
export function normalizeComponent(raw, sku = '') {
  if (!raw || typeof raw !== 'object') return null
  const name = firstOf(raw, ['name', 'productName', 'componentName', 'goodsName', 'title'])
  const model = firstOf(raw, ['productModel', 'model', 'manufacturerModel', 'partNumber', 'spec'])
  const brand = firstOf(raw, ['brandName', 'brand', 'manufacturer', 'vendorName'])
  const pkg = firstOf(raw, ['package', 'encapsulation', 'footprint', 'packageName'])
  const stock = firstOf(raw, ['stockNumber', 'stock', 'inventory', 'availableStock'])
  const price = firstOf(raw, ['price', 'salePrice', 'unitPrice', 'goodsPrice'])
  const datasheet = firstOf(raw, ['datasheetUrl', 'pdfUrl', 'datasheet', 'fileUrl'])
  const url = firstOf(raw, ['productUrl', 'url', 'detailUrl'])
  const code = firstOf(raw, ['productCode', 'componentCode', 'sku', 'goodsId']) || sku
  if (!name && !model && !brand && !code) return null
  return {
    source: 'jlc',
    sku: String(code),
    name: String(name || model || code),
    model: String(model),
    brand: String(brand),
    package: String(pkg),
    stock: stock === '' ? null : Number(stock) || stock,
    price: price === '' ? null : Number(price) || price,
    datasheetUrl: String(datasheet),
    url: String(url),
    params: (raw.params || raw.attributes || raw.properties || null)
  }
}

/** 嘉立创 EDA 公开器件库字段归一化 */
export function normalizeEasyEda(result, sku = '') {
  if (!result || typeof result !== 'object') return null
  const para = result.dataStr?.head?.c_para || {}
  const lcsc = result.lcsc || result.szlcsc || {}
  const code = String(lcsc.number || para['Supplier Part'] || sku).toUpperCase()
  if (!code) return null
  const model = String(para['Manufacturer Part'] || result.title || '')
  const value = String(para.Value || '')
  const description = String(result.description || '')
  const params = {}
  // 把 EDA 参数里除基础字段外的内容转成 key: value，便于展示与后续检索
  for (const [key, val] of Object.entries(para)) {
    if (['name', 'Supplier', 'Manufacturer', 'Manufacturer Part', 'Supplier Part', 'package', 'pre'].includes(key)) continue
    if (val !== '' && val != null) params[key] = String(val)
  }
  return {
    source: 'easyeda',
    sku: code,
    name: [value, model].filter(Boolean).join(' ') || description || model || code,
    model,
    brand: String(para.Manufacturer || ''),
    package: normalizePackage(String(para.package || '')) || String(para.package || ''),
    stock: lcsc.stock == null ? null : Number(lcsc.stock),
    price: lcsc.price == null ? null : Number(lcsc.price),
    datasheetUrl: '',
    url: String(lcsc.url || ''),
    description,
    params
  }
}

function notConfiguredMessage() {
  return '未配置嘉立创开放平台密钥；可直接输入立创料号（C 开头，如 C25804）使用公开器件库查询'
}

async function viaOfficial(env, sku, deps) {
  const path = String(env.JLC_COMPONENT_PATH || '').trim()
  if (!path) {
    return { configured: true, ok: false, message: '已配置密钥，但尚未设置 JLC_COMPONENT_PATH：请按开放平台下发的接口文档填写器件查询路径' }
  }
  const result = await jlcPost(path, { productCode: sku, componentCode: sku }, env, deps)
  const item = normalizeComponent(pickItem(result.data), sku)
  const businessOk = result.status === 200 && !(result.data && result.data.code && Number(result.data.code) !== 0)
  return {
    configured: true,
    ok: businessOk,
    source: 'jlc',
    status: result.status,
    traceId: result.traceId,
    item,
    message: businessOk ? (item ? '' : '接口返回成功，但未识别到器件字段') : (result.data?.message || `调用失败（HTTP ${result.status}）`)
  }
}

/**
 * 查询器件信息。
 * 优先官方开放平台；未配置或查询失败时，C 料号回退到嘉立创 EDA 公开器件库。
 * @param {object} env 环境变量（JLC_*）
 * @param {string} sku 立创料号或型号
 * @param {{ fetchImpl?: Function, now?: () => number, nonce?: string }} [deps]
 */
export async function queryComponent(env = {}, sku = '', deps = {}) {
  const code = String(sku).trim()
  if (!code) return { configured: false, ok: false, message: '请输入料号' }

  if (jlcConfigured(env)) {
    try {
      const official = await viaOfficial(env, code, deps)
      if (official.ok && official.item) return { ...official, fallback: false }
      if (!isLcscCode(code)) return { ...official, fallback: false }
      const publicItem = await fallbackEasyEda(code, deps)
      if (publicItem) return { configured: true, ok: true, source: 'easyeda', item: publicItem, fallback: true, message: '' }
      return { ...official, fallback: false }
    } catch (e) {
      if (!isLcscCode(code)) {
        return { configured: true, ok: false, message: `调用嘉立创接口失败：${String((e && e.message) || e)}` }
      }
    }
  }

  if (!isLcscCode(code)) {
    return { configured: false, ok: false, message: notConfiguredMessage() }
  }
  const item = await fallbackEasyEda(code, deps)
  if (!item) {
    return { configured: false, ok: false, message: `未查询到料号 ${code.toUpperCase()}，请确认是否为立创商城 C 料号` }
  }
  return { configured: false, ok: true, source: 'easyeda', item, fallback: true, message: '' }
}

async function fallbackEasyEda(code, deps) {
  try {
    const raw = await fetchByLcscCode(code, deps)
    return raw ? normalizeEasyEda(raw, code) : null
  } catch {
    return null
  }
}
