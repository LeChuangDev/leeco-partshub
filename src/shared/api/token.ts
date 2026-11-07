// src/shared/api/token.ts
// 访问令牌的唯一存储位置。HTTP 层与 auth store 都从这里读写，
// 避免二者互相 import 形成循环依赖。

const TOKEN_KEY = 'leeco_token'

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) || ''
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}
