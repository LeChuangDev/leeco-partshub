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
            <n-upload accept=".json" :default-upload="false" :max="1" :show-file-list="false" :disabled="restoring" @change="restore">
              <n-button :loading="restoring">
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
            当前版本范围：主数据 · 库存位置 · 订单导入 · 项目齐套 · 统计看板 · 操作日志
          </div>
          <div class="sec-actions">
            <span class="chip gray">v1.0</span>
            <span class="chip green">本地数据持久化</span>
          </div>
        </div>
      </section>
    </div>
    <!-- 恢复确认：预演数字 + 输入 RESTORE 才能提交 -->
    <n-modal v-model:show="showRestore" preset="card" title="确认覆盖恢复" style="width: 520px; max-width: 92vw" :mask-closable="false">
      <div class="restore-note">
        <b>此操作会用备份整体覆盖当前数据，且不可自动撤销。</b>
      </div>
      <div class="restore-grid">
        <div><span>备份包含</span><b>{{ dryCounts.categories ?? 0 }} 分类 · {{ dryCounts.parts ?? 0 }} 器件 · {{ dryCounts.stocks ?? 0 }} 批次</b></div>
        <div><span>备份包含</span><b>{{ dryCounts.locations ?? 0 }} 库位 · {{ dryCounts.transactions ?? 0 }} 流水 · {{ dryCounts.projects ?? 0 }} 项目</b></div>
        <div><span>当前数据</span><b>{{ currentCounts.categories ?? '—' }} 分类 · {{ currentCounts.parts ?? '—' }} 器件 · {{ currentCounts.transactions ?? '—' }} 流水</b></div>
      </div>
      <div v-if="dryWarnings.length" class="restore-warn">
        校验提示 {{ dryWarnings.length }} 条：{{ dryWarnings.slice(0, 3).join('；') }}
      </div>
      <p class="dim" style="font-size: 12px; margin: 12px 0 8px">
        已自动保存恢复前快照（本次会话内可回滚）。请输入 <code class="code">RESTORE</code> 确认覆盖：
      </p>
      <n-input v-model:value="confirmText" placeholder="输入 RESTORE" :disabled="restoring" @keyup.enter="confirmText === 'RESTORE' && doRestore()" />
      <template #footer>
        <div class="row gap-8" style="justify-content: flex-end">
          <n-button :disabled="restoring" @click="showRestore = false">取消</n-button>
          <n-button type="error" :disabled="confirmText !== 'RESTORE' || restoring" :loading="restoring" @click="doRestore">确认覆盖</n-button>
        </div>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NUpload, NInput, NModal, useDialog, useMessage } from 'naive-ui'
import { api, getToken } from '@/shared/api'
import { useAuth } from '@/modules/auth/stores/auth'
import AppIcon from '@/shared/ui/AppIcon.vue'
import PageHeader from '@/shared/ui/PageHeader.vue'
import { emitDataChanged } from '@/shared/utils/events'

const message = useMessage()
const dialog = useDialog()
const router = useRouter()
const auth = useAuth()
const loading = ref(false)
const restoring = ref(false)
const rollbackSnapshot = ref<any>(null)
const showRestore = ref(false)
const confirmText = ref('')
const pendingRestore = ref<any>(null)
const dryCounts = ref<Record<string, number>>({})
const dryWarnings = ref<string[]>([])
const currentCounts = ref<Record<string, number>>({})

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
  if (file.size > 20 * 1024 * 1024) { message.error('备份文件超过 20MB，已拒绝'); return }
  loading.value = true
  try {
    const text = await file.text()
    let data: any
    try { data = JSON.parse(text) } catch { message.error('文件不是合法 JSON'); return }

    // 服务端预演：只校验结构与引用，不写库
    const dry: any = await api.restoreDryRun(data)
    dryCounts.value = dry.counts || {}
    dryWarnings.value = dry.warnings || []
    currentCounts.value = {}
    rollbackSnapshot.value = null
    try {
      const snapshot: any = await api.exportAll()
      rollbackSnapshot.value = snapshot
      currentCounts.value = {
        categories: (snapshot.categories || []).length,
        parts: (snapshot.parts || []).length,
        transactions: (snapshot.transactions || []).length
      }
    } catch { /* 快照失败不阻断恢复，仅失去会话内回滚能力 */ }

    pendingRestore.value = data
    confirmText.value = ''
    showRestore.value = true
  } catch (e: any) {
    message.error('校验失败：' + (e?.message || e))
  } finally {
    loading.value = false
  }
}

async function doRestore() {
  if (confirmText.value !== 'RESTORE' || !pendingRestore.value) return
  restoring.value = true
  try {
    const r: any = await api.restore(pendingRestore.value)
    message.success(`恢复完成：${JSON.stringify(r.counts)}`)
    emitDataChanged()
    showRestore.value = false
    if (rollbackSnapshot.value) {
      dialog.info({
        title: '需要回滚吗？',
        content: '已保留恢复前的数据快照（仅本次会话有效）。若结果不符合预期，可立即回滚。',
        positiveText: '保留恢复结果',
        negativeText: '回滚到恢复前',
        onNegativeClick: async () => {
          try {
            await api.restore(rollbackSnapshot.value)
            message.success('已回滚到恢复前状态')
            emitDataChanged()
          } catch (e: any) {
            message.error('回滚失败：' + (e?.message || e))
            return false
          }
        }
      })
    }
  } catch (e: any) {
    message.error('恢复失败：' + (e?.message || e))
  } finally {
    restoring.value = false
  }
}

async function exportXlsx(kind: 'parts' | 'stock' | 'lowstock') {
  try {
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
    const XLSX = await import('xlsx')
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, kind)
    XLSX.writeFile(wb, `leeco-${kind}-${Date.now()}.xlsx`)
    message.success('已导出 Excel')
  } catch (e: any) {
    message.error('导出失败：' + (e?.message || e))
  }
}

function download(url: string, name: string) {
  const a = document.createElement('a'); a.href = url; a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
async function copyToken() {
  const t = getToken()
  if (!t) { message.warning('当前没有可复制的令牌'); return }
  try {
    if (!navigator.clipboard) throw new Error('clipboard unavailable')
    await navigator.clipboard.writeText(t)
    message.success('已复制')
  } catch {
    message.warning('浏览器未授权剪贴板，请手动选择复制')
  }
}
function logout() { auth.logout(); router.push({ name: 'login' }) }
</script>

<style scoped>
.restore-note { color: var(--error, #d03050); font-size: 13px; margin-bottom: 12px; }
.restore-grid { display: grid; gap: 8px; font-size: 12.5px; }
.restore-grid div { display: flex; justify-content: space-between; gap: 12px; }
.restore-grid span { color: var(--text-3); flex-shrink: 0; }
.restore-grid b { font-weight: 600; color: var(--text-1); text-align: right; }
.restore-warn { margin-top: 12px; font-size: 12px; color: var(--warning); line-height: 1.6; }

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
