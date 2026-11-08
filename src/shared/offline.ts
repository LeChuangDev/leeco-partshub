// src/shared/offline.ts
// 离线桌面版标记。Electron 构建使用 vite --mode offline，内置本地服务与 FileKV，
// 不经过 EdgeOne，因此不受 1MB 请求体上限约束。
export const IS_OFFLINE = import.meta.env.VITE_OFFLINE === '1'
export const IS_EDGE = import.meta.env.PROD && !IS_OFFLINE
