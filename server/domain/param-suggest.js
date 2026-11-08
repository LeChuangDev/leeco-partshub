// server/domain/param-suggest.js
// 电气参数取值建议：行业标准系列值 + EIA/工程写法解析（纯函数，前后端共用）。
// 目标：输入「10k」即可看到 10kΩ、100kΩ…并一键选中；输入「103」会提示 10kΩ。

import { UNIT_OF, eiaCode, eiaDecode, familyOfKey, formatSI, parseSI } from './normalize.js'

const E12 = [1, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2]
const E24 = [
  1, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2, 2.2, 2.4,
  2.7, 3, 3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2,
  6.8, 7.5, 8.2, 9.1
]

// 按十进位展开标准系列，保留 6 位有效数字避免浮点噪声
function decadeSeries(base, fromExp, toExp) {
  const out = []
  for (let e = fromExp; e <= toExp; e++) {
    for (const m of base) out.push(Number((m * Math.pow(10, e)).toPrecision(6)))
  }
  return out
}

const NUMERIC = {
  resistance: [...decadeSeries(E24, 0, 6), 10e6],
  capacitance: decadeSeries(E12, -12, -4),
  inductance: decadeSeries(E12, -9, -2),
  voltage: [
    1.8, 2.5, 3, 3.3, 5, 5.5, 6.3, 7.5, 9, 10, 12, 15, 16, 18, 20,
    24, 25, 30, 35, 40, 48, 50, 60, 63, 75, 80, 100, 150, 200,
    250, 300, 400, 450, 600, 630, 800, 1000
  ],
  current: [
    0.001, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.25, 0.3, 0.5,
    0.75, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 15, 20, 30, 50, 100
  ],
  frequency: [
    1e3, 2e3, 4e3, 8e3, 16e3, 32e3, 100e3, 1e6, 2e6, 4e6,
    8e6, 10e6, 12e6, 16e6, 24e6, 25e6, 32e6, 40e6, 48e6, 50e6,
    72e6, 100e6, 168e6, 1e9
  ]
}

// 输入为空时优先展示的常用值
const POPULAR = {
  resistance: [1, 10, 100, 220, 330, 470, 1000, 2200, 4700, 10000, 22000, 47000, 100000, 1000000],
  capacitance: [1e-12, 1e-9, 1e-8, 1e-7, 1e-6, 4.7e-6, 10e-6, 22e-6, 47e-6, 100e-6, 470e-6, 1000e-6],
  inductance: [1e-9, 100e-9, 1e-6, 2.2e-6, 4.7e-6, 10e-6, 22e-6, 47e-6, 100e-6, 220e-6, 1e-3, 10e-3],
  voltage: [3.3, 5, 12, 24, 3, 1.8, 2.5, 5.5, 10, 16, 25, 50],
  current: [0.001, 0.01, 0.1, 0.2, 0.5, 1, 2, 3, 5, 10, 20, 50],
  frequency: [32.768e3, 1e6, 8e6, 12e6, 16e6, 25e6, 48e6, 72e6, 100e6, 168e6, 1e9]
}

const TEXT_PRESETS = {
  tolerance: ['±0.01%', '±0.05%', '±0.1%', '±0.25%', '±0.5%', '±1%', '±2%', '±5%', '±10%', '±20%'],
  power: ['1/16W', '1/10W', '1/8W', '1/4W', '1/2W', '1W', '2W', '3W', '5W', '10W'],
  package: [
    '0201', '0402', '0603', '0805', '1206', '1210', '1812', '2010', '2512',
    'SOT-23', 'SOT-89', 'SOD-123', 'SMA', 'SMB', 'SMC', 'DO-214',
    'TO-220', 'TO-252', 'TO-263', 'SOP-8', 'SOIC-8', 'TSSOP-20',
    'QFN-32', 'LQFP-48', 'DIP-8'
  ]
}

function textOf(param = {}) {
  return `${param.key || ''} ${param.label || ''}`
}

function textPresetOf(param) {
  const text = textOf(param)
  if (/tolerance|精度/i.test(text)) return TEXT_PRESETS.tolerance
  if (/package|封装/i.test(text)) return TEXT_PRESETS.package
  if (/power|功率/i.test(text)) return TEXT_PRESETS.power
  return null
}

function nearlyEqual(a, b) {
  const diff = Math.abs(a - b)
  return diff <= Math.max(Math.abs(a), Math.abs(b), 1e-12) * 1e-6
}

