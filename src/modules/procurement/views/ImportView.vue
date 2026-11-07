<template>
  <div class="import-page">
    <PageHeader title="订单批量导入" subtitle="文件在浏览器本地解析，仅结构化数据回传；自动归一封装与参数后再去重匹配">
      <div class="flow">
        <template v-for="(s, i) in steps" :key="s.label">
          <div class="flow-item" :class="s.state">
            <span class="fi-dot">
              <AppIcon v-if="s.state === 'done'" name="check" :size="12" />
              <template v-else>{{ i + 1 }}</template>
            </span>
            <span class="fi-label">{{ s.label }}</span>
          </div>
          <span v-if="i < steps.length - 1" class="flow-line" :class="{ done: s.state === 'done' }" />
        </template>
      </div>
    </PageHeader>

    <!-- 完成回执 -->
    <div v-if="lastSummary" class="card result-card mt-16">
      <div class="rc-icon"><AppIcon name="check" :size="20" /></div>
      <div class="rc-text">
        <div class="rc-title">导入完成</div>
        <div class="rc-sub">
          新建 <b>{{ lastSummary.created }}</b> 种 ·
          并入 <b>{{ lastSummary.matched }}</b> 种
          <template v-if="lastSummary.errors"> · 失败 <b class="err">{{ lastSummary.errors }}</b></template>
        </div>
      </div>
      <div class="row gap-8">
        <n-button size="small" @click="lastSummary = null">继续导入</n-button>
        <n-button size="small" type="primary" @click="goParts">查看元器件</n-button>
      </div>
    </div>

    <!-- 上传 -->
    <div class="card card-pad mt-16">
      <n-upload accept=".xlsx,.xls,.csv" :default-upload="false" :max="1" @change="onFile">
        <n-upload-dragger class="dragger">
          <div class="up-icon"><AppIcon name="import" :size="26" /></div>
          <div class="up-title">点击或拖拽订单文件到此处</div>
          <div class="up-sub">支持 立创 / 贸泽 / 得捷 / 淘宝 1688 / 通用模板，.xlsx .xls .csv</div>
          <div class="up-chips">
            <span class="chip plain">立创商城</span>
            <span class="chip plain">贸泽电子</span>
            <span class="chip plain">得捷电子</span>
            <span class="chip plain">淘宝 / 1688</span>
            <span class="chip plain">通用</span>
          </div>
        </n-upload-dragger>
      </n-upload>

      <div v-if="platform" class="detect">
        <div class="row gap-8">
          <span class="dim" style="font-size: 12.5px">识别平台</span>
          <n-select v-model:value="platform" :options="platOpts" size="small" style="width: 200px" @update:value="buildPlan" />
          <span class="chip green">{{ rawRows.length }} 行</span>
        </div>
        <div class="norm-tip">
          <AppIcon name="spark" :size="13" />
          已自动归一：1608 Metric → 0603，1000nF → 1µF，10k → 10kΩ
        </div>
      </div>
    </div>

    <!-- 导入撤销窗口 -->
    <div v-if="lastBatchId" class="undo-bar card">
      <AppIcon name="clock" :size="16" />
      <span>
        本次导入已提交（批次 <code>{{ lastBatchId }}</code>），
        <b v-if="undoable">{{ undoLeftText }}</b>
        <b v-else>撤销窗口已结束</b>
        内可一键撤销：删除本次新建的器件、批次与流水，不影响导入前的数据。
      </span>
      <span class="flex-1" />
      <n-button size="small" :disabled="!undoable" :loading="undoBusy" @click="confirmUndo">撤销本次导入</n-button>
    </div>

    <!-- 预览 -->
    <div v-if="items.length" class="card table-card mt-16">
      <div class="imp-head">
        <div class="imp-stats">
          <span class="stat-pill"><i class="dot green" />匹配 <b>{{ summary.match }}</b></span>
          <span class="stat-pill"><i class="dot blue" />新建 <b>{{ summary.create }}</b></span>
          <span class="stat-pill"><i class="dot gray" />跳过 <b>{{ summary.skip }}</b></span>
          <span v-if="summary.similar" class="stat-pill warn"><i class="dot amber" />疑似重复 <b>{{ summary.similar }}</b></span>
        </div>
        <div class="imp-actions">
          <span class="dim" style="font-size: 12px">已选 {{ checked.length }} 项 · 金额 ¥{{ totalAmount.toFixed(2) }}</span>
          <n-select v-model:value="defaultLoc" :options="locOptions" placeholder="默认位置" clearable size="small" style="width: 170px" />
          <n-button type="primary" :loading="committing" :disabled="!checked.length" @click="confirmCommit">
            <template #icon><AppIcon name="check" :size="15" /></template>
            确认入库
          </n-button>
        </div>
      </div>
      <n-data-table
        :columns="cols" :data="items" :row-key="(r:any)=>r.index"
        v-model:checked-row-keys="checked" :scroll-x="1040" size="small"
        :bordered="false" :bottom-bordered="false" :pagination="{ pageSize: 50, pageSlot: 5 }"
      />
    </div>

    <!-- 空态：导入能力说明 -->
    <div v-if="!items.length" class="tips mt-16">
      <div v-for="t in tips" :key="t.title" class="tip card">
        <div class="tip-icon"><AppIcon :name="t.icon" :size="18" /></div>
        <div>
          <div class="tip-title">{{ t.title }}</div>
          <div class="tip-desc">{{ t.desc }}</div>
        </div>
      </div>
    </div>

    <!-- 第三方代理占位 -->
    <div class="card card-pad mt-16 proxy">
      <div class="proxy-head">
        <div class="row gap-8">
          <span class="block-title" style="margin: 0">器件信息自动补全</span>
          <span class="chip amber">待接入</span>
        </div>
        <span class="dim" style="font-size: 12px">模块 3.3</span>
      </div>
      <p class="muted">输入平台料号自动拉取参数与规格书链接。当前为占位实现，部署后由边缘函数代理各平台公开接口。</p>
      <div class="row gap-8" style="flex-wrap: wrap">
        <n-select v-model:value="infoPlatform" :options="platOpts" size="small" style="width: 170px" />
        <n-input v-model:value="infoSku" placeholder="料号，如 C12345" size="small" style="width: 190px" @keyup.enter="queryInfo" />
        <n-button size="small" @click="queryInfo" :loading="infoLoading">查询</n-button>
      </div>
      <n-alert v-if="infoMsg" type="warning" :bordered="false" style="margin-top: 12px">{{ infoMsg }}</n-alert>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, h, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  NUpload, NUploadDragger, NSelect, NButton, NDataTable, NAlert, NTag, NInput, useDialog, useMessage
} from 'naive-ui'
import { api } from '@/shared/api'
import { mapRow, detectPlatform, PLATFORMS } from '@server/domain/import-map.js'
import AppIcon from '@/shared/ui/AppIcon.vue'
import PageHeader from '@/shared/ui/PageHeader.vue'
import { emitDataChanged } from '@/shared/utils/events'
import type { Location } from '@/shared/api/types'

