<template>
  <div ref="wrapEl" class="trend" @mousemove="onMove" @mouseleave="hover = -1">
    <svg :viewBox="`0 0 ${W} ${H}`" class="trend-svg">
      <defs>
        <linearGradient :id="gidIn" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" :stop-color="COL_IN" stop-opacity=".22" />
          <stop offset="100%" :stop-color="COL_IN" stop-opacity="0" />
        </linearGradient>
        <linearGradient :id="gidOut" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" :stop-color="COL_OUT" stop-opacity=".2" />
          <stop offset="100%" :stop-color="COL_OUT" stop-opacity="0" />
        </linearGradient>
      </defs>
      <!-- 水平网格线 -->
      <g>
        <line
          v-for="g in gridLines" :key="'g' + g.y"
          :x1="padL" :y1="g.y" :x2="W - padR" :y2="g.y"
          :stroke="'var(--outline)'" stroke-width="1"
        />
        <text
          v-for="g in gridLines" :key="'t' + g.y"
          :x="padL - 6" :y="g.y + 3" text-anchor="end"
          class="axis-text"
        >{{ g.label }}</text>
      </g>
      <!-- X 轴标签 -->
      <text
        v-for="(l, i) in labels" :key="'x' + i"
        :x="xOf(i)" :y="H - 8" text-anchor="middle" class="axis-text"
      >{{ l }}</text>
      <!-- 面积渐变 -->
      <polygon v-if="!empty" :points="areaIn" :fill="`url(#${gidIn})`" />
      <polygon v-if="!empty" :points="areaOut" :fill="`url(#${gidOut})`" />
      <!-- 悬浮竖线 -->
      <line v-if="hover >= 0" :x1="xOf(hover)" :y1="padT" :x2="xOf(hover)" :y2="H - padB"
        :stroke="'var(--text-3)'" stroke-width="1" stroke-dasharray="3 3" />
      <!-- 入库折线 -->
      <polyline :points="polyIn" fill="none" :stroke="COL_IN" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />
      <!-- 出库折线 -->
      <polyline :points="polyOut" fill="none" :stroke="COL_OUT" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />
      <!-- 数据点 -->
      <circle v-for="(v, i) in data.in" :key="'in' + i" :cx="xOf(i)" :cy="yOf(v)" r="3" :fill="COL_IN" />
      <circle v-for="(v, i) in data.out" :key="'out' + i" :cx="xOf(i)" :cy="yOf(v)" r="3" :fill="COL_OUT" />
      <circle v-if="hover >= 0" :cx="xOf(hover)" :cy="yOf(data.in[hover])" r="5" :fill="COL_IN" stroke="var(--surface)" stroke-width="2" />
      <circle v-if="hover >= 0" :cx="xOf(hover)" :cy="yOf(data.out[hover])" r="5" :fill="COL_OUT" stroke="var(--surface)" stroke-width="2" />
    </svg>
    <div v-if="hover >= 0" class="tip" :style="tipStyle">
      <div class="tip-title">{{ labels[hover] }}</div>
      <div class="tip-row"><span class="dot" :style="{ background: COL_IN }" />入库 <b>{{ data.in[hover] }}</b></div>
      <div class="tip-row"><span class="dot" :style="{ background: COL_OUT }" />出库 <b>{{ data.out[hover] }}</b></div>
    </div>
    <div v-if="empty" class="trend-empty">暂无出入库记录</div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { Trend } from '../api/types'

const props = defineProps<{ data: Trend }>()

const wrapEl = ref<HTMLElement | null>(null)
const W = ref(720)
const H = computed(() => (W.value < 460 ? 210 : 280))
const padL = 40
const padR = 16
const padT = 16
const padB = 28
const plotW = computed(() => W.value - padL - padR)
const plotH = computed(() => H.value - padT - padB)
const COL_IN = '#5b6cff'
const COL_OUT = '#f59e0b'

