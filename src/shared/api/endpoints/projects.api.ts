// src/shared/api/endpoints/projects.api.ts
// 项目 BOM：项目 CRUD、BOM 行保存、导入、分析与领料。

import { request, toQuery } from '../http'
import type { Project, ProjectAnalysis, ProjectConsumeResult } from '../types'

export interface ProjectLinePayload {
  id?: string
  partId?: string | null
  name?: string
  model?: string
  package?: string
  designators?: string
  quantity: number
  note?: string
}

export const projectsApi = {
  listProjects: () => request<Project[]>('/projects'),
  getProject: (id: string, buildQty?: number) =>
    request<ProjectAnalysis>(`/projects/${id}${toQuery({ buildQty })}`),
  createProject: (body: Record<string, unknown>) =>
    request<{ project: Project; lines: unknown[] }>('/projects', 'POST', body),
  updateProject: (id: string, body: Record<string, unknown>) =>
    request<{ project: Project }>(`/projects/${id}`, 'PUT', body),
  deleteProject: (id: string) => request(`/projects/${id}`, 'DELETE'),
  saveProjectBom: (id: string, lines: ProjectLinePayload[], buildQty?: number) =>
    request(`/projects/${id}/bom`, 'PUT', { lines, buildQty }),
  importProjectBom: (id: string, body: { text?: string; rows?: unknown[]; mode?: 'replace' | 'append'; buildQty?: number }) =>
    request<any>(`/projects/${id}/import`, 'POST', body),
  consumeProject: (id: string, body: { buildQty?: number } = {}) =>
    request<ProjectConsumeResult>(`/projects/${id}/consume`, 'POST', body)
}
