<template>
  <Teleport to="body">
    <Transition name="cmdk">
      <div v-if="visible" class="cmdk-mask" @mousedown.self="close">
        <div class="cmdk" role="dialog" aria-label="全局搜索">
          <div class="cmdk-input">
            <AppIcon name="search" :size="18" />
            <input
              ref="inputRef"
              v-model="query"
              placeholder="搜索元器件、型号、库位、分类，或跳转页面…"
              @keydown="onKey"
            />
            <kbd>ESC</kbd>
          </div>

          <div ref="bodyRef" class="cmdk-body">
            <div v-if="!query.trim()" class="cmdk-hint">快捷操作与跳转</div>
            <div v-else-if="loading && !items.length" class="cmdk-hint">搜索中…</div>
            <button
              v-for="(item, idx) in items"
              :key="item.type + item.id"
              :ref="(el) => setItemRef(el, idx)"
              class="cmdk-item"
              :class="{ active: idx === active }"
              @mouseenter="active = idx"
              @click="run(item)"
            >
              <span class="ci-icon"><AppIcon :name="item.icon" :size="16" /></span>
              <span class="ci-main">
                <span class="ci-label">{{ item.label }}</span>
                <span v-if="item.sub" class="ci-sub">{{ item.sub }}</span>
              </span>
              <span v-if="item.type === 'part'" class="ci-meta">
                <b :class="{ low: item.low }">{{ item.qty }}</b>
              </span>
              <span v-else class="ci-kind">{{ kindLabel(item.type) }}</span>
            </button>
            <div v-if="query.trim() && !loading && !items.length" class="cmdk-empty">
              没有匹配结果
              <span>试试型号片段，如 «STM32» 或 «10k 0603»</span>
            </div>
          </div>

          <div class="cmdk-foot">
            <span><kbd>↑</kbd><kbd>↓</kbd> 选择</span>
            <span><kbd>↵</kbd> 打开</span>
            <span class="flex-1" />
            <span class="dim">共 {{ items.length }} 项</span>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '@/shared/api'
import { useUi } from '@/shared/stores/ui'
import { useTheme } from '@/shared/stores/theme'
import type { SearchResult } from '@/shared/api/types'
import AppIcon from '@/shared/ui/AppIcon.vue'

interface Item {
  type: 'part' | 'location' | 'category' | 'page' | 'action'
  id: string
  label: string
  sub?: string
  icon: string
  qty?: number
  low?: boolean
  to?: any
  action?: 'quickAdd' | 'scan' | 'help' | 'theme'
}

const router = useRouter()
const ui = useUi()
const theme = useTheme()
const visible = computed({
  get: () => ui.paletteOpen,
  set: (v: boolean) => { ui.paletteOpen = v }
})
const query = ref('')
const inputRef = ref<HTMLInputElement | null>(null)
const bodyRef = ref<HTMLElement | null>(null)
const active = ref(0)
const loading = ref(false)
const itemEls: HTMLElement[] = []

const PAGES: Item[] = [
  { type: 'page', id: 'dashboard', label: '总览看板', sub: '库存概览与趋势', icon: 'dashboard', to: { name: 'dashboard' } },
  { type: 'page', id: 'parts', label: '元器件管理', sub: '主数据与出入库', icon: 'parts', to: { name: 'parts' } },
  { type: 'page', id: 'projects', label: '项目 BOM', sub: '项目用料、齐套与领料', icon: 'project', to: { name: 'projects' } },
  { type: 'page', id: 'bom', label: 'BOM 齐套', sub: '比对库存、生成缺料清单', icon: 'bom', to: { name: 'bom' } },
  { type: 'page', id: 'locations', label: '存储位置', sub: '位置树与二维码', icon: 'location', to: { name: 'locations' } },
  { type: 'page', id: 'import', label: '订单导入', sub: '立创 / 贸泽 / 得捷', icon: 'import', to: { name: 'import' } },
  { type: 'page', id: 'labels', label: '打印标签', sub: '二维码标签与批量打印', icon: 'printer', to: { name: 'labels' } },
  { type: 'page', id: 'audit', label: '操作日志', sub: '出入库、移库、导入与恢复留痕', icon: 'clock', to: { name: 'audit' } },
  { type: 'page', id: 'backup', label: '备份与设置', sub: '导出、恢复', icon: 'settings', to: { name: 'backup' } }
]

