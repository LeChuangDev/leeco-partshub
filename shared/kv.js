// shared/kv.js
// 边缘 KV 存储抽象层。
// 设计目标：业务代码只依赖统一接口，部署时切到真实 EdgeOne KV，开发/测试时用 MemoryKV / FileKV。
//
// 统一接口（所有实现必须满足）：
//   get(key)            -> Promise<string|null>
//   put(key, value)     -> Promise<void>            (value 必须为字符串)
//   del(key)            -> Promise<void>
//   list(prefix, opts)  -> Promise<{ keys:string[], cursor:string|null, done:boolean }>
//
// 注意：EdgeOne 真实 KV 的方法名/签名需以官方文档为准（下方 EdgeOneKV 为合理适配，
// 部署前请核对并调整方法映射）。本地 FileKV 已完整实现，可在本地真实验证全链路。

const NAMESPACE = 'leeco-partshub'

/**
 * 根据运行环境创建 KV 实例。
 * - 生产（EdgeOne）：env.KV 为边缘 KV 绑定 -> 走 EdgeOneKV 适配器
 * - 本地开发：dev/server.mjs 注入 env.LOCAL_KV（FileKV）
 * - 单测：env 不传或传 { memory:true } -> MemoryKV
 */
export function createKV(env = {}) {
  if (env && env.KV) return new EdgeOneKV(env.KV)
  if (env && env.LOCAL_KV) return env.LOCAL_KV
  if (env && env.memory) return new MemoryKV()
  // 默认回退到内存（便于无环境时跑通逻辑）
  return new MemoryKV()
}

export function namespace() {
  return NAMESPACE
}

/* ----------------------------- 内存实现（测试/兜底） ----------------------------- */
export class MemoryKV {
  constructor() {
    this.map = new Map()
  }
  async get(key) {
    return this.map.has(key) ? this.map.get(key) : null
  }
  async put(key, value) {
    this.map.set(key, String(value))
  }
  async del(key) {
    this.map.delete(key)
  }
  async list(prefix = '', opts = {}) {
    const limit = opts.limit || 1000
    const keys = []
    for (const k of this.map.keys()) {
      if (k.startsWith(prefix)) keys.push(k)
    }
    keys.sort()
    const cursor = opts.cursor || '0'
    const start = parseInt(cursor, 10) || 0
    const slice = keys.slice(start, start + limit)
    const done = start + limit >= keys.length
    return { keys: slice, cursor: String(start + limit), done }
  }
  // 测试辅助：返回全部键值
  snapshot() {
    return Object.fromEntries(this.map.entries())
  }
}

/* ----------------------------- EdgeOne 边缘 KV 适配器 ----------------------------- */
// 适配 EdgeOne Pages Functions 中的 KV 绑定（env.KV）。
// 若 EdgeOne 实际 API 不同，仅需要调整本类的四个方法即可，业务层无需改动。
export class EdgeOneKV {
  constructor(binding) {
    this.kv = binding
  }
  async get(key) {
    // EdgeOne KV: kv.get(key) 返回 string|null（按文档可能支持类型参数）
    const v = await this.kv.get(key)
    return v == null ? null : String(v)
  }
  async put(key, value) {
    await this.kv.put(key, String(value))
  }
  async del(key) {
    await this.kv.delete(key)
  }
  async list(prefix = '', opts = {}) {
    const res = await this.kv.list({ prefix, limit: opts.limit || 1000, cursor: opts.cursor || undefined })
    const keys = (res.keys || []).map((k) => (typeof k === 'string' ? k : k.name))
    return { keys, cursor: res.cursor || null, done: res.list_complete !== false ? true : !!res.done }
  }
}

/* ----------------------------- JSON 便捷封装 ----------------------------- */
export async function kvGetJSON(kv, key) {
  const raw = await kv.get(key)
  if (raw == null) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export async function kvPutJSON(kv, key, value) {
  await kv.put(key, JSON.stringify(value))
}
