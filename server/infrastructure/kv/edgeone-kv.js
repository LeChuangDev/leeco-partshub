// server/infrastructure/kv/edgeone-kv.js
// EdgeOne 边缘 KV 适配器：把部署环境的 KV 绑定收敛到统一接口。
// 若 EdgeOne 实际 API 有差异，只改本文件，业务层与仓储层无需改动。

export class EdgeOneKV {
  constructor(binding) {
    this.kv = binding
  }
  async get(key) {
    const value = await this.kv.get(key)
    return value == null ? null : String(value)
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
