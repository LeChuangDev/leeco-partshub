<template>
  <div class="dash">
    <PageHeader title="总览看板" subtitle="库存健康、资产与预警一屏掌握">
      <div class="head-note desktop-only">
        <span class="dot" />
        <span>{{ today }}</span>
      </div>
      <n-button v-if="editing" size="small" secondary @click="showPalette = true">
        <template #icon><AppIcon name="plus" :size="14" /></template>
        添加卡片
      </n-button>
      <n-button size="small" :type="editing ? 'primary' : 'default'" @click="toggleEdit">
        <template #icon><AppIcon :name="editing ? 'check' : 'layout'" :size="14" /></template>
        {{ editing ? '完成' : '自定义' }}
      </n-button>
    </PageHeader>

    <div v-if="editing" class="edit-bar">
      <AppIcon name="grip" :size="15" />
      <span class="edit-text-full">拖动卡片排序 · 点「宽度」调整占列 · 点 × 移除</span>
      <span class="edit-text-short">拖动排序 · 宽度调列 · × 移除</span>
      <span class="flex-1" />
      <button class="edit-reset" @click="resetLayout">恢复默认布局</button>
    </div>

    <div v-if="layout.length" class="board" :class="{ editing }">
      <div
        v-for="(w, idx) in widgets"
        :key="w.id"
        class="widget card"
        :class="[`span-${w.span}`, { 'is-editing': editing, dragging: dragIdx === idx, 'drag-over': overIdx === idx && dragIdx !== idx }]"
        :draggable="editing"
        @dragstart="onDragStart(idx, $event)"
        @dragover.prevent="onDragOver(idx)"
        @drop.prevent="onDrop(idx)"
        @dragend="onDragEnd"
      >
        <div class="w-head">
          <span v-if="editing" class="w-grip" title="拖动排序"><AppIcon name="grip" :size="15" /></span>
          <span class="w-icon" :style="{ color: w.def.color, background: w.def.color + '18' }">
            <AppIcon :name="w.def.icon" :size="15" />
          </span>
          <div class="w-titles">
            <div class="w-title">{{ w.def.title }}</div>
            <div class="w-sub">{{ w.def.sub }}</div>
          </div>
          <span class="flex-1" />
          <template v-if="editing">
            <button
              v-if="w.def.spans.length > 1"
              class="w-ctl"
              :title="`当前占 ${w.span} 列，点击切换宽度`"
              @click.stop="cycleSpan(w.id)"
            >
              <AppIcon name="layout" :size="13" />
              宽度 {{ w.span }}
            </button>
            <button class="w-ctl danger" title="移除卡片" @click.stop="removeWidget(w.id)">
              <AppIcon name="x" :size="14" />
            </button>
          </template>
        </div>

        <div class="w-body">
          <!-- 概览指标 -->
          <div v-if="w.id === 'stats'" class="stat-grid">
            <button
              v-for="(s, i) in cards"
              :key="s.label"
              class="stat"
              :class="{ clickable: !!s.filter }"
              :style="{ animationDelay: i * 35 + 'ms' }"
              @click="s.filter && goFilter(s.filter)"
            >
              <div class="stat-top">
                <span class="stat-label">{{ s.label }}</span>
                <span class="stat-icon" :style="{ background: s.color + '1f', color: s.color }">
                  <AppIcon :name="s.icon" :size="16" />
                </span>
              </div>
              <div class="stat-val">{{ s.value }}</div>
              <div class="stat-foot">{{ s.hint }}</div>
              <span v-if="s.filter" class="stat-go"><AppIcon name="chevronRight" :size="13" /></span>
              <span class="stat-bar" :style="{ background: s.color }" />
            </button>
          </div>

          <!-- 趋势 -->
          <template v-else-if="w.id === 'trend'">
            <div class="body-head">
              <div class="legend-line">
                <span class="lg"><span class="dot" style="background: #5b6cff" />入库</span>
                <span class="lg"><span class="dot" style="background: #f59e0b" />出库</span>
              </div>
              <n-radio-group v-model:value="period" size="small" @update:value="load">
                <n-radio-button value="week">7 天</n-radio-button>
                <n-radio-button value="month">30 天</n-radio-button>
                <n-radio-button value="year">12 月</n-radio-button>
              </n-radio-group>
            </div>
            <TrendChart :data="stats.trend" />
          </template>

          <!-- 预警 -->
          <template v-else-if="w.id === 'alerts'">
            <div class="body-head">
              <div class="row gap-6">
                <button class="chip red chip-btn" @click="goFilter('low')">不足 {{ stats.lowStockCount }}</button>
                <button class="chip amber chip-btn" @click="goFilter('short')">缺货 {{ stats.shortageCount }}</button>
              </div>
            </div>
            <div class="sub-label">低于安全库存</div>
            <div class="list" :class="{ short: w.span === 1 }">
              <button
                v-for="l in stats.lowStock"
                :key="l.partId"
                class="li"
                @click="goPart(l.partId)"
                @contextmenu.prevent="openPartMenu($event, l.partId, l.name)"
              >
                <span class="li-name">{{ l.name }}</span>
                <span class="row gap-6">
                  <span class="qty-num">{{ l.quantity }}</span>
                  <span class="dim xs">/ {{ l.safetyStock }}</span>
                  <span class="chip red">补货</span>
                </span>
              </button>
              <div v-if="!stats.lowStock.length" class="list-empty">
                <AppIcon name="check" :size="15" /> 全部物料库存充足
              </div>
            </div>
            <div class="sub-label">完全缺货</div>
            <div class="list" :class="{ short: w.span <= 2 }">
              <button
                v-for="s in stats.shortage"
                :key="s.partId"
                class="li"
                @click="goPart(s.partId)"
                @contextmenu.prevent="openPartMenu($event, s.partId, s.name)"
              >
                <span class="li-name">{{ s.name }}</span>
                <span class="chip amber">需补货</span>
              </button>
              <div v-if="!stats.shortage.length" class="list-empty">
                <AppIcon name="check" :size="15" /> 无缺货物料
              </div>
            </div>
          </template>

          <!-- 呆滞 -->
          <template v-else-if="w.id === 'stale'">
            <div class="body-head">
              <span class="dim xs">超过 180 天未领用的库存</span>
              <button class="chip amber chip-btn" @click="goFilter('stale')">{{ stats.stale.length }}</button>
            </div>
            <div class="list" :class="{ short: w.span <= 2 }">
              <button
                v-for="s in stats.stale"
                :key="s.partId"
                class="li"
                @click="goPart(s.partId)"
                @contextmenu.prevent="openPartMenu($event, s.partId, s.name)"
              >
                <span class="li-name">{{ s.name }}</span>
                <span class="row gap-8">
                  <span class="dim xs">库存</span>
                  <span class="qty-num">{{ s.quantity }}</span>
                </span>
              </button>
              <div v-if="!stats.stale.length" class="list-empty">
                <AppIcon name="check" :size="15" /> 没有呆滞物料
              </div>
            </div>
          </template>

          <!-- 分布环图 -->
          <div v-else-if="w.id === 'category' || w.id === 'brand' || w.id === 'package'" class="donut-row">
            <DonutChart
              :data="w.id === 'category' ? stats.byCategory : w.id === 'brand' ? stats.byBrand : stats.byPackage"
              :center-label="w.id === 'category' ? '分类' : w.id === 'brand' ? '品牌' : '封装'"
            />
          </div>

          <!-- 快捷入口 -->
          <template v-else-if="w.id === 'quick'">
            <div v-if="quickItems.length" class="quick-grid">
              <button v-for="q in quickItems" :key="q.id" class="quick" @click="runQuick(q)">
                <span class="q-icon"><AppIcon :name="q.icon" :size="17" /></span>
                <span class="q-label">{{ q.label }}</span>
              </button>
            </div>
            <div v-else class="quick-empty">
              <span>还没有配置快捷入口</span>
            </div>
            <button v-if="editing" class="quick-config" @click.stop="showQuick = true">
              <AppIcon name="settings" :size="13" /> 配置快捷入口
            </button>
          </template>

          <!-- 项目齐套 -->
          <template v-else-if="w.id === 'projects'">
            <div v-if="projects.length" class="proj-list">
              <button v-for="p in projects" :key="p.id" class="proj" @click="goProject(p.id)">
                <div class="proj-top">
                  <span class="proj-name">{{ p.name }}</span>
                  <span class="proj-pct" :class="pctClass(p.completeness)">{{ p.completeness }}%</span>
                </div>
                <div class="proj-bar"><i :class="pctClass(p.completeness)" :style="{ width: p.completeness + '%' }" /></div>
                <div class="proj-sub">{{ p.buildQty }} 套 · {{ p.lineCount }} 行物料</div>
              </button>
            </div>
            <div v-else class="list-empty proj-empty">
              <AppIcon name="project" :size="15" />
              还没有项目，去「项目 BOM」建立第一份用料表
            </div>
          </template>
        </div>
      </div>

      <button v-if="editing" class="add-tile" @click="showPalette = true">
        <span class="at-icon"><AppIcon name="plus" :size="18" /></span>
        <span>添加卡片</span>
      </button>
    </div>

    <div v-else class="board-empty card">
      <div class="es-icon"><AppIcon name="layout" :size="26" /></div>
      <div class="es-title">看板是空的</div>
      <div>添加你关心的卡片，或恢复默认布局</div>
      <div class="row gap-8 mt-8">
        <n-button size="small" type="primary" @click="showPalette = true; editing = true">添加卡片</n-button>
        <n-button size="small" @click="resetLayout">恢复默认</n-button>
      </div>
    </div>

    <!-- 卡片库 -->
    <n-modal v-model:show="showPalette" preset="card" title="添加卡片" style="width: 540px; max-width: 94vw">
      <p class="cfg-tip">看板布局与快捷入口会保存在本机浏览器，随时可以调整。</p>
      <div class="wpal">
        <button
          v-for="d in WIDGETS"
          :key="d.id"
          class="wpal-item"
          :class="{ on: activeIds.has(d.id) }"
          :disabled="activeIds.has(d.id)"
          @click="addWidget(d.id)"
        >
          <span class="wp-icon" :style="{ color: d.color, background: d.color + '18' }">
            <AppIcon :name="d.icon" :size="16" />
          </span>
          <span class="wp-main">
            <b>{{ d.title }}</b>
            <em>{{ d.sub }}</em>
          </span>
          <span class="wp-state">
            <AppIcon :name="activeIds.has(d.id) ? 'check' : 'plus'" :size="13" />
            {{ activeIds.has(d.id) ? '已添加' : '添加' }}
          </span>
        </button>
      </div>
      <template #footer>
        <div class="row">
          <span class="dim xs">共 {{ WIDGETS.length }} 种卡片</span>
          <span class="flex-1" />
          <n-button size="small" @click="showPalette = false">完成</n-button>
        </div>
      </template>
    </n-modal>

    <!-- 快捷入口配置 -->
    <n-modal v-model:show="showQuick" preset="card" title="快捷入口" style="width: 540px; max-width: 94vw">
      <p class="cfg-tip">选择常用操作与页面，最多显示 8 个。</p>
      <div class="qcfg">
        <button
          v-for="q in QUICK_ALL"
          :key="q.id"
          class="qcfg-item"
          :class="{ on: quickIds.includes(q.id) }"
          @click="toggleQuick(q.id)"
        >
          <span class="q-icon"><AppIcon :name="q.icon" :size="16" /></span>
          <span class="qc-label">{{ q.label }}</span>
          <AppIcon :name="quickIds.includes(q.id) ? 'check' : 'plus'" :size="14" />
        </button>
      </div>
      <template #footer>
        <div class="row">
          <span class="dim xs">{{ quickIds.length }} / 8 已选择</span>
          <span class="flex-1" />
          <n-button size="small" type="primary" @click="showQuick = false">完成</n-button>
        </div>
      </template>
    </n-modal>

    <ContextMenu v-model:show="ctx.show" :x="ctx.x" :y="ctx.y" :items="ctx.items" :title="ctx.title" @select="onCtxSelect" />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NRadioGroup, NRadioButton, NModal, useMessage } from 'naive-ui'
