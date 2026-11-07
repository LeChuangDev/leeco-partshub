<template>
  <n-drawer :show="show" :width="620" placement="right" @update:show="(v: boolean) => $emit('update:show', v)">
    <n-drawer-content :title="part?.name || '元器件详情'" :native-scrollbar="false">
      <template v-if="part">
        <!-- 概要 -->
        <div class="summary" @contextmenu.prevent="openDetailMenu">
          <div class="big">
            <span class="num" :class="{ danger: low }">{{ part.totalQuantity ?? 0 }}</span>
            <span class="unit">件</span>
            <span v-if="low" class="chip red" style="margin-left:8px">低于安全库存</span>
          </div>
          <div class="meta">
            <span class="chip gray">{{ catName }}</span>
            <span class="chip gray" v-if="part.package">{{ part.package }}</span>
            <span class="chip gray" v-if="part.manufacturerModel">{{ part.manufacturerModel }}</span>
            <span class="chip green" v-if="stockValue > 0">货值 ¥{{ stockValue.toFixed(2) }}</span>
          </div>
          <div class="chips">
            <span class="chip" v-for="t in part.tags" :key="t">{{ t }}</span>
          </div>
        </div>

        <!-- 出入库 -->
        <n-tabs type="segment" animated class="mt-16" v-model:value="tab">
          <n-tab-pane name="in" tab="入库">
            <div class="form">
              <div class="row2">
                <label class="fld">
                  <span>数量 <i>*</i></span>
                  <n-input-number v-model:value="inQty" :min="1" :precision="0" style="width:100%" />
                </label>
                <label class="fld">
                  <span>计量单位</span>
                  <n-select v-model:value="inUnit" :options="unitOptions" />
                </label>
              </div>

              <div class="row2">
                <label class="fld">
                  <span>来源 / 供应商</span>
                  <n-select
                    v-model:value="inSupplier" :options="supplierOptions" filterable tag
                    placeholder="选择或输入，如 立创 / 某宝店" clearable
                  />
                </label>
                <label class="fld">
                  <span>采购单价（元）</span>
                  <n-input-number v-model:value="inPrice" :min="0" :precision="4" style="width:100%" placeholder="0.0000" />
                </label>
              </div>

              <div class="row2">
                <label class="fld">
                  <span>订单号 / 批次号</span>
                  <n-input v-model:value="inOrderNo" placeholder="选填，便于溯源对账" clearable />
                </label>
                <label class="fld">
                  <span>存放位置</span>
                  <n-select v-model:value="inLoc" :options="locOptions" placeholder="选填" clearable filterable />
                </label>
              </div>

              <label class="fld">
                <span>备注</span>
                <n-input v-model:value="inNote" placeholder="选填，如 拆包散装 / 上批余料" clearable />
              </label>

              <div class="calc">
                本次入库 <b>{{ inQty || 0 }}</b> {{ inUnit }}
                <template v-if="inPrice"> · 金额 <b>¥{{ ((inQty || 0) * inPrice).toFixed(2) }}</b></template>
                <span v-if="inSupplier"> · 来源 {{ inSupplier }}</span>
              </div>

              <!-- 物料信息（封装 / 参数）：入库时可直接补录 -->
              <div class="pkg-block">
                <div class="pkg-head">
                  <span>物料信息（封装 / 参数）</span>
                  <span class="pkg-tip">电阻电容必填，缺失会导致重复建档</span>
                </div>
                <div class="row2">
                  <label class="fld">
                    <span>封装</span>
                    <n-input v-model:value="editPkg" placeholder="0603 / SOT-23" />
                    <em v-if="editPkg && normalizedPkg && normalizedPkg !== editPkg">将保存为 {{ normalizedPkg }}</em>
                  </label>
                  <label class="fld" v-for="p in quickParams" :key="p.key">
                    <span>{{ p.label }}<template v-if="p.unit"> ({{ p.unit }})</template></span>
                    <n-select
                      v-if="p.type === 'enum'"
                      v-model:value="editParams[p.key]"
                      :options="(p.options || []).map((o: string) => ({ label: o, value: o }))"
                      clearable placeholder="选择"
                    />
                    <n-input v-else v-model:value="editParams[p.key]" :placeholder="p.label" />
                  </label>
                </div>
              </div>

              <div class="actions">
                <n-switch v-model:value="continuous" size="small" />
                <span class="switch-label">连续录入（保留来源/单价/位置）</span>
                <div style="flex:1" />
                <n-button type="primary" strong :loading="busy" @click="doIn">确认入库</n-button>
              </div>
            </div>
          </n-tab-pane>

          <n-tab-pane name="out" tab="出库">
            <div class="form">
              <div class="row2">
                <label class="fld">
                  <span>出库数量 <i>*</i></span>
                  <n-input-number v-model:value="outQty" :min="1" :precision="0" style="width:100%" />
                </label>
                <label class="fld">
                  <span>计量单位</span>
                  <n-select v-model:value="inUnit" :options="unitOptions" disabled />
                </label>
              </div>
              <label class="fld">
                <span>用途 / 原因</span>
                <n-input v-model:value="outNote" placeholder="如 项目领料 / 损坏 / 盘点差异" clearable />
              </label>
              <div class="calc">按先进先出（FIFO）自动扣减最早入库批次，当前可用 <b>{{ part.totalQuantity ?? 0 }}</b>。</div>
              <div v-if="outStockId" class="batch-pick">
                <AppIcon name="box" :size="14" />
                <span>仅从批次 {{ outStockLabel }} 出库</span>
                <button class="batch-clear" title="改回 FIFO" @click="outStockId = null">
                  <AppIcon name="x" :size="13" />
                </button>
              </div>
              <div class="actions">
                <div style="flex:1" />
                <n-button type="warning" strong :loading="busy" @click="doOut">确认出库</n-button>
              </div>
            </div>
          </n-tab-pane>
        </n-tabs>

        <!-- 参数 -->
        <div class="block-title mt-16">电气参数</div>
        <n-descriptions v-if="paramEntries.length" bordered :column="2" size="small">
          <n-descriptions-item v-for="[k, v] in paramEntries" :key="k" :label="k">{{ v }}</n-descriptions-item>
        </n-descriptions>
        <n-empty v-else description="暂无参数，可在上方入库时补录" size="small" />

        <!-- 供应商 -->
        <div class="block-title mt-16">供应商料号</div>
        <div class="sup-list">
          <div v-for="(s, i) in part.suppliers" :key="i" class="sup">
            <span class="chip green">{{ s.platform }}</span>
            <span class="sku">{{ s.sku }}</span>
            <span class="price">¥{{ s.price }}</span>
          </div>
          <n-empty v-if="!part.suppliers.length" description="无" size="small" />
        </div>

        <!-- 库存批次 -->
        <div class="block-title mt-16">库存批次（{{ (part.stocks || []).length }}）</div>
        <div class="batch-wrap" @contextmenu.prevent="openBatchMenu">
          <n-table :single-line="false" size="small" v-if="part.stocks && part.stocks.length">
            <thead>
              <tr><th>位置</th><th>数量</th><th>单价</th><th>来源</th><th>单号</th><th>入库时间</th></tr>
            </thead>
            <tbody>
              <tr v-for="s in part.stocks" :key="s.id">
                <td>{{ locName(s.locationId) || '—' }}</td>
                <td>{{ s.quantity }} {{ s.unit }}</td>
                <td>{{ s.unitPrice ? '¥' + s.unitPrice : '—' }}</td>
                <td>{{ s.supplier || '—' }}</td>
                <td>{{ s.orderNo || '—' }}</td>
                <td>{{ fmt(s.createdAt) }}</td>
              </tr>
            </tbody>
          </n-table>
          <n-empty v-else description="暂无批次" size="small" />
        </div>
        <p class="batch-tip">提示：在批次行上右键，可指定批次出库或移动位置</p>

        <!-- 流水 -->
        <div class="block-title mt-16">出入库流水</div>
        <div class="txn">
          <div v-for="t in txns" :key="t.id" class="tx" :class="t.type">
            <span class="tx-type">{{ t.type === 'in' ? '入库' : '出库' }}</span>
            <span class="tx-q">{{ (t.type === 'in' ? '+' : '-') + t.quantity }}</span>
            <span class="tx-bal">余 {{ t.balance }}</span>
            <span class="tx-reason">{{ t.reason || '' }}<template v-if="t.orderNo"> · {{ t.orderNo }}</template></span>
            <span class="tx-time">{{ fmt(t.createdAt) }}</span>
          </div>
          <n-empty v-if="!txns.length" description="暂无流水" size="small" />
        </div>

        <n-space justify="end" class="mt-16">
          <n-button secondary @click="openQr">
            <template #icon><AppIcon name="qr" :size="15" /></template>
            扫码信息
          </n-button>
          <n-button secondary @click="printLabel">
            <template #icon><AppIcon name="printer" :size="15" /></template>
            打印标签
          </n-button>
          <n-button type="error" secondary @click="del">删除元器件</n-button>
        </n-space>
      </template>
    </n-drawer-content>
  </n-drawer>

  <n-modal v-model:show="showQr" :mask-closable="true">
    <div class="qr-modal">
      <div class="qm-head">
        <div>
          <div class="qm-title">扫码信息</div>
          <div class="qm-sub">扫码即得名称、型号、参数、库存与库位</div>
        </div>
        <button class="qm-close" title="关闭" @click="showQr = false">×</button>
      </div>
      <div class="qm-body">
        <div class="qm-code">
          <img v-if="qrUrl" :src="qrUrl" alt="器件二维码" />
        </div>
        <pre class="qm-text">{{ qrPayload }}</pre>
      </div>
      <div class="qm-foot">
        <span class="qm-hint">普通相机 / 微信扫一扫均可直接读取</span>
        <div class="row gap-8">
          <n-button size="small" secondary @click="copyQr">复制文本</n-button>
          <n-button size="small" type="primary" @click="printLabel">打印标签</n-button>
        </div>
      </div>
    </div>
  </n-modal>

  <ContextMenu v-model:show="ctx.show" :x="ctx.x" :y="ctx.y" :items="ctx.items" :title="ctxTitle" @select="onCtxSelect" />
  <MoveStockModal
    v-model:show="moveShow"
    :part-id="part?.id || null"
    :part-name="part?.name"
    :locations="locations"
    :stock-id="moveStockId"
    :stock-label="moveStockLabel"
    @done="afterMove"
  />
