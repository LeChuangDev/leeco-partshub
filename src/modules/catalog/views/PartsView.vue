<template>
  <div class="page">
    <PageHeader title="元器件管理" :subtitle="headerSub">
      <n-button type="primary" @click="openNewPart">
        <template #icon><AppIcon name="plus" :size="16" /></template>
        新建元器件
      </n-button>
    </PageHeader>

    <div class="layout mt-16">
      <!-- 分类侧栏（桌面） -->
      <aside class="side card desktop-only">
        <div class="side-head">
          <span class="side-title">分类</span>
          <button class="mini-btn" title="新建顶级分类" @click="openCat(null)">
            <AppIcon name="plus" :size="15" />
          </button>
        </div>
        <div class="tree-wrap">
          <n-tree
            block-line
            :data="treeData"
            :selected-keys="selectedCat ? [selectedCat] : []"
            :default-expand-all="true"
            :render-label="renderTreeLabel"
            @update:selected-keys="onTreeSelect"
            class="tree"
          />
          <div v-if="!categories.length" class="tree-empty">暂无分类</div>
        </div>
        <div v-if="selectedCat" class="side-actions">
          <n-button size="small" block @click="openCat(selectedCat)">
            <template #icon><AppIcon name="plus" :size="14" /></template>子分类
          </n-button>
          <div class="act-row">
            <n-button size="small" tertiary @click="openEditCat">编辑</n-button>
            <n-button size="small" tertiary type="error" @click="delCat">删除</n-button>
          </div>
        </div>
      </aside>

      <!-- 主区 -->
      <section class="main">
        <div class="toolbar card">
          <div class="tb-field tb-search">
            <n-input
              v-model:value="search"
              placeholder="搜索名称 / 型号 / 料号 / 分类"
              clearable
              @update:value="onFilter"
            >
              <template #prefix><AppIcon name="search" :size="16" /></template>
            </n-input>
          </div>
          <div class="tb-more" :class="{ open: showFilters }">
            <div class="tb-field">
              <n-input v-model:value="expr" placeholder="表达式 10k 0603 1%" clearable @update:value="onFilter">
                <template #prefix><AppIcon name="zap" :size="15" /></template>
              </n-input>
            </div>
            <n-select
              v-model:value="tag"
              :options="tagOptions"
              placeholder="标签"
              clearable
              class="tb-tag"
              @update:value="onFilter"
            />
          </div>
          <div class="flex-1" />
          <div class="tb-right">
            <button class="mini-btn mobile-only filter-btn" :class="{ on: showFilters || !!expr || !!tag }" @click="showFilters = !showFilters">
              <AppIcon name="filter" :size="14" />
              筛选
            </button>
            <button class="mini-btn mobile-only filter-btn" @click="drawer = true">
              <AppIcon name="grid" :size="14" />
              分类
            </button>
            <span class="result-count">
              共 <b>{{ displayRows.length }}</b><template v-if="displayRows.length !== rows.length"> / {{ rows.length }}</template> 项
            </span>
            <n-button v-if="hasFilter" quaternary size="small" @click="resetFilters">清除</n-button>
            <button class="mini-btn desktop-only" title="刷新" @click="loadParts">
              <AppIcon name="refresh" :size="16" />
            </button>
          </div>
        </div>

        <div class="table-card card mt-12">
          <div class="table-head">
            <div class="row gap-8">
              <span class="table-title">{{ selectedCatName || '全部元器件' }}</span>
              <span class="chip gray">{{ displayRows.length }}</span>
              <span v-if="checkedKeys.length" class="chip">{{ checkedKeys.length }} 已选</span>
            </div>
            <div class="row gap-8">
              <n-button v-if="checkedKeys.length" size="tiny" secondary @click="printLabels">
                <template #icon><AppIcon name="printer" :size="13" /></template>
                打印标签
              </n-button>
              <span class="dim tb-hint">
                <AppIcon name="scan" :size="14" />
                点击行查看 · 右键快捷操作
              </span>
            </div>
          </div>

          <div class="filter-bar">
            <button
              v-for="f in quickFilters"
              :key="f.value"
              class="qf"
              :class="{ on: quickFilter === f.value }"
              @click="quickFilter = f.value"
            >
              {{ f.label }}
              <span v-if="f.value !== 'all'" class="qf-count">{{ quickCount(f.value) }}</span>
            </button>
          </div>

          <n-data-table
            v-if="loading || displayRows.length"
            :columns="columns"
            :data="displayRows"
            :loading="loading"
            :pagination="displayRows.length > 20 ? pagination : false"
            :row-key="(r:any)=>r.id"
            :row-props="rowProps"
            :row-selection="rowSelection"
            :checked-row-keys="checkedKeys"
            @update:checked-row-keys="onCheckedChange"
            :bordered="false"
            :bottom-bordered="false"
            size="small"
            :scroll-x="isMobile ? 430 : 800"
          />

          <div v-else class="empty-state">
            <div class="es-icon"><AppIcon name="parts" :size="26" /></div>
            <div class="es-title">{{ hasFilter ? '没有匹配的元器件' : '这里还是空的' }}</div>
            <div>{{ hasFilter ? '试试更换关键词，或清除筛选条件' : '新建元器件，或从订单导入开始建档' }}</div>
            <div class="row gap-8 mt-8">
              <n-button v-if="hasFilter" size="small" @click="resetFilters">清除筛选</n-button>
              <n-button v-else type="primary" size="small" @click="openNewPart">
                <template #icon><AppIcon name="plus" :size="14" /></template>
                新建元器件
              </n-button>
            </div>
          </div>
        </div>
      </section>
    </div>

    <!-- 移动端分类抽屉 -->
    <n-drawer v-model:show="drawer" placement="left" :width="280">
      <n-drawer-content title="分类" :native-scrollbar="false">
        <div class="row gap-8" style="margin-bottom: 8px">
          <n-button size="small" block @click="openCat(null)">
            <template #icon><AppIcon name="plus" :size="14" /></template>新建分类
          </n-button>
        </div>
        <n-tree
          block-line
          :data="treeData"
          :selected-keys="selectedCat ? [selectedCat] : []"
          :default-expand-all="true"
          :render-label="renderTreeLabel"
          @update:selected-keys="onTreeSelect"
        />
        <template v-if="selectedCat">
          <n-divider />
          <div class="side-actions">
            <n-button size="small" block @click="openCat(selectedCat)">新建子分类</n-button>
            <n-button size="small" block tertiary @click="openEditCat">编辑分类</n-button>
            <n-button size="small" block tertiary type="error" @click="delCat">删除分类</n-button>
          </div>
        </template>
      </n-drawer-content>
    </n-drawer>

    <!-- 抽屉与弹窗 -->
    <PartFormDrawer v-model:show="showPartForm" :part="editingPart" :categories="categories" @done="afterPart" />
    <PartDetailDrawer
      v-model:show="showDetail"
      :part-id="detailId"
      :intent="detailIntent"
      :categories="categories"
      :locations="locations"
      @done="afterPart"
    />
    <MoveStockModal
      v-model:show="moveShow"
      :part-id="moveTarget?.id || null"
      :part-name="moveTarget?.name"
      :locations="locations"
      @done="afterPart"
    />
    <ContextMenu v-model:show="ctx.show" :x="ctx.x" :y="ctx.y" :items="ctx.items" :title="ctxTitle" @select="onCtxSelect" />

    <n-modal v-model:show="showCat" preset="card" :title="catForm.id ? '编辑分类' : '新建分类'" style="width: 480px; max-width: 94vw">
      <n-form label-placement="top">
        <n-form-item label="分类名称">
          <n-input v-model:value="catForm.name" placeholder="如 电阻" />
        </n-form-item>
        <n-divider style="margin: 8px 0 14px">参数模板</n-divider>
        <div v-for="(p, i) in catForm.paramTemplate" :key="i" class="pt-row">
          <n-input v-model:value="p.label" placeholder="字段名 如 阻值" style="flex: 1" />
          <n-select v-model:value="p.type" :options="typeOpts" style="width: 104px" />
          <button class="mini-btn danger" title="删除字段" @click="catForm.paramTemplate.splice(i, 1)">
            <AppIcon name="x" :size="14" />
          </button>
        </div>
        <n-button dashed block @click="catForm.paramTemplate.push({ label: '', type: 'text' })">
          <template #icon><AppIcon name="plus" :size="14" /></template>
          添加参数
        </n-button>
        <p class="dim" style="font-size: 12px; margin: 8px 0 0">参数模板决定新增元器件时显示的电气参数字段</p>
      </n-form>
      <template #footer>
        <n-space justify="end">
          <n-button @click="showCat = false">取消</n-button>
          <n-button type="primary" :loading="catLoading" @click="saveCat">保存</n-button>
        </n-space>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, h, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  NButton, NInput, NSelect, NTree, NDataTable, NModal, NForm, NFormItem, NDivider, NSpace,
  NDrawer, NDrawerContent, useMessage, useDialog
} from 'naive-ui'
import { api } from '@/shared/api'
import { onDataChanged } from '@/shared/utils/events'
import type { Category, Location, Part } from '@/shared/api/types'
import AppIcon from '@/shared/ui/AppIcon.vue'
import PageHeader from '@/shared/ui/PageHeader.vue'
import PartFormDrawer from '@/modules/catalog/components/PartFormDrawer.vue'
import PartDetailDrawer from '@/modules/catalog/components/PartDetailDrawer.vue'
import { MoveStockModal } from '@/modules/inventory'
import ContextMenu from '@/shared/ui/ContextMenu.vue'
import type { ContextMenuItem } from '@/shared/ui/context-menu.types'