function isStandardValue(value, family) {
  const list = NUMERIC[family] || []
  return list.some((v) => nearlyEqual(v, value))
}

// 输入可能是工程写法（10k / 4R7 / 0.1uF）或 EIA 代码（103），统一解析为基本单位数值。
// 纯数字优先按字面值理解；字面值不是标准系列值且能解出标准 EIA 值时（如 103 → 10kΩ）才按 EIA 解释。
function resolveTarget(raw, family) {
  if (/^\d{3,4}$/.test(raw) && (family === 'resistance' || family === 'capacitance' || family === 'inductance')) {
    const literal = Number(raw)
    if (!isStandardValue(literal, family)) {
      const decoded = eiaDecode(raw)
      const decodedValue = decoded && decoded[family]
      if (isFinite(decodedValue) && decodedValue > 0 && isStandardValue(decodedValue, family)) return decodedValue
    }
    return literal
  }
  const parsed = parseSI(raw, family)
  if (parsed && isFinite(parsed.value) && parsed.value >= 0) return parsed.value
  return null
}

function stripUnit(value, family) {
  const unit = String(UNIT_OF[family] || '').toLowerCase()
  return unit && value.endsWith(unit) ? value.slice(0, -unit.length) : value
}

function splitEngineering(text = '') {
  const m = String(text).match(/^([\d.]+)(.*)$/)
  return m ? { digits: m[1], prefix: m[2] } : { digits: '', prefix: String(text) }
}

function normalizePrefix(prefix = '') {
  return String(prefix)
    .replace(/[μµ]/g, 'u')
    .replace(/^K$/, 'k')
    .replace(/^U$/, 'u')
    .replace(/^N$/, 'n')
    .replace(/^P$/, 'p')
}

function scoreCandidate(candidate, query, family, target) {
  if (target != null && candidate.num != null && nearlyEqual(candidate.num, target)) return 100
  const bare = stripUnit(candidate.value, family) // 保留前缀大小写：M（兆）与 m（毫）不能混
  const q = splitEngineering(query)
  const c = splitEngineering(bare)
  // 非数字开头（如 R、NF）退化为文本包含
  if (!q.digits) {
    const value = candidate.value.toLowerCase()
    const text = query.toLowerCase()
    return value.startsWith(text) ? 70 : value.includes(text) ? 45 : 0
  }
  // 数字前缀 + 单位前缀必须同时匹配，避免 10k 命中 110k / 510k 这类中段巧合
  const prefixOk = !q.prefix || normalizePrefix(q.prefix) === normalizePrefix(c.prefix)
  if (prefixOk && c.digits.startsWith(q.digits)) return 70
  if (candidate.value.toLowerCase().startsWith(query.toLowerCase())) return 70
  return 0
}

// 去重用的规范化：µ/u、K/k 视为同一写法，但保留 M（兆）与 m（毫）的区别
function canonicalValue(value) {
  return String(value).trim()
    .replace(/^([\d.]+)[µμ]/, '$1u')
    .replace(/^([\d.]+)U/, '$1u')
    .replace(/^([\d.]+)K/, '$1k')
    .replace(/^([\d.]+)N/, '$1n')
    .replace(/^([\d.]+)P/, '$1p')
}

function dedupe(values) {
  const seen = new Set()
  const out = []
  for (const v of values) {
    const key = canonicalValue(v)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(String(v))
  }
  return out
}

/**
 * 生成参数取值建议。
 * @param {{key?:string,label?:string,unit?:string,type?:string}} param 参数模板字段
 * @param {string} input 当前输入（可为空）
 * @param {number} limit 最多返回条数
 * @param {string[]} extras 库内已用值（可选，用于保持一致写法）
 * @returns {string[]} 建议值，按匹配度排序
 */
