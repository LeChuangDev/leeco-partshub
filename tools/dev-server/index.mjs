// tools/dev-server/index.mjs
// 本地开发 API 服务端：复用 server/http/router.js，使用 FileKV 持久化，注入开发令牌。
// 仅处理 /api/*；前端静态资源由 Vite dev server (5173) 提供并通过代理转发 /api 到本服务。
// 数据落在 .data/local-kv.json（可通过 KV_FILE 覆盖），与生产 EdgeOne KV 隔离。
import http from 'node:http'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { handleApi } from '../../server/http/router.js'
import { FileKV } from './file-kv.js'
import { DEV_TOKEN } from '../../server/http/auth.js'

const PORT = 8787
const __dirname = dirname(fileURLToPath(import.meta.url))
const kvFile = process.env.KV_FILE || join(__dirname, '../../.data/local-kv.json')
const kv = new FileKV(kvFile)
const env = {
  LOCAL_KV: kv,
  AUTH_TOKEN: process.env.AUTH_TOKEN || DEV_TOKEN,
  // 本地开发免鉴权：自动放行所有接口，便于免密验证功能。
  // 生产边缘函数不注入 AUTH_DISABLED，令牌鉴权照常强制。
  AUTH_DISABLED: process.env.AUTH_DISABLED || '1'
}

function buildRequest(req) {
  return new Promise((resolve) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      const headers = new Headers()
      for (const [k, v] of Object.entries(req.headers)) {
        headers.set(k, Array.isArray(v) ? v.join(', ') : v)
      }
      const url = `http://127.0.0.1:${PORT}${req.url}`
      const init = { method: req.method, headers }
      if (req.method !== 'GET' && req.method !== 'HEAD' && body) init.body = body
      resolve(new Request(url, init))
    })
  })
}

const server = http.createServer(async (req, res) => {
  if (!req.url.startsWith('/api')) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('Leeco PartsHub local API. Only /api/* is served here.')
    return
  }
  try {
    const request = await buildRequest(req)
    const response = await handleApi(request, env, new URL(request.url))
    const out = {}
    response.headers.forEach((v, k) => (out[k] = v))
    res.writeHead(response.status, out)
    const text = await response.text()
    res.end(text)
  } catch (e) {
    res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ code: 500, data: {}, msg: String((e && e.stack) || e) }))
  }
})

server.listen(PORT, () => {
  console.log(`✅ Leeco PartsHub API 已启动: http://127.0.0.1:${PORT}`)
  console.log(`   开发令牌 X-Auth-Token: ${env.AUTH_TOKEN}`)
  console.log(`   本地数据文件: ${kvFile}`)
})
