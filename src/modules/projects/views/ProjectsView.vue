<template>
  <div class="prj-page">
    <PageHeader title="项目 BOM" subtitle="按项目归集用料，跟踪齐套率与领料记录">
      <n-button type="primary" @click="openCreate">
        <template #icon><AppIcon name="plus" :size="16" /></template>
        新建项目
      </n-button>
    </PageHeader>

    <!-- 项目切换条 -->
    <div class="prj-bar card">
      <div class="pb-search">
        <n-input v-model:value="kw" size="small" placeholder="搜索项目 / 编号" clearable>
          <template #prefix><AppIcon name="search" :size="14" /></template>
        </n-input>
      </div>
      <div class="prj-chips">
        <button
          v-for="p in filteredProjects" :key="p.id"
          class="prj-chip" :class="{ active: p.id === selectedId }"
          @click="selectProject(p.id)"
        >
          <div class="pc-top">
            <span class="pc-name">{{ p.name }}</span>
            <span class="chip" :class="statusClass(p.status)">{{ statusLabel(p.status) }}</span>
          </div>
          <div class="pc-meta">
            <span class="mono">{{ p.code || '未编号' }}</span>
            <span class="sep">·</span>
            <span>{{ p.lineCount }} 行</span>
            <span class="sep">·</span>
            <span>{{ p.buildQty }} 套</span>
          </div>
        </button>
        <div v-if="!filteredProjects.length" class="pb-empty">
          <AppIcon name="project" :size="18" />
          <span>{{ kw ? '没有匹配的项目' : '还没有项目，先新建一个' }}</span>
        </div>
      </div>
    </div>

    <!-- 项目详情 -->
    <section class="prj-main">
        <template v-if="analysis">
          <div class="card prj-head">
            <div class="head-row">
              <div class="head-main">
                <div class="prj-title">{{ analysis.project.name }}</div>
                <div class="prj-meta">
                  <span class="mono">{{ analysis.project.code || '未编号' }}</span>
                  <span class="sep">·</span>
                  <span>{{ analysis.project.version }}</span>
                  <template v-if="analysis.project.owner">
                    <span class="sep">·</span><span>{{ analysis.project.owner }}</span>
                  </template>
                  <template v-if="analysis.project.note">
                    <span class="sep">·</span><span class="note">{{ analysis.project.note }}</span>
                  </template>
                </div>
              </div>
              <div class="head-actions">
                <n-select
                  v-model:value="statusDraft" :options="statusOptions" size="small"
                  style="width: 122px" @update:value="saveStatus"
                />
                <n-button size="small" secondary @click="openEdit">
                  <template #icon><AppIcon name="edit" :size="14" /></template>
                  编辑
                </n-button>
                <n-button size="small" secondary type="error" @click="removeProject">
                  <template #icon><AppIcon name="trash" :size="14" /></template>
                </n-button>
              </div>
            </div>

            <div class="head-tools">
              <div class="qty-box">
                <span class="qb-label">投产套数</span>
                <n-input-number
                  v-model:value="buildQty" size="small" :min="1" :precision="0"
                  style="width: 96px" @update:value="onBuildQty"
                />
                <span class="qb-hint">需求 = 单套用量 × 套数</span>
              </div>
              <div class="tools">
                <n-button size="small" secondary @click="openImport">
                  <template #icon><AppIcon name="upload" :size="14" /></template>
                  导入 BOM
                </n-button>
                <n-button size="small" secondary @click="openAddLine">
                  <template #icon><AppIcon name="plus" :size="14" /></template>
                  添加行
                </n-button>
                <n-button size="small" secondary :disabled="!lines.length" @click="exportCsv">
                  <template #icon><AppIcon name="download" :size="14" /></template>
                  导出
                </n-button>
                <n-button size="small" type="primary" :disabled="!lines.length" @click="doConsume">
                  <template #icon><AppIcon name="zap" :size="14" /></template>
                  一键领料
                </n-button>
              </div>
            </div>
          </div>

          <div class="prj-kpis">
            <div class="kpi card">
              <span class="k-label">BOM 行数</span>
              <b class="k-val">{{ summary.lineCount }}</b>
              <span class="k-hint">覆盖 {{ summary.partKinds }} 种器件</span>
            </div>
            <div class="kpi card">
              <span class="k-label">齐套率（件）</span>
              <b class="k-val" :class="summary.completeness >= 100 ? 'good' : summary.completeness >= 60 ? 'warn' : 'bad'">
                {{ summary.completeness }}%
              </b>
              <span class="k-hint">已齐 {{ summary.readyQty }} / 需求 {{ summary.requiredQty }}</span>
            </div>
            <div class="kpi card">
              <span class="k-label">缺料行（含未建档）</span>
              <b class="k-val" :class="shortageLines ? 'bad' : 'good'">{{ shortageLines }}</b>
              <span class="k-hint">缺口合计 {{ summary.shortageQty }} 件</span>
            </div>
            <div class="kpi card">
              <span class="k-label">待建档</span>
              <b class="k-val" :class="summary.unlinkedLines ? 'warn' : 'good'">{{ summary.unlinkedLines }}</b>
              <span class="k-hint">未绑定库存器件</span>
            </div>
            <div class="kpi card">
              <span class="k-label">领料记录</span>
              <b class="k-val small">{{ analysis.project.lastConsumedAt ? dateText(analysis.project.lastConsumedAt) : '—' }}</b>
              <span class="k-hint">最近一次按项目出库</span>
            </div>
          </div>

          <div class="card table-card">
            <div class="table-head">
              <span class="table-title">物料清单</span>
              <span class="chip gray">{{ lines.length }} 行</span>
              <span class="chip plain">单套 {{ buildQty }} 套投产</span>
              <div class="th-right">
                <span class="dim right-hint">右键快捷操作</span>
                <n-input v-model:value="lineKw" size="small" placeholder="筛选位号 / 型号 / 名称" clearable style="width: 200px">
                  <template #prefix><AppIcon name="search" :size="14" /></template>
                </n-input>
              </div>
            </div>

            <n-data-table
              v-if="lines.length"
              :columns="columns" :data="filteredLines" size="small"
              :row-key="(r: any) => r.id" :bordered="false" :bottom-bordered="false"
              :row-props="rowProps"
              :scroll-x="isMobile ? 360 : 960" :pagination="filteredLines.length > 50 ? { pageSize: 50 } : false"
            />
            <div v-else class="empty-bom">
              <AppIcon name="bom" :size="26" />
              <div class="eb-title">BOM 还是空的</div>
              <p>从 Excel / WPS / KiCad 复制表格粘贴导入，或手动添加物料行。</p>
              <div class="row gap-8">
                <n-button size="small" type="primary" @click="openImport">导入 BOM</n-button>
                <n-button size="small" secondary @click="openAddLine">添加行</n-button>
              </div>
            </div>
          </div>
        </template>

        <div v-else class="card prj-empty">
          <AppIcon name="project" :size="30" />
          <div class="pe-title">{{ projects.length ? '选择一个项目查看 BOM' : '还没有项目' }}</div>
          <p>项目 BOM 把元器件、用量与投产套数放在一起，随时看清齐套率和缺口。</p>
          <n-button type="primary" @click="openCreate">新建项目</n-button>
        </div>
      </section>

    <!-- 新建 / 编辑项目 -->
    <n-modal v-model:show="showForm" preset="card" :title="editingId ? '编辑项目' : '新建项目'" :style="modalStyle">
      <n-form label-placement="top" :show-feedback="false">
        <div class="row2">
          <n-form-item label="项目名称" required>
            <n-input v-model:value="form.name" placeholder="如 温控器主板 V1" @keyup.enter="submitForm" />
          </n-form-item>
          <n-form-item label="项目编号">
            <n-input v-model:value="form.code" placeholder="如 PRJ-2026-001" />
          </n-form-item>
        </div>
        <div class="row3">
          <n-form-item label="版本">
            <n-input v-model:value="form.version" placeholder="V1.0" />
          </n-form-item>
          <n-form-item label="状态">
            <n-select v-model:value="form.status" :options="statusOptions" />
          </n-form-item>
          <n-form-item label="投产套数">
            <n-input-number v-model:value="form.buildQty" :min="1" :precision="0" style="width: 100%" />
          </n-form-item>
        </div>
        <div class="row2">
          <n-form-item label="负责人">
            <n-input v-model:value="form.owner" placeholder="选填" />
          </n-form-item>
          <n-form-item label="备注">
            <n-input v-model:value="form.note" placeholder="选填，如 打样批次 / 客户" />
          </n-form-item>
        </div>
      </n-form>
      <template #footer>
        <div class="modal-foot">
          <n-button @click="showForm = false">取消</n-button>
          <n-button type="primary" :loading="saving" @click="submitForm">{{ editingId ? '保存' : '创建' }}</n-button>
        </div>
      </template>
    </n-modal>

    <!-- 导入 BOM -->
    <n-modal v-model:show="showImport" preset="card" title="导入项目 BOM" :style="modalStyleWide">
      <div class="imp-tip">
        <div class="imp-modes">
          <n-radio-group v-model:value="impMode" size="small">
            <n-radio-button value="replace">覆盖现有 BOM</n-radio-button>
            <n-radio-button value="append">追加合并</n-radio-button>
          </n-radio-group>
        </div>
        <div class="imp-actions">
          <n-button size="tiny" quaternary @click="loadSample">载入示例</n-button>
          <n-button size="tiny" quaternary @click="impFile?.click()">上传 Excel / CSV</n-button>
        </div>
      </div>
      <input ref="impFile" type="file" accept=".xlsx,.xls,.csv,.txt" style="display: none" @change="onImpFile" />
      <n-input
        v-model:value="impText" type="textarea" :rows="11"
        placeholder="从 Excel / WPS / KiCad 选中区域复制，直接粘贴到这里。&#10;支持列：位号、型号、名称、封装、数量、备注；无表头时按列序推断。"
      />
      <div class="imp-foot">
        <span class="dim">导入后会自动匹配库存已有器件，匹配不到的标记为「待建档」</span>
      </div>
      <template #footer>
        <div class="modal-foot">
          <n-button @click="showImport = false">取消</n-button>
          <n-button type="primary" :loading="importing" :disabled="!impText.trim()" @click="doImport">解析并导入</n-button>
        </div>
      </template>
    </n-modal>

    <!-- 添加 / 换料 -->
    <n-modal v-model:show="showPick" preset="card" :title="pickMode === 'add' ? '添加物料行' : '更换物料'" :style="modalStyle">
      <div v-if="pickMode === 'change' && pickTarget" class="pick-cur">
        当前：<b>{{ pickTarget.partName || pickTarget.name }}</b>
        <span class="mono dim">{{ pickTarget.partModel || pickTarget.model }}</span>
      </div>
      <n-form label-placement="top" :show-feedback="false">
        <n-form-item label="选择已有器件">
          <n-select
            v-model:value="pickPartId" filterable remote clearable
            :options="partOptions" :loading="partLoading"
            placeholder="输入名称 / 型号 / 封装搜索库存器件"
            @search="searchParts"
          />
        </n-form-item>
        <div class="row2">
          <n-form-item label="位号">
            <n-input v-model:value="pickDesignators" placeholder="如 R1,R2" />
          </n-form-item>
          <n-form-item label="单套用量">
            <n-input-number v-model:value="pickQty" :min="1" :precision="0" style="width: 100%" />
          </n-form-item>
        </div>
        <n-form-item label="备注">
          <n-input v-model:value="pickNote" placeholder="选填" />
        </n-form-item>
      </n-form>
      <template #footer>
        <div class="modal-foot">
          <n-button @click="showPick = false">取消</n-button>
          <n-button type="primary" :disabled="!pickPartId" :loading="saving" @click="confirmPick">确定</n-button>
        </div>
      </template>
    </n-modal>

    <ContextMenu v-model:show="ctx.show" :x="ctx.x" :y="ctx.y" :items="ctx.items" :title="ctxTitle" @select="onCtxSelect" />
  </div>