const ACTIONS: Item[] = [
  { type: 'action', id: 'quick-add', label: '快速入库', sub: '打开入库向导', icon: 'zap', action: 'quickAdd' },
  { type: 'action', id: 'scan', label: '扫码操作', sub: '扫描标签后直接入库 / 出库', icon: 'scan', action: 'scan' },
  { type: 'action', id: 'theme', label: '切换明暗主题', sub: '浅色 / 暗色', icon: 'moon', action: 'theme' },
  { type: 'action', id: 'help', label: '键盘快捷键', sub: '查看全部快捷操作', icon: 'keyboard', action: 'help' }
]

const results = ref<SearchResult>({ parts: [], locations: [], categories: [], total: 0 })

const items = computed<Item[]>(() => {
  const q = query.value.trim().toLowerCase()
  const out: Item[] = []
  if (!q) return [...ACTIONS, ...PAGES]
  for (const p of results.value.parts) {
    out.push({
      type: 'part', id: p.id, label: p.name,
      sub: [p.model, p.package].filter(Boolean).join(' · ') || '元器件',
      icon: 'parts', qty: p.quantity,
      low: Boolean(p.safetyStock && p.quantity < p.safetyStock),
      to: { name: 'parts', query: { open: p.id } }
    })
  }
  for (const l of results.value.locations) {
    out.push({
      type: 'location', id: l.id, label: l.name,
      sub: l.code ? `位置 · ${l.code}` : '位置',
      icon: 'location', to: { name: 'locations', query: { focus: l.id } }
    })
  }
  for (const c of results.value.categories) {
    out.push({
      type: 'category', id: c.id, label: c.name, sub: '分类',
      icon: 'layers', to: { name: 'parts', query: { cat: c.id } }
    })
  }
  const matched = ACTIONS.filter((a) => a.label.toLowerCase().includes(q) || (a.sub || '').toLowerCase().includes(q))
  const pages = PAGES.filter((p) => p.label.toLowerCase().includes(q) || (p.sub || '').toLowerCase().includes(q))
  out.push(...pages, ...matched)
  return out
})

function kindLabel(t: string) {
  return t === 'location' ? '位置' : t === 'category' ? '分类' : t === 'action' ? '操作' : '页面'
}

let timer: any = null
watch(query, (v) => {
  active.value = 0
  clearTimeout(timer)
  const q = v.trim()
  if (!q) { results.value = { parts: [], locations: [], categories: [], total: 0 }; return }
  loading.value = true
  timer = setTimeout(async () => {
    try {
      results.value = await api.search(q, 8)
    } catch {
      results.value = { parts: [], locations: [], categories: [], total: 0 }
    } finally {
      loading.value = false
    }
  }, 170)
})

watch(active, (idx) => {
  nextTick(() => itemEls[idx]?.scrollIntoView({ block: 'nearest' }))
})

function setItemRef(el: any, idx: number) {
  if (el) itemEls[idx] = el as HTMLElement
}

function open() {
  ui.paletteOpen = true
}
function close() {
  ui.paletteOpen = false
}
function run(item: Item) {
  close()
  if (item.action === 'quickAdd') { ui.openQuickAdd(); return }
  if (item.action === 'scan') { ui.openScan(); return }
  if (item.action === 'help') { ui.openHelp(); return }
  if (item.action === 'theme') { theme.toggle(); return }
  if (item.to) router.push(item.to)
}

