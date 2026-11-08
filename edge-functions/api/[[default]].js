// edge-functions/api/[[default]].js
// EdgeOne Pages Edge Functions 入口（/api 下多级 catch-all 路由）。
// 本文件只是薄封装：直接复用 server/http/router.js 的统一处理逻辑，保证边缘端与本地服务端同构。
//
// 部署要点：
//   - EdgeOne Pages 的 Edge Functions 目录为 ./edge-functions，[[default]].js 匹配 /api 下所有路径
//   - KV 绑定在 EdgeOne 中以变量名注入全局（官方示例直接用 my_kv），同时兼容 env.KV 风格
//   - env.AUTH_TOKEN 在控制台环境变量中配置，切勿硬编码或提交到仓库

import { handleApi } from '../../server/http/router.js'
import { json } from '../../server/http/http-utils.js'

export default function onRequest(context) {
  const { request, env = {} } = context
  // 兼容两种注入方式：EdgeOne 全局变量 KV / Cloudflare 风格 env.KV
  let kvBinding = env.KV
  if (!kvBinding && typeof KV !== 'undefined') kvBinding = KV
  if (!kvBinding && typeof globalThis !== 'undefined') kvBinding = globalThis.KV
  if (!kvBinding) {
    return json(-1, {}, 'KV 未绑定：请在 EdgeOne 控制台把命名空间绑定为变量 KV', 500)
  }
  return handleApi(request, { ...env, KV: kvBinding }, new URL(request.url))
}
