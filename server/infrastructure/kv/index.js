// server/infrastructure/kv/index.js
// KV 基础设施统一出口。上层（仓储/应用服务/HTTP）只从这里导入，
// 不直接依赖具体部署实现。

export { MemoryKV } from './memory-kv.js'
export { EdgeOneKV } from './edgeone-kv.js'
export { createKV, namespace, NAMESPACE } from './create-kv.js'
export { kvGetJSON, kvPutJSON } from './json.js'
export { KV_BATCH, mapLimit } from './batch.js'
