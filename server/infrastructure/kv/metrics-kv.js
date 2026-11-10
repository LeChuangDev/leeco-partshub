// server/infrastructure/kv/metrics-kv.js
// 按请求统计 KV 读/写次数：只做观测，不额外落盘。
// 线上免费额度（如 Cloudflare KV 每天 1000 次写）先在这里量化，再决定是否合并写入。

export function withKvMetrics(store) {
  const stats = { reads: 0, writes: 0, lists: 0 }
  const kv = {
    get: (...args) => {
      stats.reads += 1
      return store.get(...args)
    },
    put: (...args) => {
      stats.writes += 1
      return store.put(...args)
    },
    del: (...args) => {
      stats.writes += 1
      return store.del(...args)
    },
    list: (...args) => {
      stats.lists += 1
      return store.list(...args)
    }
  }
  return { kv, stats }
}

/** 给响应附加本次请求的 KV 读写计数，便于在控制台/抓包中核对写入预算 */
export function withMetricsHeaders(response, stats) {
  const headers = new Headers(response.headers)
  headers.set('X-KV-Reads', String(stats.reads))
  headers.set('X-KV-Writes', String(stats.writes))
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  })
}