</template>

<script setup lang="ts">
import { computed, h, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  NButton, NInput, NInputNumber, NSelect, NModal, NForm, NFormItem,
  NRadioGroup, NRadioButton, NDataTable, useMessage, useDialog
} from 'naive-ui'
import { api } from '@/shared/api'
import type { Part, Project, ProjectAnalysis, ProjectLine, ProjectStatus } from '@/shared/api/types'
import AppIcon from '@/shared/ui/AppIcon.vue'
import PageHeader from '@/shared/ui/PageHeader.vue'
import ContextMenu from '@/shared/ui/ContextMenu.vue'
import type { ContextMenuItem } from '@/shared/ui/context-menu.types'

const message = useMessage()
const dialog = useDialog()
const route = useRoute()
const router = useRouter()

const projects = ref<Project[]>([])
const analysis = ref<ProjectAnalysis | null>(null)
const selectedId = ref<string | null>(null)
const kw = ref('')
const lineKw = ref('')
const buildQty = ref(1)
const statusDraft = ref<ProjectStatus>('design')
const saving = ref(false)
const importing = ref(false)

const modalStyle = 'width: min(560px, calc(100vw - 24px))'
const modalStyleWide = 'width: min(720px, calc(100vw - 24px))'

const statusOptions = [
  { label: '设计中', value: 'design' },
  { label: '打样', value: 'sample' },
  { label: '小批试产', value: 'pilot' },
  { label: '量产', value: 'mass' },
  { label: '已归档', value: 'archived' }
]

