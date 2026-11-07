// server/domain/scan.js
// 扫码内容解析：把二维码 / 条码 / 手工输入的文本还原成可检索的器件或库位。
// 支持四类输入：
//   1. 本系统生成的器件/库位二维码文本（见 qr.js）；
//   2. 带详情链接的 URL（#/p/:id、?open=:id、?focus=:id）；
//   3. 结构化 JSON（USB 扫码枪或外部系统常见）；
//   4. 任意型号 / 料号 / 名称片段，交给后端模糊检索。

const TITLE = '樂創元件仓'

// 二维码里是「型号 ABC」的空格写法，手工输入常见「型号：ABC」，两种都要认
const KEY_RE = /^(型号|封装|分类|品牌|库存|库位|编码|存放|内部料号|供应商料号|详情|参数)(?:\s*[：:]\s*|\s+)(.*)$/
const PARAM_RE = /^[·\-*]\s*([^：:]{1,20})[：:]\s*(.+)$/
const SKIP_RE = /^(参数|备注|数量|单价)$/

function clean(v) {
  return String(v ?? '').replace(/\s+/g, ' ').trim()
}

/**
 * @typedef {Object} ScanResult
 * @property {'part'|'location'|'query'|'empty'} kind
 * @property {string} raw
 * @property {string} [id]
 * @property {string} [query]
 * @property {string} [name]
 * @property {string} [model]
 * @property {string} [package]
 * @property {string} [internalNo]
 * @property {string} [code]
 * @property {string} [path]
 * @property {number} [quantity]
 * @property {string} [locationPath]
 * @property {Record<string,string>} [params]
 */

/** @returns {ScanResult} */
export function parseScanPayload(text) {
  const raw = String(text ?? '').trim()
  if (!raw) return { kind: 'empty', raw }

  const asJson = tryJson(raw)
  if (asJson) return fromJson(asJson, raw)

  if (/^https?:\/\//i.test(raw)) {
    const fromUrl = parseUrl(raw)
    if (fromUrl) return fromUrl
  }

  if (raw.startsWith('{') || raw.startsWith('[')) return { kind: 'query', raw, query: raw }

  const lines = raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
  const isQr = raw.includes(TITLE) || lines.some((l) => /^(型号|封装|内部料号|库存|库位)\s/.test(l))
  if (isQr) return parseQrText(lines, raw)

  // 纯文本条码：去掉常见前缀（如 P/N:、MODEL:）
  const stripped = raw.replace(/^(p\/?n|part\s*no|model|sku|料号|型号)\s*[:：]\s*/i, '').trim()
  return { kind: 'query', raw, query: stripped || raw }
}

function tryJson(raw) {
  if (!raw.startsWith('{') && !raw.startsWith('[')) return null
  try {
    const o = JSON.parse(raw)
    return o && typeof o === 'object' && !Array.isArray(o) ? o : null
  } catch {
    return null
  }
}

function fromJson(o, raw) {
  const id = clean(o.partId || o.part_id || o.id || '')
  const locationId = clean(o.locationId || o.location_id || '')
  const model = clean(o.model || o.manufacturerModel || '')
  const name = clean(o.name || o.partName || '')
  const internalNo = clean(o.internalNo || o.sku || '')
  const code = clean(o.code || '')
  const path = clean(o.path || o.locationPath || '')
  const params = o.params && typeof o.params === 'object' ? o.params : undefined

  if (o.type === 'location' || (locationId && !id && !model && !name)) {
    return {
      kind: 'location', raw,
      id: locationId || id || undefined,
      code: code || undefined,
      name: name || path.split(/\s*[/>]\s*/).filter(Boolean).pop() || undefined,
      path: path || undefined
    }
  }
  if (id) return { kind: 'part', raw, id, name: name || undefined, model: model || undefined, internalNo: internalNo || undefined, quantity: numOrUndef(o.quantity) }
  if (model || name || internalNo) {
    return { kind: 'part', raw, query: model || internalNo || name, name: name || undefined, model: model || undefined, internalNo: internalNo || undefined, params }
  }
  return { kind: 'query', raw, query: raw }
}

function parseUrl(raw) {
  let u
  try { u = new URL(raw) } catch { return null }
  const hash = u.hash || ''
  const hashQuery = (hash.split('?')[1] || '')
  const hp = new URLSearchParams(hashQuery)
  const sp = u.searchParams

  const partPath = hash.match(/\/p\/([A-Za-z0-9_-]+)/)
  const openId = hp.get('open') || sp.get('open') || (partPath ? partPath[1] : '')
  const focusId = hp.get('focus') || sp.get('focus')
  const locPath = hash.match(/\/l(?:ocation)?\/([A-Za-z0-9_-]+)/)
  const code = hp.get('code') || sp.get('code')
  const search = hp.get('search') || sp.get('search') || hp.get('q') || sp.get('q')

  if (openId) return { kind: 'part', raw, id: openId, quantity: numOrUndef(hp.get('qty') || sp.get('qty')) }
  if (focusId || locPath) return { kind: 'location', raw, id: focusId || locPath[1] }
  if (code) return { kind: 'location', raw, code }
  if (search) return { kind: 'query', raw, query: search }
  return { kind: 'query', raw, query: raw }
}

function parseQrText(lines, raw) {
  const header = lines[0] || ''
  const isLocation = header.includes('库位')
  const body = lines.slice(1)

  const fields = {}
  const params = {}
  const plain = []

  for (const line of body) {
    const kv = line.match(KEY_RE)
    if (kv) { fields[kv[1]] = kv[2].trim(); continue }
    const pm = line.match(PARAM_RE)
    if (pm) { params[pm[1].trim()] = pm[2].trim(); continue }
    if (SKIP_RE.test(line)) continue
    plain.push(line)
  }

  if (isLocation) {
    // 库位码第二行就是完整路径；带「库位」字段的变体也兼容
    const path = fields['库位'] || plain[0] || ''
    return {
      kind: 'location', raw,
      code: fields['编码'] || undefined,
      path: path || undefined,
      name: path ? path.split(/\s*[/>]\s*/).filter(Boolean).pop() : plain[0],
      quantity: numOrUndef((fields['存放'] || '').match(/(\d+)\s*件/)?.[1])
    }
  }

  const name = plain[0] || fields['名称'] || ''
  const model = fields['型号'] || ''
  const internalNo = fields['内部料号'] || ''
  return {
    kind: 'part', raw,
    name: name || undefined,
    model: model || undefined,
    package: fields['封装'] || undefined,
    internalNo: internalNo || undefined,
    quantity: numOrUndef(fields['库存']),
    locationPath: fields['库位'] || undefined,
    params: Object.keys(params).length ? params : undefined,
    query: model || internalNo || name || raw
  }
}

function numOrUndef(v) {
  if (v === undefined || v === null || v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

/** 给用户看的识别结果摘要 */
export function describeScan(r) {
  if (!r) return ''
  if (r.kind === 'part') return r.model || r.internalNo || r.name || r.id || '器件'
  if (r.kind === 'location') return r.path || r.code || r.name || r.id || '库位'
  if (r.kind === 'query') return r.query || ''
  return ''
}
