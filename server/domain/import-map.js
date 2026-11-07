// server/domain/import-map.js
// 订单导入字段映射（纯函数，无 KV / Node 依赖，前端与后端共用）。
// 各采购平台导出的表格列名不一，这里用「别名词典」把原始列映射到统一字段。
// 映射后统一做归一化：封装标准化、名称清洗、从标题抽取参数。

import { cleanName, normalizePackage, extractFromText, guessCategoryName } from './normalize.js'

export const PLATFORMS = [
  { id: 'lcsc', label: '立创商城 (LCSC)' },
  { id: 'mouser', label: '贸泽电子 (Mouser)' },
  { id: 'digikey', label: '得捷电子 (DigiKey)' },
  { id: 'taobao', label: '淘宝 / 1688' },
  { id: 'generic', label: '通用自定义' }
]

// 入库批次里记录短名，和手动入库的「来源」保持一致
export const PLATFORM_SHORT = {
  lcsc: '立创',
  mouser: '贸泽',
  digikey: '得捷',
  taobao: '淘宝/1688',
  generic: '通用'
}

// 通用字段别名（所有平台共用）
const COMMON = {
  quantity: ['数量', '采购数量', 'qty', 'quantity', '数量(个)', '购买数量'],
  unitPrice: ['单价', '单价(元)', '价格', '价格(元)', 'unitprice', 'unit price', 'price', '单价cny', '单价rmb'],
  orderNo: ['订单号', '订单编号', 'order', 'orderno', 'order number'],
  url: ['商品链接', '链接', 'url', 'link', '商品地址']
}

// 平台专属别名
const SPECIFIC = {
  lcsc: {
    sku: ['商品编号', 'c号', 'c编号', 'lcsc', 'lcsc编号', '货号', '商品编码', 'part number'],
    name: ['商品名称', '商品名', '名称', '产品名称', 'description', '描述'],
    package: ['封装', '封装规格', 'package', 'footprint', '尺寸']
  },
  mouser: {
    sku: ['贸泽料号', 'mouser', 'mouserpart', 'mouserpartnumber', '料号', 'mouser料号'],
    model: ['原厂型号', '型号', 'manufacturerpart', 'mpn', '原厂', 'manufacturerpartnumber'],
    package: ['封装', 'package', 'footprint']
  },
  digikey: {
    sku: ['digikey', 'dk', 'digikeypart', 'digikey料号', 'digikey编号', '料号'],
    model: ['原厂型号', '型号', 'manufacturerpart', 'mpn', '原厂'],
    package: ['封装', 'package', 'footprint']
  },
  taobao: {
    name: ['商品名称', '宝贝标题', '标题', '名称', '产品名称'],
    model: ['规格型号', '型号', '规格', 'sku规格'],
    package: ['封装', 'package']
  },
  generic: {
    sku: ['料号', 'sku', '编号', '商品编号'],
    name: ['名称', '商品名称', '品名', '描述'],
    model: ['型号', '原厂型号', '规格型号'],
    package: ['封装', '封装规格', '规格']
  }
}

function normHeader(h) {
  return String(h || '').toLowerCase().replace(/\s+/g, '').replace(/[（）()]/g, '')
}

function buildLookup(platform) {
  const lookup = {}
  const specs = SPECIFIC[platform] || SPECIFIC.generic
  const all = { ...specs, ...COMMON }
  for (const [field, aliases] of Object.entries(all)) {
    for (const a of aliases) lookup[normHeader(a)] = field
  }
  return lookup
}

// 根据表头自动识别平台
export function detectPlatform(headers) {
  const set = new Set(headers.map(normHeader))
  const has = (s) => [...set].some((h) => h.includes(s))
  if (has('商品编号') || has('lcsc') || has('c号')) return 'lcsc'
  if (has('贸泽') || has('mouser')) return 'mouser'
  if (has('digikey') || has('得捷') || has('dk')) return 'digikey'
  if (has('规格型号') || has('宝贝') || has('淘宝') || has('1688') || has('taobao')) return 'taobao'
  return 'generic'
}

function pick(row, lookup, field) {
  for (const [header, value] of Object.entries(row)) {
    const f = lookup[normHeader(header)]
    if (f === field && value !== undefined && value !== null && String(value).trim() !== '') {
      return value
    }
  }
  return ''
}

function toNumber(v) {
  if (v === '' || v == null) return 0
  const n = parseFloat(String(v).replace(/[¥￥$,，\s]/g, ''))
  return isNaN(n) ? 0 : n
}

// 把一行原始数据映射为统一结构（含归一化）
export function mapRow(platform, rawRow) {
  const lookup = buildLookup(platform)
  const sku = String(pick(rawRow, lookup, 'sku')).trim()
  const rawName = String(pick(rawRow, lookup, 'name')).trim()
  const model = String(pick(rawRow, lookup, 'model')).trim()
  const rawPkg = String(pick(rawRow, lookup, 'package')).trim()
  const quantity = toNumber(pick(rawRow, lookup, 'quantity'))
  const unitPrice = toNumber(pick(rawRow, lookup, 'unitPrice'))
  const orderNo = String(pick(rawRow, lookup, 'orderNo')).trim()
  const url = String(pick(rawRow, lookup, 'url')).trim()

  const name = cleanName(rawName) || rawName || model || sku
  // 从「名称 + 型号 + 规格」里提取封装与电气参数，避免只存一个标题
  const extracted = extractFromText(`${rawName} ${model} ${rawPkg}`)
  const pkg = normalizePackage(rawPkg) || extracted.package

  return {
    platform,
    sku,
    name,
    manufacturerModel: model,
    package: pkg,
    params: extracted.params,
    categoryName: guessCategoryName(`${name} ${model}`),
    quantity,
    unitPrice,
    orderNo,
    url,
    raw: rawRow
  }
}

// 通用模板：允许用户手动映射（列名 -> 字段）
export function manualMap(rawRow, columnMap) {
  const get = (field) => {
    const header = columnMap[field]
    if (!header) return ''
    return rawRow[header] ?? ''
  }
  const name = cleanName(String(get('name') || get('model') || get('sku')))
  const model = String(get('model')).trim()
  const rawPkg = String(get('package')).trim()
  const extracted = extractFromText(`${name} ${model} ${rawPkg}`)
  return {
    platform: columnMap.platform || 'generic',
    sku: String(get('sku')).trim(),
    name: name || model,
    manufacturerModel: model,
    package: normalizePackage(rawPkg) || extracted.package,
    params: extracted.params,
    categoryName: guessCategoryName(`${name} ${model}`),
    quantity: toNumber(get('quantity')),
    unitPrice: toNumber(get('unitPrice')),
    orderNo: String(get('orderNo')).trim(),
    url: String(get('url')).trim(),
    raw: rawRow
  }
}