const filteredProjects = computed(() => {
  const q = kw.value.trim().toLowerCase()
  if (!q) return projects.value
  return projects.value.filter((p) => `${p.name} ${p.code} ${p.version}`.toLowerCase().includes(q))
})
const lines = computed<ProjectLine[]>(() => analysis.value?.lines || [])
const summary = computed(() => analysis.value?.summary || {
  lineCount: 0, partKinds: 0, requiredQty: 0, readyQty: 0, shortageQty: 0,
  completeness: 0, shortLines: 0, emptyLines: 0, unlinkedLines: 0, multiple: 1, buildQty: 1
} as any)
const shortageLines = computed(() => summary.value.shortageLinesIncludingUnlinked || 0)
const filteredLines = computed(() => {
  const q = lineKw.value.trim().toLowerCase()
  if (!q) return lines.value
  return lines.value.filter((l) =>
    `${l.designators} ${l.partName} ${l.partModel} ${l.name} ${l.model} ${l.package}`.toLowerCase().includes(q)
  )
})

function statusLabel(s: string) {
  return statusOptions.find((o) => o.value === s)?.label || '设计中'
}
function statusClass(s: string) {
  return s === 'mass' ? 'green' : s === 'pilot' ? 'amber' : s === 'sample' ? 'amber' : s === 'archived' ? 'gray' : 'gray'
}
function dateText(s?: string) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