</template>

<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  NDrawer, NDrawerContent, NSpace, NInputNumber, NButton, NInput, NDescriptions,
  NDescriptionsItem, NTable, NEmpty, NTabs, NTabPane, NSelect, NSwitch, NModal,
  useMessage, useDialog
} from 'naive-ui'
import QRCode from 'qrcode'
import { api } from '@/shared/api'
import { normalizePackage } from '@server/domain/normalize.js'
import { buildPartQrText, isPublicOrigin } from '@server/domain/qr.js'
import AppIcon from '@/shared/ui/AppIcon.vue'
import ContextMenu from '@/shared/ui/ContextMenu.vue'
import { MoveStockModal } from '@/modules/inventory'
import type { ContextMenuItem } from '@/shared/ui/context-menu.types'
import type { Category, Location, Part, Stock, Transaction } from '@/shared/api/types'

const props = withDefaults(
  defineProps<{
    show: boolean
    partId: string | null
    categories: Category[]
    locations: Location[]
    intent?: 'detail' | 'in' | 'out' | 'qr'
  }>(),
  { intent: 'detail' }
)
const emit = defineEmits<{ (e: 'update:show', v: boolean): void; (e: 'done'): void }>()
const message = useMessage()
const dialog = useDialog()
const router = useRouter()