const message = useMessage()
const dialog = useDialog()
const route = useRoute()
const router = useRouter()

const categories = ref<Category[]>([])
const locations = ref<Location[]>([])
const rows = ref<Part[]>([])
const allParts = ref<Part[]>([])
const loading = ref(false)
const selectedCat = ref<string | null>(null)
const search = ref('')
const expr = ref('')
const tag = ref<string | null>(null)
const tagOptions = ref<{ label: string; value: string }[]>([])
const drawer = ref(false)
const showFilters = ref(false)
const isMobile = ref(false)
function syncViewport() { isMobile.value = window.innerWidth < 720 }

const showPartForm = ref(false)
const editingPart = ref<Part | null>(null)
const showDetail = ref(false)
const detailId = ref<string | null>(null)
const detailIntent = ref<'detail' | 'in' | 'out' | 'qr'>('detail')
const moveShow = ref(false)
const moveTarget = ref<Part | null>(null)

// 右键快捷菜单
const ctx = reactive({ show: false, x: 0, y: 0, items: [] as ContextMenuItem[] })
const ctxPart = ref<Part | null>(null)
const ctxTitle = computed(() => ctxPart.value?.name || '')

// 快捷筛选与批量操作
type QuickFilter = 'all' | 'low' | 'short' | 'stale'
const quickFilter = ref<QuickFilter>('all')
const checkedKeys = ref<string[]>([])
const quickFilters: { label: string; value: QuickFilter }[] = [
  { label: '全部', value: 'all' },
  { label: '低库存', value: 'low' },
  { label: '缺货', value: 'short' },
  { label: '从未领用', value: 'stale' }
]

