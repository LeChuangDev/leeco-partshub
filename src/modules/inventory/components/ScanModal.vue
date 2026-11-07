<template>
  <n-modal
    :show="show"
    preset="card"
    style="width: 600px; max-width: 94vw"
    :mask-closable="!busy"
    @update:show="(v: boolean) => emit('update:show', v)"
  >
    <template #header>
      <div class="scan-head">
        <span class="sh-icon"><AppIcon name="scan" :size="18" /></span>
        <div class="sh-text">
          <div class="sh-title">扫码操作</div>
          <div class="sh-sub">扫码枪扫描标签，或输入型号 / 料号后回车</div>
        </div>
        <kbd class="sh-kbd">Ctrl S</kbd>
      </div>
    </template>

    <div class="scan-input" :class="{ filled: !!code }" @click="focusInput">
      <AppIcon name="scan" :size="17" />
      <textarea
        ref="inputRef"
        v-model="code"
        rows="1"
        placeholder="等待扫码…"
        autocomplete="off"
        spellcheck="false"
        @keydown.enter.prevent="onEnter"
        @input="onType"
        @paste="onPaste"
      />
      <button v-if="code" class="mini-btn" title="清空" @click.stop="reset"><AppIcon name="x" :size="15" /></button>
      <span class="s-kbd">ENTER</span>
    </div>

    <div class="scan-bar">
      <span :class="['sb-dot', { on: loading }]" />
      <span class="sb-text">{{ hint }}</span>
      <span class="flex-1" />
      <span v-if="scanLines > 1" class="chip gray">{{ scanLines }} 行</span>
      <span v-if="parsed?.kind" class="chip gray">{{ kindLabel(parsed.kind) }}</span>
    </div>

    <div v-if="loading" class="scan-loading">
      <span class="spinner" /> 正在识别…
    </div>

    <!-- 识别到器件 -->
    <div v-else-if="part" class="scan-card">
      <div class="sc-head">
        <div class="sc-title-wrap">
          <div class="sc-title">{{ part.name }}</div>
          <div class="sc-chips">
            <span v-if="part.manufacturerModel" class="chip gray mono">{{ part.manufacturerModel }}</span>
            <span v-if="part.package" class="chip gray">{{ part.package }}</span>
            <span class="chip gray">{{ catName }}</span>
          </div>
        </div>
        <div class="sc-stock" :class="{ low: isLow }">
          <b>{{ part.totalQuantity ?? 0 }}</b>
          <span>件</span>
        </div>
      </div>

      <div class="sc-grid">
        <div class="sc-fact">
          <span>存放位置</span>
          <b :title="locationPath">{{ locationPath || '未指定' }}</b>
        </div>
        <div class="sc-fact">
          <span>安全库存</span>
          <b>{{ part.safetyStock || '—' }}</b>
        </div>
        <div class="sc-fact">
          <span>批次</span>
          <b>{{ (part.stocks || []).length }} 个</b>
        </div>
      </div>

      <div v-if="paramText" class="sc-params">{{ paramText }}</div>

      <div class="sc-ops">
        <label class="sc-qty">
          <span>数量</span>
          <n-input-number v-model:value="qty" :min="1" :precision="0" size="small" style="width: 92px" />
        </label>
        <n-button type="primary" size="small" :loading="busy" @click="operate('in')">
          <template #icon><AppIcon name="import" :size="14" /></template>
          入库
        </n-button>
        <n-button size="small" :loading="busy" :disabled="!part.totalQuantity" @click="operate('out')">
          <template #icon><AppIcon name="upload" :size="14" /></template>
          出库
        </n-button>
        <span class="flex-1" />
        <n-button size="small" quaternary @click="openDetail">打开档案</n-button>
        <n-button size="small" quaternary @click="printLabel">
          <template #icon><AppIcon name="printer" :size="14" /></template>
          打印标签
        </n-button>
      </div>
    </div>

    <!-- 识别到库位 -->
    <div v-else-if="location" class="scan-card loc">
      <div class="sc-head">
        <div class="sc-title-wrap">
          <div class="sc-title"><AppIcon name="location" :size="16" /> {{ location.name }}</div>
          <div class="sc-chips">
            <span v-if="location.code" class="chip gray mono">{{ location.code }}</span>
            <span class="chip gray">{{ locPath }}</span>
          </div>
        </div>
      </div>
      <p class="loc-tip">这是存放位置标签，可进入位置页查看该位置的器件与网格。</p>
      <div class="sc-ops">
        <span class="flex-1" />
        <n-button type="primary" size="small" @click="openLocation">查看库位</n-button>
      </div>
    </div>

    <!-- 多个候选 -->
    <div v-else-if="candidates.length" class="scan-cands">
      <div class="sc-hint">找到 {{ candidates.length }} 个可能的元器件，选择一项：</div>
      <button v-for="c in candidates" :key="c.id" class="cand" @click="choose(c.id)">
        <span class="cand-main">
          <span class="cand-name">{{ c.name }}</span>
          <span class="cand-sub mono">{{ [c.model, c.package].filter(Boolean).join(' · ') || '未填写型号' }}</span>
        </span>
        <span class="cand-qty">{{ c.quantity }}</span>
        <AppIcon name="chevronRight" :size="14" />
      </button>
    </div>

    <!-- 空状态 / 未找到 -->
    <div v-else class="scan-empty">
      <div class="se-icon"><AppIcon name="scan" :size="24" /></div>
      <div class="se-title">{{ searched ? '没有找到匹配的元器件' : '对准标签二维码扫描' }}</div>
      <div class="se-sub">
        {{ searched ? '可尝试输入完整型号，或先在元器件管理中建档' : '也支持输入内部料号、型号片段；扫码枪回车即确认' }}
      </div>
      <n-button v-if="searched" size="small" tertiary @click="goCreate">去建档</n-button>
    </div>

    <template #footer>
      <div class="scan-foot">
        <span><kbd>ESC</kbd> 关闭</span>
        <span class="dim">识别结果不会修改数据，入库/出库需点击确认</span>
      </div>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { NModal, NButton, NInputNumber, useMessage } from 'naive-ui'