const part = ref<Part | null>(null)
const txns = ref<Transaction[]>([])
const tab = ref<'in' | 'out'>('in')
const busy = ref(false)
const showQr = ref(false)
const qrUrl = ref('')
const qrPayload = ref('')

// 指定批次出库 / 右键菜单 / 移动位置
const outStockId = ref<string | null>(null)
const ctx = reactive({ show: false, x: 0, y: 0, items: [] as ContextMenuItem[] })
const ctxBatch = ref<Stock | null>(null)
const ctxIsBatch = ref(false)
const moveShow = ref(false)
const moveStockId = ref<string | null>(null)
const moveStockLabel = ref('')

/* 入库表单 */
const inQty = ref<number | null>(1)
const inUnit = ref('个')
const inPrice = ref<number | null>(0)
const inSupplier = ref<string | null>(null)
const inOrderNo = ref('')
const inLoc = ref<string | null>(null)
const inNote = ref('')
const continuous = ref(true)
const editPkg = ref('')
const editParams = ref<Record<string, string>>({})

/* 出库表单 */
const outQty = ref<number | null>(1)
const outNote = ref('')

const unitOptions = ['个', '米', '克', '卷', '片', '套'].map((u) => ({ label: u, value: u }))
const supplierOptions = ['立创', '贸泽', '得捷', '淘宝/1688', '自备库存', '其他'].map((s) => ({ label: s, value: s }))
const locOptions = computed(() => props.locations.map((l) => ({ label: `${l.name}（${l.code}）`, value: l.id })))