/* ------------------------------- 列表 / 详情 ------------------------------- */
async function loadProjects() {
  projects.value = await api.listProjects()
}

async function selectProject(id: string) {
  if (selectedId.value === id) return
  selectedId.value = id
  await loadDetail(id)
  if (route.query.id !== id) router.replace({ query: { ...route.query, id } })
}

async function loadDetail(id: string) {
  // 不带 buildQty，读取项目自己保存的投产套数
  analysis.value = await api.getProject(id)
  buildQty.value = analysis.value.buildQty
  statusDraft.value = analysis.value.project.status
}

async function reload() {
  if (!selectedId.value) return
  analysis.value = await api.getProject(selectedId.value, buildQty.value)
  await loadProjects()
  const fresh = projects.value.find((p) => p.id === selectedId.value)
  if (fresh) statusDraft.value = fresh.status
}

onMounted(async () => {
  syncViewport()
  window.addEventListener('resize', syncViewport)
  await loadProjects()
  const wanted = String(route.query.id || '')
  if (wanted && projects.value.some((p) => p.id === wanted)) {
    selectedId.value = wanted
    await loadDetail(wanted)
  } else if (projects.value.length) {
    await selectProject(projects.value[0].id)
  }
})
onBeforeUnmount(() => window.removeEventListener('resize', syncViewport))

/* ------------------------------- 项目表单 ------------------------------- */
const showForm = ref(false)
const editingId = ref<string | null>(null)
const form = ref(blankForm())
function blankForm() {
  return { name: '', code: '', version: 'V1.0', status: 'design' as ProjectStatus, buildQty: 1, owner: '', note: '' }
}

function openCreate() {
  editingId.value = null
  form.value = blankForm()
  showForm.value = true
}
function openEdit() {
  if (!analysis.value) return
  const p = analysis.value.project
  editingId.value = p.id
  form.value = {
    name: p.name, code: p.code, version: p.version, status: p.status,
    buildQty: p.buildQty, owner: p.owner, note: p.note
  }
  showForm.value = true
}

async function submitForm() {
  if (!form.value.name.trim()) { message.warning('请输入项目名称'); return }
  saving.value = true
  try {
    if (editingId.value) {
      await api.updateProject(editingId.value, { ...form.value })
      message.success('项目已更新')
      showForm.value = false
      buildQty.value = form.value.buildQty
      await reload()
    } else {
      const r = await api.createProject({ ...form.value })
      message.success('项目已创建')
      showForm.value = false
      await loadProjects()
      selectedId.value = null
      await selectProject(r.project.id)
    }
  } catch (e: any) {
    message.error(e.message)
  } finally {
    saving.value = false
  }
}

async function saveStatus(v: ProjectStatus) {
  if (!selectedId.value) return
  try {
    await api.updateProject(selectedId.value, { status: v })
    await loadProjects()
    if (analysis.value) analysis.value.project.status = v
    message.success('状态已更新')
  } catch (e: any) {
    message.error(e.message)
  }
}

function removeProject() {
  if (!analysis.value) return
  const p = analysis.value.project
  dialog.warning({
    title: '删除项目',
    content: `确定删除「${p.name}」？项目 BOM 会一并删除，库存数据不受影响。`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await api.deleteProject(p.id)
        message.success('项目已删除')
        analysis.value = null
        selectedId.value = null
        await loadProjects()
        if (projects.value.length) await selectProject(projects.value[0].id)
      } catch (e: any) {
        message.error(e.message)
      }
    }
  })
}

/* ------------------------------- 套数 / BOM 行 ------------------------------- */
let qtyTimer: any = null
function onBuildQty(v: number | null) {
  if (!selectedId.value || !v) return
  clearTimeout(qtyTimer)
  qtyTimer = setTimeout(async () => {
    try {
      await api.updateProject(selectedId.value!, { buildQty: v })
      await reload()
    } catch (e: any) {
      message.error(e.message)
    }
  }, 350)
}