function matchQuick(p: Part, f: QuickFilter) {
  const qty = p.totalQuantity ?? 0
  if (f === 'low') return Boolean(p.safetyStock && qty < p.safetyStock)
  if (f === 'short') return qty === 0
  if (f === 'stale') return qty > 0 && !p.lastOutAt
  return true
}
const quickCounts = computed(() => ({
  low: rows.value.filter((p) => matchQuick(p, 'low')).length,
  short: rows.value.filter((p) => matchQuick(p, 'short')).length,
  stale: rows.value.filter((p) => matchQuick(p, 'stale')).length
}))
function quickCount(f: QuickFilter) {
  return f === 'low' ? quickCounts.value.low : f === 'short' ? quickCounts.value.short : quickCounts.value.stale
}
const displayRows = computed(() =>
  quickFilter.value === 'all' ? rows.value : rows.value.filter((p) => matchQuick(p, quickFilter.value))
)
const rowSelection = { type: 'checkbox' as const }
function onCheckedChange(keys: any[]) { checkedKeys.value = keys as string[] }
function printLabels() {
  if (!checkedKeys.value.length) { message.warning('先勾选要打印的元器件'); return }
  const ids = checkedKeys.value.slice(0, 100).join(',')
  router.push({ name: 'labels', query: { ids } })
}

