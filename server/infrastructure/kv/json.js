// server/infrastructure/kv/json.js
// KV 只存字符串，这里统一 JSON 编解码；解析失败返回 null 而不是抛错，
// 避免单条脏数据让整个列表接口 500。

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