import { api } from '../api/client'
import { useUi } from '../stores/ui'
import { onDataChanged } from '../utils/events'
import AppIcon from '../components/AppIcon.vue'
import PageHeader from '../components/PageHeader.vue'
import DonutChart from '../components/DonutChart.vue'
import TrendChart from '../components/TrendChart.vue'
import ContextMenu from '../components/ContextMenu.vue'
import type { ContextMenuItem } from '../components/context-menu'
import type { Stats } from '../api/types'

const router = useRouter()
const ui = useUi()
const message = useMessage()
const period = ref<'week' | 'month' | 'year'>('week')
const today = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })

/* ------------------------------ 卡片定义 ------------------------------ */
interface WidgetDef { id: string; title: string; sub: string; icon: string; color: string; spans: number[] }
const WIDGETS: WidgetDef[] = [
  { id: 'stats', title: '库存概览', sub: '核心指标与资产', icon: 'dashboard', color: '#5b6cff', spans: [3] },
  { id: 'trend', title: '出入库趋势', sub: '按流水汇总的入库与领用', icon: 'spark', color: '#0ea5e9', spans: [2, 3] },
  { id: 'alerts', title: '库存预警', sub: '低于安全库存与缺货', icon: 'alert', color: '#f43f5e', spans: [1, 2] },
  { id: 'category', title: '分类占比', sub: '按物料分类统计', icon: 'layers', color: '#8b5cf6', spans: [1] },
  { id: 'brand', title: '品牌占比', sub: '按品牌统计', icon: 'tag', color: '#14b8a6', spans: [1] },
  { id: 'package', title: '封装占比', sub: '按封装统计', icon: 'grid', color: '#f59e0b', spans: [1] },
  { id: 'quick', title: '快捷入口', sub: '常用操作直达', icon: 'zap', color: '#5b6cff', spans: [1] },
  { id: 'projects', title: '项目齐套', sub: '在产项目用料状态', icon: 'project', color: '#8b5cf6', spans: [1, 2] },
  { id: 'stale', title: '呆滞物料', sub: '长期未领用的库存', icon: 'clock', color: '#f59e0b', spans: [1, 2] }
]
const DEFAULT_LAYOUT = [
  { id: 'stats', span: 3 },
  { id: 'trend', span: 2 },
  { id: 'alerts', span: 1 },
  { id: 'category', span: 1 },
  { id: 'brand', span: 1 },
  { id: 'package', span: 1 },
  { id: 'quick', span: 1 },
  { id: 'projects', span: 1 },
  { id: 'stale', span: 1 }
]
const LAYOUT_KEY = 'leeco_dash_layout_v1'
const QUICK_KEY = 'leeco_dash_quick_v1'

