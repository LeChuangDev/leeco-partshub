<template>
  <div class="page">
    <PageHeader title="BOM 齐套" :subtitle="hasResult ? summarySub : '粘贴 BOM，自动比对库存，生成缺料清单并一键出库'">
      <template v-if="hasResult">
        <n-button quaternary size="small" @click="reset">
          <template #icon><AppIcon name="refresh" :size="15" /></template>
          重新导入
        </n-button>
        <n-button quaternary size="small" @click="exportShortage">
          <template #icon><AppIcon name="download" :size="15" /></template>
          导出缺料
        </n-button>
        <n-button quaternary size="small" @click="openSaveProject">
          <template #icon><AppIcon name="project" :size="15" /></template>
          保存为项目
        </n-button>
        <n-button type="primary" size="small" :disabled="!readyLines.length && !shortRows.length" @click="openConsume">
          <template #icon><AppIcon name="box" :size="15" /></template>
          一键出库
        </n-button>
      </template>
    </PageHeader>

    <!-- 导入区 -->
    <div v-if="!hasResult" class="import-wrap mt-16">
      <div class="card paste-card">
        <div class="paste-head">
          <div>
            <div class="block-title" style="margin: 0">粘贴 BOM</div>
            <div class="dim" style="font-size: 12px">从 Excel / WPS / KiCad 直接复制整块表格</div>
          </div>
          <div class="row gap-8">
            <n-button size="small" @click="pickFile">
              <template #icon><AppIcon name="upload" :size="14" /></template>
              上传 Excel / CSV
            </n-button>
            <n-button size="small" quaternary @click="loadSample">载入示例</n-button>
          </div>
        </div>
        <n-input
          v-model:value="bomText"
          type="textarea"
          placeholder="位号&#9;型号&#9;封装&#9;数量&#10;R1,R2&#9;RC0603FR-0710KL&#9;0603&#9;2"
          :autosize="{ minRows: 11, maxRows: 18 }"
          class="paste-area"
        />
        <div class="paste-foot">
          <span class="dim hint-line">
            自动识别「位号 / 型号 / 名称 / 封装 / 数量」列，无表头时按列序推断；封装与单位会自动归一
          </span>
          <n-button type="primary" :disabled="!bomText.trim()" :loading="matching" @click="runMatch">
            <template #icon><AppIcon name="zap" :size="15" /></template>
            解析并匹配库存
          </n-button>
        </div>
      </div>

      <div class="help-col">
        <div class="card help-card">
          <div class="block-title">工作方式</div>
          <ol class="steps">
            <li><b>导入需求</b><span>粘贴或上传 BOM，一行一个料号</span></li>
            <li><b>自动匹配</b><span>按供应商料号 → 型号+封装 → 名称逐级匹配</span></li>
            <li><b>补齐缺料</b><span>缺料行可直接建档，或导出采购清单</span></li>
            <li><b>一键出库</b><span>齐套的料按 FIFO 扣减并记流水</span></li>
          </ol>
        </div>
        <div class="card help-card legend-card">
          <div class="block-title">状态图例</div>
          <div class="legend"><span class="chip green">齐套</span><span>库存 ≥ 需求</span></div>
          <div class="legend"><span class="chip amber">缺料</span><span>有库存但不够</span></div>
          <div class="legend"><span class="chip red">无库存</span><span>已建档但库存为 0</span></div>
          <div class="legend"><span class="chip plain">未建档</span><span>库里没有这颗料</span></div>
        </div>
      </div>
    </div>

    <!-- 结果 -->
    <template v-else>
      <div class="kpi-row mt-16">
        <div class="card kpi">
          <div class="kpi-label">BOM 行数</div>
          <div class="kpi-value">{{ summary?.lineCount }}<span class="kpi-unit">行</span></div>
          <div class="kpi-sub">{{ summary?.partKinds }} 种器件</div>
        </div>
        <div class="card kpi">
          <div class="kpi-label">齐套率（件）</div>
          <div class="kpi-value" :class="completenessClass">{{ summary?.completeness }}<span class="kpi-unit">%</span></div>
          <div class="kpi-bar"><i :style="{ width: (summary?.completeness || 0) + '%' }" :class="completenessClass" /></div>
        </div>
        <div class="card kpi">
          <div class="kpi-label">缺料行（不含未建档）</div>
          <div class="kpi-value accent">{{ (summary?.shortLines || 0) + (summary?.emptyLines || 0) }}<span class="kpi-unit">行</span></div>
          <div class="kpi-sub">缺口 {{ summary?.shortageQty }} 件</div>
        </div>
        <div class="card kpi">
          <div class="kpi-label">未建档</div>
          <div class="kpi-value">{{ summary?.missingLines }}<span class="kpi-unit">行</span></div>
          <div class="kpi-sub">匹配率（行） {{ summary?.coverage }}%</div>
        </div>
      </div>

      <div class="card table-card mt-12">
        <div class="table-head">
          <div class="row gap-8">
            <span class="table-title">匹配明细</span>
            <span class="chip gray">{{ lines.length }}</span>
            <span v-if="readyLines.length" class="chip green">可出库 {{ readyLines.length }} 行</span>
          </div>
          <div class="row gap-8">
            <n-select
              v-model:value="statusFilter"
              :options="statusOptions"
              size="small"
              style="width: 132px"
            />
          </div>
        </div>
        <n-data-table
          :columns="columns"
          :data="filteredLines"
          :bordered="false"
          :bottom-bordered="false"
          size="small"
          :row-key="(r:any)=>r.lineNo"
          :scroll-x="narrow ? 780 : 900"
          :max-height="tableHeight"
        />
      </div>
    </template>

    <!-- 匹配选择 -->
    <n-modal v-model:show="showPick" preset="card" title="更换匹配器件" style="width: 620px; max-width: 94vw">
      <n-input v-model:value="pickQuery" placeholder="搜索名称 / 型号 / 料号" clearable @update:value="onPickSearch">
        <template #prefix><AppIcon name="search" :size="15" /></template>
      </n-input>
      <div class="pick-list">
        <button
          v-for="p in pickList"
          :key="p.id"
          class="pick-item"
          @click="chooseMatch(p)"
        >
          <div class="pi-main">
            <div class="cell-main">{{ p.name }}</div>
            <div class="cell-sub mono">{{ p.manufacturerModel || p.internalNo || '—' }} · {{ p.package || '无封装' }}</div>
          </div>
          <div class="pi-qty">
            <b>{{ p.totalQuantity ?? 0 }}</b>
            <span class="dim">库存</span>
          </div>
        </button>
        <div v-if="!pickList.length" class="empty-state" style="padding: 28px">
          <div class="es-title">没有搜索结果</div>
          <div>换个关键词试试</div>
        </div>
      </div>
      <template #footer>
        <n-space justify="space-between" align="center">
          <n-button size="small" quaternary @click="clearMatch">清除匹配</n-button>
          <n-button @click="showPick = false">关闭</n-button>
        </n-space>
      </template>
    </n-modal>

    <!-- 快速建档 -->
    <n-modal v-model:show="showCreate" preset="card" title="为缺料行建档" style="width: 520px; max-width: 94vw">
      <n-form label-placement="top">
        <n-form-item label="名称">
          <n-input v-model:value="createForm.name" placeholder="如 0603 100nF 电容" />
        </n-form-item>
        <div class="form-grid">
          <n-form-item label="型号">
            <n-input v-model:value="createForm.manufacturerModel" placeholder="MPN" />
          </n-form-item>
          <n-form-item label="封装">
            <n-input v-model:value="createForm.package" placeholder="0603" />
          </n-form-item>
        </div>
        <n-form-item label="分类">
          <n-select v-model:value="createForm.categoryId" :options="catOptions" placeholder="选择分类" clearable />
        </n-form-item>
        <p class="dim" style="font-size: 12px; margin: 0">
          仅创建元器件档案，不产生库存。建档后可继续补入库或再次匹配。
        </p>
      </n-form>
      <template #footer>
        <n-space justify="end">
          <n-button @click="showCreate = false">取消</n-button>
          <n-button type="primary" :loading="creating" @click="doCreate">建档</n-button>
        </n-space>
      </template>
    </n-modal>

    <!-- 出库确认 -->
    <n-modal v-model:show="showConsume" preset="card" title="BOM 出库" style="width: 560px; max-width: 94vw">
      <n-form label-placement="top">
        <n-form-item label="项目 / 板卡名称">
          <n-input v-model:value="projectName" placeholder="如 电源板 V2.1 试产" />
        </n-form-item>
      </n-form>
      <div class="consume-summary">
        <div class="cs-row"><span>需求总量</span><b>{{ totalRequired }} 件</b></div>
        <div class="cs-row"><span>本次出库</span><b class="ok-text">{{ consumeQty }} 件</b></div>
        <div class="cs-row"><span>仍未覆盖</span><b class="warn-text">{{ Math.max(0, totalRequired - consumeQty) }} 件</b></div>
        <div class="cs-row"><span>不出库行</span><b>{{ lines.length - consumePlan.length }} 行</b></div>
        <div class="cs-row"><span>出库方式</span><b>按批次 FIFO 扣减</b></div>
      </div>
      <n-checkbox v-if="shortRows.length" v-model:checked="partialShort" style="margin-top: 10px">
        缺料行按可用量部分出库（{{ shortRows.length }} 行，会产生欠料）
      </n-checkbox>
      <p class="dim" style="font-size: 12px; margin: 10px 0 0">
        出库会写入库存流水，备注记录位号。未勾选「部分出库」时，缺料行整行不出库。
      </p>
      <template #footer>
        <n-space justify="end">
          <n-button @click="showConsume = false">取消</n-button>
          <n-button type="primary" :loading="consuming" :disabled="!projectName.trim()" @click="doConsume">
            确认出库
          </n-button>
        </n-space>
      </template>
    </n-modal>

    <!-- 保存为项目 -->
    <n-modal v-model:show="showSaveProject" preset="card" title="保存为项目 BOM" style="width: min(460px, calc(100vw - 24px))">
      <n-form label-placement="top" :show-feedback="false">
        <n-form-item label="项目名称" required>
          <n-input v-model:value="prjName" placeholder="如 电源板 V2.1" @keyup.enter="saveAsProject" />
        </n-form-item>
        <div class="row2" style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <n-form-item label="项目编号">
            <n-input v-model:value="prjCode" placeholder="选填" />
          </n-form-item>
          <n-form-item label="投产套数">
            <n-input-number v-model:value="prjQty" :min="1" :precision="0" style="width: 100%" />
          </n-form-item>
        </div>
      </n-form>
      <p class="dim" style="font-size: 12px; margin: 4px 0 0; line-height: 1.6">
        将把当前 {{ lines.length }} 行匹配结果存为项目物料清单（单套用量 = 当前需求），之后可在「项目 BOM」里按套数核算齐套与领料。
      </p>
      <template #footer>
        <n-space justify="end">
          <n-button @click="showSaveProject = false">取消</n-button>
          <n-button type="primary" :loading="savingProject" :disabled="!prjName.trim()" @click="saveAsProject">
            保存项目
          </n-button>
        </n-space>
      </template>
    </n-modal>

    <input ref="fileInput" type="file" accept=".xlsx,.xls,.csv,.txt" style="display: none" @change="onFile" />
  </div>
