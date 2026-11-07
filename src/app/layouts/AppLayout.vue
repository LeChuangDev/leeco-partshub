<template>
  <div class="app-shell">
    <!-- 桌面侧栏 -->
    <aside v-if="!isMobile" class="sider" :class="{ collapsed }">
      <div class="brand" :class="{ center: collapsed }">
        <div class="logo"><AppIcon name="package" :size="21" /></div>
        <div v-if="!collapsed" class="brand-text">
          <div class="b1">樂創元件仓</div>
          <div class="b2">LEECO PARTSHUB</div>
        </div>
      </div>

      <div v-if="!collapsed" class="menu-label">工作台</div>
      <n-menu
        :value="activeKey"
        :options="menuOptions"
        :collapsed="collapsed"
        :collapsed-width="68"
        :indent="16"
        :root-indent="16"
        @update:value="onMenu"
      />

      <div class="sider-foot">
        <template v-if="!collapsed">
          <span class="dot" />
          <span>数据存储于 EdgeOne KV</span>
        </template>
        <span v-else class="dot" />
      </div>
    </aside>

    <!-- 移动端抽屉 -->
    <n-drawer v-model:show="drawer" :width="252" placement="left">
      <n-drawer-content :native-scrollbar="false" body-content-style="padding: 0">
        <div class="drawer-body">
          <div class="brand">
            <div class="logo"><AppIcon name="package" :size="21" /></div>
            <div class="brand-text">
              <div class="b1">樂創元件仓</div>
              <div class="b2">LEECO PARTSHUB</div>
            </div>
          </div>
          <n-menu :value="activeKey" :options="menuOptions" :indent="16" @update:value="onMenu" />
        </div>
      </n-drawer-content>
    </n-drawer>

    <!-- 主区 -->
    <div class="main-col">
      <header class="header">
        <div class="h-left">
          <button class="icon-btn" :title="isMobile ? '打开菜单' : collapsed ? '展开侧栏' : '收起侧栏'" :aria-label="isMobile ? '打开菜单' : collapsed ? '展开侧栏' : '收起侧栏'" @click="toggleSider">
            <AppIcon name="menu" :size="18" />
          </button>
          <nav class="crumb">
            <span class="crumb-root">樂創</span>
            <AppIcon name="chevronRight" :size="12" />
            <span class="crumb-cur">{{ currentTitle }}</span>
          </nav>
          <button class="search-trigger" title="全局搜索（Ctrl / ⌘ + K）" aria-label="全局搜索" @click="ui.openPalette()">
            <AppIcon name="search" :size="15" />
            <span class="st-text">搜索器件、库位…</span>
            <kbd class="st-kbd">⌘K</kbd>
          </button>
        </div>

        <div class="h-right">
          <button class="icon-btn kb-trigger" title="键盘快捷键（?）" aria-label="键盘快捷键" @click="ui.openHelp()">
            <AppIcon name="keyboard" :size="17" />
          </button>
          <button class="icon-btn" :title="theme.dark ? '切换浅色' : '切换暗色'" :aria-label="theme.dark ? '切换到浅色主题' : '切换到暗色主题'" @click="theme.toggle()">
            <AppIcon :name="theme.dark ? 'sun' : 'moon'" :size="18" />
          </button>
          <n-button type="primary" strong round class="quick-add" @click="ui.openQuickAdd()">
            <template #icon><AppIcon name="plus" :size="16" /></template>
            <span class="qa-text">快速入库</span>
          </n-button>
          <n-dropdown :options="userOptions" trigger="click" @select="onUser">
            <button class="icon-btn" title="账户与令牌" aria-label="账户与令牌"><AppIcon name="user" :size="17" /></button>
          </n-dropdown>
        </div>
      </header>

      <main class="content">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </main>
    </div>

    <QuickAddModal :show="ui.quickAddOpen" @update:show="(v: boolean) => ui.quickAddOpen = v" />
    <CommandPalette />
    <ScanModal :show="ui.scanOpen" @update:show="(v: boolean) => ui.scanOpen = v" />
    <ShortcutSheet :show="ui.helpOpen" @update:show="(v: boolean) => ui.helpOpen = v" />
  </div>
</template>

<script setup lang="ts">
import { computed, h, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NMenu, NButton, NDropdown, NDrawer, NDrawerContent } from 'naive-ui'
import { useAuth } from '@/modules/auth/stores/auth'
import { useTheme } from '@/shared/stores/theme'
import { useUi } from '@/shared/stores/ui'
import AppIcon from '@/shared/ui/AppIcon.vue'
import QuickAddModal from '@/modules/inventory/components/QuickAddModal.vue'
import CommandPalette from '@/app/components/CommandPalette.vue'
import ScanModal from '@/modules/inventory/components/ScanModal.vue'
import ShortcutSheet from '@/shared/ui/ShortcutSheet.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuth()
const theme = useTheme()
const ui = useUi()