function toSaveLines() {
  return lines.value.map((l) => ({
    id: l.id, partId: l.partId, designators: l.designators,
    model: l.model || l.partModel || '', name: l.name || l.partName || '',
    package: l.package || l.partPackage || '', quantity: l.quantity, note: l.note || ''
  }))
}

async function saveLines(next: any[]) {
  if (!selectedId.value) return
  saving.value = true
  try {
    await api.saveProjectBom(selectedId.value, next, buildQty.value)
    await reload()
  } catch (e: any) {
    message.error(e.message)
  } finally {
    saving.value = false
  }
}

/* ------------------------------- 导入 ------------------------------- */
const showImport = ref(false)
const impText = ref('')
const impMode = ref<'replace' | 'append'>('replace')
const impFile = ref<HTMLInputElement | null>(null)
const SAMPLE = [
  '位号\t型号\t名称\t封装\t数量',
  'R1,R2\tRC0805FR-0710KL\t10kΩ 电阻\t0603\t2',
  'C1,C2\tGRM188R71H104KA93D\t100nF 电容\t0603\t4',
  'U1\tSTM32F103C8T6\tMCU\tLQFP-48\t1',
  'D1\tSS34\t肖特基二极管\tSMA\t2'
].join('\n')

function openImport() {
  impText.value = ''
  showImport.value = true
}
function loadSample() { impText.value = SAMPLE }

async function onImpFile(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    if (/\.(csv|txt)$/i.test(file.name)) {
      impText.value = await file.text()
    } else {
      // 按需加载表格解析库，避免打开项目页就下载 xlsx
      const XLSX = await import('xlsx')
      const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      impText.value = XLSX.utils.sheet_to_csv(ws, { FS: '\t' })
    }
    message.success(`已读取 ${file.name}`)
  } catch (e: any) {
    message.error('读取失败：' + e.message)
  } finally {
    input.value = ''
  }
}

async function doImport() {
  if (!selectedId.value || !impText.value.trim()) return
  importing.value = true
  try {
    const r = await api.importProjectBom(selectedId.value, {
      text: impText.value, mode: impMode.value, buildQty: buildQty.value
    })
    message.success(`已导入 ${r.imported} 行${r.analysis ? `，当前齐套率 ${r.analysis.summary.completeness}%` : ''}`)
    showImport.value = false
    await reload()
  } catch (e: any) {
    message.error(e.message)
  } finally {
    importing.value = false
  }
}

/* ------------------------------- 添加 / 换料 ------------------------------- */
const showPick = ref(false)
const pickMode = ref<'add' | 'change'>('add')
const pickTarget = ref<ProjectLine | null>(null)
const pickPartId = ref<string | null>(null)
const pickDesignators = ref('')
const pickQty = ref<number | null>(1)
const pickNote = ref('')
const partOptions = ref<{ label: string; value: string; part: Part }[]>([])
const partLoading = ref(false)

function openAddLine() {
  pickMode.value = 'add'
  pickTarget.value = null
  pickPartId.value = null
  pickDesignators.value = ''
  pickQty.value = 1
  pickNote.value = ''
  partOptions.value = []
  showPick.value = true
  searchParts('')
}
function openChangeLine(row: ProjectLine) {
  pickMode.value = 'change'
  pickTarget.value = row
  pickPartId.value = row.partId
  pickDesignators.value = row.designators
  pickQty.value = row.quantity
  pickNote.value = row.note || ''
  partOptions.value = []
  showPick.value = true
  searchParts(row.partModel || row.model || '')
}

let searchTimer: any = null
function searchParts(q: string) {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(async () => {
    partLoading.value = true
    try {
      const r: any = await api.listParts({ search: q || undefined, pageSize: 20 })
      partOptions.value = (r.list || []).map((p: Part) => ({
        value: p.id,
        part: p,
        label: `${p.name}${p.manufacturerModel ? ' · ' + p.manufacturerModel : ''}${p.package ? ' · ' + p.package : ''}（库存 ${p.totalQuantity ?? 0}）`
      }))
    } catch {
      partOptions.value = []
    } finally {
      partLoading.value = false
    }
  }, 220)
}

async function confirmPick() {
  if (!pickPartId.value) return
  const opt = partOptions.value.find((o) => o.value === pickPartId.value)
  const part = opt?.part
  if (pickMode.value === 'add') {
    const next = toSaveLines()
    next.push({
      id: '', partId: pickPartId.value, designators: pickDesignators.value,
      model: part?.manufacturerModel || '', name: part?.name || '',
      package: part?.package || '', quantity: Number(pickQty.value) || 1, note: pickNote.value
    })
    await saveLines(next)
    message.success('已添加物料行')
  } else if (pickTarget.value) {
    const next = toSaveLines().map((l) =>
      l.id === pickTarget.value!.id
        ? {
            ...l,
            partId: pickPartId.value,
            designators: pickDesignators.value,
            quantity: Number(pickQty.value) || 1,
            note: pickNote.value,
            model: part?.manufacturerModel || l.model,
            name: part?.name || l.name,
            package: part?.package || l.package
          }
        : l
    )
    await saveLines(next)
    message.success('已更换物料')
  }
  showPick.value = false
}

