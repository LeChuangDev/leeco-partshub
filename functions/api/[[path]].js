// functions/api/[[path]].js
// Cloudflare Pages Functions 入口（/api 下多级 catch-all）。
// 与 EdgeOne 入口共用同一份 server/http/router.js，运行时只依赖 Web 标准 API。
//
// 部署要点（全部在网页控制台完成，无需本地安装）：
//   - Pages 项目连接本仓库，构建命令 npm run build，输出目录 dist
//   - 创建 Workers KV 命名空间，绑定到本项目，变量名必须为 KV
//   - 环境变量配置 AUTH_TOKEN（强随机值），不要配置 AUTH_DISABLED

import { handleApi } from '../../server/http/router.js'
import { json } from '../../server/http/http-utils.js'

export async function onRequest(context) {
  const { request, env = {} } = context
  if (!env.KV) {
    return json(-1, {}, 'KV 未绑定：请在 Cloudflare Pages 项目设置中把 KV 命名空间绑定到变量 KV', 500)
  }
  return handleApi(request, env, new URL(request.url))
}