// 打开时重置输入；关闭时释放高亮
watch(visible, (v) => {
  if (v) {
    query.value = ''
    active.value = 0
    results.value = { parts: [], locations: [], categories: [], total: 0 }
    nextTick(() => inputRef.value?.focus())
  }
})

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') { close(); return }
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    active.value = Math.min(active.value + 1, items.value.length - 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    active.value = Math.max(active.value - 1, 0)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const item = items.value[active.value]
    if (item) run(item)
  }
}

onBeforeUnmount(() => clearTimeout(timer))

defineExpose({ open, close })
</script>

<style scoped>
.cmdk-mask {
  position: fixed; inset: 0; z-index: 3000;
  background: rgba(12, 15, 22, .42);
  backdrop-filter: blur(3px);
  display: flex; align-items: flex-start; justify-content: center;
  padding: 14vh 16px 16px;
}
.cmdk {
  width: 620px; max-width: 100%;
  background: var(--surface);
  border: 1px solid var(--outline-strong);
  border-radius: 16px;
  box-shadow: var(--shadow-2);
  overflow: hidden;
  display: flex; flex-direction: column;
  max-height: 68vh;
}
.cmdk-input {
  display: flex; align-items: center; gap: 10px;
  padding: 14px 16px; border-bottom: 1px solid var(--outline);
  color: var(--text-3);
}
.cmdk-input input {
  flex: 1; min-width: 0; border: 0; outline: 0; background: transparent;
  font-size: 15px; color: var(--text-1); font-family: inherit;
}
.cmdk-input input::placeholder { color: var(--text-3); }
kbd {
  font-family: var(--mono); font-size: 10.5px; line-height: 1;
  padding: 3px 5px; border-radius: 4px;
  border: 1px solid var(--outline-strong); background: var(--surface-2); color: var(--text-3);
}
.cmdk-body { overflow: auto; padding: 6px; }
.cmdk-hint { font-size: 11px; color: var(--text-3); padding: 6px 10px 4px; letter-spacing: .04em; }
.cmdk-item {
  width: 100%; display: flex; align-items: center; gap: 10px;
  padding: 9px 10px; border-radius: 9px; border: 0; background: transparent;
  cursor: pointer; text-align: left; color: var(--text-1); font-family: inherit;
}
.cmdk-item.active { background: var(--primary-soft); }
.ci-icon {
  width: 28px; height: 28px; border-radius: 8px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: var(--surface-3); color: var(--text-2);
}
.cmdk-item.active .ci-icon { background: var(--surface); color: var(--primary); }
.ci-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.ci-label { font-size: 13.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ci-sub { font-size: 11.5px; color: var(--text-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ci-meta b { font-variant-numeric: tabular-nums; font-size: 13px; }
.ci-meta b.low { color: var(--accent); }
.ci-kind { font-size: 11px; color: var(--text-3); background: var(--surface-3); border-radius: 5px; padding: 1px 7px; }
.cmdk-empty { padding: 28px 12px; text-align: center; color: var(--text-2); font-size: 13px; display: flex; flex-direction: column; gap: 4px; }
.cmdk-empty span { color: var(--text-3); font-size: 12px; }
.cmdk-foot {
  display: flex; align-items: center; gap: 12px;
  padding: 8px 14px; border-top: 1px solid var(--outline);
  font-size: 11px; color: var(--text-3);
}
.cmdk-foot span { display: inline-flex; align-items: center; gap: 4px; }

.cmdk-enter-active, .cmdk-leave-active { transition: opacity .18s var(--ease); }
.cmdk-enter-active .cmdk, .cmdk-leave-active .cmdk { transition: transform .18s var(--ease), opacity .18s var(--ease); }
.cmdk-enter-from, .cmdk-leave-to { opacity: 0; }
.cmdk-enter-from .cmdk, .cmdk-leave-to .cmdk { transform: translateY(-8px) scale(.985); opacity: 0; }
</style>
