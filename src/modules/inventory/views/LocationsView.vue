<template>
  <div class="page">
    <PageHeader title="存储位置" subtitle="按「工作台 → 工具箱 → 抽屉 → 元件盒 → 格子」建立树形收纳，每个位置可打印二维码">
      <n-button class="desktop-only" type="primary" @click="openLoc(null)">
        <template #icon><AppIcon name="plus" :size="16" /></template>
        新建位置
      </n-button>
    </PageHeader>

    <div class="layout mt-16">
      <aside class="side card desktop-only">
        <div class="side-head">
          <span class="side-title">位置树</span>
          <button class="mini-btn" title="新建顶级位置" @click="openLoc(null)">
            <AppIcon name="plus" :size="15" />
          </button>
        </div>
        <div class="tree-wrap">
          <n-tree
            block-line
            :data="treeData"
            :selected-keys="selected ? [selected] : []"
            :default-expand-all="true"
            :render-label="renderTreeLabel"
            @update:selected-keys="onSelect"
            class="tree"
          />
          <div v-if="!locations.length" class="tree-empty">还没有位置，先建一个「工具箱」</div>
        </div>
        <div v-if="selected" class="side-actions">
          <n-button size="small" block @click="openLoc(selected)">
            <template #icon><AppIcon name="plus" :size="14" /></template>子位置
          </n-button>
          <div class="act-row">
            <n-button size="small" tertiary @click="openEdit">编辑</n-button>
            <n-button size="small" tertiary type="error" @click="del">删除</n-button>
          </div>
        </div>
      </aside>

      <section class="main">
        <button class="mini-btn mobile-only mobile-floating" title="选择位置" @click="drawer = true">
          <AppIcon name="filter" :size="16" />
          <span>位置树</span>
        </button>

        <div v-if="current" class="detail card" @contextmenu.prevent="openCurrentMenu">
          <div class="detail-head">
            <div class="dh-left">
              <div class="loc-badge"><AppIcon name="location" :size="20" /></div>
              <div>
                <h2 class="loc-name">{{ current.name }}</h2>
                <div class="loc-meta">
                  <span class="mono">编码 {{ current.code }}</span>
                  <span class="sep" />
                  <span>{{ pathText }}</span>
                </div>
              </div>
            </div>
            <div class="dh-right">
              <n-button size="small" tertiary @click="copyPath">
                <template #icon><AppIcon name="edit" :size="14" /></template>
                复制路径
              </n-button>
            </div>
          </div>

          <div class="detail-body">
            <div class="grid-section">
              <div class="block-title">
                网格布局
                <span v-if="current.grid && current.grid.rows" class="hint">{{ current.grid.rows }} 行 × {{ current.grid.cols }} 列</span>
              </div>
              <div v-if="current.grid && current.grid.rows" class="grid" :style="gridStyle">
                <div v-for="cell in gridCells" :key="cell" class="cell">
                  <span class="cell-code">{{ cell }}</span>
                </div>
              </div>
              <div v-else class="grid-empty">
                <AppIcon name="grid" :size="22" />
                <div>未配置网格</div>
                <div class="dim">在「编辑」中设置行列，可生成格子编号</div>
                <n-button size="small" tertiary @click="openEdit">配置网格</n-button>
              </div>
            </div>

            <div class="qr-section">
              <div class="qr-card">
                <img v-if="qr" :src="qr" width="150" height="150" alt="位置二维码" />
                <div v-else class="qr-ph"><AppIcon name="qr" :size="28" /></div>
                <div class="qr-code mono">{{ current.code }}</div>
              </div>
              <p class="qr-tip">打印后粘贴到物理位置，扫码即可定位</p>
            </div>
          </div>

          <div class="loc-facts">
            <div class="fact"><span>存放器件</span><b>{{ currentStat.kinds.size }} 种</b></div>
            <div class="fact"><span>库存数量</span><b>{{ currentStat.qty }}</b></div>
            <div class="fact"><span>子位置</span><b>{{ childCount }}</b></div>
            <div class="fact"><span>位置层级</span><b>{{ depth }} 级</b></div>
            <div class="fact"><span>创建时间</span><b>{{ createdText }}</b></div>
          </div>
        </div>

        <div v-else class="card empty-state detail-empty">
          <div class="es-icon"><AppIcon name="location" :size="26" /></div>
          <div class="es-title">选择一个位置查看详情</div>
          <div>左侧位置树点选，或新建一个位置开始整理收纳</div>
          <n-button class="mt-8" type="primary" size="small" @click="openLoc(null)">
            <template #icon><AppIcon name="plus" :size="14" /></template>
            新建位置
          </n-button>
        </div>
      </section>
    </div>

    <!-- 移动端位置抽屉 -->
    <n-drawer v-model:show="drawer" placement="left" :width="280">
      <n-drawer-content title="存储位置" :native-scrollbar="false">
        <n-button size="small" block style="margin-bottom: 8px" @click="openLoc(null)">
          <template #icon><AppIcon name="plus" :size="14" /></template>新建位置
        </n-button>
        <n-tree
          block-line
          :data="treeData"
          :selected-keys="selected ? [selected] : []"
          :default-expand-all="true"
          :render-label="renderTreeLabel"
          @update:selected-keys="onTreeSelect"
        />
      </n-drawer-content>
    </n-drawer>

    <n-modal v-model:show="show" preset="card" :title="form.id ? '编辑位置' : '新建位置'" style="width: 440px; max-width: 94vw">
      <n-form label-placement="top">
        <n-form-item label="名称"><n-input v-model:value="form.name" placeholder="如 元件盒 B" /></n-form-item>
        <n-form-item label="唯一编码"><n-input v-model:value="form.code" placeholder="留空自动生成" /></n-form-item>
        <n-divider style="margin: 10px 0 14px">网格（可选）</n-divider>
        <div class="row gap-12">
          <n-form-item label="行数" style="flex: 1">
            <n-input-number v-model:value="form.rows" :min="0" placeholder="行" style="width: 100%" />
          </n-form-item>
          <n-form-item label="列数" style="flex: 1">
            <n-input-number v-model:value="form.cols" :min="0" placeholder="列" style="width: 100%" />
          </n-form-item>
        </div>
      </n-form>
      <template #footer>
        <n-space justify="end">
          <n-button @click="show = false">取消</n-button>
          <n-button type="primary" :loading="loading" @click="save">保存</n-button>
        </n-space>
      </template>
    </n-modal>

    <ContextMenu v-model:show="ctx.show" :x="ctx.x" :y="ctx.y" :items="ctx.items" :title="ctxTitle" @select="onCtxSelect" />
  </div>