function removeLine(row: ProjectLine) {
  dialog.warning({
    title: '移除物料行',
    content: `从 BOM 中移除「${row.partName || row.name}」？`,
    positiveText: '移除',
    negativeText: '取消',
    onPositiveClick: async () => {
      await saveLines(toSaveLines().filter((l) => l.id !== row.id))
    }
  })
}

/* ------------------------------- 右键快捷操作 ------------------------------- */
const ctx = reactive({ show: false, x: 0, y: 0, items: [] as ContextMenuItem[] })
const ctxLine = ref<ProjectLine | null>(null)
const ctxTitle = computed(() => {
  const l = ctxLine.value
  if (!l) return ''
  return `${l.partName || l.name || '未匹配物料'}${l.designators ? ' · ' + l.designators : ''}`
})

function rowProps(r: any) {
  return {
    onContextmenu: (e: MouseEvent) => {
      e.preventDefault()
      openLineMenu(e, r as ProjectLine)
    }
  }
}

function openLineMenu(e: MouseEvent, r: ProjectLine) {
  ctxLine.value = r
  const linked = !!r.partId
  ctx.items = [
    { key: 'open', label: '查看器件详情', icon: 'info', disabled: !linked },
    { key: 'in', label: '入库', icon: 'import', disabled: !linked },
    { key: 'out', label: '出库', icon: 'upload', disabled: !linked },
    { divider: true },
    { key: 'label', label: '打印标签', icon: 'printer', disabled: !linked },
    { key: 'change', label: '更换物料', icon: 'refresh' },
    { key: 'copy', label: '复制型号', icon: 'copy', disabled: !(r.partModel || r.model) },
    { divider: true },
    { key: 'remove', label: '从 BOM 移除', icon: 'trash', danger: true }
  ]
  ctx.x = e.clientX
  ctx.y = e.clientY
  ctx.show = true
}

async function onCtxSelect(key: string) {
  const l = ctxLine.value
  if (!l) return
  if (key === 'open') { router.push({ name: 'parts', query: { open: l.partId } }); return }
  if (key === 'in' || key === 'out') { router.push({ name: 'parts', query: { open: l.partId, intent: key } }); return }
  if (key === 'label') { router.push({ name: 'labels', query: { ids: l.partId } }); return }
  if (key === 'change') { openChangeLine(l); return }
  if (key === 'remove') { removeLine(l); return }
  if (key === 'copy') {
    const text = l.partModel || l.model || ''
    try {
      await navigator.clipboard.writeText(text)
      message.success(`已复制 ${text}`)
    } catch { message.warning('复制失败，请手动选择文本') }
  }
}

/* ------------------------------- 领料 / 导出 ------------------------------- */
function doConsume() {
  if (!analysis.value) return
  const s = summary.value
  dialog.warning({
    title: '按项目领料',
    content: `将按当前齐套结果出库 ${s.readyQty} 件（${s.multiple} 套）。缺料行会跳过并给出清单，是否继续？`,
    positiveText: '确认领料',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        const r = await api.consumeProject(analysis.value!.project.id, { buildQty: buildQty.value })
        if (r.failed.length) {
          dialog.info({
            title: `已出库 ${r.totalOut} 件，${r.failed.length} 行未出`,
            content: r.failed.slice(0, 8).map((f) =>
              `${f.name || f.model || '未命名'}：${f.msg}`
            ).join('\n'),
            positiveText: '知道了'
          })
        } else {
          message.success(`领料完成，共出库 ${r.totalOut} 件`)
        }
        await reload()
      } catch (e: any) {
        message.error(e.message)
      }
    }
  })
}

