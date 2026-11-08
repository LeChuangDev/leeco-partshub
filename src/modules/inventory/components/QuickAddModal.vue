<template>
  <n-modal
    :show="show"
    preset="card"
    style="width: 560px; max-width: 92vw"
    :mask-closable="false"
    @update:show="(v: boolean) => $emit('update:show', v)"
  >
    <template #header>
      <div class="qa-head"><AppIcon name="zap" :size="18" /> 快速入库</div>
    </template>
    <n-steps :current="step" size="small" class="steps">
      <n-step title="选择物料" />
      <n-step title="入库信息" />
      <n-step title="确认" />
    </n-steps>

    <!-- Step 1 -->
    <div v-if="step === 1">
      <n-input v-model:value="search" placeholder="搜索已有元器件（名称 / 型号 / 料号）" @update:value="onSearch" clearable />
      <div class="result" v-if="searchResults.length">
        <div
          v-for="p in searchResults"
          :key="p.id"
          class="r-item"
          :class="{ active: selPart && selPart.id === p.id }"
          @click="selPart = p"
        >
          <div class="r-name">{{ p.name }}</div>
          <div class="r-meta">{{ p.manufacturerModel || '—' }} · {{ p.package || '—' }} · 库存 {{ p.totalQuantity ?? 0 }}</div>
        </div>
      </div>
      <n-divider>或 新建元器件</n-divider>
      <n-space vertical>
        <n-input v-model:value="newName" placeholder="新建元器件名称，如 0603 10kΩ 电阻" />
        <!-- 名称里识别到规格（如 100nf / 10k）时，直接紧贴名称给出整规格快选 -->
        <ParamComboPicker :template="quickTemplate" :params="newParams" :query="nameQuery" @apply="applyCombo" />
        <!-- 分类与封装决定参数模板，放在快选条之后 -->
        <n-space>
          <n-select v-model:value="newCat" :options="catOptions" placeholder="分类" style="width: 200px" clearable @update:value="onNewCat" />
          <n-input v-model:value="newPkg" placeholder="封装 0603" style="width: 140px" />
        </n-space>
        <!-- 选中分类后按参数模板补全电气参数，入库即建档 -->
        <div v-if="newTemplate.length" class="new-params">
          <div class="np-title">电气参数</div>
          <n-grid :cols="2" :x-gap="10" :y-gap="10">
            <n-form-item-gi v-for="p in quickTemplate" :key="p.key" :label="p.label + (p.unit ? ' (' + p.unit + ')' : '')" :show-feedback="false">
              <n-select
                v-if="p.type === 'enum'"
                v-model:value="newParams[p.key]"
                :options="(p.options || []).map((o: string) => ({ label: o, value: o }))"
                clearable placeholder="选择"
              />
              <ParamValueInput v-else v-model:value="newParams[p.key]" :param="p" />
            </n-form-item-gi>
          </n-grid>
        </div>
      </n-space>
    </div>

    <!-- Step 2 -->
    <div v-else-if="step === 2">
      <n-form label-placement="top">
        <n-grid :cols="2" :x-gap="12">
          <n-form-item-gi label="数量">
            <n-input-number v-model:value="qty" :min="1" style="width: 100%" />
          </n-form-item-gi>
          <n-form-item-gi label="单位">
            <n-select v-model:value="unit" :options="unitOptions" style="width: 100%" />
          </n-form-item-gi>
          <n-form-item-gi label="单价（元）">
            <n-input-number v-model:value="price" :min="0" :precision="4" style="width: 100%" />
          </n-form-item-gi>
          <n-form-item-gi label="存放位置">
            <n-select v-model:value="locId" :options="locOptions" placeholder="可选" clearable style="width: 100%" />
          </n-form-item-gi>
        </n-grid>
        <n-form-item label="来源 / 供应商">
          <n-select v-model:value="supplier" :options="supplierOptions" filterable tag placeholder="如 立创 / 淘宝 / 自备" clearable style="width: 100%" />
        </n-form-item>
        <n-form-item label="订单号 / 批次号">
          <n-input v-model:value="orderNo" placeholder="选填，便于对账溯源" />
        </n-form-item>
        <n-form-item label="备注">
          <n-input v-model:value="note" placeholder="选填，如 拆包散装" />
        </n-form-item>
      </n-form>
    </div>

    <!-- Step 3 -->
    <div v-else>
      <n-descriptions bordered :column="1" size="small">
        <n-descriptions-item label="元器件">{{ partLabel }}</n-descriptions-item>
        <n-descriptions-item label="封装 / 参数">{{ specLabel }}</n-descriptions-item>
        <n-descriptions-item label="数量">{{ qty }} {{ unit }}</n-descriptions-item>
        <n-descriptions-item label="单价">¥{{ price }}<template v-if="price"> · 合计 ¥{{ (price * qty).toFixed(2) }}</template></n-descriptions-item>
        <n-descriptions-item label="位置">{{ locName }}</n-descriptions-item>
        <n-descriptions-item label="来源">{{ supplier || '—' }}</n-descriptions-item>
        <n-descriptions-item label="订单号">{{ orderNo || '—' }}</n-descriptions-item>
      </n-descriptions>
    </div>

    <template #footer>
      <n-space justify="end">
        <n-button v-if="step > 1" @click="step--">上一步</n-button>
        <n-button v-if="step < 3" type="primary" :disabled="!canNext" @click="next">下一步</n-button>
        <n-button v-else type="primary" :loading="loading" @click="confirm">确认入库</n-button>
      </n-space>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { computed, h, ref, watch } from 'vue'
