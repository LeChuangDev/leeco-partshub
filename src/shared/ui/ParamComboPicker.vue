<template>
  <div v-if="combos.length" class="pcombo">
    <div class="pcombo-head">
      <AppIcon class="pcombo-icon" name="spark" :size="13" />
      <span class="pcombo-title">常用规格</span>
      <span class="pcombo-hint">点选一次填入全部参数</span>
    </div>
    <div class="pcombo-list">
      <button
        v-for="combo in displayCombos"
        :key="combo.key"
        type="button"
        class="pcombo-chip"
        :class="{ 'pcombo-chip--active': isActive(combo) }"
        :title="combo.label"
        @click="emit('apply', combo.values)"
      >
        <AppIcon v-if="isActive(combo)" class="pcombo-check" name="check" :size="12" />
        <span class="pcombo-main">{{ combo.main }}</span>
        <span v-if="combo.rest" class="pcombo-rest">{{ combo.rest }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from '@/shared/ui/AppIcon.vue'
import { suggestParamCombos } from '@server/domain/param-suggest.js'
import type { ParamField } from '@/shared/api/types'

const props = withDefaults(defineProps<{
  template: ParamField[]
  params: Record<string, string>
  query?: string
  limit?: number
}>(), { query: '', limit: 10 })

const emit = defineEmits<{ (e: 'apply', values: Record<string, string>): void }>()

const combos = computed(() => suggestParamCombos(props.template, props.params, props.limit, props.query))
// 主规格（阻值/容值）加粗突出，其余精度/耐压等作为次要信息
const displayCombos = computed(() =>
  combos.value.map((combo) => {
    const [main, ...rest] = combo.label.split(/\s+/)
    return { ...combo, main, rest: rest.join(' ') }
  })
)

// 当前参数与该规格完全一致时高亮，便于确认点选已生效
function isActive(combo: { values: Record<string, string> }) {
  return Object.entries(combo.values).every(
    ([key, value]) => String(props.params?.[key] ?? '').trim() === String(value)
  )
}
</script>

<style scoped>
.pcombo {
  margin-top: 10px;
  padding: 9px 11px 10px;
  background: var(--surface-2);
  border: 1px solid var(--outline);
  border-radius: 10px;
}
.pcombo-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  line-height: 1;
}
.pcombo-icon {
  color: var(--primary);
}
.pcombo-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-1);
}
.pcombo-hint {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-3);
  white-space: nowrap;
}
.pcombo-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.pcombo-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  padding: 0 10px;
  border: 1px solid var(--outline);
  border-radius: 7px;
  background: var(--surface);
  color: var(--text-2);
  font-family: inherit;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  transition: border-color .15s var(--ease), color .15s var(--ease),
    background-color .15s var(--ease), box-shadow .15s var(--ease), transform .15s var(--ease);
}
.pcombo-chip:hover {
  border-color: var(--primary);
  background: var(--primary-soft);
  box-shadow: var(--shadow-1);
  transform: translateY(-1px);
}
.pcombo-chip:focus-visible {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 2px var(--primary-soft);
}
.pcombo-main {
  font-weight: 600;
  color: var(--text-1);
}
.pcombo-rest {
  color: var(--text-3);
}
.pcombo-chip:hover .pcombo-main,
.pcombo-chip:hover .pcombo-rest {
  color: var(--primary);
}
.pcombo-chip--active {
  border-color: var(--primary);
  background: var(--primary-soft);
  box-shadow: inset 0 0 0 1px var(--primary-soft);
}
.pcombo-chip--active .pcombo-main,
.pcombo-chip--active .pcombo-rest,
.pcombo-check {
  color: var(--primary);
}
.pcombo-check {
  margin-left: -2px;
  flex-shrink: 0;
}
</style>