function exportCsv() {
  if (!analysis.value) return
  const header = ['位号', '名称', '型号', '封装', '单套用量', '需求', '库存', '缺口', '状态', '库位', '备注']
  const rows = lines.value.map((l) => [
    l.designators, l.partName || l.name, l.partModel || l.model, l.partPackage || l.package,
    l.quantity, l.required, l.available, l.shortage,
    l.status === 'ok' ? '齐套' : l.status === 'short' ? '缺料' : l.status === 'empty' ? '零库存' : '未绑定',
    (l.locations || []).map((x) => `${x.path}(${x.quantity})`).join(' / '),
    l.note
  ])
  const csv = [header, ...rows]
    .map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\r\n')
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${analysis.value.project.name}-BOM.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

/* ------------------------------- 表格列 ------------------------------- */
function statusChip(r: ProjectLine) {
  const map: Record<string, [string, string]> = {
    ok: ['齐套', 'green'], short: [`缺 ${r.shortage}`, 'amber'],
    empty: ['零库存', 'red'], unlinked: ['待建档', 'gray']
  }
  const [text, cls] = map[r.status || 'unlinked'] || ['待建档', 'gray']
  return h('span', { class: `chip ${cls}` }, text)
}
function opCell(r: ProjectLine) {
  return h('div', { class: 'row-ops' }, [
    h('button', { class: 'mini-btn text', title: '更换物料', onClick: () => openChangeLine(r) }, '换'),
    h('button', { class: 'mini-btn danger', title: '移除', onClick: () => removeLine(r) },
      h(AppIcon, { name: 'trash', size: 14 }))
  ])
}

const allColumns = [
  {
    title: '位号', key: 'designators', width: 108,
    render: (r: ProjectLine) => h('span', { class: 'mono desig' }, r.designators || '—')
  },
  {
    title: '器件', key: 'part', minWidth: 210,
    render: (r: ProjectLine) => h('div', {}, [
      h('div', { class: 'cell-main' }, r.partName || r.name || '未命名器件'),
      h('div', { class: 'cell-sub mono' }, r.partModel || r.model || '—')
    ])
  },
  { title: '封装', key: 'package', width: 92, render: (r: ProjectLine) => r.partPackage || r.package || '—' },
  {
    title: '单套', key: 'quantity', width: 72, align: 'right' as const,
    render: (r: ProjectLine) => String(r.quantity)
  },
  {
    title: '需求', key: 'required', width: 76, align: 'right' as const,
    render: (r: ProjectLine) => h('b', {}, String(r.required ?? 0))
  },
  {
    title: '库存', key: 'available', width: 76, align: 'right' as const,
    render: (r: ProjectLine) => h('span', {
      style: r.status === 'ok' ? 'color:var(--secondary);font-weight:600' : 'color:var(--accent);font-weight:600'
    }, String(r.available ?? 0))
  },
  {
    title: '状态', key: 'status', width: 96,
    render: statusChip
  },
  {
    title: '库位', key: 'locations', minWidth: 150,
    render: (r: ProjectLine) => {
      const first = (r.locations || [])[0]
      if (!first) return h('span', { class: 'dim' }, '—')
      return h('span', { class: 'loc-text', title: (r.locations || []).map((l) => `${l.path} (${l.quantity})`).join('\n') },
        `${first.path}${(r.locations || []).length > 1 ? ` +${(r.locations || []).length - 1}` : ''}`
      )
    }
  },
  {
    title: '', key: 'op', width: 84, fixed: 'right' as const,
    render: opCell
  }
]

// 窄屏只保留关键列，避免 9 列挤压到几百像素里
const isMobile = ref(false)
function syncViewport() { isMobile.value = window.innerWidth < 720 }
const columns = computed(() => {
  if (!isMobile.value) return allColumns
  return [
    {
      title: '器件', key: 'part', minWidth: 138,
      render: (r: ProjectLine) => h('div', {}, [
        h('div', { class: 'cell-main' }, r.partName || r.name || '未命名器件'),
        h('div', { class: 'cell-sub mono' },
          [r.designators, r.partModel || r.model || ''].filter(Boolean).join(' · ') || '—')
      ])
    },
    {
      title: '需求', key: 'required', width: 50, align: 'right' as const,
      render: (r: ProjectLine) => h('b', {}, String(r.required ?? 0))
    },
    { title: '状态', key: 'status', width: 74, render: statusChip },
    { title: '', key: 'op', width: 84, render: opCell }
  ]
})
</script>

<style scoped>
.prj-page { display: flex; flex-direction: column; gap: 16px; }

/* 顶部项目切换条 */
.prj-bar { padding: 12px; display: flex; align-items: center; gap: 12px; }
.pb-search { flex: 0 0 200px; }
.prj-chips { display: flex; align-items: stretch; gap: 8px; overflow-x: auto; flex: 1; min-width: 0; padding-bottom: 2px; }
.prj-chip {
  text-align: left; border: 1px solid var(--outline); background: var(--surface); border-radius: 10px;
  padding: 8px 12px; cursor: pointer; font-family: inherit; display: flex; flex-direction: column; gap: 3px;
  min-width: 168px; flex: 0 0 auto;
  transition: background-color .15s var(--ease), border-color .15s var(--ease), box-shadow .15s var(--ease);
}
.prj-chip:hover { background: var(--surface-2); border-color: var(--outline-strong); }
.prj-chip.active {
  background: var(--primary-soft); border-color: color-mix(in srgb, var(--primary) 38%, transparent);
  box-shadow: 0 1px 0 color-mix(in srgb, var(--primary) 20%, transparent);
}
.pc-top { display: flex; align-items: center; gap: 8px; }
.pc-name { font-size: 13px; font-weight: 650; color: var(--text-1); max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pc-meta { font-size: 11px; color: var(--text-3); display: flex; align-items: center; gap: 5px; white-space: nowrap; }
.pc-meta .sep { opacity: .5; }
.pb-empty { display: flex; align-items: center; gap: 8px; color: var(--text-3); font-size: 12.5px; padding: 8px 4px; }

/* 右侧详情 */
.prj-main { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.prj-head { padding: 16px 18px; display: flex; flex-direction: column; gap: 14px; }
.head-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; flex-wrap: wrap; }
.head-main { min-width: 0; }
.prj-title { font-size: 18px; font-weight: 750; letter-spacing: -.01em; color: var(--text-1); }
.prj-meta { margin-top: 4px; font-size: 12px; color: var(--text-3); display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.prj-meta .sep { opacity: .5; }
.prj-meta .note { max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.head-actions { display: flex; align-items: center; gap: 8px; }
.head-tools { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; border-top: 1px dashed var(--outline); padding-top: 12px; }
.qty-box { display: flex; align-items: center; gap: 8px; }
.qb-label { font-size: 12px; font-weight: 600; color: var(--text-2); }
.qb-hint { font-size: 11px; color: var(--text-3); }
.tools { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

.prj-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(148px, 1fr)); gap: 12px; }
.kpi { padding: 12px 14px; display: flex; flex-direction: column; gap: 3px; }
.k-label { font-size: 11.5px; color: var(--text-3); font-weight: 600; }
.k-val { font-size: 22px; font-weight: 760; line-height: 1.2; font-variant-numeric: tabular-nums; color: var(--text-1); }
.k-val.small { font-size: 15px; padding-top: 5px; }
.k-val.good { color: var(--secondary); }
.k-val.warn { color: #c47c05; }
.k-val.bad { color: var(--accent); }
.k-hint { font-size: 11px; color: var(--text-3); }

.table-card { padding: 0; overflow: hidden; }
.table-head { display: flex; align-items: center; gap: 10px; padding: 13px 16px; border-bottom: 1px solid var(--outline); flex-wrap: wrap; }
.table-title { font-weight: 700; font-size: 14px; }
.th-right { margin-left: auto; display: flex; align-items: center; gap: 10px; }
.right-hint { font-size: 11.5px; white-space: nowrap; }
.empty-bom { padding: 46px 20px; display: flex; flex-direction: column; align-items: center; gap: 8px; color: var(--text-2); }
.eb-title { font-weight: 700; font-size: 14px; color: var(--text-1); }
.empty-bom p { margin: 0 0 6px; font-size: 12.5px; color: var(--text-3); }
.prj-empty { padding: 60px 24px; display: flex; flex-direction: column; align-items: center; gap: 8px; color: var(--text-3); }
.pe-title { font-size: 15px; font-weight: 700; color: var(--text-1); }
.prj-empty p { margin: 0 0 8px; font-size: 12.5px; max-width: 360px; text-align: center; line-height: 1.6; }

.row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.row3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
:deep(.n-form-item) { margin-bottom: 14px; }
.modal-foot { display: flex; justify-content: flex-end; gap: 8px; }
.imp-tip { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }
.imp-actions { display: flex; align-items: center; gap: 4px; }
.imp-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 12px; flex-wrap: wrap; }
.imp-foot .dim { font-size: 11.5px; }
.pick-cur { font-size: 12.5px; color: var(--text-2); background: var(--surface-2); border-radius: 8px; padding: 8px 10px; margin-bottom: 12px; }
.pick-cur .mono { margin-left: 6px; }

.desig { font-size: 12px; color: var(--text-2); }
.row-ops { display: flex; align-items: center; gap: 4px; }
.loc-text { font-size: 12px; color: var(--text-2); display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

@media (max-width: 720px) {
  .row-ops { gap: 2px; }
  .row-ops .mini-btn { width: 24px; height: 24px; }
  .row-ops .mini-btn.text { width: 26px; padding: 0; font-size: 12px; }
}
@media (max-width: 1080px) {
  .prj-bar { flex-direction: column; align-items: stretch; }
  .pb-search { flex: 0 0 auto; }
}
@media (max-width: 640px) {
  .head-actions { width: 100%; }
  .head-actions .n-select { flex: 1; }
  .head-tools { align-items: flex-start; flex-direction: column; }
  .tools { width: 100%; }
  .tools .n-button { flex: 1; }
  .row2, .row3 { grid-template-columns: 1fr; }
  .th-right { margin-left: 0; width: 100%; }
  .th-right .n-input { width: 100% !important; }
  .right-hint { display: none; }
  .prj-chip { min-width: 150px; }
}
</style>
