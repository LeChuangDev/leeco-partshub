// src/shared/api/endpoints/bom.api.ts
// BOM 齐套：匹配与一键领料。

import { request } from '../http'
import type { BomMatchResult } from '../types'

export interface BomConsumeResult {
  ok: boolean
  totalOut: number
  success: any[]
  failed: any[]
  projectName: string
}

export const bomApi = {
  bomMatch: (rows: unknown[]) => request<BomMatchResult>('/bom/match', 'POST', { rows }),
  bomConsume: (lines: unknown[], projectName: string) =>
    request<BomConsumeResult>('/bom/consume', 'POST', { lines, projectName })
}