const showCat = ref(false)
const catLoading = ref(false)
const catForm = ref<{ id: string | null; name: string; parentId: string | null; paramTemplate: any[] }>({ id: null, name: '', parentId: null, paramTemplate: [] })
const typeOpts = [{ label: '文本', value: 'text' }, { label: '数字', value: 'number' }, { label: '枚举', value: 'enum' }]

const hasFilter = computed(() => !!(search.value || expr.value || tag.value || selectedCat.value || quickFilter.value !== 'all'))
const selectedCatName = computed(() => categories.value.find((c) => c.id === selectedCat.value)?.name || '')
const headerSub = computed(() => {
  const total = allParts.value.length
  if (!total) return '维护元器件主数据、参数模板与安全库存'
  return `共 ${categories.value.length} 个分类 · ${total} 种元器件`
})

/* ---------------- 分类树（带数量） ---------------- */
const countMap = computed(() => {
  const m: Record<string, number> = {}
  for (const p of allParts.value) if (p.categoryId) m[p.categoryId] = (m[p.categoryId] || 0) + 1
  return m
})
const treeData = computed(() => buildTree(categories.value, null))
function buildTree(list: Category[], parentId: string | null): any[] {
  return list
    .filter((c) => c.parentId === parentId)
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map((c) => {
      const children = buildTree(list, c.id)
      const own = countMap.value[c.id] || 0
      const childSum = children.reduce((s: number, x: any) => s + (x.count || 0), 0)
      return { key: c.id, label: c.name, children, count: own + childSum }
    })
}
function renderTreeLabel({ option }: any) {
  return h('span', { class: 'tree-label' }, [
    h('span', { class: 'tl-name' }, option.label),
    option.count ? h('span', { class: 'tl-count' }, String(option.count)) : null
  ])
}
function onTreeSelect(keys: string[]) {
  selectedCat.value = keys[0] || null
  drawer.value = false
  loadParts()
}

const pagination = { pageSize: 20, pageSlot: 5 }

const allColumns: any[] = [
  { type: 'selection', width: 40, fixed: 'left', key: 'selection' },
  {
    title: '元器件', key: 'name', width: 230, minWidth: 170,
    sorter: (a: any, b: any) => String(a.name).localeCompare(String(b.name), 'zh-Hans-CN'),
    render: (r: any) => h('div', {}, [
      h('div', { class: 'cell-main' }, r.name),
      h('div', { class: 'cell-sub mono' }, r.manufacturerModel || r.internalNo || '—')
    ])
  },
  { title: '分类', key: 'cat', width: 110, ellipsis: { tooltip: true }, render: (r: any) => h('span', { class: 'chip gray' }, catName(r.categoryId)) },
  {
    title: '封装', key: 'package', width: 88,
    render: (r: any) => (r.package ? h('span', { class: 'mono' }, r.package) : h('span', { class: 'dim' }, '—'))
  },
  { title: '品牌', key: 'brand', width: 110, ellipsis: { tooltip: true }, render: (r: any) => r.brand || h('span', { class: 'dim' }, '—') },
  {
    title: '库存', key: 'qty', width: 108,
    sorter: (a: any, b: any) => (a.totalQuantity ?? 0) - (b.totalQuantity ?? 0),
    render: (r: any) => {
      const qty = r.totalQuantity ?? 0
      const low = r.safetyStock && qty < r.safetyStock
      return h('div', { class: 'stock-cell' }, [
        h('span', { class: low ? 'stock-num low' : 'stock-num' }, String(qty)),
        low ? h('span', { class: 'chip red' }, '低') : null
      ])
    }
  },
  {
    title: '标签', key: 'tags', width: 150,
    render: (r: any) => {
      const tags = (r.tags || []).slice(0, 2)
      if (!tags.length) return h('span', { class: 'dim' }, '—')
      return h('div', { style: 'display:flex;gap:4px;flex-wrap:wrap' }, tags.map((t: string) => h('span', { class: 'chip gray' }, t)))
    }
  },
  {
    title: '', key: 'op', width: 52, fixed: 'right',
    render: (r: any) => h('button', { class: 'mini-btn', title: '查看详情', onClick: (e: Event) => { e.stopPropagation(); openDetail(r.id) } },
      [h(AppIcon, { name: 'chevronRight', size: 16 })])
  }
]
const columns = computed(() => {
  if (!isMobile.value) return allColumns
  const keys = ['selection', 'name', 'package', 'qty', 'op']
  return allColumns
    .filter((c) => keys.includes(c.key))
    .map((c) => (c.key === 'op' ? { ...c, fixed: undefined } : c))
})
function catName(id: string | null) {
  return categories.value.find((c) => c.id === id)?.name || '未分类'
}
function rowProps(r: any) {
  return {
    style: 'cursor: pointer',
    onClick: (e: MouseEvent) => {
      const el = e.target as HTMLElement
      if (el?.closest('.n-checkbox') || el?.closest('.n-data-table-td--selection')) return
      openDetail(r.id)
    },
    onContextmenu: (e: MouseEvent) => {
      e.preventDefault()
      openRowMenu(e, r)
    }
  }
}

