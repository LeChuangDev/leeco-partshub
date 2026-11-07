// src/shared/api/types.ts
// 接口 DTO：只描述传输结构，不含 UI 状态与业务方法。

export interface Category {
  id: string
  name: string
  parentId: string | null
  order: number
  paramTemplate: ParamField[]
  createdAt?: string
  updatedAt?: string
}
export interface ParamField {
  key: string
  label: string
  type: 'text' | 'number' | 'enum'
  unit?: string
  options?: string[]
}
export interface Supplier {
  platform: string
  sku: string
  url?: string
  price?: number
}
export interface Part {
  id: string
  internalNo: string
  name: string
  categoryId: string | null
  package: string
  description: string
  brand: string
  manufacturerModel: string
  alternates: string[]
  suppliers: Supplier[]
  params: Record<string, string>
  tags: string[]
  attachments: any[]
  safetyStock: number
  lastOutAt?: string | null
  createdAt?: string
  updatedAt?: string
  stocks?: Stock[]
  totalQuantity?: number
}
export interface Stock {
  id: string
  partId: string
  locationId: string | null
  quantity: number
  unit: string
  unitPrice: number
  orderNo: string
  supplier: string
  note: string
  safetyStock: number
  createdAt?: string
  lastOutAt?: string | null
}
export interface Location {
  id: string
  name: string
  parentId: string | null
  code: string
  grid: { rows: number; cols: number } | null
  createdAt?: string
  updatedAt?: string
}
export interface Transaction {
  id: string
  partId: string
  stockId: string | null
  type: 'in' | 'out'
  quantity: number
  balance: number
  reason: string
  orderNo: string
  operator: string
  createdAt?: string
}
export interface DistItem {
  name: string
  value: number
}
export interface Trend {
  period: 'week' | 'month' | 'year'
  labels: string[]
  in: number[]
  out: number[]
}
export interface Stats {
  categoriesCount: number
  partsCount: number
  locationsCount: number
  transactionsCount: number
  totalQuantity: number
  totalValue: number
  lowStockCount: number
  shortageCount: number
  shortage: { partId: string; name: string }[]
  lowStock: { partId: string; name: string; quantity: number; safetyStock: number }[]
  stale: { partId: string; name: string; quantity: number; lastOutAt: string | null }[]
  projectsCount: number
  trend: Trend
  byCategory: DistItem[]
  byBrand: DistItem[]
  byPackage: DistItem[]
}
export interface ImportItem {
  index: number
  action: 'match' | 'create' | 'skip'
  partId?: string
  partName?: string
  partData?: any
  row?: any
  locationId?: string | null
  categoryId?: string | null
  selected?: boolean
}

/* ---------------- BOM 齐套 ---------------- */
export type BomStatus = 'ok' | 'short' | 'empty' | 'missing'

export interface BomLocationHint {
  id: string
  path: string
  quantity: number
}

export interface BomCandidate {
  partId: string
  name: string
  model: string
  package: string
  available: number
}

export interface BomLine {
  lineNo: number
  designators: string
  model: string
  name: string
  package: string
  required: number
  note: string
  status: BomStatus
  partId: string | null
  partName: string
  partModel: string
  partPackage: string
  available: number
  shortage: number
  locations: BomLocationHint[]
  candidates: BomCandidate[]
  needCreate?: boolean
  score?: number
}

export interface BomSummary {
  lineCount: number
  partKinds: number
  matchedLines: number
  missingLines: number
  okLines: number
  shortLines: number
  emptyLines: number
  requiredQty: number
  shortageQty: number
  readyQty: number
  coverage: number
  completeness: number
}

export interface BomMatchResult {
  lines: BomLine[]
  summary: BomSummary
}

export interface SearchResult {
  parts: {
    id: string; name: string; model: string; package: string
    quantity: number; safetyStock: number; categoryId: string | null
  }[]
  locations: { id: string; name: string; code: string; parentId: string | null }[]
  categories: { id: string; name: string; parentId: string | null }[]
  total: number
}

/* ------------------------------- 项目 BOM ------------------------------- */
export type ProjectStatus = 'design' | 'sample' | 'pilot' | 'mass' | 'archived'

export interface Project {
  id: string
  name: string
  code: string
  version: string
  status: ProjectStatus
  owner: string
  buildQty: number
  note: string
  lineCount: number
  createdAt?: string
  updatedAt?: string
  lastConsumedAt?: string
}

export interface ProjectLine {
  id: string
  partId: string | null
  designators: string
  model: string
  name: string
  package: string
  quantity: number
  note: string
  createdAt?: string
  // 分析时补充
  lineId?: string
  partName?: string
  partModel?: string
  partPackage?: string
  required?: number
  available?: number
  shortage?: number
  status?: 'ok' | 'short' | 'empty' | 'unlinked'
  multiple?: number
  locations?: { id: string; path: string; quantity: number }[]
}

export interface ProjectAnalysis {
  project: Project
  lines: ProjectLine[]
  buildQty: number
  summary: BomSummary & {
    multiple: number
    buildQty: number
    unlinkedLines: number
  }
}

export interface ProjectConsumeResult {
  ok: boolean
  partial?: boolean
  totalOut: number
  success: { partId: string; name?: string; quantity: number; designators: string[]; transactions: number }[]
  failed: { partId: string | null; name?: string; model?: string; quantity: number; shortage?: number; msg: string }[]
  projectName: string
}