import { api } from '@/shared/api'
import { parseScanPayload } from '@server/domain/scan.js'
import { emitDataChanged } from '@/shared/utils/events'
import type { Category, Location, Part } from '@/shared/api/types'
import AppIcon from '@/shared/ui/AppIcon.vue'

const props = defineProps<{ show: boolean }>()
const emit = defineEmits<{ (e: 'update:show', v: boolean): void }>()
const router = useRouter()
const message = useMessage()

const inputRef = ref<HTMLTextAreaElement | null>(null)
const code = ref('')
const hint = ref('等待扫码或输入…')
const loading = ref(false)
const busy = ref(false)
const searched = ref(false)
const parsed = ref<any>(null)
const part = ref<Part | null>(null)
const location = ref<Location | null>(null)
const candidates = ref<{ id: string; name: string; model: string; package: string; quantity: number }[]>([])
const categories = ref<Category[]>([])
const locations = ref<Location[]>([])
const qty = ref<number | null>(1)

const catName = computed(() => categories.value.find((c) => c.id === part.value?.categoryId)?.name || '未分类')
const isLow = computed(() => !!part.value && (part.value.totalQuantity ?? 0) < (part.value.safetyStock || 0))
const locationPath = computed(() => {
  const batch = [...(part.value?.stocks || [])]
    .filter((b) => b.locationId && (b.quantity || 0) > 0)
    .sort((a, b) => (b.quantity || 0) - (a.quantity || 0))[0]
  return batch ? pathOf(batch.locationId) : ''
})
const paramText = computed(() => {
  const entries = Object.entries(part.value?.params || {}).filter(([, v]) => v)
  return entries.slice(0, 4).map(([, v]) => v).join(' · ')
})
const locPath = computed(() => (location.value ? pathOf(location.value.id) : ''))
const scanLines = computed(() => code.value.split('\n').filter((l) => l.trim()).length)

function pathOf(id: string | null) {
  const names: string[] = []
  let cur = locations.value.find((l) => l.id === id)
  let guard = 0
  while (cur && guard++ < 12) {
    names.unshift(cur.name)
    cur = locations.value.find((l) => l.id === cur!.parentId)
  }
  return names.join(' / ')
}

function kindLabel(kind: string) {
  return kind === 'part' ? '器件标签' : kind === 'location' ? '库位标签' : kind === 'query' ? '文本检索' : '空内容'
}

