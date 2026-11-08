// server/infrastructure/kv/batch.js
// 批量并发原语：KV 没有 multi-get，仓储层用有限并发把多次往返重叠起来。
// 并发上限沿用业务侧既有约定（24），避免对边缘 KV 造成突发压力。

export const KV_BATCH = 24

/** 按顺序对数组每一项执行 fn，最多 limit 个并发；返回值顺序与入参一致 */
export async function mapLimit(items, limit, fn) {
  const list = items || []
  const results = new Array(list.length)
  if (!list.length) return results
  const width = Math.max(1, Math.min(Number(limit) || KV_BATCH, list.length))
  let cursor = 0
  async function worker() {
    while (true) {
      const index = cursor++
      if (index >= list.length) return
      results[index] = await fn(list[index], index)
    }
  }
  await Promise.all(Array.from({ length: width }, worker))
  return results
}