const message = useMessage()
const dialog = useDialog()
const router = useRouter()
const platform = ref('')
const rawRows = ref<any[]>([])
const items = ref<any[]>([])
const summary = ref<any>({ match: 0, create: 0, skip: 0, similar: 0 })
const checked = ref<(string | number)[]>([])
const defaultLoc = ref<string | null>(null)
const committing = ref(false)
const lastSummary = ref<any>(null)
const lastBatchId = ref<string | null>(null)
const batchAt = ref(0)
const clock = ref(Date.now())
const undoBusy = ref(false)
let clockTimer: ReturnType<typeof setInterval> | null = null
const undoRemaining = computed(() => Math.max(0, 10 * 60 * 1000 - (clock.value - batchAt.value)))
const undoable = computed(() => !!lastBatchId.value && undoRemaining.value > 0)
const undoLeftText = computed(() => {
  const total = Math.ceil(undoRemaining.value / 1000)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
})
onBeforeUnmount(() => { if (clockTimer) clearInterval(clockTimer) })

const locations = ref<Location[]>([])
const locOptions = computed(() => locations.value.map((l) => ({ label: l.name + ' (' + l.code + ')', value: l.id })))
const platOpts = PLATFORMS.map((p) => ({ label: p.label, value: p.id }))

const steps = computed(() => {
  const uploaded = rawRows.value.length > 0
  const preview = items.value.length > 0
  return [
    { label: '上传文件', state: uploaded ? 'done' : 'active' },
    { label: '校验匹配', state: preview ? 'active' : '' },
    { label: '确认入库', state: '' }
  ]
})

const totalAmount = computed(() => {
  let sum = 0
  for (const it of items.value) {
    if (!checked.value.includes(it.index)) continue
    sum += (Number(it.row?.quantity) || 0) * (Number(it.row?.unitPrice) || 0)
  }
  return sum
})