function focusInput() {
  inputRef.value?.focus()
}

function reset() {
  clearTimeout(enterTimer)
  code.value = ''
  part.value = null
  location.value = null
  candidates.value = []
  parsed.value = null
  searched.value = false
  hint.value = '等待扫码或输入…'
  nextTick(focusInput)
}

watch(() => props.show, async (v) => {
  if (!v) { clearTimeout(enterTimer); return }
  reset()
  qty.value = 1
  try {
    const [c, l] = await Promise.all([api.listCategories(), api.listLocations()])
    categories.value = c
    locations.value = l
  } catch { /* 基础数据失败不阻断扫码 */ }
  nextTick(focusInput)
})

let enterTimer: any = null
let lastSubmitAt = 0

// 扫码枪会把多行二维码逐字符敲进来，换行也会变成 Enter。
// 因此 Enter 不立即提交，等待一小段时间看是否还有后续字符。
function onEnter() {
  if (!code.value.trim()) {
    if (Date.now() - lastSubmitAt < 600) return
    hint.value = '请输入或扫描内容'
    focusInput()
    return
  }
  code.value += '\n'
  clearTimeout(enterTimer)
  enterTimer = setTimeout(() => submit(), 200)
}
function onType() {
  clearTimeout(enterTimer)
}
function onPaste() {
  clearTimeout(enterTimer)
  enterTimer = setTimeout(() => { if (code.value.trim()) submit() }, 260)
}

async function submit() {
  clearTimeout(enterTimer)
  const text = code.value.trim()
  if (!text) { hint.value = '请输入或扫描内容'; focusInput(); return }
  lastSubmitAt = Date.now()
  const r = parseScanPayload(text)
  parsed.value = r
  await resolve(r)
  // 识别成功即清空输入，方便连续扫下一件；失败时保留内容便于修改
  const ok = !!part.value || !!location.value || candidates.value.length > 0
  if (ok) {
    code.value = ''
    nextTick(focusInput)
  }
}

async function resolve(r: any) {
  part.value = null
  location.value = null
  candidates.value = []
  searched.value = true

  if (r.kind === 'empty') { hint.value = '内容为空'; return }

  loading.value = true
  try {
    // 1) 直接命中器件 ID
    if (r.kind === 'part' && r.id) {
      if (await loadPart(r.id)) { hint.value = '已识别器件，可直接入库 / 出库'; return }
      if (!(r.model || r.name || r.query)) {
        hint.value = '标签对应的器件不存在（可能已删除）'
        return
      }
    }

    // 2) 库位标签：按 ID / 编码匹配
    if (r.kind === 'location') {
      const byId = r.id ? locations.value.find((l) => l.id === r.id) : null
      const byCode = r.code ? locations.value.find((l) => (l.code || '').toLowerCase() === r.code.toLowerCase()) : null
      const byName = !byId && !byCode && r.name ? locations.value.find((l) => l.name === r.name) : null
      const hit = byId || byCode || byName
      if (hit) {
        location.value = hit
        hint.value = '已识别库位标签'
        return
      }
      hint.value = `没有找到库位${r.code ? ' ' + r.code : ''}，可能已被删除`
      return
    }

    // 3) 文本 / 器件标签：用型号优先检索
    const q = String(r.query || r.model || r.internalNo || r.name || '').trim()
    if (!q) { hint.value = '无法从标签中提取有效信息'; return }

    // 标签里带型号时先做精确型号匹配，避免同名不同料
    if (r.model) {
      const exact = await api.listParts({ search: r.model, pageSize: 20 })
      const list = (exact.list || []).filter((p: Part) => (p.manufacturerModel || '').toLowerCase() === r.model.toLowerCase())
      if (list.length === 1) {
        await loadPart(list[0].id)
        hint.value = '按型号精确匹配'
        return
      }
    }

    const res = await api.search(q, 8)
    if (res.parts.length === 1) {
      await loadPart(res.parts[0].id)
      hint.value = '已识别器件，可直接入库 / 出库'
    } else if (res.parts.length > 1) {
      candidates.value = res.parts.map((p) => ({ id: p.id, name: p.name, model: p.model, package: p.package, quantity: p.quantity }))
      hint.value = `找到 ${res.parts.length} 个可能的元器件`
    } else {
      hint.value = `没有匹配「${q}」的元器件`
    }
  } catch (e: any) {
    hint.value = e.message || '识别失败'
  } finally {
    loading.value = false
  }
}