function defOf(id: string) { return WIDGETS.find((w) => w.id === id) }

function loadLayout(): { id: string; span: number }[] {
  let saved: any = null
  try { saved = JSON.parse(localStorage.getItem(LAYOUT_KEY) || 'null') } catch { saved = null }
  if (Array.isArray(saved)) {
    const seen = new Set<string>()
    const out: { id: string; span: number }[] = []
    for (const it of saved) {
      const def = defOf(String(it?.id || ''))
      if (!def || seen.has(def.id)) continue
      seen.add(def.id)
      const span = def.spans.includes(Number(it?.span)) ? Number(it.span) : def.spans[0]
      out.push({ id: def.id, span })
    }
    if (out.length || saved.length === 0) return out
  }
  return DEFAULT_LAYOUT.map((x) => ({ ...x }))
}

interface QuickDef { id: string; label: string; icon: string; to?: any; action?: 'quickAdd' | 'scan' }
const QUICK_ALL: QuickDef[] = [
  { id: 'quick-add', label: '快速入库', icon: 'zap', action: 'quickAdd' },
  { id: 'scan', label: '扫码操作', icon: 'scan', action: 'scan' },
  { id: 'new-part', label: '新建元器件', icon: 'plus', to: { name: 'parts', query: { new: '1' } } },
  { id: 'parts', label: '元器件管理', icon: 'parts', to: { name: 'parts' } },
  { id: 'projects', label: '项目 BOM', icon: 'project', to: { name: 'projects' } },
  { id: 'bom', label: 'BOM 齐套', icon: 'bom', to: { name: 'bom' } },
  { id: 'locations', label: '存储位置', icon: 'location', to: { name: 'locations' } },
  { id: 'import', label: '订单导入', icon: 'import', to: { name: 'import' } },
  { id: 'labels', label: '打印标签', icon: 'printer', to: { name: 'labels' } },
  { id: 'backup', label: '备份与设置', icon: 'settings', to: { name: 'backup' } }
]
const DEFAULT_QUICK = ['quick-add', 'scan', 'import', 'bom', 'labels', 'projects']