</template>

<script setup lang="ts">
import { computed, h, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  NButton, NInput, NInputNumber, NSelect, NDataTable, NModal, NForm, NFormItem, NSpace, NCheckbox, useMessage
} from 'naive-ui'
import { api } from '@/shared/api'
import type { BomLine, BomSummary, Category, Part } from '@/shared/api/types'
import { parseBomText } from '@server/domain/bom/parser.js'
import AppIcon from '@/shared/ui/AppIcon.vue'
import PageHeader from '@/shared/ui/PageHeader.vue'

const message = useMessage()
const router = useRouter()

const showSaveProject = ref(false)
const savingProject = ref(false)
const prjName = ref('')
const prjCode = ref('')
const prjQty = ref(1)

function openSaveProject() {
  prjName.value = `BOM-${new Date().toISOString().slice(0, 10)}`
  prjCode.value = ''
  prjQty.value = 1
  showSaveProject.value = true
}

async function saveAsProject() {
  if (!prjName.value.trim()) { message.warning('请输入项目名称'); return }
  savingProject.value = true
  try {
    const r = await api.createProject({
      name: prjName.value.trim(),
      code: prjCode.value.trim(),
      buildQty: prjQty.value,
      lines: lines.value.map((l) => ({
        partId: l.partId, designators: l.designators,
        model: l.model || l.partModel, name: l.name || l.partName,
        package: l.package || l.partPackage, quantity: l.required, note: l.note
      }))
    })
    message.success('已保存为项目 BOM')
    showSaveProject.value = false
    router.push({ name: 'projects', query: { id: r.project.id } })
  } catch (e: any) {
    message.error(e.message)
  } finally {
    savingProject.value = false
  }
}

