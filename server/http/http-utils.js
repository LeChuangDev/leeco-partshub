// server/http/http-utils.js
// HTTP 层通用工具：统一响应体与请求体解析。
// 约定：所有接口返回 { code, data, msg }，code=0 表示成功。

export function json(code, data = {}, msg = 'success', status = 200) {
  return new Response(JSON.stringify({ code, data, msg }), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  })
}

export async function readBody(request) {
  try {
    const text = await request.text()
    if (!text) return {}
    return JSON.parse(text)
  } catch {
    return {}
  }
}