function loadQuick(): string[] {
  let saved: any = null
  try { saved = JSON.parse(localStorage.getItem(QUICK_KEY) || 'null') } catch { saved = null }
  if (Array.isArray(saved)) return saved.filter((id) => QUICK_ALL.some((q) => q.id === id)).slice(0, 8)
  return [...DEFAULT_QUICK]
}

const layout = ref(loadLayout())
const quickIds = ref<string[]>(loadQuick())
const editing = ref(false)
const showPalette = ref(false)
const showQuick = ref(false)
const ready = ref(false)

const widgets = computed(() =>
  layout.value.map((w) => ({ ...w, def: defOf(w.id)! })).filter((w) => w.def)
)
const activeIds = computed(() => new Set(layout.value.map((w) => w.id)))
const quickItems = computed(() => quickIds.value.map((id) => QUICK_ALL.find((q) => q.id === id)!).filter(Boolean))

watch(layout, (v) => {
  if (!ready.value) return
  localStorage.setItem(LAYOUT_KEY, JSON.stringify(v))
}, { deep: true })
watch(quickIds, (v) => {
  if (!ready.value) return
  localStorage.setItem(QUICK_KEY, JSON.stringify(v))
}, { deep: true })

function toggleEdit() {
  editing.value = !editing.value
  if (!editing.value) message.success('看板布局已保存')
}
function addWidget(id: string) {
  const def = defOf(id)
  if (!def || activeIds.value.has(id)) return
  layout.value.push({ id, span: def.spans[0] })
}
function removeWidget(id: string) {
  layout.value = layout.value.filter((w) => w.id !== id)
}
function cycleSpan(id: string) {
  const target = layout.value.find((x) => x.id === id)
  const def = defOf(id)
  if (!target || !def || def.spans.length < 2) return
  const i = def.spans.indexOf(target.span)
  target.span = def.spans[(i + 1) % def.spans.length]
}
function resetLayout() {
  layout.value = DEFAULT_LAYOUT.map((x) => ({ ...x }))
  quickIds.value = [...DEFAULT_QUICK]
  message.success('已恢复默认布局')
}
function toggleQuick(id: string) {
  if (quickIds.value.includes(id)) {
    quickIds.value = quickIds.value.filter((q) => q !== id)
    return
  }
  if (quickIds.value.length >= 8) { message.warning('最多选择 8 个快捷入口'); return }
  quickIds.value = [...quickIds.value, id]
}
function runQuick(q: QuickDef) {
  if (editing.value) return
  if (q.action === 'quickAdd') { ui.openQuickAdd(); return }
  if (q.action === 'scan') { ui.openScan(); return }
  if (q.to) router.push(q.to)
}

