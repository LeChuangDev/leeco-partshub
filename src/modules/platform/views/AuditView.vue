<template>
  <div class="audit-page">
    <PageHeader title="操作日志" subtitle="入库、出库、移库、导入与恢复五类操作留痕，按时间 / 动作 / 来源 / 器件检索" />

    <div class="audit-bar card mt-16">
      <n-select v-model:value="action" :options="actionOptions" placeholder="全部动作" clearable size="small" style="width: 160px" />
      <n-select v-model:value="source" :options="sourceOptions" placeholder="全部来源" clearable size="small" style="width: 150px" />
      <n-input v-model:value="keyword" placeholder="搜索器件 / 批次 / 单号" clearable size="small" style="width: 220px">
        <template #prefix><AppIcon name="search" :size="14" /></template>
      </n-input>
      <n-button size="small" secondary :loading="loading" @click="load">
        <template #icon><AppIcon name="refresh" :size="14" /></template>
        刷新
      </n-button>
      <span class="flex-1" />
      <span class="chip gray">共 {{ events.length }} 条</span>
      <span class="chip green">入库 {{ countOf('stock.in') }}</span>
      <span class="chip red">出库 {{ countOf('stock.out') }}</span>
    </div>

    <div class="card audit-table mt-16">
      <n-data-table
        :columns="columns" :data="events" :loading="loading" size="small"
        :row-key="(r: AuditEvent) => r.id" :bordered="false" :bottom-bordered="false"
        :scroll-x="1000" :pagination="{ pageSize: 50, pageSlot: 5 }"
      />
      <div v-if="!loading && !events.length" class="audit-empty">
        <AppIcon name="clock" :size="26" />
        <p>暂无匹配的操作记录</p>
        <span>完成一次入库、出库或导入后，这里会自动出现记录。</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { h, onMounted, ref, watch } from 'vue'
import { NButton, NDataTable, NInput, NSelect, NTag, useMessage } from 'naive-ui'
import { api } from '@/shared/api'
import { AUDIT_ACTIONS, AUDIT_SOURCES } from '@server/domain/audit.js'
import type { AuditEvent } from '@/shared/api/types'
import AppIcon from '@/shared/ui/AppIcon.vue'
import PageHeader from '@/shared/ui/PageHeader.vue'

const message = useMessage()
const loading = ref(false)
const events = ref<AuditEvent[]>([])
const action = ref<string | null>(null)
const source = ref<string | null>(null)
const keyword = ref('')

const actionOptions = Object.entries(AUDIT_ACTIONS).map(([value, label]) => ({ label, value }))
const sourceOptions = Object.entries(AUDIT_SOURCES).map(([value, label]) => ({ label, value }))

function countOf(a: string) {
  return events.value.filter((e) => e.action === a).length
}

function timeText(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('zh-CN', { hour12: false })
}

function qtyText(row: AuditEvent) {
  if (!['stock.in', 'stock.out'].includes(row.action)) return '—'
  if (row.beforeQty == null || row.afterQty == null) return row.quantity ? `${row.quantity} 件` : '—'
  const delta = row.afterQty - row.beforeQty
  const sign = delta > 0 ? '+' : ''
  return `${row.beforeQty} → ${row.afterQty}（${sign}${delta}）`
}

const tagType: Record<string, 'success' | 'warning' | 'error' | 'info' | 'default'> = {
  'stock.in': 'success', 'stock.out': 'warning', 'stock.move': 'info',
  'import.commit': 'info', 'import.undo': 'warning', 'backup.restore': 'error'
}

const columns = [
  { title: '时间', key: 'createdAt', width: 170, render: (r: AuditEvent) => h('span', { class: 'mono' }, timeText(r.createdAt)) },
  {
    title: '动作', key: 'action', width: 110,
    render: (r: AuditEvent) => h(NTag, { size: 'small', round: true, type: tagType[r.action] || 'default', bordered: false },
      { default: () => AUDIT_ACTIONS[r.action as keyof typeof AUDIT_ACTIONS] || r.action })
  },
  {
    title: '来源', key: 'source', width: 100,
    render: (r: AuditEvent) => h('span', { class: 'dim' }, AUDIT_SOURCES[r.source as keyof typeof AUDIT_SOURCES] || r.source)
  },
  { title: '器件', key: 'partName', minWidth: 160, ellipsis: { tooltip: true as const }, render: (r: AuditEvent) => r.partName || '—' },
  { title: '库存变化', key: 'qty', width: 140, render: (r: AuditEvent) => h('span', { class: 'mono' }, qtyText(r)) },
  {
    title: '批次 / 单号', key: 'batchId', width: 180, ellipsis: { tooltip: true as const },
    render: (r: AuditEvent) => h('span', { class: 'mono dim' }, r.batchId || r.orderNo || '—')
  },
  { title: '说明', key: 'detail', minWidth: 200, ellipsis: { tooltip: true as const }, render: (r: AuditEvent) => r.detail || r.reason || '—' },
  { title: '操作人', key: 'operator', width: 100, render: (r: AuditEvent) => h('span', { class: 'dim' }, r.operator || 'system') }
]

let timer: ReturnType<typeof setTimeout> | null = null
watch([action, source, keyword], () => {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => load(), 220)
})

async function load() {
  loading.value = true
  try {
    events.value = await api.auditList(auditParams())
  } catch (e: any) {
    message.error('操作日志加载失败：' + (e?.message || e))
    events.value = []
  } finally {
    loading.value = false
  }
}

// 过滤参数是 ref，传给 API 前展开为普通值
function auditParams() {
  return {
    action: action.value || undefined,
    source: source.value || undefined,
    q: keyword.value.trim() || undefined,
    limit: 500
  }
}

onMounted(() => load())
</script>

<style scoped>
.audit-bar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 12px 16px; }
.audit-table { padding: 8px 8px 12px; min-height: 220px; position: relative; }
.audit-empty {
  position: absolute; inset: 0; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 6px; color: var(--text-3);
  background: var(--surface); border-radius: 10px;
}
.audit-empty p { margin: 4px 0 0; font-size: 13px; color: var(--text-2); }
.audit-empty span { font-size: 12px; }

@media (max-width: 720px) {
  .audit-bar .n-input { width: 100% !important; }
  .audit-bar .n-select { flex: 1; min-width: 130px; }
}
</style>