</template>

<script setup lang="ts">
import { computed, h, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  NButton, NInput, NTree, NModal, NForm, NFormItem, NDivider, NSpace, NInputNumber,
  NDrawer, NDrawerContent, useMessage, useDialog
} from 'naive-ui'
import QRCode from 'qrcode'
import { api } from '@/shared/api'
import { onDataChanged } from '@/shared/utils/events'
import { buildLocationQrText, isPublicOrigin } from '@server/domain/qr.js'
import AppIcon from '@/shared/ui/AppIcon.vue'
import PageHeader from '@/shared/ui/PageHeader.vue'
import ContextMenu from '@/shared/ui/ContextMenu.vue'
import type { ContextMenuItem } from '@/shared/ui/context-menu.types'
import type { Location, Part } from '@/shared/api/types'

const message = useMessage()
const dialog = useDialog()
const route = useRoute()

const locations = ref<Location[]>([])
const parts = ref<Part[]>([])
const selected = ref<string | null>(null)
const current = ref<Location | null>(null)
const qr = ref('')
const show = ref(false)
const loading = ref(false)
const drawer = ref(false)
const form = ref<{ id: string | null; name: string; code: string; parentId: string | null; rows: number; cols: number }>({ id: null, name: '', code: '', parentId: null, rows: 0, cols: 0 })

// 右键快捷菜单
const ctx = reactive({ show: false, x: 0, y: 0, items: [] as ContextMenuItem[] })
const ctxId = ref<string | null>(null)
const ctxTitle = computed(() => locations.value.find((l) => l.id === ctxId.value)?.name || '位置')

