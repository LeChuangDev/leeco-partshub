<template>
  <div class="settings">
    <PageHeader title="备份与设置" subtitle="数据完全自控：全量导出 / 恢复、Excel 清单导出与访问令牌管理" />

    <div class="stack mt-16">
      <!-- 备份 -->
      <section class="card section">
        <div class="sec-icon" style="background: rgba(91,108,255,.12); color: var(--primary)">
          <AppIcon name="database" :size="19" />
        </div>
        <div class="sec-body">
          <div class="sec-title">全量数据备份</div>
          <div class="sec-desc">导出全部元器件、库存批次、位置与流水为标准 JSON；可随时导入完整恢复。建议每次批量入库后备份一次。</div>
          <div class="sec-actions">
            <n-button type="primary" @click="exportJson" :loading="loading">
              <template #icon><AppIcon name="download" :size="16" /></template>
              导出全量 JSON
            </n-button>
            <n-upload accept=".json" :default-upload="false" :max="1" :show-file-list="false" @change="restore">
              <n-button>
                <template #icon><AppIcon name="upload" :size="16" /></template>
                恢复备份
              </n-button>
            </n-upload>
          </div>
        </div>
      </section>

      <!-- Excel -->
      <section class="card section">
        <div class="sec-icon" style="background: rgba(20,184,166,.12); color: var(--secondary)">
          <AppIcon name="grid" :size="19" />
        </div>
        <div class="sec-body">
          <div class="sec-title">导出 Excel 清单</div>
          <div class="sec-desc">将当前数据导出为 Excel，便于盘点、对账与离线归档。</div>
          <div class="sec-actions">
            <n-button @click="exportXlsx('parts')">元器件清单</n-button>
            <n-button @click="exportXlsx('stock')">库存清单</n-button>
            <n-button @click="exportXlsx('lowstock')">低库存清单</n-button>
          </div>
        </div>
      </section>

      <!-- 令牌 -->
      <section class="card section">
        <div class="sec-icon" style="background: rgba(245,158,11,.14); color: var(--warning)">
          <AppIcon name="key" :size="19" />
        </div>
        <div class="sec-body">
          <div class="sec-title">访问令牌</div>
          <div class="sec-desc">令牌仅保存在浏览器本地，不会上传。部署到 EdgeOne 后由边缘函数环境变量 <code class="code">AUTH_TOKEN</code> 校验。</div>
          <div class="sec-actions">
            <n-input :value="masked" readonly style="width: 260px; max-width: 100%" />
            <n-button @click="copyToken">复制</n-button>
            <n-button type="error" secondary @click="logout">
              <template #icon><AppIcon name="logout" :size="15" /></template>
              退出登录
            </n-button>
          </div>
        </div>
      </section>

      <!-- 关于 -->
      <section class="card section">
        <div class="sec-icon" style="background: rgba(139,92,246,.12); color: var(--violet)">
          <AppIcon name="info" :size="19" />
        </div>
        <div class="sec-body">
          <div class="sec-title">关于</div>
          <div class="sec-desc">
            樂創元件仓 Leeco PartsHub · 个人元器件库存管理系统<br />
            架构：Vue 3 + Vite + Naive UI + Pinia ／ EdgeOne Serverless（边缘函数 + 边缘 KV）<br />
            当前版本范围：主数据 · 库存位置 · 订单导入 · 统计看板
          </div>
          <div class="sec-actions">
            <span class="chip gray">v0.2 MVP</span>
            <span class="chip green">本地数据持久化</span>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NUpload, NInput, useMessage } from 'naive-ui'
import * as XLSX from 'xlsx'
import { api, getToken } from '@/shared/api'
import { useAuth } from '@/modules/auth/stores/auth'
import AppIcon from '@/shared/ui/AppIcon.vue'
import PageHeader from '@/shared/ui/PageHeader.vue'

const message = useMessage()
const router = useRouter()
const auth = useAuth()
const loading = ref(false)

