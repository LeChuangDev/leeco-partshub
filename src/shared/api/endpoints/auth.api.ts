// src/shared/api/endpoints/auth.api.ts
import { request } from '../http'

export interface AuthCheckResult {
  authenticated: boolean
  devBypass?: boolean
}

export const authApi = {
  authCheck: () => request<AuthCheckResult>('/auth/check')
}