const catName = computed(() => props.categories.find((c) => c.id === part.value?.categoryId)?.name || '未分类')
const low = computed(() => !!part.value && (part.value.totalQuantity ?? 0) < (part.value.safetyStock || 0))
const paramEntries = computed(() => Object.entries(part.value?.params || {}).filter(([, v]) => v))
const template = computed(() => props.categories.find((c) => c.id === part.value?.categoryId)?.paramTemplate || [])
// 入库区块只展示前 4 个核心参数，避免表单过长
const quickParams = computed(() => template.value.slice(0, 4))
const normalizedPkg = computed(() => (editPkg.value ? normalizePackage(editPkg.value) : ''))
const stockValue = computed(() =>
  (part.value?.stocks || []).reduce((s, b) => s + (Number(b.quantity) || 0) * (Number(b.unitPrice) || 0), 0)
)
const outStockLabel = computed(() => {
  const s = (part.value?.stocks || []).find((b) => b.id === outStockId.value)
  if (!s) return '—'
  return `${s.orderNo || s.id.slice(-6)} · ${s.quantity} ${s.unit || '件'}`
})

function locName(id: string | null) { return props.locations.find((l) => l.id === id)?.name || '' }
function fmt(s?: string) { return s ? s.slice(0, 10) : '—' }

watch(() => [props.show, props.partId, props.intent], async ([v, id]) => {
  if (v && id) {
    // 切换到另一颗料时重置表单，避免沿用上一颗的来源/单价
    inQty.value = 1; outQty.value = 1
    inSupplier.value = null; inPrice.value = null; inLoc.value = null
    inOrderNo.value = ''; inNote.value = ''; outNote.value = ''
    outStockId.value = null
    await load(id as string)
    tab.value = props.intent === 'out' ? 'out' : 'in'
    if (props.intent === 'qr') nextTick(() => openQr())
  }
}, { immediate: true })

async function load(id: string) {
  part.value = await api.getPart(id)
  txns.value = await api.listTransactions(id)
  editPkg.value = part.value?.package || ''
  const p: Record<string, string> = {}
  for (const f of template.value) p[f.key] = part.value?.params?.[f.key] || ''
  editParams.value = p
  // 用最近一次批次的来源/单价做默认值，连续补货时少填几项
  const stocks = [...(part.value?.stocks || [])].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
  if (stocks[0]) {
    inSupplier.value = inSupplier.value || stocks[0].supplier || null
    if (!inPrice.value) inPrice.value = stocks[0].unitPrice || null
    inLoc.value = inLoc.value || stocks[0].locationId || null
  }
}

