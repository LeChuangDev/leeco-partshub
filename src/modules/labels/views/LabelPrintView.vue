<template>
  <div class="labels-page">
    <header class="lp-bar">
      <div class="row gap-12">
        <button class="back-btn" @click="goBack">
          <AppIcon name="chevronRight" :size="16" class="back-icon" />
          返回
        </button>
        <div>
          <div class="lp-title">元器件标签</div>
          <div class="lp-sub">{{ items.length }} 张 · 46 × 30 mm · A4 排版</div>
        </div>
      </div>
      <div class="row gap-8">
        <n-select v-if="size === 'md'" v-model:value="qrMode" :options="qrModeOptions" size="small" style="width: 116px" />
        <n-select v-model:value="size" :options="sizeOptions" size="small" style="width: 128px" />
        <n-button size="small" type="primary" :disabled="!items.length" @click="doPrint">
          <template #icon><AppIcon name="printer" :size="15" /></template>
          打印
        </n-button>
      </div>
    </header>

    <div v-if="loading" class="lp-empty">正在生成二维码…</div>
    <div v-else-if="!items.length" class="lp-empty">
      没有可打印的元器件
      <span>请在元器件列表勾选后点击「打印标签」</span>
    </div>

    <div v-else class="sheet" :class="`size-${size}`">
      <div v-for="p in items" :key="p.id" class="label">
        <div class="lb-main">
          <div class="lb-name">{{ p.name }}</div>
          <div class="lb-model">{{ p.manufacturerModel || p.internalNo || '' }}</div>
          <div class="lb-meta">
            <span v-if="p.package" class="lb-pkg">{{ p.package }}</span>
            <span v-if="catName(p.categoryId)" class="lb-cat">{{ catName(p.categoryId) }}</span>
          </div>
          <div v-if="size === 'md' && paramLine(p)" class="lb-param">{{ paramLine(p) }}</div>
          <div class="lb-foot">
            <span class="lb-qty">×{{ p.totalQuantity ?? 0 }}</span>
            <span v-if="locPath(p.id)" class="lb-loc">{{ locPath(p.id) }}</span>
          </div>
        </div>
        <div class="lb-qr">
          <img v-if="qrMap[p.id]" :src="qrMap[p.id]" alt="qr" />
          <div v-else class="qr-ph" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NButton, NSelect, useMessage } from 'naive-ui'
import QRCode from 'qrcode'
import { api } from '@/shared/api'
import { buildPartQrText, isPublicOrigin } from '@server/domain/qr.js'
import type { Category, Location, Part } from '@/shared/api/types'
import AppIcon from '@/shared/ui/AppIcon.vue'

const route = useRoute()
const router = useRouter()
const message = useMessage()

const loading = ref(true)
const parts = ref<Part[]>([])
const categories = ref<Category[]>([])
const locations = ref<Location[]>([])
const qrMap = ref<Record<string, string>>({})
const size = ref<'sm' | 'md'>('sm')
const sizeOptions = [
  { label: '46 × 30 mm', value: 'sm' },
  { label: '60 × 40 mm', value: 'md' }
]
const qrMode = ref<'compact' | 'full'>('compact')
const qrModeOptions = [
  { label: '扫码·简版', value: 'compact' },
  { label: '扫码·完整', value: 'full' }
]

const items = computed(() => parts.value)

function catName(id: string | null) {
  return categories.value.find((c) => c.id === id)?.name || ''
}
function paramLabels(id: string | null): Record<string, string> {
  const tpl = categories.value.find((c) => c.id === id)?.paramTemplate || []
  const map: Record<string, string> = {}
  for (const f of tpl) map[f.key] = f.label
  return map
}
function paramLine(p: Part) {
  const labels = paramLabels(p.categoryId)
  const pairs = Object.entries(p.params || {}).filter(([, v]) => v).slice(0, 2)
  return pairs.map(([k, v]) => `${labels[k] || k} ${v}`).join(' · ')
}
function locPath(partId: string) {
  const p = parts.value.find((x) => x.id === partId)
  const batch = (p?.stocks || []).find((b) => b.locationId && (b.quantity || 0) > 0)
  if (!batch?.locationId) return ''
  const byId = new Map(locations.value.map((l) => [l.id, l]))
  const names: string[] = []
  let cur = byId.get(batch.locationId)
  let guard = 0
  while (cur && guard++ < 10) {
    names.unshift(cur.name)
    cur = cur.parentId ? byId.get(cur.parentId) : null
  }
  return names.join(' / ')
}

// 二维码内容：直接承载器件名、型号、封装、关键参数、库存与库位，普通扫码工具即可读
function qrText(p: Part, mode: 'compact' | 'full' = 'compact') {
  const origin = isPublicOrigin(window.location.origin) ? window.location.origin : ''
  return buildPartQrText(p, {
    categoryName: catName(p.categoryId),
    paramLabels: paramLabels(p.categoryId),
    quantity: p.totalQuantity ?? (p.stocks || []).reduce((s, b) => s + (Number(b.quantity) || 0), 0),
    locationPath: locPath(p.id),
    mode,
    origin
  })
}

async function buildQrMap() {
  if (!parts.value.length) return
  const map: Record<string, string> = {}
  for (const p of parts.value) {
    map[p.id] = await QRCode.toDataURL(qrText(p, qrMode.value), {
      margin: 0, width: 300, errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#ffffff' }
    })
  }
  qrMap.value = map
}

watch(qrMode, () => { buildQrMap() })
// 小标签只放简版二维码，避免模块过密导致手机难识别
watch(size, (v) => { if (v === 'sm' && qrMode.value !== 'compact') qrMode.value = 'compact' })

