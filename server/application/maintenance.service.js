// server/application/maintenance.service.js
// 数据自检与索引重建：KV 没有事务，多键写入中途失败会留下不一致的索引。
// 这里按业务数据（part/stock/transaction/...）反推应有的索引，供手动检查与一键修复。

import { KV_BATCH, mapLimit } from '../infrastructure/kv/index.js'
import { kvGetJSON, kvPutJSON } from '../infrastructure/kv/index.js'
import { nowISO } from '../domain/models.js'

const PRIMARY = {
  categories: { prefix: 'category:', index: 'index:categories' },
  locations: { prefix: 'location:', index: 'index:locations' },
  parts: { prefix: 'part:', index: 'index:parts' },
  transactions: { prefix: 'transaction:', index: 'index:transactions' },
  projects: { prefix: 'project:', index: 'index:projects' }
}

const SECONDARY_PREFIXES = ['index:parts:cat:', 'index:parts:tag:', 'index:stock:part:', 'index:txn:part:']

/** 按前缀列出全部业务键（兼容不同 KV 的分页返回） */
async function listKeys(kv, prefix) {
  const keys = []
  let cursor = null
  for (let page = 0; page < 50; page++) {
    const res = await kv.list(prefix, { limit: 1000, cursor: cursor || undefined })
    keys.push(...((res && res.keys) || []))
    if (!res || res.done || !res.cursor) break
    cursor = res.cursor
  }
  return [...new Set(keys)]
}

async function listIds(kv, prefix) {
  const keys = await listKeys(kv, prefix)
  return keys.map((k) => String(k).slice(prefix.length)).filter(Boolean).sort()
}

function pushId(map, key, id) {
  const arr = map.get(key)
  if (arr) {
    if (!arr.includes(id)) arr.push(id)
  } else {
    map.set(key, [id])
  }
}

/** 汇总各类业务数据与应有的二级索引 */
async function collectState(kv) {
  const ids = {}
  const docs = {}
  for (const [name, cfg] of Object.entries(PRIMARY)) {
    ids[name] = await listIds(kv, cfg.prefix)
    docs[name] = (await mapLimit(ids[name], KV_BATCH, (id) => kvGetJSON(kv, `${cfg.prefix}${id}`))).filter(Boolean)
  }
  const stockIds = await listIds(kv, 'stock:')
  const stocks = (await mapLimit(stockIds, KV_BATCH, (id) => kvGetJSON(kv, `stock:${id}`))).filter(Boolean)

  const primary = new Map()
  for (const [name, cfg] of Object.entries(PRIMARY)) primary.set(cfg.index, docs[name].map((d) => d.id))

  const secondary = new Map()
  for (const p of docs.parts) {
    if (p.categoryId) pushId(secondary, `index:parts:cat:${p.categoryId}`, p.id)
    for (const t of p.tags || []) pushId(secondary, `index:parts:tag:${t}`, p.id)
  }
  for (const s of stocks) {
    if (s.partId) pushId(secondary, `index:stock:part:${s.partId}`, s.id)
  }
  for (const t of docs.transactions) {
    if (t.partId) pushId(secondary, `index:txn:part:${t.partId}`, t.id)
  }

  return {
    ids,
    docs,
    stocks,
    primary,
    secondary,
    counts: {
      categories: docs.categories.length,
      locations: docs.locations.length,
      parts: docs.parts.length,
      stocks: stocks.length,
      transactions: docs.transactions.length,
      projects: docs.projects.length
    }
  }
}

function diffIndex(expectedIds, indexedIds) {
  const expected = new Set(expectedIds)
  const indexed = new Set(indexedIds)
  const missing = expectedIds.filter((id) => !indexed.has(id))
  const orphan = indexedIds.filter((id) => !expected.has(id))
  const seen = new Set()
  const duplicates = []
  for (const id of indexedIds) {
    if (seen.has(id)) duplicates.push(id)
    else seen.add(id)
  }
  const sample = [
    ...missing.slice(0, 3).map((id) => ({ id, issue: 'missing' })),
    ...orphan.slice(0, 3).map((id) => ({ id, issue: 'orphan' }))
  ].slice(0, 5)
  return {
    expected: expectedIds.length,
    indexed: indexedIds.length,
    missingCount: missing.length,
    orphanCount: orphan.length,
    duplicateCount: duplicates.length,
    sample
  }
}