/** 每个位置（含子位置汇总）存放的器件种类与数量 */
const locStats = computed(() => {
  const map = new Map<string, { kinds: Set<string>; qty: number }>()
  const byId = new Map(locations.value.map((l) => [l.id, l]))
  for (const p of parts.value) {
    for (const s of p.stocks || []) {
      if (!s.locationId || !(s.quantity > 0)) continue
      let cur = byId.get(s.locationId)
      let guard = 0
      while (cur && guard++ < 10) {
        const entry = map.get(cur.id) || { kinds: new Set<string>(), qty: 0 }
        entry.kinds.add(p.id)
        entry.qty += s.quantity
        map.set(cur.id, entry)
        cur = cur.parentId ? byId.get(cur.parentId) : undefined
      }
    }
  }
  return map
})
const currentStat = computed(() => locStats.value.get(selected.value || '') || { kinds: new Set<string>(), qty: 0 })

const treeData = computed(() => buildTree(locations.value, null))
function buildTree(list: Location[], parentId: string | null): any[] {
  return list
    .filter((l) => l.parentId === parentId)
    .map((l) => {
      const children = buildTree(list, l.id)
      // 子位置与自身去重合并，避免同一器件在多个格子重复计数
      const ids = new Set<string>(locStats.value.get(l.id)?.kinds || [])
      for (const c of children) for (const id of c.ids as Set<string>) ids.add(id)
      return { key: l.id, label: l.name, code: l.code, count: ids.size, ids, children }
    })
}
function renderTreeLabel({ option }: any) {
  return h('span', {
    class: 'tree-label',
    onContextmenu: (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      openLocMenu(e, option.key)
    }
  }, [
    h('span', { class: 'tl-name' }, option.label),
    option.count
      ? h('span', { class: 'tl-count' }, String(option.count))
      : option.code ? h('span', { class: 'tl-code mono' }, option.code) : null
  ])
}
function onSelect(keys: string[]) {
  selected.value = keys[0] || null
  drawer.value = false
  loadCurrent()
}
function onTreeSelect(keys: string[]) { onSelect(keys) }

/* ---------------- 右键快捷菜单 ---------------- */
function pathOfLocation(l: Location) {
  const names: string[] = []
  let cur: Location | undefined = l
  let guard = 0
  while (cur && guard++ < 12) {
    names.unshift(cur.name)
    cur = locations.value.find((x) => x.id === cur!.parentId)
  }
  return names.join(' / ')
}

function openLocMenu(e: MouseEvent, id: string) {
  const l = locations.value.find((x) => x.id === id)
  if (!l) return
  ctxId.value = id
  ctx.items = [
    { key: 'view', label: '定位到此位置', icon: 'target' },
    { key: 'new-child', label: '新建子位置', icon: 'plus' },
    { key: 'edit', label: '编辑位置与网格', icon: 'edit' },
    { divider: true },
    { key: 'copy', label: '复制位置路径', icon: 'copy' },
    { key: 'qr', label: '复制二维码内容', icon: 'qr' },
    { divider: true },
    { key: 'del', label: '删除位置', icon: 'trash', danger: true }
  ]
  ctx.x = e.clientX
  ctx.y = e.clientY
  ctx.show = true
}

function openCurrentMenu(e: MouseEvent) {
  if (current.value) openLocMenu(e, current.value.id)
}

async function onCtxSelect(key: string) {
  const l = locations.value.find((x) => x.id === ctxId.value)
  if (!l) return
  if (key === 'view') { onSelect([l.id]); return }
  if (key === 'new-child') { openLoc(l.id); return }
  if (key === 'edit') { selected.value = l.id; current.value = l; openEdit(); return }
  if (key === 'del') { selected.value = l.id; current.value = l; del(); return }
  if (key === 'copy') {
    await copyText(`${pathOfLocation(l)}${l.code ? ` (${l.code})` : ''}`)
    return
  }
  if (key === 'qr') {
    const stat = locStats.value.get(l.id) || { kinds: new Set<string>(), qty: 0 }
    const text = buildLocationQrText(l, {
      path: pathOfLocation(l),
      partKinds: stat.kinds.size,
      quantity: stat.qty,
      origin: isPublicOrigin(window.location.origin) ? window.location.origin : ''
    })
    await copyText(text)
  }
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    message.success('已复制')
  } catch {
    message.warning('复制失败，请手动选择文本')
  }
}