/* ------------------------------ 拖拽排序 ------------------------------ */
const dragIdx = ref(-1)
const overIdx = ref(-1)
function onDragStart(i: number, e: DragEvent) {
  if (!editing.value) return
  dragIdx.value = i
  overIdx.value = i
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(i))
  }
}
function onDragOver(i: number) {
  if (dragIdx.value < 0) return
  overIdx.value = i
}
function onDrop(i: number) {
  if (dragIdx.value < 0) return
  const arr = [...layout.value]
  const [moved] = arr.splice(dragIdx.value, 1)
  arr.splice(i, 0, moved)
  layout.value = arr
  dragIdx.value = -1
  overIdx.value = -1
}
function onDragEnd() {
  dragIdx.value = -1
  overIdx.value = -1
}

/* ------------------------------ 数据 ------------------------------ */
const stats = ref<Stats>({
  categoriesCount: 0, partsCount: 0, locationsCount: 0, transactionsCount: 0,
  totalQuantity: 0, totalValue: 0, lowStockCount: 0, shortageCount: 0,
  shortage: [], lowStock: [], stale: [], projectsCount: 0,
  trend: { period: 'week', labels: [], in: [], out: [] },
  byCategory: [], byBrand: [], byPackage: []
})
const projects = ref<{ id: string; name: string; buildQty: number; lineCount: number; completeness: number }[]>([])
const loading = ref(false)

function fmt(n: number) {
  return (Number(n) || 0).toLocaleString('zh-CN')
}

type FilterKey = 'low' | 'short' | 'stale'
const cards = computed<{ label: string; value: string; hint: string; icon: string; color: string; filter?: FilterKey }[]>(() => [
  { label: '元器件种类', value: fmt(stats.value.partsCount), hint: `覆盖 ${stats.value.categoriesCount} 个分类`, icon: 'parts', color: '#5b6cff' },
  { label: '当前库存总量', value: fmt(stats.value.totalQuantity), hint: `累计 ${stats.value.transactionsCount} 条流水`, icon: 'box', color: '#14b8a6' },
  { label: '库存不足', value: fmt(stats.value.lowStockCount), hint: stats.value.lowStockCount ? '低于安全库存阈值' : '库存水位健康', icon: 'alert', color: '#f43f5e', filter: 'low' },
  { label: '缺货元器件', value: fmt(stats.value.shortageCount), hint: stats.value.shortageCount ? '库存为 0，需要补货' : '暂无零库存物料', icon: 'alert', color: '#f59e0b', filter: 'short' },
  { label: '资产总价值', value: '¥' + fmt(stats.value.totalValue), hint: '按批次采购单价估算', icon: 'wallet', color: '#8b5cf6' },
  { label: '存放位置', value: fmt(stats.value.locationsCount), hint: '含全部子位置', icon: 'location', color: '#0ea5e9' }
])

async function load() {
  loading.value = true
  try {
    stats.value = await api.stats(period.value)
  } catch (e: any) {
    message.error(e.message || '统计加载失败')
  } finally {
    loading.value = false
  }
}