const bomText = ref('')
const matching = ref(false)
const lines = ref<BomLine[]>([])
const summary = ref<BomSummary | null>(null)
const statusFilter = ref<'all' | 'issue' | 'missing' | 'ok'>('all')
const fileInput = ref<HTMLInputElement | null>(null)
const tableHeight = ref(520)
const narrow = ref(false)
function syncNarrow() { narrow.value = window.innerWidth < 720 }

const hasResult = computed(() => lines.value.length > 0)
const summarySub = computed(() =>
  `共 ${summary.value?.lineCount || 0} 行 · 齐套率 ${summary.value?.completeness || 0}% · 缺口 ${summary.value?.shortageQty || 0} 个`
)
const completenessClass = computed(() => {
  const v = summary.value?.completeness || 0
  if (v >= 90) return 'ok'
  if (v >= 60) return 'warn'
  return 'bad'
})
const statusOptions = [
  { label: '全部状态', value: 'all' },
  { label: '仅看问题行', value: 'issue' },
  { label: '仅看未建档', value: 'missing' },
  { label: '仅看齐套', value: 'ok' }
]
const filteredLines = computed(() => {
  if (statusFilter.value === 'all') return lines.value
  if (statusFilter.value === 'ok') return lines.value.filter((l) => l.status === 'ok')
  if (statusFilter.value === 'missing') return lines.value.filter((l) => l.status === 'missing')
  return lines.value.filter((l) => l.status !== 'ok')
})
const readyLines = computed(() => lines.value.filter((l) => l.status === 'ok'))
const shortRows = computed(() => lines.value.filter((l) => l.status === 'short'))
// 缺料行默认整行不出库；开启「部分出库」后按可用量扣减
const partialShort = ref(false)
const consumePlan = computed(() => {
  const plan = readyLines.value.map((l) => ({ line: l, qty: l.required }))
  if (partialShort.value) {
    for (const l of shortRows.value) plan.push({ line: l, qty: Math.min(l.required, l.available) })
  }
  return plan
})
const consumeQty = computed(() => consumePlan.value.reduce((s, x) => s + x.qty, 0))
const totalRequired = computed(() => lines.value.reduce((s, l) => s + (Number(l.required) || 0), 0))

