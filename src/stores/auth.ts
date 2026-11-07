import { defineStore } from 'pinia'
import { getToken, setToken, clearToken } from '../api/client'

export const useAuth = defineStore('auth', {
  state: () => ({
    token: getToken(),
    authenticated: !!getToken()
  }),
  actions: {
    login(token: string) {
      setToken(token)
      this.token = token
      this.authenticated = true
    },
    logout() {
      clearToken()
      this.token = ''
      this.authenticated = false
    }
  }
})
