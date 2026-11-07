// server/domain/bom/summary.js
// BOM 统计口径唯一实现（纯函数）。前端粘贴预览、后端齐套分析、项目 BOM 三处共用，
// 避免「齐套率 / 匹配率 / 缺料行」出现两套算法而漂移。
//
// 口径定义（同时写入 docs/API.md）：
//   completeness  齐套率（件）= Σ min(需求, 可用) / Σ 需求，缺料行获得部分 credit
//   coverage      匹配率（行）= 已绑定器件的行数 / 总行数
//   shortageLines 缺料行数（不含未建档）= status short + empty
//   shortageLinesIncludingUnlinked 缺料行数（含未建档）= 上式 + missingLines

/** 汇总一组 BOM 行；行至少包含 partId / status / required / available / shortage */
export function summarizeBom(lines = []) {
  const list = Array.isArray(lines) ? lines : []
  const matched = list.filter((l) => l.partId)
  const sum = (key) => list.reduce((s, x) => s + (Number(x[key]) || 0), 0)
  const count = (status) => list.filter((l) => l.status === status).length

  const okLines = count('ok')
  const shortLines = count('short')
  const emptyLines = count('empty')
  const unlinkedLines = count('unlinked')
  const matchedLines = matched.length
  const missingLines = list.length - matchedLines
  const requiredQty = sum('required')
  const shortageQty = sum('shortage')
  const readyQty = list.reduce(
    (s, l) => s + Math.min(Number(l.required) || 0, Number(l.available) || 0),
    0
  )

  return {
    lineCount: list.length,
    partKinds: new Set(matched.map((l) => l.partId)).size,
    matchedLines,
    missingLines,
    okLines,
    shortLines,
    emptyLines,
    unlinkedLines,
    shortageLines: shortLines + emptyLines,
    shortageLinesIncludingUnlinked: shortLines + emptyLines + missingLines,
    requiredQty,
    shortageQty,
    readyQty,
    coverage: list.length ? Math.round((matchedLines / list.length) * 100) : 0,
    completeness: requiredQty ? Math.round((readyQty / requiredQty) * 100) : 0
  }
}

/** 统一展示标签，避免各处自造名称 */
export const METRIC_LABELS = {
  completeness: '齐套率（件）',
  coverage: '匹配率（行）',
  shortageLines: '缺料行（不含未建档）',
  shortageLinesIncludingUnlinked: '缺料行（含未建档）',
  missingLines: '未建档行'
}
