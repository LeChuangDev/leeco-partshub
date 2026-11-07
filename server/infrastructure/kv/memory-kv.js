// server/infrastructure/kv/memory-kv.js
// 内存 KV：单测与无环境兜底实现。接口与 EdgeOne KV 保持一致：
//   get(key) / put(key, value) / del(key) / list(prefix, opts)

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
  // 测试辅助：返回全部键值快照
  snapshot() {
    return Object.fromEntries(this.map.entries())
  }
}
