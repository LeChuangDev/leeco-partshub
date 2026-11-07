// server/infrastructure/kv/create-kv.js
// KV 工厂：按运行环境选择实现。
// - 生产（EdgeOne）：env.KV 为边缘 KV 绑定
// - 本地开发：tools/dev-server 注入 env.LOCAL_KV（FileKV）
// - 单测：env 缺省或 { memory: true }
import { EdgeOneKV } from './edgeone-kv.js'
import { MemoryKV } from './memory-kv.js'

export const NAMESPACE = 'leeco-partshub'

export function namespace() {
  return NAMESPACE
}

export function createKV(env = {}) {
  if (env && env.KV) return new EdgeOneKV(env.KV)
  if (env && env.LOCAL_KV) return env.LOCAL_KV
  if (env && env.memory) return new MemoryKV()
  return new MemoryKV()
}