/** 对比一个二级索引族：期望的键集合 vs 实际写入的键集合 */
async function checkSecondary(kv, prefix, expectedMap) {
  const actualKeys = await listKeys(kv, prefix)
  const allKeys = [...new Set([...actualKeys, ...expectedMap.keys()])]
  const arrays = await mapLimit(allKeys, KV_BATCH, (key) => kvGetJSON(kv, key))
  let staleIds = 0
  let missingIds = 0
  const samples = []
  for (let i = 0; i < allKeys.length; i++) {
    const key = allKeys[i]
    const got = new Set(Array.isArray(arrays[i]) ? arrays[i] : [])
    const want = new Set(expectedMap.get(key) || [])
    const stale = [...got].filter((id) => !want.has(id))
    const missing = [...want].filter((id) => !got.has(id))
    staleIds += stale.length
    missingIds += missing.length
    if ((stale.length || missing.length) && samples.length < 5) {
      samples.push({ key, stale: stale.slice(0, 3), missing: missing.slice(0, 3) })
    }
  }
  return {
    keys: actualKeys.length,
    expectedKeys: expectedMap.size,
    missingKeys: [...expectedMap.keys()].filter((k) => !actualKeys.includes(k)).length,
    orphanKeys: actualKeys.filter((k) => !expectedMap.has(k)).length,
    staleIds,
    missingIds,
    samples
  }
}

function sameMembers(a, b) {
  if (a.length !== b.length) return false
  const set = new Set(a)
  return b.every((id) => set.has(id))
}

/** 只读检查：返回索引与业务数据的一致情况 */
export async function checkIndexes(kv) {
  const state = await collectState(kv)
  const primary = {}
  for (const [name, cfg] of Object.entries(PRIMARY)) {
    const indexed = await kvGetJSON(kv, cfg.index)
    primary[name] = diffIndex(state.primary.get(cfg.index) || [], Array.isArray(indexed) ? indexed : [])
  }

  const expected = new Map([
    [`index:parts:cat:`, new Map()],
    [`index:parts:tag:`, new Map()],
    [`index:stock:part:`, new Map()],
    [`index:txn:part:`, new Map()]
  ])
  for (const [key, ids] of state.secondary) {
    for (const prefix of expected.keys()) {
      if (key.startsWith(prefix)) {
        expected.get(prefix).set(key, ids)
        break
      }
    }
  }
  const secondary = {
    partCategories: await checkSecondary(kv, 'index:parts:cat:', expected.get('index:parts:cat:')),
    partTags: await checkSecondary(kv, 'index:parts:tag:', expected.get('index:parts:tag:')),
    stockByPart: await checkSecondary(kv, 'index:stock:part:', expected.get('index:stock:part:')),
    transactionsByPart: await checkSecondary(kv, 'index:txn:part:', expected.get('index:txn:part:'))
  }

  const issues = []
  for (const [name, info] of Object.entries(primary)) {
    if (info.missingCount) issues.push(`index:${name} 缺少 ${info.missingCount} 条`)
    if (info.orphanCount) issues.push(`index:${name} 有 ${info.orphanCount} 条孤儿 ID`)
    if (info.duplicateCount) issues.push(`index:${name} 有 ${info.duplicateCount} 条重复 ID`)
  }
  for (const [name, info] of Object.entries(secondary)) {
    if (info.missingIds) issues.push(`${name} 缺少 ${info.missingIds} 条关联`)
    if (info.staleIds) issues.push(`${name} 残留 ${info.staleIds} 条关联`)
    if (info.missingKeys) issues.push(`${name} 缺少 ${info.missingKeys} 个索引键`)
    if (info.orphanKeys) issues.push(`${name} 有 ${info.orphanKeys} 个孤儿索引键`)
  }

  return {
    healthy: issues.length === 0,
    checkedAt: nowISO(),
    counts: state.counts,
    primary,
    secondary,
    issues: issues.slice(0, 10)
  }
}

/** 按业务数据重建索引；dryRun=true 时只返回将要发生的变更 */
export async function rebuildIndexes(kv, options = {}) {
  const dryRun = !!options.dryRun
  const state = await collectState(kv)
  const changes = []

  const writeIfChanged = async (key, ids) => {
    const current = await kvGetJSON(kv, key)
    const cur = Array.isArray(current) ? current : []
    if (sameMembers(cur, ids)) return
    changes.push({ key, action: 'write', before: cur.length, after: ids.length })
    if (!dryRun) await kvPutJSON(kv, key, ids)
  }

  for (const [key, ids] of state.primary) await writeIfChanged(key, ids)
  for (const [key, ids] of state.secondary) await writeIfChanged(key, ids)

  // 清掉业务数据里已不存在的二级索引键
  for (const prefix of SECONDARY_PREFIXES) {
    for (const key of await listKeys(kv, prefix)) {
      if (state.primary.has(key) || state.secondary.has(key)) continue
      changes.push({ key, action: 'delete' })
      if (!dryRun) await kv.del(key)
    }
  }

  const written = changes.filter((c) => c.action === 'write').length
  return {
    dryRun,
    written,
    removed: changes.filter((c) => c.action === 'delete').length,
    unchanged: state.primary.size + state.secondary.size - written,
    changes: changes.slice(0, 20)
  }
}