const pathText = computed(() => {
  if (!current.value) return ''
  const path: string[] = []
  let cur: Location | undefined = current.value
  while (cur) { path.unshift(cur.name); cur = locations.value.find((l) => l.id === cur!.parentId) }
  return path.join(' / ')
})
const gridCells = computed(() => {
  const g = current.value?.grid
  if (!g || !g.rows) return []
  const cells: string[] = []
  for (let r = 1; r <= g.rows; r++) for (let c = 1; c <= g.cols; c++) cells.push(`${r}-${c}`)
  return cells
})
const gridStyle = computed(() => {
  const g = current.value?.grid
  return g && g.cols ? { gridTemplateColumns: `repeat(${g.cols}, minmax(0, 1fr))` } : {}
})
const childCount = computed(() => (current.value ? locations.value.filter((l) => l.parentId === current.value!.id).length : 0))
const depth = computed(() => (pathText.value ? pathText.value.split(' / ').length : 0))
const createdText = computed(() => {
  const t = current.value?.createdAt
  if (!t) return '—'
  return new Date(t).toLocaleDateString('zh-CN')
})

async function loadCurrent() {
  const l = locations.value.find((x) => x.id === selected.value) || null
  current.value = l
  qr.value = ''
  if (l) {
    try {
      const stat = locStats.value.get(l.id) || { kinds: new Set<string>(), qty: 0 }
      const text = buildLocationQrText(l, {
        path: pathText.value,
        partKinds: stat.kinds.size,
        quantity: stat.qty,
        origin: isPublicOrigin(window.location.origin) ? window.location.origin : ''
      })
      qr.value = await QRCode.toDataURL(text, { width: 300, margin: 1 })
    } catch {}
  }
}

async function loadLocs() {
  locations.value = await api.listLocations()
  try {
    const r: any = await api.listParts({ pageSize: 2000 })
    parts.value = r.list || []
  } catch {
    parts.value = []
  }
}

/** 深链或首次进入时选中默认位置 */
async function selectInitial() {
  const focus = route.query.focus ? String(route.query.focus) : ''
  if (focus && locations.value.some((l) => l.id === focus)) {
    selected.value = focus
  } else if (!selected.value && locations.value.length) {
    const root = locations.value.find((l) => !l.parentId)
    if (root) selected.value = root.id
  }
  await loadCurrent()
}

function openLoc(parentId: string | null) {
  form.value = { id: null, name: '', code: '', parentId, rows: 0, cols: 0 }
  show.value = true
}
function openEdit() {
  const l = current.value
  if (!l) return
  form.value = { id: l.id, name: l.name, code: l.code, parentId: l.parentId, rows: l.grid?.rows || 0, cols: l.grid?.cols || 0 }
  show.value = true
}
async function save() {
  if (!form.value.name.trim()) { message.warning('请输入名称'); return }
  loading.value = true
  const grid = form.value.rows > 0 && form.value.cols > 0 ? { rows: form.value.rows, cols: form.value.cols } : null
  try {
    if (form.value.id) await api.updateLocation({ id: form.value.id, name: form.value.name, code: form.value.code, grid })
    else await api.createLocation({ name: form.value.name, code: form.value.code, parentId: form.value.parentId, grid })
    message.success('已保存')
    show.value = false
    await loadLocs(); loadCurrent()
  } catch (e: any) { message.error(e.message) }
  finally { loading.value = false }
}
function del() {
  dialog.warning({
    title: '删除位置', content: '将上移其子位置，确定删除？', positiveText: '删除', negativeText: '取消',
    onPositiveClick: async () => {
      try { await api.deleteLocation(selected.value!); message.success('已删除'); selected.value = null; await loadLocs(); loadCurrent() }
      catch (e: any) { message.error(e.message) }
    }
  })
}

async function copyPath() {
  await copyText(pathText.value + (current.value ? ` (${current.value.code})` : ''))
}

let offData: (() => void) | null = null
onMounted(async () => {
  await loadLocs()
  await selectInitial()
  offData = onDataChanged(async () => {
    await loadLocs()
    await loadCurrent()
  })
})
onBeforeUnmount(() => { if (offData) offData() })
watch(() => route.query.focus, (v) => {
  if (route.name === 'locations' && v) selectInitial()
})
</script>

