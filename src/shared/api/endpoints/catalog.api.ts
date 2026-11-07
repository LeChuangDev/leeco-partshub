// src/shared/api/endpoints/catalog.api.ts
// 元器件与分类接口。

import { request, toQuery } from '../http'
import type { Category, Part } from '../types'

export const catalogApi = {
  // 分类
  listCategories: () => request<Category[]>('/categories'),
  createCategory: (body: Partial<Category>) => request<Category>('/categories', 'POST', body),
  updateCategory: (body: Partial<Category> & { id: string }) => request<Category>('/categories', 'PUT', body),
  deleteCategory: (id: string) => request(`/categories${toQuery({ id })}`, 'DELETE'),

  // 元器件
  listParts: (query: Record<string, unknown> = {}) => request<any>(`/parts${toQuery(query)}`),
  getPart: (id: string) => request<Part>(`/parts${toQuery({ id })}`),
  createPart: (body: Partial<Part>) => request<Part>('/parts', 'POST', body),
  updatePart: (body: Partial<Part> & { id: string }) => request<Part>('/parts', 'PUT', body),
  deletePart: (id: string) => request(`/parts${toQuery({ id })}`, 'DELETE'),

  // 第三方器件信息代理（占位）
  partInfo: (platform: string, sku: string) => request(`/parts/info/${platform}/${sku}`)
}