async function doIn() {
  if (!part.value) return
  const qty = Number(inQty.value) || 0
  if (qty <= 0) { message.warning('请输入入库数量'); return }
  busy.value = true
  try {
    // 封装/参数有改动时先回写主数据，保证「入库即建档完整」
    const patch: any = {}
    const pkg = editPkg.value.trim()
    if (pkg && pkg !== (part.value.package || '')) patch.package = pkg
    const dirtyParams = Object.entries(editParams.value).some(([k, v]) => (part.value?.params?.[k] || '') !== v)
    if (dirtyParams) patch.params = { ...(part.value.params || {}), ...editParams.value }
    if (Object.keys(patch).length) await api.updatePart({ id: part.value.id, ...patch })

    await api.stockIn({
      partId: part.value.id,
      quantity: qty,
      unit: inUnit.value,
      unitPrice: Number(inPrice.value) || 0,
      supplier: inSupplier.value || '',
      orderNo: inOrderNo.value.trim(),
      locationId: inLoc.value,
      note: inNote.value.trim(),
      reason: inNote.value.trim() || '入库'
    })
    const amount = ((Number(inPrice.value) || 0) * qty).toFixed(2)
    message.success(`已入库 ${qty} ${inUnit.value}${Number(inPrice.value) ? ` · ¥${amount}` : ''}`)
    await load(part.value.id)
    if (continuous.value) {
      inQty.value = 1
      inNote.value = ''
    } else {
      emit('update:show', false)
    }
    emit('done')
  } catch (e: any) {
    message.error(e.message || '入库失败')
  } finally { busy.value = false }
}

async function doOut() {
  if (!part.value) return
  const qty = Number(outQty.value) || 0
  if (qty <= 0) { message.warning('请输入出库数量'); return }
  busy.value = true
  try {
    await api.stockOut({
      partId: part.value.id,
      quantity: qty,
      reason: outNote.value.trim() || '出库',
      stockId: outStockId.value || undefined
    })
    message.success(`已出库 ${qty}`)
    outStockId.value = null
    await load(part.value.id)
    emit('done')
  } catch (e: any) {
    message.error(e.message || '出库失败')
  } finally { busy.value = false }
}

function locPathOf(id: string | null) {
  const names: string[] = []
  let cur = props.locations.find((l) => l.id === id)
  let guard = 0
  while (cur && guard++ < 12) {
    names.unshift(cur.name)
    cur = props.locations.find((l) => l.id === cur!.parentId)
  }
  return names.join(' / ')
}
function mainLocationPath() {
  const batch = [...(part.value?.stocks || [])]
    .filter((b) => b.locationId && (b.quantity || 0) > 0)
    .sort((a, b) => (b.quantity || 0) - (a.quantity || 0))[0]
  return batch ? locPathOf(batch.locationId) : ''
}
async function openQr() {
  if (!part.value) return
  const p = part.value
  const labels: Record<string, string> = {}
  for (const f of template.value) labels[f.key] = f.label
  qrPayload.value = buildPartQrText(p, {
    categoryName: catName.value,
    paramLabels: labels,
    quantity: p.totalQuantity ?? 0,
    locationPath: mainLocationPath(),
    mode: 'full',
    origin: isPublicOrigin(window.location.origin) ? window.location.origin : ''
  })
  try {
    qrUrl.value = await QRCode.toDataURL(qrPayload.value, {
      width: 520, margin: 1, errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#ffffff' }
    })
    showQr.value = true
  } catch (e: any) {
    message.error('二维码生成失败：' + e.message)
  }
}
async function copyQr() {
  try {
    await navigator.clipboard.writeText(qrPayload.value)
    message.success('已复制扫码文本')
  } catch {
    message.warning('复制失败，请手动选择文本')
  }
}

function printLabel() {
  if (!part.value) return
  emit('update:show', false)
  router.push({ name: 'labels', query: { ids: part.value.id } })
}

/* ---------------- 右键菜单与批次操作 ---------------- */
const ctxTitle = computed(() => {
  if (!part.value) return ''
  if (ctxIsBatch.value && ctxBatch.value) {
    return `${part.value.name} · 批次 ${ctxBatch.value.orderNo || ctxBatch.value.id.slice(-6)}`
  }
  return part.value.name
})

function openDetailMenu(e: MouseEvent) {
  if (!part.value) return
  ctxIsBatch.value = false
  ctxBatch.value = null
  ctx.items = [
    { key: 'in', label: '入库', icon: 'import', hint: 'Ctrl I' },
    { key: 'out', label: '出库', icon: 'upload', disabled: !part.value.totalQuantity },
    { divider: true },
    { key: 'label', label: '打印标签', icon: 'printer' },
    { key: 'qr', label: '扫码信息', icon: 'qr' },
    { key: 'move', label: '移动全部批次', icon: 'move', disabled: !(part.value.stocks || []).length },
    { divider: true },
    { key: 'copy', label: '复制型号 / 料号', icon: 'copy', disabled: !(part.value.manufacturerModel || part.value.internalNo) },
    { key: 'del', label: '删除元器件', icon: 'trash', danger: true }
  ]
  ctx.x = e.clientX
  ctx.y = e.clientY
  ctx.show = true
}