const collapsed = ref(false)
const isMobile = ref(false)
const drawer = ref(false)

const menuOptions = [
  { label: '总览看板', key: 'dashboard', icon: () => h(AppIcon, { name: 'dashboard', size: 18 }) },
  { label: '元器件管理', key: 'parts', icon: () => h(AppIcon, { name: 'parts', size: 18 }) },
  { label: '项目 BOM', key: 'projects', icon: () => h(AppIcon, { name: 'project', size: 18 }) },
  { label: 'BOM 齐套', key: 'bom', icon: () => h(AppIcon, { name: 'bom', size: 18 }) },
  { label: '存储位置', key: 'locations', icon: () => h(AppIcon, { name: 'location', size: 18 }) },
  { label: '订单导入', key: 'import', icon: () => h(AppIcon, { name: 'import', size: 18 }) },
  { label: '备份与设置', key: 'backup', icon: () => h(AppIcon, { name: 'settings', size: 18 }) }
]

const activeKey = computed(() => route.name as string)
const currentTitle = computed(() => (route.meta?.title as string) || '樂創元件仓')

function onMenu(key: string) {
  drawer.value = false
  router.push({ name: key })
}

function toggleSider() {
  if (isMobile.value) drawer.value = true
  else collapsed.value = !collapsed.value
}

let viewportReady = false
let lastNarrow = false
function syncViewport() {
  isMobile.value = window.innerWidth < 860
  const narrow = window.innerWidth < 1180
  // 首次按断点给默认值；之后只在「变窄」时自动收起，不覆盖用户手动展开/收起
  if (!viewportReady || (narrow && !lastNarrow)) collapsed.value = narrow
  viewportReady = true
  lastNarrow = narrow
}

/* ---------------- 全局快捷键 ---------------- */
const NAV_KEYS: Record<string, string> = {
  '1': 'dashboard', '2': 'parts', '3': 'projects', '4': 'bom',
  '5': 'locations', '6': 'import', '7': 'backup', '8': 'labels'
}

function isTyping(el: EventTarget | null) {
  const t = el as HTMLElement | null
  if (!t) return false
  const tag = t.tagName?.toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select' || !!t.isContentEditable
}

function onGlobalKey(e: KeyboardEvent) {
  if (e.isComposing) return
  const mod = e.metaKey || e.ctrlKey
  const key = e.key.toLowerCase()

  // Ctrl/⌘ K：全局搜索（打开状态下再按一次关闭）
  if (mod && key === 'k') {
    e.preventDefault()
    if (ui.quickAddOpen || ui.scanOpen || ui.helpOpen) return
    ui.paletteOpen ? ui.closePalette() : ui.openPalette()
    return
  }
  // 命令面板打开时，不叠加其它弹层
  if (ui.paletteOpen || ui.anyModalOpen) return

  if (mod && key === 'i' && !isTyping(e.target)) { e.preventDefault(); ui.openQuickAdd(); return }
  if (mod && key === 's' && !isTyping(e.target)) { e.preventDefault(); ui.openScan(); return }

  // Alt + 1..8 直达页面（输入框内不劫持）
  if (e.altKey && !mod && NAV_KEYS[e.key] && !isTyping(e.target)) {
    e.preventDefault()
    router.push({ name: NAV_KEYS[e.key] })
    return
  }

  if (e.key === '?' && !isTyping(e.target)) { e.preventDefault(); ui.openHelp(); return }
  if (e.key === '/' && !isTyping(e.target)) { e.preventDefault(); ui.openPalette() }
}

onMounted(() => {
  syncViewport()
  window.addEventListener('resize', syncViewport)
  window.addEventListener('keydown', onGlobalKey)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', syncViewport)
  window.removeEventListener('keydown', onGlobalKey)
})

const userOptions: any[] = [
  { label: '快捷键说明', key: 'help', icon: () => h(AppIcon, { name: 'keyboard', size: 16 }) },
  { type: 'divider', key: 'd1' },
  { label: '退出登录', key: 'logout', icon: () => h(AppIcon, { name: 'logout', size: 16 }) }
]
function onUser(key: string) {
  if (key === 'help') { ui.openHelp(); return }
  if (key === 'logout') {
    auth.logout()
    router.push({ name: 'login' })
  }
}
</script>

