// server/repositories/kv-index.js
// 索引维护：所有集合都通过 index:* 键保存 ID 列表，避免依赖 KV 的 scan 能力。
// 仅此文件直接读写索引键，其余仓储复用这里的原语。

import { kvGetJSON, kvPutJSON } from '../infrastructure/kv/index.js'
import { nowISO } from '../domain/models.js'

/** 读取索引数组，缺失或损坏时返回空数组 */
export async function idxGet(kv, key) {
  const value = await kvGetJSON(kv, key)
  return Array.isArray(value) ? value : []
}

/** 幂等追加：已存在则不重复写入，避免无意义的 KV 写 */
export async function idxAdd(kv, key, id) {
  const arr = await idxGet(kv, key)
  if (!arr.includes(id)) {
    arr.push(id)
    await kvPutJSON(kv, key, arr)
  }
}

export async function idxRemove(kv, key, id) {
  const arr = await idxGet(kv, key)
  const next = arr.filter((x) => x !== id)
  if (next.length !== arr.length) await kvPutJSON(kv, key, next)
}

export async function idxReset(kv, key) {
  await kv.del(key)
}

/** 每次写入业务数据后刷新元信息时间戳，供备份与「最后更新」展示 */
export async function touchMeta(kv) {
  const meta = (await kvGetJSON(kv, 'meta:info')) || { version: 1 }
  meta.lastUpdated = nowISO()
  await kvPutJSON(kv, 'meta:info', meta)
}

export async function getMeta(kv) {
  return (await kvGetJSON(kv, 'meta:info')) || { version: 1 }
}
