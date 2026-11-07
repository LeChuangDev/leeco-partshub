// src/shared/api/index.ts
// API 门面：把各资源端点聚合为一个稳定对象，页面只依赖这里。
// 拆分维度是「资源」，而不是「页面」——同一资源可被多个模块复用。

import { authApi } from './endpoints/auth.api'
import { bomApi } from './endpoints/bom.api'
import { catalogApi } from './endpoints/catalog.api'
import { inventoryApi } from './endpoints/inventory.api'
import { projectsApi } from './endpoints/projects.api'
import { systemApi } from './endpoints/system.api'

export const api = {
  ...authApi,
  ...catalogApi,
  ...inventoryApi,
  ...bomApi,
  ...projectsApi,
  ...systemApi
}

export { ApiError, request, setUnauthorizedHandler, toQuery } from './http'
export { clearToken, getToken, setToken } from './token'
export type { AuthCheckResult } from './endpoints/auth.api'
export type { BomConsumeResult } from './endpoints/bom.api'
export type { MoveStockPayload, MoveStockResult, StockInPayload, StockOutPayload } from './endpoints/inventory.api'
export type { ProjectLinePayload } from './endpoints/projects.api'
