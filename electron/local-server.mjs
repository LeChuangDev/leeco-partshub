// electron/local-server.mjs
// 离线桌面版的本地服务：同一份 server/http/router.js + FileKV，
// 同时提供 dist-offline 静态资源与 /api 接口，渲染进程通过 http://127.0.0.1 访问。
import http from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, resolve, sep } from 'node:path'
import { handleApi } from '../server/http/router.js'
import { FileKV } from '../server/infrastructure/kv/file-kv.js'

const MAX_BODY = 100 * 1024 * 1024

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8'
}

function readRequestBody(req) {
  return new Promise((resolveBody, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY) {
        reject(new Error('请求体超过 100MB'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolveBody(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function toHeaders(nodeHeaders) {
  const headers = new Headers()
  for (const [key, value] of Object.entries(nodeHeaders)) {
    if (value != null) headers.set(key, Array.isArray(value) ? value.join(', ') : String(value))
  }
  return headers
}

async function serveStatic(res, rootDir, pathname) {
  const root = resolve(rootDir)
  const rel = pathname === '/' ? '/index.html' : pathname
  let target = resolve(root, '.' + rel)
  if (!target.startsWith(root + sep) && target !== root) {
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('Forbidden')
    return
  }
  try {
    let info = await stat(target)
    if (info.isDirectory()) {
      target = join(target, 'index.html')
      info = await stat(target)
    }
    const body = await readFile(target)
    const ext = extname(target).toLowerCase()
    const headers = {
      'content-type': MIME[ext] || 'application/octet-stream',
      'cache-control': rel.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache'
    }
    res.writeHead(200, headers)
    res.end(body)
    return info
  } catch {
    // Hash 路由下正常只需要 '/'，未命中时回退到 index.html
    try {
      const body = await readFile(join(root, 'index.html'))
      res.writeHead(200, { 'content-type': MIME['.html'], 'cache-control': 'no-cache' })
      res.end(body)
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('Not Found')
    }
  }
}

/**
 * 启动离线版本地服务。
 * @param {{ rootDir: string, kvFile: string, port?: number }} options
 * @returns {Promise<{ server: http.Server, port: number, kvFile: string, close: () => Promise<void> }>}
 */
export function startLocalServer({ rootDir, kvFile, port = 0 }) {
  const kv = new FileKV(kvFile)
  // 离线版：无登录令牌，数据只存在本机；OFFLINE=1 用于关闭公网接口代理能力
  const env = { LOCAL_KV: kv, AUTH_DISABLED: '1', OFFLINE: '1' }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1')

    if (url.pathname.startsWith('/api')) {
      try {
        const method = req.method || 'GET'
        const init = { method, headers: toHeaders(req.headers) }
        if (method !== 'GET' && method !== 'HEAD') {
          const body = await readRequestBody(req)
          if (body.length) init.body = body
        }
        const request = new Request(url.toString(), init)
        const response = await handleApi(request, env, url)
        const headers = {}
        response.headers.forEach((value, key) => { headers[key] = value })
        const buffer = Buffer.from(await response.arrayBuffer())
        res.writeHead(response.status, headers)
        res.end(buffer)
      } catch (e) {
        if (!res.headersSent) {
          res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
        }
        res.end(JSON.stringify({ code: 500, data: {}, msg: String((e && e.message) || e) }))
      }
      return
    }

    await serveStatic(res, rootDir, decodeURIComponent(url.pathname))
  })

  return new Promise((resolveServer, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => {
      const actualPort = server.address().port
      resolveServer({
        server,
        port: actualPort,
        kvFile,
        close: () => new Promise((done) => server.close(() => done()))
      })
    })
  })
}
