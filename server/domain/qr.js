// server/domain/qr.js
// 扫码内容构造：把器件/库位信息压成适合二维码承载的纯文本。
// 设计原则：
//   1. 任意扫码工具（相机、微信、支付宝）都能直接读出可理解的中文内容，无需联网或登录；
//   2. compact 版控制在 8 行内，保证 14mm 小标签也能稳定识别；
//   3. 部署到公网后可选追加详情链接，方便在手机上打开完整档案。

import { BRAND_TITLE as TITLE } from './brand.js'

function clean(v) {
  return String(v ?? '').replace(/[\r\n\t]+/g, ' ').trim()
}

function clip(v, max) {
  const s = clean(v)
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

/** 取路径最后 n 段，用于小标签上压缩库位长度 */
export function shortPath(path, keep = 2) {
  const parts = clean(path).split(/\s*[/>]\s*/).filter(Boolean)
  return parts.slice(-keep).join('/')
}

/**
 * 参数摘要：按模板顺序取前 limit 个有值的参数。
 * @param {Record<string,string>} params
 * @param {Record<string,string>} labels key → 中文标签
 */
export function paramPairs(params = {}, labels = {}, limit = 2) {
  const entries = Object.entries(params || {}).filter(([, v]) => clean(v))
  const pairs = entries.map(([k, v]) => ({
    key: k,
    label: labels[k] || k,
    value: clip(v, 22)
  }))
  // 已知模板参数优先，其它自定义参数补在后面
  pairs.sort((a, b) => (labels[a.key] ? 0 : 1) - (labels[b.key] ? 0 : 1))
  return typeof limit === 'number' ? pairs.slice(0, limit) : pairs
}

/** 器件扫码文本 */
export function buildPartQrText(part, opts = {}) {
  if (!part) return ''
  const mode = opts.mode === 'full' ? 'full' : 'compact'
  const name = clip(part.name || part.manufacturerModel || '未命名器件', mode === 'full' ? 40 : 24)
  const model = clip(part.manufacturerModel || '', 32)
  const pkg = clip(part.package || '', 16)
  const qty = Number(opts.quantity ?? 0)
  const loc = clip(opts.locationPath || '', 40)
  const pairs = paramPairs(part.params, opts.paramLabels || {}, mode === 'full' ? 14 : 2)
  // 详情链接只有公网地址才有意义；本地地址印在标签上无法从手机打开
  const link = isPublicOrigin(opts.origin) ? clean(opts.origin) : ''

  const lines = [`${TITLE} · ${mode === 'full' ? '器件档案' : '器件'}`, name]
  if (model) lines.push(`型号 ${model}`)
  if (pkg) lines.push(`封装 ${pkg}`)
  if (mode === 'full' && opts.categoryName) lines.push(`分类 ${clip(opts.categoryName, 30)}`)
  if (mode === 'full' && part.brand) lines.push(`品牌 ${clip(part.brand, 20)}`)

  if (pairs.length) {
    if (mode === 'full') {
      lines.push('参数')
      for (const p of pairs) lines.push(`· ${p.label}：${p.value}`)
    } else {
      lines.push(pairs.map((p) => `${p.label} ${p.value}`).join(' · '))
    }
  }

  lines.push(`库存 ${qty}`)
  if (loc) lines.push(`库位 ${mode === 'full' ? loc : shortPath(loc, 2)}`)
  if (mode === 'full') {
    if (part.internalNo) lines.push(`内部料号 ${clip(part.internalNo, 24)}`)
    const sku = (part.suppliers || []).find((s) => s && s.sku)
    if (sku) lines.push(`供应商料号 ${clip(sku.sku, 24)}`)
    if (link) lines.push(`详情 ${link}/#/p/${part.id}`)
  }
  return lines.join('\n')
}

/** 库位扫码文本 */
export function buildLocationQrText(loc, opts = {}) {
  if (!loc) return ''
  const path = clean(opts.path || loc.name)
  const lines = [`${TITLE} · 库位`, path]
  if (loc.code) lines.push(`编码 ${clip(loc.code, 24)}`)
  const kinds = Number(opts.partKinds ?? 0)
  const qty = Number(opts.quantity ?? 0)
  if (kinds || qty) lines.push(`存放 ${kinds} 种 / ${qty} 件`)
  if (isPublicOrigin(opts.origin)) lines.push(`详情 ${clean(opts.origin)}/#/locations?focus=${loc.id}`)
  return lines.join('\n')
}

/** 判断是否公网可访问地址（本机地址不适合印在标签上） */
export function isPublicOrigin(origin) {
  const s = clean(origin)
  if (!/^https?:\/\//i.test(s)) return false
  return !/^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?/i.test(s)
}