function openBatchMenu(e: MouseEvent) {
  const p = part.value
  if (!p?.stocks?.length) return
  const tr = (e.target as HTMLElement)?.closest('tbody tr') as HTMLElement | null
  if (!tr || !tr.parentElement) return
  const idx = [...tr.parentElement.children].indexOf(tr)
  const batch = p.stocks[idx]
  if (!batch) return
  ctxIsBatch.value = true
  ctxBatch.value = batch
  ctx.items = [
    { key: 'out-batch', label: '从该批次出库', icon: 'upload', disabled: !(batch.quantity > 0) },
    { key: 'move-batch', label: '移动该批次位置', icon: 'move' },
    { divider: true },
    { key: 'copy-batch', label: '复制批次信息', icon: 'copy' },
    { key: 'move', label: '移动全部批次', icon: 'move' }
  ]
  ctx.x = e.clientX
  ctx.y = e.clientY
  ctx.show = true
}

function onCtxSelect(key: string) {
  const p = part.value
  if (!p) return
  if (key === 'in') { tab.value = 'in'; return }
  if (key === 'out') { tab.value = 'out'; return }
  if (key === 'out-batch') {
    const b = ctxBatch.value
    if (!b) return
    outStockId.value = b.id
    outQty.value = b.quantity || 1
    outNote.value = ''
    tab.value = 'out'
    return
  }
  if (key === 'label') { printLabel(); return }
  if (key === 'qr') { openQr(); return }
  if (key === 'move') {
    moveStockId.value = null
    moveStockLabel.value = ''
    moveShow.value = true
    return
  }
  if (key === 'move-batch') {
    const b = ctxBatch.value
    if (!b) return
    moveStockId.value = b.id
    moveStockLabel.value = `批次 ${b.orderNo || b.id.slice(-6)} · ${b.quantity} ${b.unit || '件'}`
    moveShow.value = true
    return
  }
  if (key === 'copy') { copyText(p.manufacturerModel || p.internalNo || p.name); return }
  if (key === 'copy-batch') {
    const b = ctxBatch.value
    if (!b) return
    copyText(`${p.name} · ${b.quantity}${b.unit || '件'} · ${locName(b.locationId) || '未指定'} · ${b.orderNo || '无单号'}`)
    return
  }
  if (key === 'del') del()
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    message.success('已复制')
  } catch {
    message.warning('复制失败，请手动选择文本')
  }
}

async function afterMove() {
  if (part.value) await load(part.value.id)
  emit('done')
}

async function del() {
  dialog.warning({
    title: '确认删除', content: `删除「${part.value?.name}」将一并删除其库存批次，确定？`,
    positiveText: '删除', negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await api.deletePart(part.value!.id)
        message.success('已删除')
        emit('update:show', false)
        emit('done')
      } catch (e: any) { message.error(e.message) }
    }
  })
}
</script>