const STATUS_META: Record<string, { label: string; cls: string }> = {
  ok: { label: '齐套', cls: 'green' },
  short: { label: '缺料', cls: 'amber' },
  empty: { label: '无库存', cls: 'red' },
  missing: { label: '未建档', cls: 'plain' }
}

/* ---------------- 导入与匹配 ---------------- */
function reset() {
  lines.value = []
  summary.value = null
  bomText.value = ''
  statusFilter.value = 'all'
}
function loadSample() {
  bomText.value = [
    '位号\t型号\t名称\t封装\t数量\t备注',
    'R1,R2\tRC0603FR-0710KL\t10kΩ 电阻\t0603\t2\t上拉',
    'C1,C2\tGRM188R71H104KA93D\t100nF 电容\t0603\t2\t去耦',
    'U1\tSTM32F103C8T6\tMCU\tLQFP-48\t1\t主控',
    'D1\tSS34\t肖特基二极管\tSMA\t1\t防反接'
  ].join('\n')
  message.info('已载入示例 BOM，可直接点「解析并匹配库存」')
}

async function runMatch() {
  const parsed = parseBomText(bomText.value)
  if (!parsed.rows.length) {
    message.warning('没有识别到有效行，请检查粘贴内容')
    return
  }
  if (parsed.rows.length > 2000) {
    message.warning('单次最多 2000 行，请拆分处理')
    return
  }
  matching.value = true
  try {
    const r = await api.bomMatch(parsed.rows)
    lines.value = r.lines || []
    summary.value = r.summary
    if (parsed.skipped) message.info(`已跳过 ${parsed.skipped} 行空数据`)
    else message.success(`已匹配 ${r.lines.length} 行`)
  } catch (e: any) {
    message.error(e.message)
  } finally {
    matching.value = false
  }
}

