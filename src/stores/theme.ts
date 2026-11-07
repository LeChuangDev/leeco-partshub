import { defineStore } from 'pinia'
import { ref } from 'vue'

function getInitial(): boolean {
  const saved = localStorage.getItem('leeco_theme')
  if (saved === 'dark' || saved === 'light') return saved === 'dark'
  // 默认跟随系统
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

export const useTheme = defineStore('theme', {
  state: () => ({ dark: getInitial() }),
  actions: {
    apply() {
      document.documentElement.setAttribute('data-theme', this.dark ? 'dark' : 'light')
      localStorage.setItem('leeco_theme', this.dark ? 'dark' : 'light')
    },
    toggle() {
      this.dark = !this.dark
      this.apply()
    },
    init() {
      this.apply()
    }
  }
})
