// server/infrastructure/kv/edgeone-kv.js
// EdgeOne 边缘 KV 适配器：把部署环境的 KV 绑定收敛到统一接口。
//
// EdgeOne KV 限制：
//   - key 仅支持数字、字母、下划线，而业务侧用 ':' 分层（part:xxx / index:parts:cat:xxx）
//   - list 单页上限 256 条，返回 { keys: [{ key }], cursor, complete }
// 因此这里统一做 key 的十六进制编码/解码；编码按字节映射，前缀查询依然成立。
// 若 EdgeOne 实际 API 仍有差异，只改本文件，业务层与仓储层无需改动。

const HEX = '0123456789abcdef'
const KEY_PREFIX = 'k_'
const MAX_LIST_LIMIT = 256

/** 业务 key → 仅含字母/数字/下划线的合法 key（UTF-8 字节逐位十六进制） */
function encodeKey(key) {
  const bytes = new TextEncoder().encode(String(key))
  let out = KEY_PREFIX
  for (const b of bytes) out += HEX[b >> 4] + HEX[b & 15]
  return out
}

/** KV 返回的 key → 业务 key；非本适配器写入的 key 返回 null */
function decodeKey(key) {
  const text = String(key)
  if (!text.startsWith(KEY_PREFIX)) return null
  const hex = text.slice(KEY_PREFIX.length)
  if (hex.length % 2 !== 0) return null
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    const byte = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
    if (!Number.isFinite(byte)) return null
    bytes[i] = byte
  }
  return new TextDecoder().decode(bytes)
}

export class EdgeOneKV {
  constructor(binding) {
    this.kv = binding
  }
  async get(key) {
    const value = await this.kv.get(encodeKey(key))
    return value == null ? null : String(value)
  }
  async put(key, value) {
    await this.kv.put(encodeKey(key), String(value))
  }
  async del(key) {
    await this.kv.delete(encodeKey(key))
  }
  async list(prefix = '', opts = {}) {
    const res = await this.kv.list({
      prefix: encodeKey(prefix),
      limit: Math.min(Number(opts.limit) || MAX_LIST_LIMIT, MAX_LIST_LIMIT),
      cursor: opts.cursor || undefined
    })
    // EdgeOne 返回 keys: [{ key }]；兼容直接返回字符串的实现
    const keys = (res.keys || [])
      .map((k) => (typeof k === 'string' ? k : (k.key ?? k.name)))
      .map(decodeKey)
      .filter((k) => k != null)
    const done = typeof res.complete === 'boolean'
      ? res.complete
      : res.list_complete != null
        ? !!res.list_complete
        : !res.cursor
    return { keys, cursor: res.cursor || null, done }
  }
}