let ro: ResizeObserver | null = null
onMounted(() => {
  if (!wrapEl.value) return
  ro = new ResizeObserver((entries) => {
    const w = entries[0]?.contentRect.width || 0
    if (w > 0) W.value = Math.max(300, Math.round(w))
  })
  ro.observe(wrapEl.value)
})
onBeforeUnmount(() => ro?.disconnect())

const data = computed(() => props.data || { labels: [], in: [], out: [] })
const labels = computed(() => data.value.labels || [])
const gid = Math.random().toString(36).slice(2, 8)
const gidIn = `ti-${gid}`
const gidOut = `to-${gid}`
const empty = computed(() => {
  const all = [...(data.value.in || []), ...(data.value.out || [])]
  return all.every((v) => !v)
})

/** 取整到 1 / 2 / 2.5 / 5 / 10 × 10ⁿ 的友好刻度 */
function niceStep(raw: number) {
  const pow = Math.pow(10, Math.floor(Math.log10(raw)))
  const n = raw / pow
  const s = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10
  return s * pow
}

const step = computed(() => {
  const all = [...(data.value.in || []), ...(data.value.out || [])]
  return Math.max(1, niceStep(Math.max(1, ...all) / 4))
})
const maxVal = computed(() => step.value * 4)

const gridLines = computed(() => {
  const n = 4
  const lines = []
  for (let i = 0; i <= n; i++) {
    const val = step.value * i
    const y = padT + plotH.value - (val / maxVal.value) * plotH.value
    lines.push({ y, label: formatNum(Math.round(val)) })
  }
  return lines
})

const n = computed(() => Math.max(labels.value.length, 1))
const xOf = (i: number) => (n.value === 1 ? padL + plotW.value / 2 : padL + (plotW.value * i) / (n.value - 1))
const yOf = (v: number) => padT + plotH.value - (v / maxVal.value) * plotH.value
const baseY = computed(() => padT + plotH.value)

const polyIn = computed(() => labels.value.map((_, i) => `${xOf(i)},${yOf(data.value.in[i] || 0)}`).join(' '))
const polyOut = computed(() => labels.value.map((_, i) => `${xOf(i)},${yOf(data.value.out[i] || 0)}`).join(' '))
const areaIn = computed(() => `${xOf(0)},${baseY.value} ${polyIn.value} ${xOf(n.value - 1)},${baseY.value}`)
const areaOut = computed(() => `${xOf(0)},${baseY.value} ${polyOut.value} ${xOf(n.value - 1)},${baseY.value}`)

function formatNum(v: number) {
  if (v >= 10000) return (v / 1000).toFixed(0) + 'k'
  return String(v)
}

// 悬浮交互
const hover = ref(-1)
function onMove(e: MouseEvent) {
  const rect = (e.currentTarget as HTMLElement).querySelector('svg')!.getBoundingClientRect()
  const x = ((e.clientX - rect.left) / rect.width) * W.value
  if (labels.value.length <= 1) { hover.value = 0; return }
  const i = Math.round(((x - padL) / plotW.value) * (n.value - 1))
  hover.value = Math.min(n.value - 1, Math.max(0, i))
}
const tipStyle = computed(() => {
  if (hover.value < 0) return {}
  const left = (xOf(hover.value) / W.value) * 100
  return { left: `calc(${left}% - 40px)` }
})
</script>

<style scoped>
.trend { position: relative; width: 100%; }
.trend-svg { width: 100%; height: auto; display: block; }
.axis-text { fill: var(--text-3); font-size: 11px; }
.tip {
  position: absolute; top: 10px; background: var(--surface);
  border: 1px solid var(--outline-strong); border-radius: 8px; padding: 8px 10px;
  font-size: 12px; box-shadow: var(--shadow-1); pointer-events: none; min-width: 84px;
}
.tip-title { font-weight: 600; color: var(--text-1); margin-bottom: 4px; }
.tip-row { display: flex; align-items: center; gap: 6px; color: var(--text-2); margin-top: 2px; }
.tip-row b { color: var(--text-1); margin-left: auto; }
.tip .dot { width: 8px; height: 8px; border-radius: 3px; }
.trend-empty {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  color: var(--text-3); font-size: 13px;
}
</style>
