// src/shared/offline.ts
// 运行形态标记：同一份前端产物会被三种方式使用，这里集中判断能力边界。
// - 线上（EdgeOne / Cloudflare）：PROD 且非离线模式，受 1MB 请求体等平台限制
// - 离线桌面版：vite --mode offline，内置本地服务与 FileKV，不联网
// - 本地开发：dev 模式，走 tools/dev-server
export const IS_OFFLINE = import.meta.env.VITE_OFFLINE === '1'
export const IS_EDGE = import.meta.env.PROD && !IS_OFFLINE

/** 是否支持第三方公开接口代理（嘉立创等）：离线版不联网，直接关闭 */
export const EXTERNAL_API = !IS_OFFLINE

/** 单次请求体积上限（字节）：EdgeOne Edge Functions 为 1MB，本地/离线放宽到 20MB */
export const BODY_LIMIT = IS_EDGE ? 900 * 1024 : 20 * 1024 * 1024

/** 附件上限（字节）：线上按 1MB 请求体反推，本地/离线放宽 */
export const ATTACHMENT_LIMIT = {
  file: IS_EDGE ? 300 * 1024 : 2 * 1024 * 1024,
  total: IS_EDGE ? 600 * 1024 : 6 * 1024 * 1024
}
