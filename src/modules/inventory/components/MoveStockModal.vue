<template>
  <n-modal
    :show="show"
    preset="card"
    style="width: 448px; max-width: 94vw"
    :mask-closable="!loading"
    @update:show="(v: boolean) => emit('update:show', v)"
  >
    <template #header>
      <div class="mv-head">
        <span class="mv-icon"><AppIcon name="move" :size="17" /></span>
        移动存放位置
      </div>
    </template>

    <div class="mv-target">
      <div class="mv-name">{{ partName || '当前元器件' }}</div>
      <div class="mv-meta">{{ summary }}</div>
    </div>

    <label class="mv-field">
      <span>目标位置</span>
      <n-select
        v-model:value="locId"
        :options="locOptions"
        placeholder="选择目标位置（可清空为未指定）"
        filterable
        clearable
        :loading="busy"
      />
    </label>
    <p class="mv-hint">
      <AppIcon name="info" :size="13" />
      只调整批次的存放位置，不改变库存数量，也不会产生出入库流水。
    </p>

    <template #footer>
      <n-space justify="end">
        <n-button @click="emit('update:show', false)">取消</n-button>
        <n-button type="primary" :loading="loading" :disabled="!ready" @click="submit">确认移动</n-button>
      </n-space>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { NModal, NSelect, NButton, NSpace, useMessage } from 'naive-ui'
import { api } from '@/shared/api'
import type { Location, Stock } from '@/shared/api/types'
import AppIcon from '@/shared/ui/AppIcon.vue'

const props = defineProps<{
  show: boolean
  partId: string | null
  partName?: string
  locations: Location[]
  stockId?: string | null
  stockLabel?: string
}>()
const emit = defineEmits<{ (e: 'update:show', v: boolean): void; (e: 'done'): void }>()
const message = useMessage()

const locId = ref<string | null>(null)
const batches = ref<Stock[]>([])
const loading = ref(false)
const busy = ref(false)

function pathOf(l: Location) {
  const names: string[] = []
  let cur: Location | undefined = l
  let guard = 0
  while (cur && guard++ < 12) {
    names.unshift(cur.name)
    cur = props.locations.find((x) => x.id === cur!.parentId)
  }
  return names.join(' / ')
}
const locOptions = computed(() =>
  props.locations
    .map((l) => ({ label: `${pathOf(l)}${l.code ? `（${l.code}）` : ''}`, value: l.id }))
    .sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'))
)
const targets = computed(() => (props.stockId ? batches.value.filter((b) => b.id === props.stockId) : batches.value))
const summary = computed(() => {
  if (props.stockLabel) return props.stockLabel
  const n = targets.value.length
  const qty = targets.value.reduce((s, b) => s + (Number(b.quantity) || 0), 0)
  if (!n) return '没有可移动的库存批次'
  return props.stockId ? `当前批次 · ${qty} 件` : `全部 ${n} 个批次 · 共 ${qty} 件`
})
const ready = computed(() => targets.value.length > 0)

watch(() => props.show, async (v) => {
  if (!v) return
  locId.value = null
  batches.value = []
  if (!props.partId) return
  busy.value = true
  try {
    batches.value = await api.listStock(props.partId)
    if (!props.stockId && batches.value.length) locId.value = batches.value[0].locationId || null
    if (props.stockId) {
      const one = batches.value.find((b) => b.id === props.stockId)
      locId.value = one?.locationId || null
    }
  } catch (e: any) {
    message.error(e.message)
  } finally {
    busy.value = false
  }
})

async function submit() {
  if (!props.partId) return
  loading.value = true
  try {
    const r = await api.moveStock({ partId: props.partId, locationId: locId.value, stockId: props.stockId || undefined })
    message.success(r.unchanged ? '位置未变化' : `已移动 ${r.moved} 个批次`)
    emit('update:show', false)
    emit('done')
  } catch (e: any) {
    message.error(e.message)
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.mv-head { display: flex; align-items: center; gap: 9px; font-weight: 700; font-size: 15px; }
.mv-icon {
  width: 30px; height: 30px; border-radius: 9px; flex-shrink: 0;
  background: var(--primary-soft); color: var(--primary);
  display: inline-flex; align-items: center; justify-content: center;
}
.mv-target {
  padding: 12px 14px; border-radius: 10px; background: var(--surface-2);
  border: 1px solid var(--outline); margin-bottom: 16px;
}
.mv-name { font-weight: 700; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mv-meta { font-size: 12px; color: var(--text-2); margin-top: 2px; }
.mv-field { display: flex; flex-direction: column; gap: 6px; }
.mv-field > span { font-size: 12px; font-weight: 600; color: var(--text-2); }
.mv-hint {
  display: flex; align-items: flex-start; gap: 6px; margin: 12px 0 0;
  font-size: 11.5px; color: var(--text-3); line-height: 1.6;
}
.mv-hint > :deep(.app-icon) { margin-top: 2px; }
</style>
