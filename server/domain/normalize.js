// server/domain/normalize.js
// 工程数值 / 封装名称 / 物料名称 归一化（纯函数，浏览器与边缘函数共用）。
// 目标：同一物料因「1000nF / 1µF」「0603(1608) / 1608 Metric」等写法差异被重复建档。

/* ------------------------------- 单位与工程值 ------------------------------- */

export const UNIT_OF = {
  resistance: 'Ω',
  capacitance: 'F',
  inductance: 'H',
  voltage: 'V',
  current: 'A',
  power: 'W',
  frequency: 'Hz'
}

const PREFIX = {
  G: 1e9,
  M: 1e6,
  k: 1e3,
  K: 1e3,
  '': 1,
  m: 1e-3,
  'µ': 1e-6,
  'μ': 1e-6,
  u: 1e-6,
  U: 1e-6,
  n: 1e-9,
  N: 1e-9,
  p: 1e-12,
  P: 1e-12
}

const PREFIX_ORDER = ['G', 'M', 'k', '', 'm', 'µ', 'n', 'p']

const UNIT_FAMILY = {
  'Ω': 'resistance',
  OHM: 'resistance',
  OHMS: 'resistance',
  F: 'capacitance',
  H: 'inductance',
  V: 'voltage',
  A: 'current',
  W: 'power',
  HZ: 'frequency'
}

/**
 * 解析工程写法为基本单位数值。
 * 支持：1000nF、1µF、10K、4R7、1K2、3V3、10kΩ、0.1uF、100NF
 * @returns {{value:number, family:string}|null}
 */
export function parseSI(raw, familyHint = '') {
  if (raw == null) return null
  const s = String(raw).trim().replace(/\s+/g, '').replace(/[，,]/g, '')
  if (!s) return null

  // 工程标记法：4R7 = 4.7Ω，1K2 = 1.2kΩ，3V3 = 3.3V
  const marked = s.match(/^(\d+)([rRkKmMvV])(\d+)$/)
  if (marked) {
    const mark = marked[2]
    const isVolt = mark === 'V' || mark === 'v'
    const isOhm = mark === 'R' || mark === 'r'
    const mult = isVolt || isOhm ? 1 : PREFIX[mark] ?? 1
    return {
      value: parseFloat(`${marked[1]}.${marked[3]}`) * mult,
      family: familyHint || (isVolt ? 'voltage' : 'resistance')
    }
  }

  const m = s.match(/^([-+]?\d*\.?\d+)([pPnNuUµμmMkKG]?)([A-Za-zΩμµ]+)?$/)
  if (!m) return null
  const num = parseFloat(m[1])
  if (!isFinite(num)) return null
  const prefix = m[2] || ''
  const unitRaw = (m[3] || '').toUpperCase()
  const family = (unitRaw && UNIT_FAMILY[unitRaw]) || familyHint || ''
  if (!prefix && !unitRaw && !familyHint) return null
  const mult = PREFIX[prefix] ?? 1
  return { value: num * mult, family }
}

/** 基本单位数值 → 最合适的工程写法，如 10000 + resistance → 10kΩ */
export function formatSI(value, family) {
  if (value == null || !isFinite(value)) return ''
  const unit = UNIT_OF[family] || ''
  if (value === 0) return '0' + unit
  const abs = Math.abs(value)
  let prefix = ''
  for (const p of PREFIX_ORDER) {
    if (PREFIX[p] <= abs) { prefix = p; break }
  }
  const num = Number((value / PREFIX[prefix]).toPrecision(4))
  return `${num}${prefix}${unit}`
}

