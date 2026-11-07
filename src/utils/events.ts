// src/utils/events.ts
// 跨组件的数据变更通知：快速入库、扫码出入库等全局操作完成后，
// 让当前页面刷新库存/统计，避免界面停留在旧数据。
export const DATA_CHANGED = 'leeco:data-changed'

export function emitDataChanged() {
  window.dispatchEvent(new Event(DATA_CHANGED))
}

export function onDataChanged(fn: () => void) {
  window.addEventListener(DATA_CHANGED, fn)
  return () => window.removeEventListener(DATA_CHANGED, fn)
}
