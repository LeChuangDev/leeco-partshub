// server/domain/audit.js
// 审计枚举与来源归一：前端展示与后端写入共用同一套常量（纯函数，无 IO）。

export const AUDIT_SOURCES = {
  manual: '手动操作',
  scan: '扫码',
  bom: 'BOM 齐套',
  project: '项目领料',
  import: '订单导入',
  restore: '备份恢复',
  system: '系统'
}

export const AUDIT_ACTIONS = {
  'stock.in': '入库',
  'stock.out': '出库',
  'stock.move': '移动位置',
  'import.commit': '导入入库',
  'import.undo': '撤销导入',
  'backup.restore': '覆盖恢复'
}

/** 从操作上下文推断来源；显式 source 优先 */
export function normalizeSource(input = {}) {
  if (input.source) {
    const s = String(input.source)
    return AUDIT_SOURCES[s] ? s : 'system'
  }
  const op = String(input.operator || 'system')
  return AUDIT_SOURCES[op] ? op : 'manual'
}