/** 同一数值的可检索写法集合（含无单位写法与 µ/u 变体） */
export function siVariants(value, family) {
  const f = formatSI(value, family)
  if (!f) return []
  const unit = UNIT_OF[family] || ''
  const bare = unit ? f.replace(new RegExp(unit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'), '') : f
  const out = new Set([f.toLowerCase(), String(Number(value.toPrecision(6)))])
  // 无单位写法仅在有意义时加入（10k 保留，1µ 这种模糊写法丢弃）
  if (bare && (!/[pnuµμmMkKG]$/.test(bare) || /[\d.]{2,}[pnuµμmMkKG]$/.test(bare))) {
    out.add(bare.toLowerCase())
  }
  if (f.includes('µ')) out.add(f.replace(/µ/g, 'u').toLowerCase())
  return [...out]
}

/** 基本单位数值 → EIA 三位/四位代码（10kΩ → 103，10nF → 103） */
const EIA_BASE = { resistance: 1, capacitance: 1e12, inductance: 1e6 }
export function eiaCode(value, family) {
  const mul = EIA_BASE[family]
  if (!mul) return ''
  const base = value * mul
  if (!isFinite(base) || base < 10 || base >= 1e10) return ''
  let mant = base
  let exp = 0
  while (mant >= 100) { mant /= 10; exp++ }
  const r = Math.round(mant)
  if (Math.abs(mant - r) > 1e-6 || r < 10 || r > 99) return ''
  return `${r}${exp}`
}

/** EIA 代码 → 电阻/电容/电感三种基本单位数值（103 存在固有歧义，三种都给出） */
export function eiaDecode(code) {
  const s = String(code || '')
  let mant, exp
  if (/^\d{3}$/.test(s)) { mant = Number(s.slice(0, 2)); exp = Number(s[2]) }
  else if (/^\d{4}$/.test(s)) { mant = Number(s.slice(0, 3)); exp = Number(s[3]) }
  else return null
  const raw = mant * Math.pow(10, exp)
  return { resistance: raw, capacitance: raw * 1e-12, inductance: raw * 1e-6 }
}

/* ------------------------------- 参数字段 ------------------------------- */

const KEY_FAMILY = [
  [/(rdson|导通电阻)/i, 'resistance'],
  [/(resistance|阻值|电阻)/i, 'resistance'],
  [/(capacitance|容值|电容)/i, 'capacitance'],
  [/(inductance|感值|电感)/i, 'inductance'],
  [/(voltage|耐压|电压|vin|vout|vcc|vdd|vsup|vds|breakdown|clamp)/i, 'voltage'],
  [/(current|电流|iout|forwardcurrent)/i, 'current'],
  [/(power|功率)/i, 'power'],
  [/(frequency|freq|频率|主频|带宽|gbw)/i, 'frequency']
]

export function familyOfKey(key) {
  const k = String(key || '')
  for (const [re, fam] of KEY_FAMILY) if (re.test(k)) return fam
  return ''
}

/** 参数值统一为标准工程写法；解析失败（如 2.5~5.5V 区间）保持原样 */
export function normalizeParams(params = {}) {
  const out = {}
  for (const [k, v] of Object.entries(params || {})) {
    if (/tolerance|精度/i.test(k) && v != null && v !== '') {
      const m = String(v).match(/(\d+(?:\.\d+)?)\s*%/)
      out[k] = m ? `±${Number(m[1])}%` : v
      continue
    }
    const fam = familyOfKey(k)
    if (!fam || v == null || v === '') { out[k] = v; continue }
    const parsed = parseSI(v, fam)
    out[k] = parsed && isFinite(parsed.value) && parsed.value > 0 ? formatSI(parsed.value, fam) : v
  }
  return out
}

/* ------------------------------- 封装 ------------------------------- */

const IMPERIAL = ['0201', '0402', '0603', '0805', '1206', '1210', '1812', '2010', '2512']
const METRIC_TO_IMPERIAL = {
  '0603': '0201', '1005': '0402', '1608': '0603', '2012': '0805',
  '3216': '1206', '3225': '1210', '4532': '1812', '5025': '2010', '6332': '2512'
}

/**
 * 在一段文本里识别封装并标准化为行业惯用（英制）写法。
 * 0603 / 0603(1608) / 1608 Metric / C0603 → 0603；SOT23 → SOT-23
 * 未识别返回 ''。
 */
export function matchPackage(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return ''

  // 明确公制：1608 Metric / 1608 公制
  const metric = s.match(/(\d{4})\s*(?:metric|公制|米制)/i)
  if (metric && METRIC_TO_IMPERIAL[metric[1]]) return METRIC_TO_IMPERIAL[metric[1]]

  // 双写法：0603(1608) / 0603_1608 / 0603-1608
  const dual = s.match(/(\d{4})\s*[(_\-]\s*(\d{4})/)
  if (dual) {
    if (IMPERIAL.includes(dual[1])) return dual[1]
    if (METRIC_TO_IMPERIAL[dual[2]]) return METRIC_TO_IMPERIAL[dual[2]]
    if (METRIC_TO_IMPERIAL[dual[1]]) return METRIC_TO_IMPERIAL[dual[1]]
  }

  // 常规贴片/插件封装：SOT-23 / SOP8 / QFN32 / TO220
  const named = s.match(/(SOT|SOD|SOP|SOIC|TSSOP|MSOP|QFN|DFN|LQFP|TQFP|QFP|DIP|TO|SSOP|BGA)[-_ ]?(\d+)(?:-\d+)?/i)
  if (named) return `${named[1].toUpperCase()}-${named[2]}`

  // 独立的四位封装代码（英制优先，符合 EDA 习惯）
  for (const code of IMPERIAL) {
    if (new RegExp(`(^|\\D)${code}(\\D|$)`).test(s)) return code
  }
  for (const code of Object.keys(METRIC_TO_IMPERIAL)) {
    if (new RegExp(`(^|\\D)${code}(\\D|$)`).test(s)) return METRIC_TO_IMPERIAL[code]
  }
  return ''
}

export function normalizePackage(raw) {
  const s = String(raw ?? '').trim()
  return matchPackage(s) || s
}

/* ------------------------------- 名称清洗 ------------------------------- */

const NOISE = [
  '全新原装', '原装正品', '原装进口', '进口原装', '全新', '原装', '正品', '包邮', '现货',
  '厂家直销', '工厂直销', '直销', '特价', '促销', '热卖', '爆款', '批发', '可开票', '开票',
  '实物拍摄', '假一赔十', '支持验货', '质量保证', '高品质', '高质量', '国产', '原厂',
  '拍下备注', '多拍不发货', '一件起批', '大量现货', '库存充足'
]

/** 去掉订单标题里的营销词与冗余符号，保留核心物料名 */
export function cleanName(raw) {
  let s = String(raw ?? '').trim()
  if (!s) return ''
  s = s.replace(/【[^】]*】|\[[^\]]*\]/g, ' ')
  for (const w of NOISE) s = s.split(w).join(' ')
  s = s.replace(/[|｜]+/g, ' ')
  s = s.replace(/\s*[-—–]{2,}\s*/g, ' ')
  s = s.replace(/\s+/g, ' ').trim()
  s = s.replace(/^[，,、;；:：\s]+|[，,、;；:：\s]+$/g, '')
  return s
}

/* ------------------------------- 文本抽取 ------------------------------- */

const RE_VALUE = {
  resistance: /(\d+(?:\.\d+)?\s*[pPnNuUµμmMkKG]?\s*(?:Ω|ohms?|欧姆?|R(?![A-Za-z0-9])))/i,
  capacitance: /(\d+(?:\.\d+)?\s*[pPnNuUµμmMkKG]?\s*F(?![A-Za-z0-9]))/,
  inductance: /(\d+(?:\.\d+)?\s*[pPnNuUµμmMkKG]?\s*H(?![A-Za-z0-9]))/,
  voltage: /(\d+(?:\.\d+)?\s*[pPnNuUµμmMkKG]?\s*V(?![A-Za-z0-9]))/,
  current: /(\d+(?:\.\d+)?\s*[pPnNuUµμmMkKG]?\s*A(?![A-Za-z0-9]))/
}

/**
 * 从一段物料描述里抽出封装 + 结构化参数。
 * 如「0603 10kΩ ±1% 1/10W 厚膜电阻」→ { package:'0603', params:{ resistance:'10kΩ', tolerance:'±1%' } }
 */
export function extractFromText(raw) {
  const text = String(raw ?? '')
  const params = {}
  const pkg = matchPackage(text)

  for (const fam of ['resistance', 'capacitance', 'inductance', 'voltage', 'current']) {
    const m = text.match(RE_VALUE[fam])
    if (!m) continue
    const parsed = parseSI(m[1], fam)
    if (parsed && parsed.value > 0) {
      params[fam] = formatSI(parsed.value, fam)
      break
    }
  }

  // 仅写「10k」无单位时，若文本明确是电阻/电容，再兜底识别
  if (!params.resistance && /电阻|resistor/i.test(text)) {
    const m = text.match(/(\d+(?:\.\d+)?\s*[kKmM])(?![A-Za-z0-9])/)
    const parsed = m && parseSI(m[1], 'resistance')
    if (parsed && parsed.value >= 1) params.resistance = formatSI(parsed.value, 'resistance')
  }
  if (!params.capacitance && /电容|capacitor/i.test(text)) {
    const m = text.match(/(\d+(?:\.\d+)?\s*[pPnNuUµμ])(?![A-Za-z0-9])/)
    const parsed = m && parseSI(m[1], 'capacitance')
    if (parsed && parsed.value > 0) params.capacitance = formatSI(parsed.value, 'capacitance')
  }
  if (!params.inductance && /电感|inductor/i.test(text)) {
    const m = text.match(/(\d+(?:\.\d+)?\s*[pPnNuUµμ])(?![A-Za-z0-9])/)
    const parsed = m && parseSI(m[1], 'inductance')
    if (parsed && parsed.value > 0) params.inductance = formatSI(parsed.value, 'inductance')
  }

  const tol = text.match(/([±+\-]?\s*\d+(?:\.\d+)?)\s*%/)
  if (tol) {
    const n = parseFloat(tol[1].replace(/[^\d.]/g, ''))
    if (isFinite(n)) params.tolerance = `±${n}%`
  }

  return { package: pkg, params }
}

/* ------------------------------- 分类推断 ------------------------------- */

const CATEGORY_RULES = [
  [/tvs|esd|静电|瞬态抑制/i, 'TVS/ESD 保护'],
  [/肖特基|schottky|整流/i, '整流/肖特基'],
  [/mosfet|mos\s*管|场效应/i, 'MOSFET'],
  [/三极管|晶体管|transistor/i, '三极管'],
  [/ldo|线性稳压|low dropout/i, 'LDO 线性稳压'],
  [/dc[-\s]?dc|降压|升压|buck|boost|电源芯片/i, 'DC-DC 电源芯片'],
  [/单片机|mcu|stm32|esp32|gd32/i, 'MCU/单片机'],
  [/运放|运算放大|比较器|opamp|op[-\s]?amp/i, '运算放大器'],
  [/晶振|振荡器|crystal|oscillator/i, '时钟与晶振'],
  [/eeprom|flash|sdram|存储芯片/i, '存储芯片'],
  [/逻辑|接口芯片|74hc|74ls|max232|rs485|can 收发/i, '逻辑/接口芯片'],
  [/电阻|resistor|\bres\b/i, '电阻'],
  [/电容|capacitor|\bcap\b/i, '电容'],
  [/电感|inductor/i, '电感'],
  [/二极管|diode/i, '二极管/三极管'],
  [/连接器|端子|排针|排母|插座|connector/i, '连接器'],
  [/螺丝|铜柱|外壳|结构件|支架/i, '结构件'],
  [/焊锡|助焊|热缩|胶带|耗材/i, '耗材工具']
]

export function guessCategoryName(text) {
  const s = String(text || '')
  for (const [re, name] of CATEGORY_RULES) if (re.test(s)) return name
  return ''
}

/* ------------------------------- 零件入库归一 ------------------------------- */

export function normalizePartInput(input = {}) {
  const out = { ...input }
  if (typeof out.package === 'string') out.package = normalizePackage(out.package)
  if (typeof out.name === 'string') out.name = cleanName(out.name) || out.name
  if (out.params && typeof out.params === 'object') out.params = normalizeParams(out.params)
  return out
}

/* ------------------------------- 检索扩展 ------------------------------- */

/** 单个检索词 → 等价写法集合（1000nF → 1µF/1uf/…；103 → 10k/10nF；1608 Metric → 0603） */
export function expandSearchToken(token) {
  const t = String(token || '').trim().toLowerCase()
  if (!t) return []
  // 「1608 Metric」被空格拆开时，metric 只是公制标记，不参与匹配
  if (/^(metric|公制|米制|imperial|英制)$/.test(t)) return []
  const forms = new Set([t])

  const parsed = parseSI(t)
  if (parsed && parsed.family && parsed.value > 0) {
    for (const f of siVariants(parsed.value, parsed.family)) forms.add(f)
    const code = eiaCode(parsed.value, parsed.family)
    if (code) forms.add(code)
  }

  if (/^\d{3,4}$/.test(t)) {
    const dec = eiaDecode(t)
    if (dec) {
      for (const fam of ['resistance', 'capacitance', 'inductance']) {
        for (const f of siVariants(dec[fam], fam)) forms.add(f)
      }
    }
  }

  const pkg = matchPackage(t)
  if (pkg) forms.add(pkg.toLowerCase())

  return [...forms]
}

export function expandSearchTokens(input) {
  return String(input || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(expandSearchToken)
}

export function matchesTokens(text, tokenGroups) {
  const t = String(text || '').toLowerCase()
  return tokenGroups.every((forms) => forms.length === 0 || forms.some((f) => t.includes(f)))
}