import {
  NModal, NSteps, NStep, NInput, NSpace, NButton, NSelect, NDivider, NForm, NFormItem,
  NInputNumber, NDescriptions, NDescriptionsItem, NGrid, NFormItemGi, useMessage
} from 'naive-ui'
import AppIcon from '@/shared/ui/AppIcon.vue'
import ParamValueInput from '@/shared/ui/ParamValueInput.vue'
import ParamComboPicker from '@/shared/ui/ParamComboPicker.vue'
import { extractParamQuery } from '@server/domain/param-suggest.js'
import { api } from '@/shared/api'
import { emitDataChanged } from '@/shared/utils/events'
import type { Category, Location, Part } from '@/shared/api/types'

const props = defineProps<{ show: boolean }>()
const emit = defineEmits<{ (e: 'update:show', v: boolean): void; (e: 'done'): void }>()
const message = useMessage()

const step = ref(1)
const search = ref('')
const searchResults = ref<Part[]>([])
const selPart = ref<Part | null>(null)
const newName = ref('')
const newCat = ref<string | null>(null)
const newPkg = ref('')
const newParams = ref<Record<string, string>>({})
const qty = ref(1)
const unit = ref('个')
const price = ref(0)
const locId = ref<string | null>(null)
const supplier = ref<string | null>(null)
const orderNo = ref('')
const note = ref('')
const loading = ref(false)

const categories = ref<Category[]>([])
const locations = ref<Location[]>([])

const catOptions = computed(() => categories.value.map((c) => ({ label: c.name, value: c.id })))
const locOptions = computed(() => locations.value.map((l) => ({ label: locLabel(l), value: l.id })))
const unitOptions = ['个', '米', '克', '卷', '片'].map((u) => ({ label: u, value: u }))
const supplierOptions = ['立创', '贸泽', '得捷', '淘宝/1688', '自备库存', '其他'].map((s) => ({ label: s, value: s }))