const masked = computed(() => { const t = getToken(); return t ? t.slice(0, 4) + '••••••••' + t.slice(-2) : '未设置' })

async function exportJson() {
  loading.value = true
  try {
    const data = await api.exportAll()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    download(URL.createObjectURL(blob), `leeco-backup-${Date.now()}.json`)
    message.success('已导出')
  } catch (e: any) { message.error(e.message) }
  finally { loading.value = false }
}
async function restore(o: any) {
  const file = o?.file?.file as File
  if (!file) return
  try {
    const text = await file.text()
    const data = JSON.parse(text)
    const r: any = await api.restore(data)
    message.success(`恢复完成：${JSON.stringify(r.counts)}`)
  } catch (e: any) { message.error('恢复失败：' + e.message) }
}

async function exportXlsx(kind: 'parts' | 'stock' | 'lowstock') {
  let rows: any[] = []
  if (kind === 'parts') {
    const data: any = await api.exportAll()
    const catMap = new Map((data.categories || []).map((c: any) => [c.id, c.name]))
    const qtyMap: Record<string, number> = {}
    for (const s of data.stocks || []) qtyMap[s.partId] = (qtyMap[s.partId] || 0) + (Number(s.quantity) || 0)
    rows = (data.parts || []).map((p: any) => ({
      名称: p.name, 内部编号: p.internalNo, 分类: catMap.get(p.categoryId) || '未分类', 封装: p.package,
      型号: p.manufacturerModel, 品牌: p.brand, 标签: (p.tags || []).join(','),
      库存: qtyMap[p.id] ?? 0, 安全库存: p.safetyStock || 0
    }))
  } else if (kind === 'stock') {
    const data: any = await api.exportAll()
    const partMap = new Map((data.parts || []).map((p: any) => [p.id, p]))
    const locMap = new Map((data.locations || []).map((l: any) => [l.id, l.name + ' (' + l.code + ')']))
    rows = (data.stocks || []).map((s: any) => {
      const p: any = partMap.get(s.partId) || {}
      return {
        名称: p.name || s.partId, 型号: p.manufacturerModel || '', 封装: p.package || '',
        位置: locMap.get(s.locationId) || '', 数量: s.quantity, 单位: s.unit,
        单价: s.unitPrice, 供应商: s.supplier, 订单号: s.orderNo || '', 入库时间: s.createdAt || ''
      }
    })
  } else {
    const st = await api.stats()
    rows = st.lowStock.map((l) => ({ 名称: l.name, 当前库存: l.quantity, 安全库存: l.safetyStock }))
  }
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, kind)
  XLSX.writeFile(wb, `leeco-${kind}-${Date.now()}.xlsx`)
  message.success('已导出 Excel')
}

function download(url: string, name: string) {
  const a = document.createElement('a'); a.href = url; a.download = name; a.click()
}
function copyToken() {
  navigator.clipboard?.writeText(getToken()); message.success('已复制')
}
function logout() { auth.logout(); router.push({ name: 'login' }) }
</script>

<style scoped>
.settings { max-width: 820px; margin: 0 auto; }
.stack { display: flex; flex-direction: column; gap: 12px; }
.section { display: flex; gap: 16px; padding: 20px; }
.sec-icon {
  width: 38px; height: 38px; border-radius: 11px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
}
.sec-body { flex: 1; min-width: 0; }
.sec-title { font-weight: 700; font-size: 14px; }
.sec-desc { color: var(--text-2); font-size: 12.5px; line-height: 1.65; margin-top: 4px; }
.sec-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
.sec-actions :deep(.n-upload) { display: inline-flex; width: auto; }
.code { font-family: var(--mono); font-size: 12px; background: var(--surface-3); padding: 1px 5px; border-radius: 5px; color: var(--primary); }
@media (max-width: 640px) {
  .section { padding: 16px; gap: 12px; }
}
</style>