/* ---------------- 右键快捷操作 ---------------- */
function openRowMenu(e: MouseEvent, r: Part) {
  ctxPart.value = r
  // 右键未选中的行时，切换为单行选择，避免误操作一批物料
  if (!checkedKeys.value.includes(r.id)) checkedKeys.value = [r.id]
  const qty = r.totalQuantity ?? 0
  const labelCount = checkedKeys.value.length
  ctx.items = [
    { key: 'open', label: '查看详情与批次', icon: 'info', hint: '↵' },
    { key: 'in', label: '入库', icon: 'import', hint: 'Ctrl I' },
    { key: 'out', label: '出库', icon: 'upload', disabled: qty <= 0 },
    { divider: true },
    { key: 'label', label: labelCount > 1 ? `打印标签（${labelCount}）` : '打印标签', icon: 'printer' },
    { key: 'qr', label: '扫码信息', icon: 'qr' },
    { key: 'move', label: '移动存放位置', icon: 'move', disabled: qty <= 0 },
    { divider: true },
    { key: 'edit', label: '编辑主数据', icon: 'edit' },
    { key: 'copy', label: '复制型号 / 料号', icon: 'copy', disabled: !(r.manufacturerModel || r.internalNo) },
    { divider: true },
    { key: 'del', label: '删除元器件', icon: 'trash', danger: true }
  ]
  ctx.x = e.clientX
  ctx.y = e.clientY
  ctx.show = true
}

async function onCtxSelect(key: string) {
  const p = ctxPart.value
  if (!p) return
  if (key === 'open') { openDetail(p.id); return }
  if (key === 'in' || key === 'out') { openDetail(p.id, key); return }
  if (key === 'qr') { openDetail(p.id, 'qr'); return }
  if (key === 'label') { printLabels(); return }
  if (key === 'move') { moveTarget.value = p; moveShow.value = true; return }
  if (key === 'copy') {
    const text = p.manufacturerModel || p.internalNo
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      message.success(`已复制 ${text}`)
    } catch {
      message.warning('复制失败，请手动选择文本')
    }
    return
  }
  if (key === 'edit') {
    try {
      editingPart.value = await api.getPart(p.id)
      showPartForm.value = true
    } catch (e: any) { message.error(e.message) }
    return
  }
  if (key === 'del') {
    dialog.warning({
      title: '删除元器件',
      content: `删除「${p.name}」将一并删除其库存批次与流水，确定？`,
      positiveText: '删除',
      negativeText: '取消',
      onPositiveClick: async () => {
        try {
          await api.deletePart(p.id)
          message.success('已删除')
          await afterPart()
        } catch (e: any) { message.error(e.message) }
      }
    })
  }
}

/* ---------------- 数据 ---------------- */
async function loadParts() {
  loading.value = true
  try {
    const r = await api.listParts({
      categoryId: selectedCat.value || undefined,
      search: search.value || undefined,
      expr: expr.value || undefined,
      tag: tag.value || undefined,
      pageSize: 200
    })
    rows.value = r.list || []
    const set = new Set<string>()
    for (const p of allParts.value) (p.tags || []).forEach((t) => set.add(t))
    tagOptions.value = [...set].map((t) => ({ label: t, value: t }))
  } catch (e: any) { message.error(e.message) }
  finally { loading.value = false }
}
async function loadAll() {
  try {
    const r = await api.listParts({ pageSize: 2000, withQuantity: 0 })
    allParts.value = r.list || []
  } catch { allParts.value = [] }
}
function onFilter() { loadParts() }
function resetFilters() {
  search.value = ''; expr.value = ''; tag.value = null; selectedCat.value = null
  quickFilter.value = 'all'; checkedKeys.value = []
  loadParts()
}
function openNewPart() { editingPart.value = null; showPartForm.value = true }
function openDetail(id: string, intent: 'detail' | 'in' | 'out' | 'qr' = 'detail') {
  detailId.value = id
  detailIntent.value = intent
  showDetail.value = true
}
async function afterPart() {
  await Promise.all([loadAll(), loadParts()])
  if (selectedCat.value) await loadCats()
}