async function goBack() {
  if (window.history.length > 1) router.back()
  else router.push({ name: 'parts' })
}
function doPrint() {
  window.print()
}

onMounted(async () => {
  try {
    const ids = String(route.query.ids || '').split(',').map((s) => s.trim()).filter(Boolean)
    const [all, cats, locs] = await Promise.all([
      api.listParts({ pageSize: 2000 }),
      api.listCategories(),
      api.listLocations()
    ])
    categories.value = cats
    locations.value = locs
    const allParts: Part[] = (all as any).list || []
    parts.value = ids.length
      ? ids.map((id) => allParts.find((p) => p.id === id)).filter(Boolean) as Part[]
      : allParts.slice(0, 40)
    if (parts.value.length > 120) {
      parts.value = parts.value.slice(0, 120)
      message.warning('单次最多打印 120 张，已截断')
    }
    await buildQrMap()
  } catch (e: any) {
    message.error(e.message)
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.labels-page { min-height: 100vh; background: #f2f3f5; padding: 0 0 40px; }

.lp-bar {
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  padding: 14px 22px; background: #fff; border-bottom: 1px solid #e5e7eb;
  position: sticky; top: 0; z-index: 5;
}
.back-btn {
  display: inline-flex; align-items: center; gap: 4px; height: 30px; padding: 0 10px;
  border-radius: 8px; border: 1px solid #e5e7eb; background: #fff; cursor: pointer;
  font-size: 12.5px; color: #4b5563; font-family: inherit;
}
.back-btn:hover { background: #f9fafb; }
.back-icon { transform: rotate(180deg); }
.lp-title { font-weight: 700; font-size: 15px; }
.lp-sub { font-size: 11.5px; color: #9aa1ac; margin-top: 1px; }
.lp-empty {
  padding: 80px 20px; text-align: center; color: #6b7280; font-size: 13px;
  display: flex; flex-direction: column; gap: 6px; align-items: center;
}
.lp-empty span { font-size: 12px; color: #9aa1ac; }

/* 标签纸：按 A4 可打印宽度（210 - 8×2 = 194mm）排版 */
.sheet {
  width: 194mm; max-width: 100%; min-height: 270mm; margin: 8mm auto; background: #fff;
  box-shadow: 0 1px 2px rgba(16, 24, 40, .06), 0 8px 24px rgba(16, 24, 40, .06);
  display: grid; justify-content: start; align-content: start;
  gap: 2mm; padding: 2mm; box-sizing: border-box;
  grid-template-columns: repeat(4, 46mm);
}
.size-md.sheet { grid-template-columns: repeat(3, 60mm); }

.label {
  width: 46mm; height: 30mm; box-sizing: border-box;
  background: #fff; border: 1px solid #e2e5e9; border-radius: 1.6mm;
  padding: 2mm; display: flex; gap: 1.6mm; overflow: hidden;
  break-inside: avoid; page-break-inside: avoid;
}
.size-md .label { width: 60mm; height: 40mm; padding: 2.6mm; gap: 2mm; }

.lb-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.lb-name {
  font-size: 2.7mm; font-weight: 700; line-height: 1.28; color: #111827;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.size-md .lb-name { font-size: 3.2mm; }
.lb-model {
  font-family: var(--mono); font-size: 2.15mm; color: #4b5563; margin-top: .6mm;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.size-md .lb-model { font-size: 2.6mm; }
.lb-meta { display: flex; align-items: center; gap: 1mm; margin-top: 1mm; flex-wrap: wrap; }
.lb-pkg {
  font-family: var(--mono); font-size: 2mm; font-weight: 600; color: #111827;
  border: .22mm solid #d1d5db; border-radius: .8mm; padding: 0 .8mm; line-height: 1.5;
}
.lb-cat { font-size: 1.95mm; color: #6b7280; }
.lb-param {
  margin-top: .7mm; font-size: 2mm; color: #374151; line-height: 1.3;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.lb-foot {
  margin-top: auto; display: flex; align-items: baseline; gap: 1.4mm;
  font-size: 1.95mm; color: #6b7280; min-width: 0;
}
.lb-qty { font-weight: 800; font-size: 2.5mm; color: #111827; font-variant-numeric: tabular-nums; }
.size-md .lb-qty { font-size: 3mm; }
.lb-loc { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lb-qr { width: 14mm; flex: 0 0 14mm; display: flex; align-items: center; justify-content: center; }
.size-md .lb-qr { width: 18mm; flex-basis: 18mm; }
.lb-qr img { width: 100%; height: auto; display: block; }
.qr-ph { width: 100%; aspect-ratio: 1; background: #f3f4f6; border-radius: 1mm; }

@media print {
  .labels-page { background: #fff; padding: 0; }
  .lp-bar { display: none; }
  .sheet {
    width: auto; max-width: none; min-height: 0; margin: 0; padding: 0;
    box-shadow: none; gap: 2mm; justify-content: flex-start;
  }
  .label { border-color: #cfd3d9; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}

@page { size: A4; margin: 8mm; }

/* 窄屏下等比缩放预览，保持 A4 版面比例，避免横向溢出（打印样式不受影响） */
@media screen and (max-width: 900px) {
  .sheet { zoom: .72; max-width: none; margin: 6mm auto; }
}
@media screen and (max-width: 600px) {
  .sheet { zoom: .46; margin: 4mm auto; }
  .lp-bar { flex-wrap: wrap; gap: 10px; padding: 10px 12px; }
  .lp-bar > .row:first-child { flex: 1 1 100%; gap: 8px; min-width: 0; }
  .lp-bar > .row:last-child { flex: 1 1 100%; justify-content: space-between; }
  .back-btn { flex-shrink: 0; }
  .lp-title { font-size: 14px; white-space: nowrap; }
  .lp-sub { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
}
</style>