<style scoped>
.app-shell { display: flex; height: 100vh; overflow: hidden; background: var(--bg); }

/* ---------------- 侧栏 ---------------- */
.sider {
  width: 236px; flex: 0 0 236px;
  display: flex; flex-direction: column;
  background: var(--surface);
  border-right: 1px solid var(--outline);
  transition: width .2s var(--ease), flex-basis .2s var(--ease), background-color .25s var(--ease);
  overflow: hidden;
}
.sider.collapsed { width: 68px; flex-basis: 68px; }
.brand { display: flex; align-items: center; gap: 11px; padding: 18px 18px 14px; min-height: 66px; }
.brand.center { justify-content: center; padding: 18px 0 14px; }
.logo {
  width: 36px; height: 36px; border-radius: 11px; color: #fff; flex-shrink: 0;
  background: linear-gradient(140deg, #6b7bff, #8f7bff 70%, #a78bfa);
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 4px 12px rgba(91, 108, 255, .32);
}
.brand-text { min-width: 0; }
.brand-text .b1 { font-weight: 750; font-size: 15.5px; letter-spacing: -.01em; line-height: 1.2; }
.brand-text .b2 { font-size: 9.5px; color: var(--text-3); letter-spacing: .14em; margin-top: 2px; }
.menu-label {
  font-size: 10.5px; font-weight: 700; letter-spacing: .12em; color: var(--text-3);
  padding: 6px 20px 4px; text-transform: uppercase;
}
.sider-foot {
  margin-top: auto; padding: 12px 18px 16px; display: flex; align-items: center; gap: 7px;
  font-size: 11px; color: var(--text-3); white-space: nowrap;
}
.sider-foot .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--secondary); flex-shrink: 0; }
.sider.collapsed .sider-foot { justify-content: center; padding: 12px 0 16px; }

/* ---------------- 主列 ---------------- */
.main-col { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.header {
  height: 62px; flex: 0 0 62px;
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 20px; gap: 12px;
  background: var(--surface);
  background: color-mix(in srgb, var(--surface) 88%, transparent);
  backdrop-filter: saturate(1.6) blur(8px);
  border-bottom: 1px solid var(--outline);
}
.h-left { display: flex; align-items: center; gap: 8px; min-width: 0; }
.h-right { display: flex; align-items: center; gap: 8px; }
.icon-btn {
  width: 34px; height: 34px; border-radius: 9px; border: 1px solid transparent;
  background: transparent; color: var(--text-2); cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
  transition: background-color .15s var(--ease), color .15s var(--ease);
}
.icon-btn:hover { background: var(--surface-3); color: var(--text-1); }
.crumb { display: flex; align-items: center; gap: 7px; font-size: 13px; color: var(--text-3); min-width: 0; }
.crumb-root { font-weight: 500; }
.crumb-cur { font-weight: 650; color: var(--text-1); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* 顶栏搜索入口 */
.search-trigger {
  display: flex; align-items: center; gap: 8px; margin-left: 8px;
  height: 32px; padding: 0 8px 0 10px; min-width: 208px;
  border-radius: 9px; border: 1px solid var(--outline); background: var(--surface-2);
  color: var(--text-3); font-size: 12.5px; cursor: pointer; font-family: inherit;
  transition: all .15s var(--ease);
}
.search-trigger:hover { border-color: var(--outline-strong); background: var(--surface-3); color: var(--text-2); }
.st-text { flex: 1; text-align: left; white-space: nowrap; }
.st-kbd {
  font-family: var(--mono); font-size: 10px; line-height: 1;
  padding: 3px 5px; border-radius: 4px;
  border: 1px solid var(--outline); background: var(--surface); color: var(--text-3);
}

.content {
  flex: 1; min-height: 0; overflow: auto;
  padding: 22px 24px 28px;
}

.drawer-body { padding: 0 0 16px; }
.quick-add :deep(.n-button__icon) { margin-right: 2px; }

@media (max-width: 768px) {
  .header { padding: 0 12px; height: 58px; flex-basis: 58px; }
  .content { padding: 14px 14px 22px; }
  .qa-text { display: none; }
  .quick-add { padding: 0 10px; }
  .crumb { font-size: 12.5px; }
  .search-trigger { min-width: 0; padding: 0; width: 34px; height: 34px; justify-content: center; margin-left: 2px; border-color: transparent; background: transparent; }
  .st-text, .st-kbd { display: none; }
  .kb-trigger { display: none; }
}
</style>