const tips = [
  { icon: 'scan', title: '自动识别平台', desc: '按导出文件的列名识别立创 / 贸泽 / 得捷 / 淘宝，识别结果可手动切换' },
  { icon: 'spark', title: '字段自动归一', desc: '封装 1608 Metric → 0603、容值 1000nF → 1µF，避免同料重复建档' },
  { icon: 'layers', title: '三级去重匹配', desc: '料号 → 型号+封装 → 参数+封装；疑似重复不自动合并，由你确认' }
]

const cols: any[] = [
  { type: 'selection' },
  {
    title: '处理', key: 'action', width: 76,
    render: (r: any) => h('span', {
      class: r.action === 'create' ? 'chip' : r.action === 'match' ? 'chip green' : 'chip gray'
    }, r.action === 'create' ? '新建' : r.action === 'match' ? '匹配' : '跳过')
  },
  {
    title: '校验', key: 'check', width: 128,
    render: (r: any) => {
      if (r.similar) {
        return h('div', { style: 'display:flex;align-items:center;gap:6px' }, [
          h(NTag, { type: 'warning', size: 'small', bordered: false, title: r.similar.detail }, { default: () => '疑似重复' }),
          h(NButton, {
            size: 'tiny', text: true, type: 'primary',
            onClick: () => mergeSimilar(r)
          }, { default: () => '并入' })
        ])
      }
      if (r.action === 'create' && !r.row?.package) {
        return h(NTag, { size: 'small', bordered: false }, { default: () => '缺封装' })
      }
      return h('span', { style: 'color:var(--text-3);font-size:12px' }, r.matchedBy || '—')
    }
  },
  {
    title: '名称', key: 'name', width: 210,
    render: (r: any) => h('div', {}, [
      h('div', { class: 'cell-main' }, r.partName || r.row?.name),
      r.row?.orderNo ? h('div', { class: 'cell-sub mono' }, r.row.orderNo) : null
    ])
  },
  { title: '型号', key: 'm', width: 120, render: (r: any) => (r.row?.manufacturerModel ? h('span', { class: 'mono' }, r.row.manufacturerModel) : '—') },
  { title: '封装', key: 'pkg', width: 78, render: (r: any) => (r.row?.package ? h('span', { class: 'mono' }, r.row.package) : '—') },
  {
    title: '识别参数', key: 'params', width: 160,
    render: (r: any) => {
      const p: Record<string, string> = r.row?.params || {}
      const txt = Object.values(p).filter(Boolean).join(' · ')
      return txt || '—'
    }
  },
  { title: '数量', key: 'qty', width: 66, render: (r: any) => h('b', {}, String(r.row?.quantity ?? 0)) },
  { title: '单价', key: 'p', width: 76, render: (r: any) => '¥' + (r.row?.unitPrice || 0) },
  { title: '平台料号', key: 'sku', width: 100, render: (r: any) => r.row?.sku || '—' },
  {
    title: '存放位置', key: 'loc', width: 160,
    render: (r: any) => h(NSelect, {
      size: 'small', clearable: true, options: locOptions.value,
      value: r._loc ?? defaultLoc.value, placeholder: '默认',
      'onUpdate:value': (v: string) => { r._loc = v }
    })
  }
]

function mergeSimilar(r: any) {
  if (!r.similar) return
  r.action = 'match'
  r.partId = r.similar.partId
  r.partName = r.similar.partName
  r.matchedBy = '参数+封装（手动确认）'
  recount()
  if (!checked.value.includes(r.index)) checked.value.push(r.index)
  message.success(`已并入「${r.similar.partName}」`)
}

function recount() {
  const s: any = { match: 0, create: 0, skip: 0, similar: 0 }
  for (const it of items.value) {
    s[it.action] = (s[it.action] || 0) + 1
    if (it.similar) s.similar++
  }
  summary.value = s
}