const newTemplate = computed(() => categories.value.find((c) => c.id === newCat.value)?.paramTemplate || [])
// 快速入库只展示前 4 个核心参数，规格快选同样只覆盖可见字段
const quickTemplate = computed(() => newTemplate.value.slice(0, 4))
const nameQuery = computed(() => extractParamQuery(newName.value))
const canNext = computed(() => (step.value === 1 ? (!!selPart.value || !!newName.value.trim()) : true))
const partLabel = computed(() => (selPart.value ? selPart.value.name : `${newName.value}${newPkg.value ? ' · ' + newPkg.value : ''}`))
const locName = computed(() => locations.value.find((l) => l.id === locId.value)?.name || '未指定')
const specLabel = computed(() => {
  const pkg = selPart.value?.package || newPkg.value
  const params = selPart.value?.params || newParams.value
  const entries = Object.entries(params || {}).filter(([, v]) => v)
  const spec = entries.map(([, v]) => v).join(' / ')
  return [pkg, spec].filter(Boolean).join(' · ') || '未填写'
})

function locLabel(l: Location): string {
  return l.parentId ? `${l.name}（${l.code}）` : l.name
}

watch(() => props.show, async (v) => {
  if (v) {
    step.value = 1
    search.value = ''; searchResults.value = []; selPart.value = null
    newName.value = ''; newCat.value = null; newPkg.value = ''; newParams.value = {}
    qty.value = 1; unit.value = '个'; price.value = 0; locId.value = null
    supplier.value = null; orderNo.value = ''; note.value = ''
    try {
      const [c, l] = await Promise.all([api.listCategories(), api.listLocations()])
      categories.value = c; locations.value = l
    } catch (e: any) { message.error(e.message) }
  }
})

function onNewCat() {
  newParams.value = {}
}

function applyCombo(values: Record<string, string>) {
  Object.assign(newParams.value, values)
}

let timer: any = null
function onSearch() {
  clearTimeout(timer)
  timer = setTimeout(async () => {
    if (!search.value.trim()) { searchResults.value = []; return }
    const r = await api.listParts({ search: search.value, pageSize: 20 })
    searchResults.value = r.list || []
  }, 250)
}

function useNew() {
  if (!newName.value.trim()) { message.warning('请输入名称'); return }
  selPart.value = {
    id: '__new__', name: newName.value, package: newPkg.value,
    categoryId: newCat.value, params: { ...newParams.value }
  } as any
}

// 名称已填但没点「使用新建的元器件」时，下一步直接采用新器件，少一次点击
function next() {
  if (step.value === 1 && !selPart.value) useNew()
  step.value++
}

async function confirm() {
  loading.value = true
  try {
    let partId = selPart.value?.id
    if (partId === '__new__') {
      const p = await api.createPart({
        name: newName.value, categoryId: newCat.value, package: newPkg.value,
        params: { ...newParams.value }
      })
      partId = p.id
    }
    await api.stockIn({
      partId, quantity: qty.value, unit: unit.value, unitPrice: price.value,
      supplier: supplier.value || '', orderNo: orderNo.value.trim(),
      locationId: locId.value, note: note.value.trim(), reason: note.value.trim() || '入库', source: 'manual'
    })
    message.success('入库成功')
    emitDataChanged()
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
.qa-head { display: flex; align-items: center; gap: 8px; font-weight: 700; }
.steps { margin-bottom: 18px; }
.result { max-height: 220px; overflow: auto; margin-top: 12px; display: flex; flex-direction: column; gap: 6px; }
.r-item {
  padding: 10px 12px; border: 1px solid var(--outline); border-radius: 10px; cursor: pointer; transition: all .15s;
}
.r-item:hover { border-color: var(--primary); background: var(--primary-soft); }
.r-item.active { border-color: var(--primary); background: var(--primary-soft); }
.r-name { font-weight: 600; }
.r-meta { font-size: 12px; color: var(--text-2); margin-top: 2px; }
.new-params { border: 1px dashed var(--outline-strong); border-radius: 10px; padding: 10px 12px; }
.np-title { font-size: 12px; font-weight: 700; color: var(--text-2); margin-bottom: 10px; }
</style>