async function loadCats() {
  categories.value = await api.listCategories()
}

/* ---------------- 分类 CRUD ---------------- */
function openCat(parentId: string | null) {
  catForm.value = { id: null, name: '', parentId, paramTemplate: [] }
  showCat.value = true
}
function openEditCat() {
  const c = categories.value.find((x) => x.id === selectedCat.value)
  if (!c) return
  catForm.value = { id: c.id, name: c.name, parentId: c.parentId, paramTemplate: (c.paramTemplate || []).map((p) => ({ ...p })) }
  showCat.value = true
}
async function saveCat() {
  if (!catForm.value.name.trim()) { message.warning('请输入名称'); return }
  catLoading.value = true
  try {
    const tpl = catForm.value.paramTemplate
      .filter((p) => p.label.trim())
      .map((p) => ({ key: p.label.trim().toLowerCase().replace(/[^a-z0-9]/g, ''), label: p.label.trim(), type: p.type }))
    if (catForm.value.id) {
      await api.updateCategory({ id: catForm.value.id, name: catForm.value.name, paramTemplate: tpl })
    } else {
      await api.createCategory({ name: catForm.value.name, parentId: catForm.value.parentId, paramTemplate: tpl })
    }
    message.success('已保存')
    showCat.value = false
    await loadCats()
  } catch (e: any) { message.error(e.message) }
  finally { catLoading.value = false }
}
function delCat() {
  dialog.warning({
    title: '删除分类', content: '若该分类下还有元器件将被拦截。确定删除？',
    positiveText: '删除', negativeText: '取消',
    onPositiveClick: async () => {
      try {
        const r: any = await api.deleteCategory(selectedCat.value!)
        if (r.ok === false) { message.error(r.msg); return }
        message.success('已删除')
        selectedCat.value = null
        await Promise.all([loadCats(), loadAll(), loadParts()])
      } catch (e: any) { message.error(e.message) }
    }
  })
}

/* ---------------- 从外部跳转带入的参数 ---------------- */
function applyQuery() {
  const q = route.query
  if (q.cat) selectedCat.value = String(q.cat)
  else if (q.cat === '') selectedCat.value = null
  if (q.search !== undefined) search.value = String(q.search)
  if (q.filter && ['low', 'short', 'stale'].includes(String(q.filter))) {
    quickFilter.value = String(q.filter) as QuickFilter
  }
  if (q.new === '1') { editingPart.value = null; showPartForm.value = true }
}

let offData: (() => void) | null = null
let refreshTimer: any = null
function scheduleRefresh() {
  clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => { loadAll(); loadParts() }, 140)
}

onMounted(async () => {
  syncViewport()
  window.addEventListener('resize', syncViewport)
  applyQuery()
  await Promise.all([loadCats(), loadAll(), loadParts()])
  try { locations.value = await api.listLocations() } catch {}
  if (route.query.open) openDetail(String(route.query.open))
  offData = onDataChanged(scheduleRefresh)
})

// 命令面板 / 看板下钻可能在当前页再次跳转，需要响应参数变化
watch(() => route.fullPath, () => {
  if (route.name !== 'parts') return
  applyQuery()
  loadParts()
  if (route.query.open) openDetail(String(route.query.open))
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', syncViewport)
  if (offData) offData()
  clearTimeout(refreshTimer)
})
</script>

<style scoped>
.page { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.layout { display: flex; gap: 16px; flex: 1; min-height: 0; }

/* 侧栏 */
.side { width: 244px; flex: 0 0 244px; display: flex; flex-direction: column; padding: 14px 12px 12px; }
.side-head { display: flex; align-items: center; justify-content: space-between; padding: 0 4px 8px; }
.side-title { font-weight: 700; font-size: 13px; }
.tree-wrap { flex: 1; min-height: 0; overflow: auto; margin: 0 -4px; }
.tree { font-size: 13px; }
.tree-empty { padding: 20px 8px; color: var(--text-3); font-size: 12.5px; text-align: center; }
.side-actions { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--outline); }
.act-row { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }

/* 主区 */
.main { flex: 1; min-width: 0; display: flex; flex-direction: column; min-height: 0; }
.toolbar { display: flex; align-items: center; gap: 10px; padding: 12px 14px; flex-wrap: wrap; }
.tb-field { width: 300px; }
.tb-more { display: flex; align-items: center; gap: 10px; }
.tb-more .tb-field { width: 210px; }
.tb-tag { width: 130px; }
.tb-right { display: flex; align-items: center; gap: 8px; }
.result-count { font-size: 12.5px; color: var(--text-3); white-space: nowrap; }
.result-count b { color: var(--text-1); font-weight: 700; }
.mini-btn.filter-btn { width: auto; height: 30px; padding: 0 9px; gap: 5px; font-size: 12.5px; border: 1px solid var(--outline); border-radius: 7px; white-space: nowrap; flex-shrink: 0; }
.mini-btn.filter-btn.on { color: var(--primary); border-color: var(--primary); background: var(--primary-soft); }

.table-card { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.table-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px; border-bottom: 1px solid var(--outline); gap: 12px; flex-wrap: wrap;
}
.table-title { font-weight: 700; font-size: 14px; }
.table-card :deep(.n-data-table) { flex: 1; min-height: 0; }
.table-card :deep(.n-data-table .n-data-table-base-table-body) { max-height: none; }
.tb-hint { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; }

/* 快捷筛选 */
.filter-bar {
  display: flex; align-items: center; gap: 4px;
  padding: 7px 14px; border-bottom: 1px solid var(--outline);
  overflow-x: auto; flex-shrink: 0;
}
.qf {
  height: 26px; padding: 0 10px; border-radius: 7px; border: 1px solid transparent;
  background: transparent; color: var(--text-2); font-size: 12.5px; cursor: pointer;
  display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; font-family: inherit;
  transition: background-color .15s var(--ease), color .15s var(--ease);
}
.qf:hover { background: var(--surface-3); color: var(--text-1); }
.qf.on { background: var(--primary-soft); color: var(--primary); font-weight: 600; }
.qf-count { font-size: 11px; opacity: .72; font-variant-numeric: tabular-nums; }

/* 树节点 */
:deep(.tree-label) { display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; }
:deep(.tl-name) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
:deep(.tl-count) { font-size: 11px; font-weight: 600; color: var(--text-2); background: rgba(120, 128, 140, .16); border-radius: 5px; padding: 0 6px; line-height: 17px; }

/* 库存列 */
:deep(.stock-cell) { display: flex; align-items: center; gap: 5px; }
:deep(.stock-num) { font-weight: 700; font-variant-numeric: tabular-nums; }
:deep(.stock-num.low) { color: var(--accent); }

/* 通用小按钮 */
.mini-btn {
  width: 28px; height: 28px; border-radius: 8px; border: 1px solid transparent;
  background: transparent; color: var(--text-2); cursor: pointer; flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center;
  transition: background-color .15s var(--ease), color .15s var(--ease);
}
.mini-btn:hover { background: var(--surface-3); color: var(--text-1); }
.mini-btn.danger:hover { background: rgba(244, 63, 94, .12); color: var(--accent); }

.pt-row { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; }
.mobile-only { display: none; }

@media (max-width: 1100px) {
  .tb-field { width: 240px; }
  .tb-more .tb-field { width: 180px; }
}
@media (max-width: 900px) {
  .desktop-only { display: none; }
  .mobile-only { display: inline-flex; }
  .layout { height: auto; }
  .page { height: auto; min-height: 100%; }
  .table-card { min-height: 420px; }
}
@media (max-width: 720px) {
  .tb-search { width: 100%; }
  .tb-more { display: none; width: 100%; }
  .tb-more.open { display: flex; flex-direction: column; align-items: stretch; gap: 8px; }
  .tb-more .tb-field { width: 100%; }
  .tb-tag { width: 100%; }
  .tb-right { width: 100%; justify-content: flex-end; }
  .table-head .dim { display: none; }
}
</style>