function pickFile() { fileInput.value?.click() }

async function onFile(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const buf = await file.arrayBuffer()
    if (/\.(csv|txt)$/i.test(file.name)) {
      bomText.value = new TextDecoder('utf-8').decode(buf)
    } else {
      const XLSX = await import('xlsx')
      const wb = XLSX.read(new Uint8Array(buf), { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, raw: false, defval: '' })
      bomText.value = rows
        .map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? '').replace(/[\t\n]/g, ' ')).join('\t') : ''))
        .join('\n')
    }
    await runMatch()
  } catch (e: any) {
    message.error(`读取失败：${e.message}`)
  } finally {
    input.value = ''
  }
}

/* ---------------- 表格 ---------------- */
function statusChip(row: BomLine) {
  const meta = STATUS_META[row.status] || STATUS_META.missing
  return h('span', { class: `chip ${meta.cls}` }, meta.label)
}

const baseColumns: any[] = [
  { title: '状态', key: 'status', width: 84, render: (r: BomLine) => statusChip(r) },
  {
    title: '位号', key: 'designators', width: 120, ellipsis: { tooltip: true },
    render: (r: BomLine) => r.designators
      ? h('span', { class: 'mono desig' }, r.designators)
      : h('span', { class: 'dim' }, '—')
  },
  {
    title: '需求器件', key: 'part', width: 230, minWidth: 180,
    render: (r: BomLine) => h('div', {}, [
      h('div', { class: 'cell-main' }, r.partName || r.name || r.model || '未命名'),
      h('div', { class: 'cell-sub mono' }, [r.model || r.partModel, r.package || r.partPackage].filter(Boolean).join(' · ') || '—')
    ])
  },
  {
    title: '需求', key: 'required', width: 70,
    render: (r: BomLine) => h('b', { class: 'num' }, String(r.required))
  },
  {
    title: '库存', key: 'available', width: 70,
    render: (r: BomLine) => h('span', { class: r.available > 0 ? 'num' : 'num zero' }, String(r.available))
  },
  {
    title: '缺口', key: 'shortage', width: 70,
    render: (r: BomLine) => r.shortage > 0
      ? h('span', { class: 'num gap' }, String(r.shortage))
      : h('span', { class: 'dim' }, '—')
  },
  {
    title: '库位', key: 'loc', width: 150, ellipsis: { tooltip: true },
    render: (r: BomLine) => {
      if (!r.locations.length) return h('span', { class: 'dim' }, '—')
      const first = r.locations[0]
      return h('div', { class: 'loc-cell' }, [
        h('span', { class: 'loc-name' }, first.path),
        r.locations.length > 1 ? h('span', { class: 'chip gray' }, `+${r.locations.length - 1}`) : null
      ])
    }
  },
  {
    title: '', key: 'op', width: 96, fixed: 'right',
    render: (r: BomLine) => h('div', { class: 'op-cell' }, [
      r.status === 'missing'
        ? h('button', { class: 'mini-btn text', onClick: () => openCreate(r) }, '建档')
        : h('button', { class: 'mini-btn text', onClick: () => openPick(r) }, '换')
    ])
  }
]