async function onFile(o: any) {
  const file = o?.file?.file as File
  if (!file) return
  try {
    const buf = await file.arrayBuffer()
    const XLSX = await import('xlsx')
    const wb = XLSX.read(new Uint8Array(buf), { type: 'array' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' })
    if (!rows.length) { message.warning('文件为空'); return }
    rawRows.value = rows
    platform.value = detectPlatform(Object.keys(rows[0]))
    await buildPlan()
  } catch (e: any) { message.error('解析失败：' + e.message) }
}

async function buildPlan() {
  const mapped = rawRows.value.map((r) => mapRow(platform.value, r))
  const plan: any = await api.importPlan(mapped)
  items.value = plan.items
  summary.value = plan.summary
  checked.value = plan.items.filter((i: any) => i.action !== 'skip').map((i: any) => i.index)
}

function confirmCommit() {
  if (!checked.value.length) return
  const picked = items.value.filter((it) => checked.value.includes(it.index) && it.action !== 'skip')
  const creates = picked.filter((it) => it.action === 'create').length
  const matches = picked.filter((it) => it.action === 'match').length
  const loc = defaultLoc.value
    ? locOptions.value.find((o) => o.value === defaultLoc.value)?.label || '已选位置'
    : '未指定（入库后需再分配库位）'
  dialog.warning({
    title: '确认入库？',
    content: () => h('div', { style: 'font-size:13px;line-height:1.9' }, [
      h('p', { style: 'margin:0 0 6px' }, `将写入 ${picked.length} 行：新建 ${creates} 个器件，匹配入库 ${matches} 行。`),
      h('p', { style: 'margin:0 0 6px' }, `合计金额约 ¥${totalAmount.value.toFixed(2)}；默认库位：${loc}。`),
      h('p', { style: 'margin:0;color:#d97706' }, '提交后会立即写入库存流水；10 分钟内可在结果栏一键撤销本次导入。')
    ]),
    positiveText: '确认入库',
    negativeText: '再检查一下',
    onPositiveClick: doCommit
  })
}

async function doCommit() {
  committing.value = true
  try {
    const out = items.value.map((it) => ({
      ...it,
      locationId: it._loc || defaultLoc.value || null,
      action: checked.value.includes(it.index) ? it.action : 'skip'
    }))
    const r: any = await api.importCommit(out)
    if (r.batchId) {
      lastBatchId.value = r.batchId
      batchAt.value = Date.now()
      clock.value = batchAt.value
      if (clockTimer) clearInterval(clockTimer)
      clockTimer = setInterval(() => { clock.value = Date.now() }, 1000)
    }
    if (r.ok) {
      lastSummary.value = r.summary
      message.success(`导入完成：新建 ${r.summary.created}，匹配 ${r.summary.matched}`)
      items.value = []; rawRows.value = []; platform.value = ''
    } else {
      const errors = r.errors || []
      const detail = errors.slice(0, 2).map((e: any) => `第 ${Number(e.index) + 1} 行：${e.msg}`).join('；')
      lastSummary.value = r.summary
      message.error(`有 ${r.summary?.errors ?? errors.length} 行失败${detail ? '：' + detail : ''}；已成功的行不会回滚，请到元器件页核对`)
      if (errors.length) console.warn('[import] 失败明细', errors)
    }
  } catch (e: any) { message.error(e.message) }
  finally { committing.value = false }
}


async function confirmUndo() {
  if (!lastBatchId.value || !undoable.value) return
  const id = lastBatchId.value
  dialog.warning({
    title: '撤销本次导入？',
    content: `将删除本次导入新建的器件、库存批次与流水（批次 ${id}）。导入前已存在的数据不受影响，操作不可恢复。`,
    positiveText: '确认撤销',
    negativeText: '取消',
    onPositiveClick: async () => {
      undoBusy.value = true
      try {
        const r: any = await api.importUndo(id)
        message.success(`已撤销：${r.removed.parts} 个器件 / ${r.removed.stocks} 个批次 / ${r.removed.transactions} 条流水`)
        lastBatchId.value = null
        emitDataChanged()
      } catch (e: any) { message.error(e.message || '撤销失败') }
      finally { undoBusy.value = false }
    }
  })
}

function goParts() { router.push({ name: 'parts' }) }

/* 第三方代理占位查询 */
const infoPlatform = ref('lcsc')
const infoSku = ref('')
const infoMsg = ref('')
const infoLoading = ref(false)
async function queryInfo() {
  if (!infoSku.value.trim()) { message.warning('请输入料号'); return }
  infoLoading.value = true; infoMsg.value = ''
  try {
    const r: any = await api.partInfo(infoPlatform.value, infoSku.value)
    infoMsg.value = r.message || '无数据'
  } catch (e: any) { infoMsg.value = e.message }
  finally { infoLoading.value = false }
}

onMounted(async () => { try { locations.value = await api.listLocations() } catch {} })
</script>

<style scoped>
.undo-bar {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 12px 16px; margin-bottom: 16px; font-size: 12.5px; color: var(--text-2);
  border-left: 3px solid var(--secondary);
}
.undo-bar code { font-family: var(--mono); color: var(--text-1); }
.undo-bar b { color: var(--primary); font-family: var(--mono); }

.import-page { max-width: 1400px; margin: 0 auto; }

/* 流程指示 */
.flow { display: flex; align-items: center; gap: 8px; }
.flow-item { display: flex; align-items: center; gap: 6px; color: var(--text-3); font-size: 12.5px; }
.fi-dot {
  width: 19px; height: 19px; border-radius: 50%; flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 700;
  background: var(--surface-3); color: var(--text-3);
}
.flow-item.active { color: var(--text-1); font-weight: 600; }
.flow-item.active .fi-dot { background: var(--primary); color: #fff; box-shadow: 0 0 0 4px var(--primary-soft); }
.flow-item.done { color: var(--text-2); }
.flow-item.done .fi-dot { background: rgba(20, 184, 166, .16); color: var(--secondary); }
.flow-line { width: 26px; height: 1.5px; background: var(--outline-strong); border-radius: 2px; }
.flow-line.done { background: rgba(20, 184, 166, .5); }

/* 拖拽区 */
.dragger {
  display: block; padding: 30px 16px !important;
  border-radius: 10px !important;
  border: 1.5px dashed var(--outline-strong) !important;
  background: var(--surface-2) !important;
  transition: border-color .18s var(--ease), background-color .18s var(--ease) !important;
}
.dragger:hover { border-color: var(--primary) !important; background: var(--primary-softer) !important; }
.up-icon {
  width: 48px; height: 48px; border-radius: 14px; margin: 0 auto;
  background: var(--primary-soft); color: var(--primary);
  display: flex; align-items: center; justify-content: center;
}
.up-title { margin-top: 10px; font-weight: 650; font-size: 14px; }
.up-sub { color: var(--text-3); font-size: 12px; margin-top: 3px; }
.up-chips { display: flex; gap: 6px; justify-content: center; flex-wrap: wrap; margin-top: 12px; }

.detect {
  margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--outline);
  display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
}
.norm-tip { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-3); }

/* 预览头 */
.table-card { overflow: hidden; }
.imp-head {
  display: flex; justify-content: space-between; align-items: center;
  padding: 13px 16px; border-bottom: 1px solid var(--outline);
  flex-wrap: wrap; gap: 12px;
}
.imp-stats { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.stat-pill {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 12.5px; color: var(--text-2);
  background: var(--surface-2); border: 1px solid var(--outline);
  border-radius: 7px; padding: 2px 9px;
}
.stat-pill b { color: var(--text-1); font-weight: 700; }
.stat-pill .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--text-3); }
.stat-pill .dot.green { background: var(--secondary); }
.stat-pill .dot.blue { background: var(--primary); }
.stat-pill .dot.amber { background: var(--warning); }
.stat-pill.warn { border-color: rgba(245, 158, 11, .35); background: rgba(245, 158, 11, .07); }
.imp-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }

/* 结果回执 */
.result-card {
  display: flex; align-items: center; gap: 14px; padding: 14px 18px;
  border-color: rgba(20, 184, 166, .35); background: rgba(20, 184, 166, .06);
}
.rc-icon {
  width: 38px; height: 38px; border-radius: 11px; flex-shrink: 0;
  background: rgba(20, 184, 166, .16); color: var(--secondary);
  display: flex; align-items: center; justify-content: center;
}
.rc-text { flex: 1; min-width: 0; }
.rc-title { font-weight: 700; font-size: 14px; }
.rc-sub { font-size: 12.5px; color: var(--text-2); margin-top: 1px; }
.rc-sub b { color: var(--text-1); }
.rc-sub b.err { color: var(--accent); }

/* 导入能力说明 */
.tips { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.tip { display: flex; gap: 12px; padding: 15px 16px; align-items: flex-start; }
.tip-icon {
  width: 34px; height: 34px; border-radius: 10px; flex-shrink: 0;
  background: var(--surface-3); color: var(--text-2);
  display: flex; align-items: center; justify-content: center;
}
.tip-title { font-weight: 650; font-size: 13.5px; }
.tip-desc { font-size: 12px; color: var(--text-3); margin-top: 3px; line-height: 1.6; }

/* 第三方 */
.proxy { border-style: dashed; }
.proxy-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; gap: 8px; }
.block-title { font-weight: 700; font-size: 14px; margin-bottom: 8px; }
.muted { color: var(--text-2); font-size: 12.5px; margin: 0 0 12px; line-height: 1.6; }

@media (max-width: 900px) {
  .tips { grid-template-columns: 1fr; }
}
@media (max-width: 720px) {
  .flow { width: 100%; }
  .fi-label { font-size: 11.5px; }
  .flow-line { width: 14px; }
  .imp-actions { width: 100%; }
  .imp-actions :deep(.n-select) { flex: 1; }
}
</style>