<style scoped>
.page { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.layout { display: flex; gap: 16px; flex: 1; min-height: 0; }
.side { width: 244px; flex: 0 0 244px; padding: 14px 12px 12px; display: flex; flex-direction: column; }
.side-head { display: flex; justify-content: space-between; align-items: center; padding: 0 4px 8px; }
.side-title { font-weight: 700; font-size: 13px; }
.tree-wrap { flex: 1; min-height: 0; overflow: auto; margin: 0 -4px; }
.tree { font-size: 13px; }
.tree-empty { padding: 20px 8px; color: var(--text-3); font-size: 12.5px; text-align: center; line-height: 1.7; }
:deep(.tree-label) { display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; }
:deep(.tl-name) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
:deep(.tl-code) { font-size: 10.5px; color: var(--text-3); background: var(--surface-3); border-radius: 5px; padding: 0 5px; }
:deep(.tl-count) { font-size: 11px; font-weight: 600; color: var(--text-2); background: rgba(120, 128, 140, .16); border-radius: 5px; padding: 0 6px; line-height: 17px; }
.side-actions { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--outline); }
.act-row { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }

.main { flex: 1; min-width: 0; min-height: 0; overflow: auto; }
.detail { padding: 20px 22px; }
.detail-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; }
.dh-left { display: flex; gap: 14px; align-items: center; min-width: 0; }
.loc-badge {
  width: 44px; height: 44px; border-radius: 13px; flex-shrink: 0;
  background: var(--primary-soft); color: var(--primary);
  display: flex; align-items: center; justify-content: center;
}
.loc-name { margin: 0; font-size: 19px; font-weight: 750; letter-spacing: -.01em; }
.loc-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; color: var(--text-2); font-size: 12.5px; margin-top: 3px; }
.loc-meta .sep { width: 1px; height: 11px; background: var(--outline-strong); }
.detail-body { display: flex; gap: 24px; margin-top: 20px; align-items: flex-start; }
.grid-section { flex: 1; min-width: 0; }
.grid { display: grid; gap: 6px; }
.cell {
  background: var(--surface-2); border: 1px solid var(--outline); border-radius: 8px;
  text-align: center; padding: 12px 4px; font-size: 12px; font-weight: 600; color: var(--text-2);
  transition: all .15s var(--ease);
}
.cell:hover { border-color: var(--primary); background: var(--primary-softer); color: var(--primary); }
.cell-code { font-variant-numeric: tabular-nums; }
.grid-empty {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 32px 16px; border: 1px dashed var(--outline-strong); border-radius: 10px;
  color: var(--text-2); font-size: 13px; text-align: center;
}
.qr-section { width: 190px; flex-shrink: 0; text-align: center; }
.qr-card {
  border: 1px dashed var(--outline-strong); border-radius: 12px; padding: 12px;
  background: #fff; display: flex; flex-direction: column; align-items: center; gap: 8px;
}
.qr-ph { width: 150px; height: 150px; display: flex; align-items: center; justify-content: center; color: var(--text-3); background: var(--surface-2); border-radius: 8px; }
.qr-card img { border-radius: 6px; display: block; }
.qr-code { font-size: 11px; color: #6b7280; word-break: break-all; }
.qr-tip { font-size: 11.5px; color: var(--text-3); margin: 8px 0 0; }
.loc-facts {
  display: flex; gap: 32px; flex-wrap: wrap;
  margin-top: 22px; padding-top: 16px; border-top: 1px solid var(--outline);
}
.fact { display: flex; flex-direction: column; gap: 2px; }
.fact span { font-size: 11.5px; color: var(--text-3); }
.fact b { font-size: 14px; font-weight: 700; }
.detail-empty { flex: 1; }

.mini-btn {
  width: 28px; height: 28px; border-radius: 8px; border: 1px solid transparent;
  background: transparent; color: var(--text-2); cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
  transition: background-color .15s var(--ease), color .15s var(--ease);
}
.mini-btn:hover { background: var(--surface-3); color: var(--text-1); }
.mobile-only { display: none; }
.mobile-floating { width: auto; padding: 0 12px; gap: 6px; font-size: 13px; border: 1px solid var(--outline); background: var(--surface); margin-bottom: 12px; }

@media (max-width: 900px) {
  .desktop-only { display: none; }
  .mobile-only { display: inline-flex; }
  .page { height: auto; min-height: 100%; }
  .detail-body { flex-direction: column; }
  .qr-section { width: 100%; }
}
</style>