const columns = computed(() => {
  if (!narrow.value) return baseColumns
  return baseColumns.map((c) => (c.key === 'op' ? { ...c, fixed: undefined } : c))
})

/* ---------------- 匹配选择 ---------------- */
const showPick = ref(false)
const pickQuery = ref('')
const pickList = ref<Part[]>([])
const pickLine = ref<BomLine | null>(null)
let pickTimer: any = null

function openPick(line: BomLine) {
  pickLine.value = line
  pickQuery.value = line.partName || line.model || ''
  showPick.value = true
  onPickSearch(pickQuery.value)
}
function onPickSearch(v: string) {
  clearTimeout(pickTimer)
  pickTimer = setTimeout(async () => {
    try {
      const r: any = await api.listParts({ search: v || undefined, pageSize: 20 })
      pickList.value = r.list || []
    } catch { pickList.value = [] }
  }, 220)
}
function applyLinePart(line: BomLine, p: Part) {
  const available = p.totalQuantity ?? 0
  line.partId = p.id
  line.partName = p.name
  line.partModel = p.manufacturerModel || ''
  line.partPackage = p.package || ''
  line.available = available
  line.shortage = Math.max(0, line.required - available)
  line.status = available >= line.required ? 'ok' : available > 0 ? 'short' : 'empty'
  line.needCreate = false
  line.candidates = []
  recomputeSummary()
}
function chooseMatch(p: Part) {
  if (!pickLine.value) return
  applyLinePart(pickLine.value, p)
  showPick.value = false
  message.success(`已匹配到「${p.name}」`)
}
function clearMatch() {
  const line = pickLine.value
  if (!line) return
  line.partId = null
  line.partName = ''
  line.partModel = ''
  line.partPackage = ''
  line.available = 0
  line.shortage = line.required
  line.status = 'missing'
  line.needCreate = true
  recomputeSummary()
  showPick.value = false
}
function recomputeSummary() {
  const list = lines.value
  const matched = list.filter((l) => l.partId)
  const requiredQty = list.reduce((s, l) => s + l.required, 0)
  const readyQty = list.reduce((s, l) => s + Math.min(l.required, l.available), 0)
  summary.value = {
    lineCount: list.length,
    partKinds: new Set(matched.map((l) => l.partId)).size,
    matchedLines: matched.length,
    missingLines: list.length - matched.length,
    okLines: list.filter((l) => l.status === 'ok').length,
    shortLines: list.filter((l) => l.status === 'short').length,
    emptyLines: list.filter((l) => l.status === 'empty').length,
    requiredQty,
    shortageQty: list.reduce((s, l) => s + l.shortage, 0),
    readyQty,
    coverage: list.length ? Math.round((matched.length / list.length) * 100) : 0,
    completeness: requiredQty ? Math.round((readyQty / requiredQty) * 100) : 0
  }
}

/* ---------------- 建档 ---------------- */
const showCreate = ref(false)
const creating = ref(false)
const categories = ref<Category[]>([])
const catOptions = computed(() => categories.value.map((c) => ({ label: c.name, value: c.id })))
const createForm = ref<any>({ name: '', manufacturerModel: '', package: '', categoryId: null })
const createLine = ref<BomLine | null>(null)

function openCreate(line: BomLine) {
  createLine.value = line
  createForm.value = {
    name: line.name || line.model,
    manufacturerModel: line.model,
    package: line.package,
    categoryId: guessCat(line)
  }
  showCreate.value = true
}
function guessCat(line: BomLine) {
  const text = `${line.name} ${line.model}`.toLowerCase()
  const hit = categories.value.find((c) => text.includes(c.name.toLowerCase()))
  if (hit) return hit.id
  if (/电阻|res|rc0|ohm|Ω/.test(text)) return categories.value.find((c) => c.name === '电阻')?.id || null
  if (/电容|cap|grm|mlcc|µf|uf|nf|pf/.test(text)) return categories.value.find((c) => c.name === '电容')?.id || null
  return null
}
async function doCreate() {
  if (!createForm.value.name?.trim()) { message.warning('请输入名称'); return }
  creating.value = true
  try {
    await api.createPart({ ...createForm.value, safetyStock: 0 })
    message.success('已建档，可继续补入库')
    showCreate.value = false
    await runMatch()
  } catch (e: any) {
    message.error(e.message)
  } finally {
    creating.value = false
  }
}