async function loadProjects() {
  try {
    const list = await api.listProjects()
    const top = list.slice(0, 4)
    projects.value = await Promise.all(top.map(async (p) => {
      try {
        const a = await api.getProject(p.id)
        return {
          id: p.id,
          name: p.name,
          buildQty: a.buildQty || p.buildQty || 1,
          lineCount: p.lineCount ?? a.lines.length,
          completeness: a.summary?.completeness ?? 0
        }
      } catch {
        return { id: p.id, name: p.name, buildQty: p.buildQty || 1, lineCount: p.lineCount || 0, completeness: 0 }
      }
    }))
  } catch {
    projects.value = []
  }
}

function pctClass(v: number) {
  return v >= 95 ? 'ok' : v >= 60 ? 'warn' : 'bad'
}
function goPart(id: string) {
  router.push({ name: 'parts', query: { open: id } })
}
function goFilter(f: 'low' | 'short' | 'stale') {
  router.push({ name: 'parts', query: { filter: f } })
}
function goProject(id: string) {
  router.push({ name: 'projects', query: { id } })
}

/* ------------------------------ 看板右键菜单 ------------------------------ */
const ctx = reactive({ show: false, x: 0, y: 0, title: '', items: [] as ContextMenuItem[] })
const ctxPartId = ref<string | null>(null)
function openPartMenu(e: MouseEvent, id: string, name: string) {
  ctxPartId.value = id
  ctx.title = name
  ctx.items = [
    { key: 'open', label: '查看详情', icon: 'info' },
    { key: 'in', label: '入库', icon: 'import', hint: 'Ctrl I' },
    { key: 'out', label: '出库', icon: 'upload' },
    { divider: true },
    { key: 'label', label: '打印标签', icon: 'printer' },
    { key: 'copy', label: '复制名称', icon: 'copy' }
  ]
  ctx.x = e.clientX
  ctx.y = e.clientY
  ctx.show = true
}
async function onCtxSelect(key: string) {
  const id = ctxPartId.value
  if (!id) return
  if (key === 'open') { goPart(id); return }
  if (key === 'in' || key === 'out') { router.push({ name: 'parts', query: { open: id, intent: key } }); return }
  if (key === 'label') { router.push({ name: 'labels', query: { ids: id } }); return }
  if (key === 'copy') {
    try {
      await navigator.clipboard.writeText(ctx.title)
      message.success('已复制名称')
    } catch { message.warning('复制失败，请手动选择文本') }
  }
}

let offData: (() => void) | null = null
onMounted(async () => {
  ready.value = true
  await Promise.all([load(), loadProjects()])
  offData = onDataChanged(() => {
    load()
    loadProjects()
  })
})
onBeforeUnmount(() => { if (offData) offData() })
</script>

<style scoped>
.dash { max-width: 1560px; margin: 0 auto; }
.head-note { display: flex; align-items: center; gap: 7px; font-size: 12.5px; color: var(--text-3); }
.head-note .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--secondary); box-shadow: 0 0 0 3px rgba(20, 184, 166, .14); }

/* 编辑提示 */
.edit-bar {
  display: flex; align-items: center; gap: 8px; margin-top: 14px;
  padding: 9px 12px; border-radius: 10px;
  background: var(--primary-soft); color: var(--primary); font-size: 12px;
}
.edit-reset {
  border: 0; background: transparent; color: var(--primary); font-family: inherit;
  font-size: 12px; cursor: pointer; text-decoration: underline; text-underline-offset: 3px;
  white-space: nowrap; flex-shrink: 0;
}
.edit-text-short { display: none; }

/* 网格 */
.board { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 16px; align-items: stretch; }
.widget { display: flex; flex-direction: column; min-width: 0; padding: 14px 16px 16px; position: relative; }
.widget.span-1 { grid-column: span 1; }
.widget.span-2 { grid-column: span 2; }
.widget.span-3 { grid-column: span 3; }
.widget.is-editing { cursor: grab; border-style: dashed; border-color: var(--outline-strong); }
.widget.is-editing:active { cursor: grabbing; }
.widget.is-editing .w-body { pointer-events: none; user-select: none; opacity: .78; }
.widget.dragging { opacity: .4; }
.widget.drag-over { outline: 2px dashed var(--primary); outline-offset: 3px; }

