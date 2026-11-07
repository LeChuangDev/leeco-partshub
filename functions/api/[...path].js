// functions/api/[...path].js
// EdgeOne Pages Functions 入口（catch-all 路由）。EdgeOne 会把 /api/* 请求转发到本文件。
// 本文件只是薄封装：直接复用 server/http/router.js 的统一处理逻辑，保证边缘端与服务端同构。
//
// 部署说明：
//   - 该文件需放在 functions/api/ 目录下，文件名为 [...path].js（catch-all）
//   - env.KV 为 EdgeOne 边缘 KV 绑定（命名空间 leeco-partshub）
//   - env.AUTH_TOKEN 为鉴权令牌（在 EdgeOne 环境变量中配置，切勿硬编码）
//   - 相对路径 ../../shared/router.js 指向项目根目录的 shared，部署时由构建打包解析

import { handleApi } from '../../server/http/router.js'

export async function onRequest(context) {
  const { request, env } = context
  const url = new URL(request.url)
  return handleApi(request, env, url)
}