/* ---------------- 出库 ---------------- */
const showConsume = ref(false)
const consuming = ref(false)
const projectName = ref('')

function openConsume() {
  if (!readyLines.value.length && !shortRows.value.length) { message.warning('没有可出库的行'); return }
  // 只有缺料行时默认开启部分出库，避免用户以为没有可出的货
  partialShort.value = !readyLines.value.length && shortRows.value.length > 0
  const d = new Date()
  projectName.value = `项目 ${d.getMonth() + 1}/${d.getDate()}`
  showConsume.value = true
}
async function doConsume() {
  const plan = consumePlan.value
  if (!plan.length) { message.warning('没有可出库的行'); return }
  consuming.value = true
  try {
    const r = await api.bomConsume(
      plan.map(({ line, qty }) => ({
        lineNo: line.lineNo, partId: line.partId, required: qty, designators: line.designators
      })),
      projectName.value.trim()
    )
    if (r.failed?.length) {
      message.warning(`部分出库失败：${r.failed[0].msg}`)
    } else {
      message.success(`已出库 ${r.totalOut} 个器件，流水已记录`)
    }
    showConsume.value = false
    await runMatch()
  } catch (e: any) {
    message.error(e.message)
  } finally {
    consuming.value = false
  }
}

/* ---------------- 导出缺料 ---------------- */
function exportShortage() {
  const rows = lines.value.filter((l) => l.status !== 'ok')
  if (!rows.length) { message.info('没有缺料行'); return }
  const head = ['位号', '型号', '名称', '封装', '需求', '库存', '缺口', '状态', '备注']
  const body = rows.map((l) => [
    l.designators, l.model || l.partModel, l.partName || l.name, l.package || l.partPackage,
    l.required, l.available, l.shortage, STATUS_META[l.status]?.label || l.status, l.note
  ])
  const csv = [head, ...body]
    .map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\r\n')
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `BOM缺料_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
  message.success(`已导出 ${rows.length} 行缺料`)
}

onMounted(async () => {
  syncNarrow()
  window.addEventListener('resize', syncNarrow)
  tableHeight.value = Math.max(320, window.innerHeight - 420)
  try { categories.value = await api.listCategories() } catch {}
})
onBeforeUnmount(() => window.removeEventListener('resize', syncNarrow))
</script>

<style scoped>
.page { display: flex; flex-direction: column; height: 100%; min-height: 0; }

/* 导入区 */
.import-wrap { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 16px; align-items: start; }
.paste-card { padding: 16px 18px 14px; }
.paste-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.paste-area :deep(textarea) { font-family: var(--mono); font-size: 12.5px; line-height: 1.7; }
.paste-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 12px; flex-wrap: wrap; }
.hint-line { font-size: 12px; line-height: 1.5; }
.help-col { display: flex; flex-direction: column; gap: 16px; }
.help-card { padding: 16px; }
.steps { margin: 0; padding: 0; list-style: none; counter-reset: s; display: flex; flex-direction: column; gap: 12px; }
.steps li { counter-increment: s; display: grid; grid-template-columns: 22px 1fr; gap: 2px 8px; align-items: start; }
.steps li::before {
  content: counter(s); width: 20px; height: 20px; border-radius: 6px; font-size: 11px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
  background: var(--primary-soft); color: var(--primary); margin-top: 1px;
  grid-column: 1; grid-row: 1 / span 2;
}
.steps li b { grid-column: 2; display: block; font-size: 13px; font-weight: 600; }
.steps li span { grid-column: 2; font-size: 12px; color: var(--text-2); line-height: 1.5; }
.legend { display: flex; align-items: center; gap: 10px; font-size: 12.5px; color: var(--text-2); margin-top: 9px; }
.legend-card .block-title { margin-bottom: 4px; }

/* KPI */
.kpi-row { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.kpi { padding: 14px 16px; }
.kpi-label { font-size: 12px; color: var(--text-2); }
.kpi-value { font-size: 26px; font-weight: 750; letter-spacing: -.02em; line-height: 1.25; margin-top: 2px; font-variant-numeric: tabular-nums; }
.kpi-value.accent { color: var(--accent); }
.kpi-value.ok { color: var(--secondary); }
.kpi-value.warn { color: var(--warning); }
.kpi-value.bad { color: var(--accent); }
.kpi-unit { font-size: 12px; font-weight: 500; color: var(--text-3); margin-left: 3px; }
.kpi-sub { font-size: 11.5px; color: var(--text-3); margin-top: 2px; }
.kpi-bar { height: 4px; border-radius: 3px; background: var(--surface-3); margin-top: 8px; overflow: hidden; }
.kpi-bar i { display: block; height: 100%; border-radius: 3px; background: var(--secondary); transition: width .3s var(--ease); }
.kpi-bar i.warn { background: var(--warning); }
.kpi-bar i.bad { background: var(--accent); }

/* 表格 */
.table-card { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.table-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 16px; border-bottom: 1px solid var(--outline); flex-wrap: wrap; }
.table-title { font-weight: 700; font-size: 14px; }
.num { font-variant-numeric: tabular-nums; font-weight: 600; }
.num.zero { color: var(--text-3); }
.num.gap { color: var(--accent); }
.desig { font-size: 12px; color: var(--text-2); }
.loc-cell { display: flex; align-items: center; gap: 5px; }
.loc-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12.5px; }
.op-cell { display: flex; gap: 4px; }
.mini-btn.text {
  height: 26px; padding: 0 10px; border-radius: 7px; border: 1px solid var(--outline);
  background: transparent; color: var(--text-2); font-size: 12px; cursor: pointer;
  transition: all .15s var(--ease);
}
.mini-btn.text:hover { color: var(--primary); border-color: var(--primary); background: var(--primary-soft); }

/* 选择器 */
.pick-list { max-height: 380px; overflow: auto; margin-top: 12px; display: flex; flex-direction: column; gap: 4px; }
.pick-item {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 9px 12px; border-radius: 9px; border: 1px solid transparent; background: var(--surface-2);
  cursor: pointer; text-align: left; transition: all .15s var(--ease);
}
.pick-item:hover { border-color: var(--primary); background: var(--primary-softer); }
.pi-main { min-width: 0; }
.pi-qty { display: flex; flex-direction: column; align-items: flex-end; }
.pi-qty b { font-variant-numeric: tabular-nums; }
.pi-qty span { font-size: 11px; }

/* 出库摘要 */
.consume-summary { background: var(--surface-2); border: 1px solid var(--outline); border-radius: 10px; padding: 10px 14px; }
.cs-row { display: flex; align-items: center; justify-content: space-between; font-size: 13px; padding: 5px 0; }
.cs-row span { color: var(--text-2); }
.cs-row b.ok-text { color: var(--secondary); }
.cs-row b.warn-text { color: var(--warning); }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

@media (max-width: 1100px) {
  .import-wrap { grid-template-columns: 1fr; }
  .help-col { flex-direction: row; }
  .help-col > * { flex: 1; }
}
@media (max-width: 860px) {
  .kpi-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .help-col { flex-direction: column; }
  .page { height: auto; }
  .table-card { min-height: 460px; }
}
@media (max-width: 560px) {
  .paste-card { padding: 14px 14px 12px; }
  .paste-head { flex-direction: column; align-items: stretch; gap: 10px; }
  .paste-head .row { flex-wrap: wrap; }
  .paste-foot { align-items: stretch; }
  .paste-foot .n-button { width: 100%; }
  .kpi-value { font-size: 22px; }
}
</style>