<style scoped>
.summary .big { display: flex; align-items: baseline; gap: 6px; }
.summary .num { font-size: 34px; font-weight: 800; }
.summary .num.danger { color: var(--accent); }
.summary .unit { color: var(--text-2); }
.summary .meta { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
.summary .chips { display: flex; gap: 6px; margin-top: 10px; flex-wrap: wrap; }
.block-title { font-weight: 700; font-size: 14px; margin-bottom: 10px; }

.form { display: flex; flex-direction: column; gap: 12px; padding-top: 4px; }
.row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.fld { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.fld > span { font-size: 12px; color: var(--text-2); font-weight: 600; }
.fld > span i { color: var(--accent); font-style: normal; }
.fld em { font-size: 11px; color: var(--secondary); font-style: normal; }

.calc { font-size: 12px; color: var(--text-2); background: var(--surface-2); border-radius: 8px; padding: 8px 10px; }
.calc b { color: var(--text-1); }

.batch-pick {
  display: flex; align-items: center; gap: 7px;
  padding: 7px 10px; border-radius: 8px; font-size: 12px;
  background: rgba(245, 158, 11, .12); color: #b47408;
}
[data-theme='dark'] .batch-pick { color: #fbbf24; }
.batch-pick span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.batch-clear {
  width: 20px; height: 20px; border-radius: 6px; border: 0; padding: 0;
  background: transparent; color: inherit; cursor: pointer; display: inline-flex;
  align-items: center; justify-content: center; opacity: .75;
}
.batch-clear:hover { opacity: 1; background: rgba(245, 158, 11, .18); }
.batch-tip { margin: 7px 0 0; font-size: 11px; color: var(--text-3); }
.batch-wrap :deep(tbody tr) { cursor: context-menu; }
.batch-wrap :deep(tbody tr:hover td) { background: var(--primary-softer) !important; }

.pkg-block { border: 1px dashed var(--outline-strong); border-radius: 10px; padding: 12px; }
.pkg-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 10px; font-weight: 700; font-size: 13px; }
.pkg-tip { font-weight: 400; font-size: 11px; color: var(--text-3); }
.pkg-block .row2 { margin-bottom: 0; }
.pkg-block .row2 + .row2 { margin-top: 10px; }

.actions { display: flex; align-items: center; gap: 8px; }
.switch-label { font-size: 12px; color: var(--text-2); }

.sup-list { display: flex; flex-direction: column; gap: 6px; }
.sup { display: flex; align-items: center; gap: 10px; font-size: 13px; }
.sup .sku { font-weight: 600; } .sup .price { color: var(--text-2); }
.txn { display: flex; flex-direction: column; gap: 4px; max-height: 220px; overflow: auto; }
.tx { display: flex; align-items: center; gap: 10px; font-size: 13px; padding: 6px 8px; border-radius: 8px; background: var(--surface-2); }
.tx .tx-type { font-weight: 700; }
.tx.in .tx-type { color: var(--secondary); } .tx.out .tx-type { color: var(--accent); }
.tx .tx-q { font-weight: 700; } .tx .tx-bal { color: var(--text-2); } .tx .tx-reason { flex: 1; color: var(--text-2); }
.tx .tx-time { color: var(--text-3); }

@media (max-width: 560px) {
  .row2 { grid-template-columns: 1fr; }
}

/* 扫码信息弹窗 */
.qr-modal {
  width: min(520px, calc(100vw - 32px)); background: var(--surface); border-radius: 14px;
  box-shadow: var(--shadow-lg, 0 18px 48px rgba(16, 24, 40, .18)); overflow: hidden;
  border: 1px solid var(--outline);
}
.qm-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 16px 18px 12px; }
.qm-title { font-size: 15px; font-weight: 700; color: var(--text-1); }
.qm-sub { font-size: 12px; color: var(--text-3); margin-top: 3px; }
.qm-close {
  border: 0; background: transparent; color: var(--text-3); font-size: 22px; line-height: 1;
  cursor: pointer; padding: 0 2px; border-radius: 6px;
}
.qm-close:hover { color: var(--text-1); background: var(--surface-2); }
.qm-body { display: grid; grid-template-columns: 200px 1fr; gap: 16px; padding: 4px 18px 16px; align-items: start; }
.qm-code { background: #fff; border: 1px solid var(--outline); border-radius: 10px; padding: 8px; }
.qm-code img { width: 100%; display: block; image-rendering: pixelated; }
.qm-text {
  margin: 0; font-family: var(--mono); font-size: 12px; line-height: 1.65; color: var(--text-2);
  background: var(--surface-2); border-radius: 10px; padding: 10px 12px;
  white-space: pre-wrap; word-break: break-word; max-height: 260px; overflow: auto;
}
.qm-foot {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 12px 18px 16px; border-top: 1px solid var(--outline);
}
.qm-hint { font-size: 11.5px; color: var(--text-3); }
@media (max-width: 560px) {
  .qm-body { grid-template-columns: 1fr; }
  .qm-code { width: 168px; margin: 0 auto; }
}
</style>
