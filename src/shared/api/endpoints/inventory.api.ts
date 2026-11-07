// src/shared/api/endpoints/inventory.api.ts
// 库存批次、出入库、移动位置、流水与存储位置接口。

import { request, toQuery } from '../http'
import type { Location, Stock, Transaction } from '../types'

export interface StockInPayload {
  partId: string
  quantity: number
  unit?: string
  locationId?: string | null
  /** 扫码连续入库：同位置 + 同单价并入既有批次，避免碎片化 */
  merge?: boolean
  source?: string
  batchId?: string
  unitPrice?: number
  supplier?: string
  orderNo?: string
  note?: string
  reason?: string
}

export interface StockOutPayload {
  partId: string
  quantity: number
  source?: string
  stockId?: string
  reason?: string
  note?: string
  orderNo?: string
  projectId?: string
  projectName?: string
}

export interface MoveStockPayload {
  partId: string
  locationId: string | null
  stockId?: string
}

export interface MoveStockResult {
  ok: boolean
  moved: number
  unchanged?: boolean
  locationId: string | null
}

export const inventoryApi = {
  // 库存
  listStock: (partId: string) => request<Stock[]>(`/stock${toQuery({ partId })}`),
  stockIn: (body: StockInPayload) => request('/stock/in', 'POST', body),
  stockOut: (body: StockOutPayload) => request('/stock/out', 'POST', body),
  moveStock: (body: MoveStockPayload) => request<MoveStockResult>('/stock/move', 'POST', body),
  listTransactions: (partId: string) => request<Transaction[]>(`/transactions${toQuery({ partId })}`),

  // 位置
  listLocations: () => request<Location[]>('/locations'),
  createLocation: (body: Partial<Location>) => request<Location>('/locations', 'POST', body),
  updateLocation: (body: Partial<Location> & { id: string }) => request<Location>('/locations', 'PUT', body),
  deleteLocation: (id: string) => request(`/locations${toQuery({ id })}`, 'DELETE')
}
