<template>
  <n-drawer :show="show" :width="520" placement="right" @update:show="(v: boolean) => $emit('update:show', v)">
    <n-drawer-content :title="part ? '编辑元器件' : '新建元器件'" :native-scrollbar="false">
      <n-form label-placement="top">
        <n-form-item label="名称 *">
          <n-input v-model:value="f.name" placeholder="如 0805 10kΩ 电阻" />
        </n-form-item>
        <n-grid :cols="2" :x-gap="12">
          <n-form-item-gi label="内部编号"><n-input v-model:value="f.internalNo" placeholder="R-001（可选）" /></n-form-item-gi>
          <n-form-item-gi label="分类">
            <n-select v-model:value="f.categoryId" :options="catOptions" clearable placeholder="选择分类" @update:value="onCat" />
          </n-form-item-gi>
          <n-form-item-gi label="封装"><n-input v-model:value="f.package" placeholder="0805" /></n-form-item-gi>
          <n-form-item-gi label="原厂型号"><n-input v-model:value="f.manufacturerModel" placeholder="RC0805FR" /></n-form-item-gi>
        </n-grid>
        <n-form-item label="品牌"><n-input v-model:value="f.brand" /></n-form-item>
        <n-form-item label="功能描述"><n-input v-model:value="f.description" type="textarea" :rows="2" /></n-form-item>

        <n-divider>电气参数</n-divider>
        <div v-if="template.length" class="params">
          <n-grid :cols="2" :x-gap="12">
            <n-form-item-gi v-for="p in template" :key="p.key" :label="p.label + (p.unit ? ' (' + p.unit + ')' : '')">
              <n-select v-if="p.type === 'enum'" v-model:value="f.params[p.key]" :options="(p.options||[]).map((o:string)=>({label:o,value:o}))" clearable />
              <n-input v-else v-model:value="f.params[p.key]" :placeholder="p.label" />
            </n-form-item-gi>
          </n-grid>
        </div>
        <n-empty v-else description="该分类暂无参数模板，可在分类管理中配置" size="small" />

        <n-divider>供应商料号</n-divider>
        <div v-for="(s, i) in f.suppliers" :key="i" class="sup-row">
          <n-select v-model:value="s.platform" :options="platOptions" placeholder="平台" style="width: 120px" />
          <n-input v-model:value="s.sku" placeholder="料号" />
          <n-input v-model:value="s.url" placeholder="链接" />
          <n-input-number v-model:value="s.price" :min="0" :precision="4" placeholder="单价" style="width: 110px" />
          <n-button text type="error" @click="f.suppliers.splice(i, 1)"><AppIcon name="x" :size="14" /></n-button>
        </div>
        <n-button dashed block @click="f.suppliers.push({ platform: 'lcsc', sku: '', url: '', price: 0 })">+ 添加供应商</n-button>

        <n-divider>标签与安全库存</n-divider>
        <n-dynamic-tags v-model:value="f.tags" />
        <n-form-item label="安全库存阈值" style="margin-top: 12px">
          <n-input-number v-model:value="f.safetyStock" :min="0" />
        </n-form-item>

        <n-divider>附件（数据手册 / 图片）</n-divider>
        <n-upload :default-upload="false" @change="onUpload">
          <n-button dashed block>+ 上传附件（转为 Base64 存储于 KV）</n-button>
        </n-upload>
        <div v-if="f.attachments.length" class="att">
          <div v-for="a in f.attachments" :key="a.id" class="att-item">
            <span>{{ a.name }}</span>
            <n-button text type="error" @click="removeAtt(a.id)">删除</n-button>
          </div>
        </div>
      </n-form>

      <template #footer>
        <n-space justify="end">
          <n-button @click="$emit('update:show', false)">取消</n-button>
          <n-button type="primary" :loading="loading" @click="save">保存</n-button>
        </n-space>
      </template>
    </n-drawer-content>
  </n-drawer>
</template>

<script setup lang="ts">
import { computed, h, ref, watch } from 'vue'
import {
  NDrawer, NDrawerContent, NForm, NFormItem, NFormItemGi, NGrid, NInput, NSelect,
  NInputNumber, NDivider, NDynamicTags, NButton, NUpload, NEmpty, NSpace, useMessage
} from 'naive-ui'
import { api } from '@/shared/api'
import AppIcon from '@/shared/ui/AppIcon.vue'
import type { Category, Part } from '@/shared/api/types'

const props = defineProps<{ show: boolean; part: Part | null; categories: Category[] }>()
const emit = defineEmits<{ (e: 'update:show', v: boolean): void; (e: 'done'): void }>()
const message = useMessage()

const platOptions = [
  { label: '立创 LCSC', value: 'lcsc' },
  { label: '贸泽 Mouser', value: 'mouser' },
  { label: '得捷 DigiKey', value: 'digikey' },
  { label: '淘宝/1688', value: 'taobao' }
]
const catOptions = computed(() => props.categories.map((c) => ({ label: c.name, value: c.id })))
const template = ref<any[]>([])

const blank = () => ({
  internalNo: '', name: '', categoryId: null, package: '', manufacturerModel: '',
  brand: '', description: '', suppliers: [], params: {}, tags: [], safetyStock: 0, attachments: []
})
const f = ref<any>(blank())

watch(() => props.show, (v) => {
  if (!v) return
  if (props.part) {
    const p = props.part
    f.value = {
      id: p.id, internalNo: p.internalNo, name: p.name, categoryId: p.categoryId,
      package: p.package, manufacturerModel: p.manufacturerModel, brand: p.brand,
      description: p.description, suppliers: (p.suppliers || []).map((s) => ({ ...s })),
      params: { ...(p.params || {}) }, tags: [...(p.tags || [])],
      safetyStock: p.safetyStock || 0, attachments: (p.attachments || []).map((a) => ({ ...a }))
    }
  } else {
    f.value = blank()
  }
  syncTemplate()
})

function onCat() { syncTemplate() }
function syncTemplate() {
  const c = props.categories.find((x) => x.id === f.value.categoryId)
  template.value = c ? c.paramTemplate || [] : []
}

const loading = ref(false)
async function save() {
  if (!f.value.name.trim()) { message.warning('请填写名称'); return }
  loading.value = true
  try {
    if (f.value.id) {
      const { id, ...rest } = f.value
      await api.updatePart({ id, ...rest })
      message.success('已更新')
    } else {
      await api.createPart(f.value)
      message.success('已创建')
    }
    emit('update:show', false)
    emit('done')
  } catch (e: any) {
    message.error(e.message)
  } finally {
    loading.value = false
  }
}

function onUpload(o: any) {
  const file = o?.file?.file as File
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    f.value.attachments.push({
      id: 'att_' + Date.now(), name: file.name, type: file.type || 'file',
      size: file.size, data: reader.result
    })
  }
  reader.readAsDataURL(file)
}
function removeAtt(id: string) {
  f.value.attachments = f.value.attachments.filter((a: any) => a.id !== id)
}
</script>

<style scoped>
.params { background: var(--surface-2); border-radius: 10px; padding: 12px; }
.sup-row { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; }
.att { margin-top: 10px; }
.att-item { display: flex; justify-content: space-between; padding: 6px 10px; background: var(--surface-2); border-radius: 8px; margin-bottom: 6px; font-size: 13px; }
</style>