async function loadPart(id: string) {
  try {
    const p = await api.getPart(id)
    if (!p) return false
    part.value = p
    qty.value = 1
    return true
  } catch {
    return false
  }
}

async function choose(id: string) {
  loading.value = true
  try {
    if (await loadPart(id)) {
      candidates.value = []
      hint.value = '已识别器件，可直接入库 / 出库'
    }
  } finally {
    loading.value = false
  }
}

async function operate(type: 'in' | 'out') {
  if (!part.value) return
  const n = Number(qty.value) || 0
  if (n <= 0) { message.warning('请输入数量'); return }
  busy.value = true
  try {
    if (type === 'in') {
      const last = [...(part.value.stocks || [])].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))[0]
      await api.stockIn({
        partId: part.value.id,
        quantity: n,
        unit: last?.unit || '个',
        unitPrice: last?.unitPrice || 0,
        supplier: last?.supplier || '',
        orderNo: '',
        locationId: last?.locationId || null,
        note: '扫码入库',
        reason: '扫码入库',
        merge: true,
        source: 'scan'
      })
      message.success(`已入库 ${n} 件`)
    } else {
      await api.stockOut({ partId: part.value.id, quantity: n, reason: '扫码出库', source: 'scan' })
      message.success(`已出库 ${n} 件`)
    }
    emitDataChanged()
    await loadPart(part.value.id)
    code.value = ''
    qty.value = 1
    hint.value = type === 'in' ? '入库完成，可继续扫码' : '出库完成，可继续扫码'
    nextTick(focusInput)
  } catch (e: any) {
    message.error(e.message || '操作失败')
  } finally {
    busy.value = false
  }
}

function openDetail() {
  if (!part.value) return
  const id = part.value.id
  emit('update:show', false)
  router.push({ name: 'parts', query: { open: id } })
}
function printLabel() {
  if (!part.value) return
  const id = part.value.id
  emit('update:show', false)
  router.push({ name: 'labels', query: { ids: id } })
}
function openLocation() {
  if (!location.value) return
  const id = location.value.id
  emit('update:show', false)
  router.push({ name: 'locations', query: { focus: id } })
}
function goCreate() {
  const q = code.value.trim()
  emit('update:show', false)
  router.push({ name: 'parts', query: q ? { search: q, new: '1' } : { new: '1' } })
}
</script>

<style scoped>
.scan-head { display: flex; align-items: center; gap: 10px; }
.sh-icon {
  width: 34px; height: 34px; border-radius: 10px; flex-shrink: 0;
  background: var(--primary-soft); color: var(--primary);
  display: inline-flex; align-items: center; justify-content: center;
}
.sh-text { flex: 1; min-width: 0; }
.sh-title { font-weight: 700; font-size: 15px; }
.sh-sub { font-size: 11.5px; color: var(--text-3); margin-top: 1px; }
.sh-kbd {
  font-family: var(--mono); font-size: 10px; color: var(--text-3);
  border: 1px solid var(--outline); background: var(--surface-2);
  border-radius: 5px; padding: 3px 6px; line-height: 1.2;
}

.scan-input {
  display: flex; align-items: center; gap: 10px;
  height: 46px; padding: 0 12px; border-radius: 11px;
  border: 1.5px solid var(--outline-strong); background: var(--surface-2);
  color: var(--text-3); transition: border-color .15s var(--ease), background-color .15s var(--ease);
  cursor: text;
}
.scan-input:focus-within { border-color: var(--primary); background: var(--surface); box-shadow: 0 0 0 3px var(--primary-soft); }
.scan-input textarea {
  flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; resize: none;
  font-family: var(--mono); font-size: 14px; color: var(--text-1); letter-spacing: .01em;
  height: 42px; padding: 11px 0; line-height: 20px; overflow: hidden; white-space: nowrap;
}
.scan-input textarea::placeholder { color: var(--text-3); font-family: var(--font); letter-spacing: 0; }
.s-kbd {
  font-family: var(--mono); font-size: 9.5px; color: var(--text-3);
  border: 1px solid var(--outline); background: var(--surface); border-radius: 4px; padding: 2px 5px;
}

