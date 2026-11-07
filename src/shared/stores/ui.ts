// src/stores/ui.ts
// 全局弹层与快捷操作状态：快捷键、命令面板、扫码、右键菜单等入口共用。
import { defineStore } from 'pinia'

export const useUi = defineStore('ui', {
  state: () => ({
    paletteOpen: false,
    quickAddOpen: false,
    scanOpen: false,
    helpOpen: false
  }),
  getters: {
    anyModalOpen: (s) => s.quickAddOpen || s.scanOpen || s.helpOpen
  },
  actions: {
    openPalette() { this.paletteOpen = true },
    closePalette() { this.paletteOpen = false },
    togglePalette() { this.paletteOpen = !this.paletteOpen },
    openQuickAdd() { this.quickAddOpen = true },
    openScan() { this.scanOpen = true },
    openHelp() { this.helpOpen = true }
  }
})