.w-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; min-width: 0; }
.w-grip { color: var(--text-3); display: inline-flex; cursor: grab; flex-shrink: 0; }
.w-icon {
  width: 27px; height: 27px; border-radius: 8px; flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center;
}
.w-titles { min-width: 0; display: flex; align-items: baseline; gap: 8px; }
.w-title { font-weight: 700; font-size: 13.5px; white-space: nowrap; }
.w-sub { font-size: 11.5px; color: var(--text-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.w-ctl {
  display: inline-flex; align-items: center; gap: 4px; height: 24px; padding: 0 7px;
  border-radius: 6px; border: 1px solid var(--outline); background: var(--surface-2);
  color: var(--text-2); font-family: inherit; font-size: 11px; cursor: pointer; flex-shrink: 0;
}
.w-ctl:hover { border-color: var(--primary); color: var(--primary); background: var(--primary-soft); }
.w-ctl.danger { width: 24px; padding: 0; justify-content: center; }
.w-ctl.danger:hover { border-color: var(--accent); color: var(--accent); background: rgba(244, 63, 94, .1); }

.w-body { flex: 1; min-height: 0; }
.body-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 8px; flex-wrap: wrap; }

/* 指标 */
.stat-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; }
.stat {
  position: relative; overflow: hidden; text-align: left;
  padding: 12px 13px 13px; border-radius: 10px;
  border: 1px solid var(--outline); background: var(--surface-2);
  color: inherit; font-family: inherit; cursor: default;
  animation: rise .32s var(--ease) both;
}
@keyframes rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
.stat.clickable { cursor: pointer; transition: border-color .15s var(--ease), background-color .15s var(--ease); }
.stat.clickable:hover { border-color: var(--primary); background: var(--primary-soft); }
.stat-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.stat-label { font-size: 11.5px; color: var(--text-2); font-weight: 500; white-space: nowrap; }
.stat-icon { width: 27px; height: 27px; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
.stat-val { font-size: 22px; font-weight: 800; letter-spacing: -.02em; margin-top: 5px; font-variant-numeric: tabular-nums; line-height: 1.2; }
.stat-foot { font-size: 11px; color: var(--text-3); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.stat-bar { position: absolute; left: 13px; bottom: 0; width: 24px; height: 2.5px; border-radius: 2px; opacity: .85; }
.stat-go {
  position: absolute; right: 11px; bottom: 11px; color: var(--text-3);
  opacity: 0; transform: translateX(-3px);
  transition: opacity .18s var(--ease), transform .18s var(--ease), color .18s var(--ease);
}
.stat.clickable:hover .stat-go { opacity: 1; transform: none; color: var(--primary); }

/* 预警 / 呆滞 */
.sub-label { font-size: 11px; font-weight: 600; color: var(--text-3); letter-spacing: .03em; margin: 10px 0 6px; }
.list { display: flex; flex-direction: column; gap: 4px; max-height: 190px; overflow: auto; }
.list.short { max-height: 148px; }
.li {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  width: 100%; text-align: left; border: none; font: inherit;
  padding: 6px 9px; border-radius: 8px; background: var(--surface-2);
  color: var(--text-1); cursor: pointer;
  transition: background-color .15s var(--ease);
}
.li:hover { background: var(--primary-soft); }
.li-name { font-size: 12.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.qty-num { font-weight: 700; font-variant-numeric: tabular-nums; font-size: 12.5px; }
.xs { font-size: 11px; }
.list-empty { display: flex; align-items: center; gap: 6px; color: var(--text-3); font-size: 12px; padding: 9px 2px; }
.chip-btn { border: 0; cursor: pointer; font-family: inherit; transition: filter .15s var(--ease); }
.chip-btn:hover { filter: brightness(.94); }

/* 环图 */
.donut-row { display: flex; align-items: center; justify-content: center; min-height: 196px; }

/* 快捷入口 */
.quick-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.quick {
  display: flex; flex-direction: column; align-items: flex-start; gap: 7px;
  padding: 11px 12px; border-radius: 10px; border: 1px solid var(--outline);
  background: var(--surface-2); color: var(--text-1); font-family: inherit;
  cursor: pointer; transition: all .15s var(--ease); min-height: 74px;
}
.quick:hover { border-color: var(--primary); background: var(--primary-soft); transform: translateY(-1px); }
.q-icon {
  width: 28px; height: 28px; border-radius: 8px; background: var(--surface);
  color: var(--primary); display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid var(--outline);
}
.quick:hover .q-icon { border-color: transparent; background: var(--primary); color: #fff; }
.q-label { font-size: 12px; font-weight: 600; }
.quick-empty { padding: 24px 8px; text-align: center; color: var(--text-3); font-size: 12px; }
.quick-config {
  display: inline-flex; align-items: center; gap: 5px; margin-top: 10px;
  border: 1px dashed var(--outline-strong); background: transparent; color: var(--text-2);
  border-radius: 7px; padding: 5px 10px; font-family: inherit; font-size: 11.5px;
  cursor: pointer; pointer-events: auto;
}
.quick-config:hover { color: var(--primary); border-color: var(--primary); }

/* 项目 */
.proj-list { display: flex; flex-direction: column; gap: 8px; }
.proj {
  width: 100%; text-align: left; border: 1px solid var(--outline); border-radius: 9px;
  background: var(--surface-2); padding: 9px 11px; color: inherit; font-family: inherit;
  cursor: pointer; transition: all .15s var(--ease);
}
.proj:hover { border-color: var(--primary); background: var(--primary-soft); }
.proj-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.proj-name { font-size: 12.5px; font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.proj-pct { font-size: 12px; font-weight: 800; font-variant-numeric: tabular-nums; }
.proj-pct.ok { color: var(--secondary); }
.proj-pct.warn { color: var(--warning); }
.proj-pct.bad { color: var(--accent); }
.proj-bar { height: 4px; border-radius: 3px; background: var(--surface-3); overflow: hidden; margin: 6px 0 5px; }
.proj-bar i { display: block; height: 100%; border-radius: 3px; background: var(--secondary); transition: width .3s var(--ease); }
.proj-bar i.warn { background: var(--warning); }
.proj-bar i.bad { background: var(--accent); }
.proj-sub { font-size: 10.5px; color: var(--text-3); }
.proj-empty { line-height: 1.7; align-items: flex-start; }

/* 添加卡片占位 */
.add-tile {
  min-height: 120px; border: 1.5px dashed var(--outline-strong); border-radius: var(--radius);
  background: transparent; color: var(--text-3); font-family: inherit; font-size: 12.5px;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;
  cursor: pointer; transition: all .15s var(--ease);
}
.add-tile:hover { border-color: var(--primary); color: var(--primary); background: var(--primary-softer); }
.at-icon { width: 34px; height: 34px; border-radius: 10px; background: var(--surface-3); display: flex; align-items: center; justify-content: center; }

.board-empty { margin-top: 16px; padding: 56px 20px; display: flex; flex-direction: column; align-items: center; gap: 8px; color: var(--text-3); font-size: 13px; }
.board-empty .es-icon { width: 56px; height: 56px; border-radius: 16px; background: var(--surface-3); display: flex; align-items: center; justify-content: center; }
.board-empty .es-title { font-size: 14px; font-weight: 650; color: var(--text-1); }

/* 卡片库 / 快捷配置 */
.cfg-tip { font-size: 12px; color: var(--text-3); margin: 0 0 12px; }
.wpal { display: flex; flex-direction: column; gap: 6px; }
.wpal-item {
  display: flex; align-items: center; gap: 10px; width: 100%;
  padding: 9px 11px; border-radius: 9px; border: 1px solid var(--outline);
  background: var(--surface-2); color: inherit; font-family: inherit; text-align: left; cursor: pointer;
  transition: all .14s var(--ease);
}
.wpal-item:hover:not(:disabled) { border-color: var(--primary); background: var(--primary-soft); }
.wpal-item.on { opacity: .62; cursor: default; }
.wp-icon { width: 28px; height: 28px; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
.wp-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.wp-main b { font-size: 12.5px; }
.wp-main em { font-style: normal; font-size: 11px; color: var(--text-3); }
.wp-state { display: inline-flex; align-items: center; gap: 3px; font-size: 11px; color: var(--text-2); }
.wpal-item.on .wp-state { color: var(--secondary); }

.qcfg { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.qcfg-item {
  display: flex; align-items: center; gap: 8px; padding: 8px 10px;
  border-radius: 8px; border: 1px solid var(--outline); background: var(--surface-2);
  color: var(--text-1); font-family: inherit; font-size: 12.5px; cursor: pointer;
  transition: all .14s var(--ease);
}
.qcfg-item:hover { border-color: var(--primary); }
.qcfg-item.on { border-color: var(--primary); background: var(--primary-soft); color: var(--primary); }
.qcfg-item .q-icon { width: 24px; height: 24px; border-radius: 7px; }
.qc-label { flex: 1; text-align: left; }

/* 响应式 */
@media (max-width: 1180px) {
  .board { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .widget.span-3 { grid-column: span 2; }
  .stat-grid { grid-template-columns: repeat(3, 1fr); }
}
@media (max-width: 720px) {
  .board { grid-template-columns: minmax(0, 1fr); }
  .widget.span-1, .widget.span-2, .widget.span-3 { grid-column: span 1; }
  .stat-grid { grid-template-columns: repeat(2, 1fr); }
  .w-sub { display: none; }
  .desktop-only { display: none; }
  .quick-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .qcfg { grid-template-columns: 1fr; }
  .edit-text-full { display: none; }
  .edit-text-short { display: inline; font-size: 11.5px; }
  .edit-bar { gap: 6px; }
}
</style>
