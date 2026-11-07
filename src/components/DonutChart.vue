<template>
  <div class="donut-wrap">
    <svg :viewBox="`0 0 ${size} ${size}`" :width="size" :height="size" class="donut">
      <circle :cx="c" :cy="c" :r="radius" fill="none" :stroke="track" :stroke-width="stroke" />
      <g v-if="hasData">
        <circle
          v-for="(seg, i) in segments"
          :key="i"
          :cx="c" :cy="c" :r="radius"
          fill="none"
          :stroke="seg.color"
          :stroke-width="stroke"
          :stroke-dasharray="`${seg.len} ${circumference}`"
          :stroke-dashoffset="seg.offset"
          transform="rotate(-90)"
          :transform-origin="`${c} ${c}`"
          stroke-linecap="butt"
        />
      </g>
    </svg>
    <div v-if="hasData" class="donut-center">
      <div class="dc-val">{{ total }}</div>
      <div class="dc-label">{{ centerLabel }}</div>
    </div>
    <div v-else class="donut-center">
      <div class="dc-val">0</div>
      <div class="dc-label">暂无数据</div>
    </div>
  </div>
  <ul class="legend">
    <li v-for="(item, i) in legend" :key="i">
      <span class="dot" :style="{ background: item.color }" />
      <span class="lg-name" :title="item.name">{{ item.name }}</span>
      <span class="lg-val">{{ item.value }}</span>
    </li>
    <li v-if="!legend.length" class="empty">暂无分布数据</li>
  </ul>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { DistItem } from '../api/types'

const props = defineProps<{
  data: DistItem[]
  centerLabel?: string
  size?: number
  maxLegend?: number
}>()

const size = props.size ?? 150
const stroke = 16
const radius = (size - stroke) / 2
const c = size / 2
const circumference = 2 * Math.PI * radius

// 配色板（主题无关，保证深浅背景都清晰）
const PALETTE = [
  '#5b6cff', '#14b8a6', '#f59e0b', '#f43f5e', '#8b5cf6',
  '#0ea5e9', '#22c55e', '#ec4899', '#a16207', '#64748b'
]

const total = computed(() => (props.data || []).reduce((s, d) => s + d.value, 0))
const hasData = computed(() => total.value > 0)

const segments = computed(() => {
  let offset = 0
  return (props.data || []).map((d, i) => {
    const frac = total.value ? d.value / total.value : 0
    const len = frac * circumference
    const seg = { len, offset, color: PALETTE[i % PALETTE.length] }
    offset += len
    return seg
  })
})

const legend = computed(() => {
  const max = props.maxLegend ?? 8
  return (props.data || []).slice(0, max).map((d, i) => ({
    name: d.name,
    value: d.value,
    color: PALETTE[i % PALETTE.length]
  }))
})

const track = computed(() => 'var(--outline-strong)')
</script>

<style scoped>
.donut-wrap { position: relative; width: 150px; height: 150px; flex: 0 0 auto; }
.donut { display: block; }
.donut-center {
  position: absolute; inset: 0; display: flex; flex-direction: column;
  align-items: center; justify-content: center; pointer-events: none;
}
.dc-val { font-size: 22px; font-weight: 700; color: var(--text-1); }
.dc-label { font-size: 12px; color: var(--text-3); margin-top: 2px; }
.legend {
  list-style: none; margin: 0; padding: 0; flex: 1;
  display: flex; flex-direction: column; gap: 6px; font-size: 12px;
  max-height: 150px; overflow: auto;
}
.legend li { display: flex; align-items: center; gap: 8px; }
.legend .dot { width: 9px; height: 9px; border-radius: 3px; flex: 0 0 auto; }
.legend .lg-name { flex: 1; color: var(--text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.legend .lg-val { color: var(--text-1); font-weight: 600; }
.legend .empty { color: var(--text-3); }
</style>