export function suggestParamValues(param = {}, input = '', limit = 12, extras = []) {
  const raw = String(input ?? '').trim()
  const textPreset = textPresetOf(param)
  const family = familyOfKey(textOf(param))
  const extraList = dedupe((extras || []).map((v) => String(v).trim()).filter(Boolean))

  // 空输入：展示常用值，便于直接点选
  if (!raw) {
    const base = textPreset
      ? textPreset
      : family && NUMERIC[family]
        ? (POPULAR[family] || []).map((v) => formatSI(v, family))
        : []
    return dedupe([...base, ...extraList]).slice(0, limit)
  }

  const query = raw.toLowerCase()

  // 文本型预置（精度 / 功率 / 封装）
  if (textPreset) {
    const scored = []
    ;[...textPreset, ...extraList].forEach((value, index) => {
      const lower = value.toLowerCase()
      const simplified = lower.replace(/^[^\da-z]+/i, '') // 去掉 ± 等前缀再比
      const score = lower.startsWith(query) || simplified.startsWith(query)
        ? 70
        : lower.includes(query)
          ? 45
          : query.length >= 2 && query.includes(lower)
            ? 25
            : 0
      if (score) scored.push({ value, score, index })
    })
    return scored
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .map((x) => x.value)
      .slice(0, limit)
  }

  // 通用文本字段：只过滤库内已用值
  if (!family || !NUMERIC[family]) {
    return extraList.filter((v) => v.toLowerCase().includes(query)).slice(0, limit)
  }

  const target = resolveTarget(raw, family)
  const candidates = []
  const seen = new Set()
  const add = (value, num) => {
    const key = canonicalValue(value)
    if (seen.has(key)) return
    seen.add(key)
    candidates.push({ value: String(value), num })
  }

  // 输入本身可解析时优先给出标准写法，再补齐系列值
  if (target != null) add(formatSI(target, family), target)
  for (const num of NUMERIC[family]) add(formatSI(num, family), num)
  for (const value of extraList) add(value, null)

  return candidates
    .map((c, index) => ({ ...c, index, score: scoreCandidate(c, raw, family, target) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((x) => x.value)
    .slice(0, limit)
}

/* --------------------------- 整器件规格组合快选 --------------------------- */

const COMMON_TOLERANCE = ['±1%', '±5%', '±10%', '±0.5%', '±0.1%', '±2%', '±0.25%', '±20%', '±0.05%', '±0.01%']
const COMMON_POWER = ['1/4W', '1/8W', '1/2W', '1/10W', '1/16W', '1W', '2W', '3W', '5W']
const COMMON_CURRENT = [1, 2, 3, 5, 0.5, 10, 20]
const COMMON_VOLTAGE = [5, 3.3, 12, 24, 50, 100, 30, 60, 150, 200, 400, 16, 25, 35]
const CAP_VOLTAGE = [50, 25, 16, 10, 100, 35, 6.3, 400, 250, 63]

function isToleranceField(field) {
  return !/accuracy|ppm/i.test(textOf(field)) && /tolerance|精度/i.test(textOf(field))
}

function isPowerField(field) {
  return /power|功率/i.test(textOf(field))
}

function isCurrentField(field) {
  return familyOfKey(textOf(field)) === 'current'
}

function isVoltageField(field) {
  return familyOfKey(textOf(field)) === 'voltage'
}

function toleranceRank(value) {
  const index = COMMON_TOLERANCE.indexOf(value)
  return index === -1 ? 99 : index
}

function pickMainField(fields) {
  // 主参数取模板中第一个可解析的数值字段（电阻/电容/电感/电压/电流/频率）
  return fields.find((f) => f && f.type !== 'enum' && !isToleranceField(f) &&
    ['resistance', 'capacitance', 'inductance', 'voltage', 'current', 'frequency'].includes(familyOfKey(textOf(f))))
}

function isSecondaryField(field) {
  if (!field) return false
  if (field.type === 'enum') return isToleranceField(field)
  return isToleranceField(field) || isPowerField(field) || isVoltageField(field) || isCurrentField(field)
}

function labelWeight(field) {
  if (isVoltageField(field)) return 10
  if (isToleranceField(field)) return 9
  if (isPowerField(field)) return 8
  if (isCurrentField(field)) return 7
  return 5
}

function toleranceValues(field, typed) {
  const options = Array.isArray(field.options) && field.options.length ? field.options : COMMON_TOLERANCE
  if (typed) {
    const hits = options.filter((v) => v.toLowerCase().includes(typed.toLowerCase()))
    return hits.length ? hits : options
  }
  return [...options].sort((a, b) => toleranceRank(a) - toleranceRank(b))
}

function secondaryValues(field, typed, mainFamily) {
  if (typed) return suggestParamValues(field, typed, 3)
  if (isToleranceField(field)) return toleranceValues(field, '').slice(0, 3)
  if (isPowerField(field)) return COMMON_POWER.slice(0, 3)
  if (isCurrentField(field)) return COMMON_CURRENT.map((v) => formatSI(v, 'current')).slice(0, 3)
  if (isVoltageField(field)) {
    const list = mainFamily === 'capacitance' ? CAP_VOLTAGE : COMMON_VOLTAGE
    return list.map((v) => formatSI(v, 'voltage')).slice(0, 3)
  }
  return []
}

/**
 * 生成整器件规格快选组合，如电阻「10kΩ ±1% 1/4W」、电容「100nF 50V ±10%」。
 * 只使用分类模板里实际存在的字段；点选后由调用方一次性写入多个参数。
 * @param {object[]} template 分类参数模板
 * @param {Record<string,string>} params 当前已填参数（用于过滤）
 * @param {number} limit 最多返回组合数
 * @returns {{ key:string, label:string, values:Record<string,string> }[]}
 */
export function suggestParamCombos(template = [], params = {}, limit = 10, query = '') {
  const fields = (Array.isArray(template) ? template : []).filter(Boolean)
  const main = pickMainField(fields)
  if (!main) return []

  const secondaries = fields
    .filter((f) => f !== main && isSecondaryField(f))
    .slice(0, 2)
    .map((field) => ({
      field,
      values: secondaryValues(field, String(params?.[field.key] ?? '').trim(), familyOfKey(textOf(main)))
    }))
    .filter((x) => x.values.length)
  if (!secondaries.length) return []

  // 参数框已有值优先；否则用名称里识别出的规格文本（如名称「0603 100nf 电容」）
  const typedMain = String(params?.[main.key] ?? '').trim() || String(query ?? '').trim()
  const mainValues = suggestParamValues(main, typedMain, 6)
  if (!mainValues.length) return []

  const mainLimit = Math.min(mainValues.length, 4)
  const perMain = Math.max(1, Math.ceil(limit / mainLimit))
  const orderedSecondaries = secondaries
    .map((s, index) => ({ ...s, index, weight: labelWeight(s.field) }))
    .sort((a, b) => b.weight - a.weight || a.index - b.index)

  const combos = []
  for (const mainValue of mainValues.slice(0, mainLimit)) {
    const produced = []
    const walk = (index, values) => {
      if (produced.length >= perMain) return
      if (index === secondaries.length) {
        produced.push({ ...values })
        return
      }
      const item = secondaries[index]
      for (const value of item.values.slice(0, 3)) {
        if (produced.length >= perMain) break
        walk(index + 1, { ...values, [item.field.key]: value })
      }
    }
    walk(0, { [main.key]: mainValue })
    for (const values of produced) {
      if (combos.length >= limit) break
      const label = [values[main.key], ...orderedSecondaries.map((s) => values[s.field.key])]
        .filter(Boolean)
        .join(' ')
      combos.push({ key: label, label, values })
    }
    if (combos.length >= limit) break
  }

  const seen = new Set()
  const out = []
  for (const combo of combos) {
    if (seen.has(combo.key)) continue
    seen.add(combo.key)
    out.push(combo)
  }
  return out
}

// 从自由文本（如器件名称）里提取第一个工程规格：4R7 / 100nF / 10kΩ / 10k / 100n
const VALUE_TOKEN = new RegExp([
  '\\d+(?:\\.\\d+)?[RrKkMm]\\d+',
  '\\d+(?:\\.\\d+)?\\s*[pPnNuUµμmMkKG]?\\s*(?:Ω|F|H|V|A|W|R)(?![A-Za-z0-9])',
  '\\d+(?:\\.\\d+)?\\s*[kKmMG](?![A-Za-z0-9])',
  '\\d+(?:\\.\\d+)?\\s*[pPnNuUµμ](?![A-Za-z0-9])'
].join('|'), 'i')

/**
 * 从器件名称中提取可用于联想的规格片段。
 * 「0805 10kΩ 电阻」→「10kΩ」；「0603 100nf 电容」→「100nf」；型号串通常返回空。
 */
export function extractParamQuery(text = '') {
  const m = String(text ?? '').match(VALUE_TOKEN)
  return m ? m[0].replace(/\s+/g, '') : ''
}

/**
 * 输入值的工程含义提示，如「10k」→「= 10kΩ · 代码 103」，「103」→「= 10kΩ」。
 * 解析失败或无单位语义时返回空字符串。
 */
export function describeParamValue(param = {}, input = '') {
  const raw = String(input ?? '').trim()
  if (!raw) return ''
  const family = familyOfKey(textOf(param))
  if (!family) return ''
  const value = resolveTarget(raw, family)
  if (value == null) return ''
  const formatted = formatSI(value, family)
  const parts = []
  if (formatted.toLowerCase() !== raw.toLowerCase()) parts.push(`= ${formatted}`)
  const code = eiaCode(value, family)
  if (code && code !== raw) parts.push(`代码 ${code}`)
  return parts.join(' · ')
}
