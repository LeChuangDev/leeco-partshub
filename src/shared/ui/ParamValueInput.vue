<template>
  <div class="pv">
    <n-auto-complete
      :value="value ?? ''"
      :options="options"
      :get-show="alwaysShow"
      :render-label="renderLabel"
      :placeholder="placeholder"
      clearable
      @update:value="onUpdate"
    />
    <div v-if="hint" class="pv-hint">{{ hint }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed, h } from 'vue'
import { NAutoComplete } from 'naive-ui'
import { describeParamValue, suggestParamValues } from '@server/domain/param-suggest.js'
import type { ParamField } from '@/shared/api/types'

const props = withDefaults(defineProps<{
  value?: string | null
  param: ParamField
  limit?: number
}>(), { value: '', limit: 12 })

const emit = defineEmits<{ (e: 'update:value', value: string): void }>()

// 聚焦即展示常用值（即使输入为空），选中后直接填入标准工程写法
const alwaysShow = () => true

const suggestions = computed(() => suggestParamValues(props.param, props.value || '', props.limit))
const options = computed(() =>
  suggestions.value.map((value) => ({
    label: value,
    value,
    hint: describeParamValue(props.param, value)
  }))
)
const hint = computed(() => describeParamValue(props.param, props.value || ''))
const placeholder = computed(() => {
  const first = suggestions.value[0]
  return first ? `如 ${first}` : props.param.label
})

function onUpdate(value: string | null) {
  emit('update:value', value || '')
}

function renderLabel(option: any) {
  return h('div', { class: 'pv-opt' }, [
    h('span', { class: 'pv-opt-value' }, option.label),
    option.hint ? h('span', { class: 'pv-opt-hint' }, option.hint) : null
  ])
}
</script>

<style scoped>
.pv-hint {
  margin-top: 2px;
  padding-left: 2px;
  font-size: 11px;
  line-height: 1.4;
  color: var(--text-3);
}
:deep(.pv-opt) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
:deep(.pv-opt-value) {
  font-variant-numeric: tabular-nums;
}
:deep(.pv-opt-hint) {
  font-size: 11px;
  color: var(--text-3);
}
</style>