.scan-bar { display: flex; align-items: center; gap: 7px; padding: 9px 2px 0; font-size: 12px; color: var(--text-2); }
.sb-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--text-3); flex-shrink: 0; }
.sb-dot.on { background: var(--secondary); box-shadow: 0 0 0 3px rgba(20, 184, 166, .16); animation: pulse 1.1s infinite; }
@keyframes pulse { 50% { opacity: .35; } }
.sb-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.scan-loading { display: flex; align-items: center; gap: 8px; padding: 28px 4px; color: var(--text-2); font-size: 13px; }
.spinner { width: 14px; height: 14px; border: 2px solid var(--outline-strong); border-top-color: var(--primary); border-radius: 50%; animation: spin .7s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.scan-card { margin-top: 12px; border: 1px solid var(--outline); border-radius: 12px; background: var(--surface-2); padding: 14px; }
.sc-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.sc-title-wrap { min-width: 0; }
.sc-title { font-size: 16px; font-weight: 750; display: flex; align-items: center; gap: 6px; }
.sc-chips { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
.sc-stock {
  display: flex; align-items: baseline; gap: 3px; flex-shrink: 0;
  padding: 4px 12px; border-radius: 9px; background: var(--surface); border: 1px solid var(--outline);
}
.sc-stock b { font-size: 24px; font-weight: 800; font-variant-numeric: tabular-nums; line-height: 1.1; }
.sc-stock span { font-size: 11px; color: var(--text-3); }
.sc-stock.low b { color: var(--accent); }
.sc-grid { display: grid; grid-template-columns: 1.6fr 1fr 1fr; gap: 10px; margin-top: 14px; }
.sc-fact { min-width: 0; }
.sc-fact span { display: block; font-size: 11px; color: var(--text-3); }
.sc-fact b { display: block; font-size: 12.5px; font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sc-params {
  margin-top: 12px; padding: 8px 10px; border-radius: 8px;
  background: var(--surface); border: 1px dashed var(--outline-strong);
  font-size: 12px; color: var(--text-2); word-break: break-all;
}
.sc-ops { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 14px; }
.sc-qty { display: inline-flex; align-items: center; gap: 7px; font-size: 12px; color: var(--text-2); }

.loc-tip { margin: 12px 0 0; font-size: 12.5px; color: var(--text-2); }

.sc-hint { font-size: 12px; color: var(--text-3); margin: 12px 2px 8px; }
.scan-cands { display: flex; flex-direction: column; gap: 6px; }
.cand {
  display: flex; align-items: center; gap: 10px; width: 100%;
  padding: 9px 11px; border-radius: 9px; border: 1px solid var(--outline);
  background: var(--surface-2); color: var(--text-1); cursor: pointer;
  font-family: inherit; text-align: left; transition: all .14s var(--ease);
}
.cand:hover { border-color: var(--primary); background: var(--primary-soft); }
.cand-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.cand-name { font-size: 13px; font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cand-sub { font-size: 11.5px; color: var(--text-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cand-qty { font-weight: 700; font-variant-numeric: tabular-nums; font-size: 13px; color: var(--text-2); }

.scan-empty { display: flex; flex-direction: column; align-items: center; gap: 7px; padding: 26px 16px 22px; text-align: center; }
.se-icon { width: 52px; height: 52px; border-radius: 15px; background: var(--surface-3); color: var(--text-3); display: flex; align-items: center; justify-content: center; }
.se-title { font-size: 13.5px; font-weight: 650; color: var(--text-1); }
.se-sub { font-size: 12px; color: var(--text-3); max-width: 360px; line-height: 1.65; }

.scan-foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 11px; color: var(--text-3); }
.scan-foot kbd {
  font-family: var(--mono); font-size: 10px; border: 1px solid var(--outline);
  background: var(--surface-2); border-radius: 4px; padding: 2px 4px;
}

@media (max-width: 560px) {
  .sc-grid { grid-template-columns: 1fr 1fr; }
  .sc-grid .sc-fact:first-child { grid-column: 1 / -1; }
  .sh-kbd { display: none; }
  .scan-foot span:last-child { display: none; }
}
</style>
