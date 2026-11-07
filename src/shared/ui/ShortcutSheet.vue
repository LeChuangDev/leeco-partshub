<template>
  <n-modal
    :show="show"
    preset="card"
    style="width: 600px; max-width: 94vw"
    @update:show="(v: boolean) => emit('update:show', v)"
  >
    <template #header>
      <div class="kb-head">
        <span class="kb-icon"><AppIcon name="keyboard" :size="18" /></span>
        <div>
          <div class="kb-title">键盘快捷键</div>
          <div class="kb-sub">少一次鼠标移动，多一次准确操作</div>
        </div>
      </div>
    </template>

    <div class="kb-body">
      <section v-for="g in groups" :key="g.title" class="kb-group">
        <div class="kb-gtitle">{{ g.title }}</div>
        <div class="kb-list">
          <div v-for="it in g.items" :key="it.label" class="kb-row">
            <span class="kb-label">{{ it.label }}</span>
            <span class="kb-keys">
              <template v-for="(k, i) in it.keys" :key="i">
                <span v-if="i" class="kb-plus">+</span>
                <kbd>{{ k }}</kbd>
              </template>
            </span>
          </div>
        </div>
      </section>

      <div class="kb-tip">
        <AppIcon name="info" :size="14" />
        <span>Mac 上把 Ctrl 换成 ⌘ 同样有效；在输入框内 <kbd>?</kbd> 与 <kbd>/</kbd> 不会触发，避免影响录入。</span>
      </div>
    </div>

    <template #footer>
      <div class="kb-foot">
        <span class="dim">提示：列表与详情页支持右键菜单（入库、出库、打印标签、移动位置）</span>
        <n-button size="small" @click="emit('update:show', false)">知道了</n-button>
      </div>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { NModal, NButton } from 'naive-ui'
import AppIcon from '@/shared/ui/AppIcon.vue'

defineProps<{ show: boolean }>()
const emit = defineEmits<{ (e: 'update:show', v: boolean): void }>()

const groups = [
  {
    title: '全局',
    items: [
      { label: '全局搜索', keys: ['Ctrl / ⌘', 'K'] },
      { label: '快速入库', keys: ['Ctrl / ⌘', 'I'] },
      { label: '扫码操作', keys: ['Ctrl / ⌘', 'S'] },
      { label: '打开快捷键说明', keys: ['?'] },
      { label: '关闭弹层 / 菜单', keys: ['Esc'] }
    ]
  },
  {
    title: '页面导航',
    items: [
      { label: '总览看板', keys: ['Alt', '1'] },
      { label: '元器件管理', keys: ['Alt', '2'] },
      { label: '项目 BOM', keys: ['Alt', '3'] },
      { label: 'BOM 齐套', keys: ['Alt', '4'] },
      { label: '存储位置', keys: ['Alt', '5'] },
      { label: '订单导入', keys: ['Alt', '6'] },
      { label: '备份与设置', keys: ['Alt', '7'] },
      { label: '打印标签', keys: ['Alt', '8'] }
    ]
  },
  {
    title: '列表与详情',
    items: [
      { label: '打开快捷菜单', keys: ['右键'] },
      { label: '查看详情 / 批次', keys: ['单击行'] },
      { label: '搜索框快速聚焦', keys: ['/'] }
    ]
  }
]
</script>

<style scoped>
.kb-head { display: flex; align-items: center; gap: 10px; }
.kb-icon {
  width: 34px; height: 34px; border-radius: 10px; flex-shrink: 0;
  background: var(--primary-soft); color: var(--primary);
  display: inline-flex; align-items: center; justify-content: center;
}
.kb-title { font-weight: 700; font-size: 15px; }
.kb-sub { font-size: 11.5px; color: var(--text-3); margin-top: 1px; }

.kb-body { display: flex; flex-direction: column; gap: 18px; }
.kb-group { display: flex; flex-direction: column; gap: 8px; }
.kb-gtitle { font-size: 11px; font-weight: 700; letter-spacing: .08em; color: var(--text-3); text-transform: uppercase; }
.kb-list { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 18px; }
.kb-row {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 7px 10px; border-radius: 8px; background: var(--surface-2); min-width: 0;
}
.kb-label { font-size: 12.5px; color: var(--text-1); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kb-keys { display: inline-flex; align-items: center; gap: 3px; flex-shrink: 0; }
.kb-keys kbd, .kb-tip kbd {
  font-family: var(--mono); font-size: 10.5px; line-height: 1.2; color: var(--text-2);
  background: var(--surface); border: 1px solid var(--outline-strong);
  border-bottom-width: 2px; border-radius: 5px; padding: 2px 5px; white-space: nowrap;
}
.kb-plus { color: var(--text-3); font-size: 10px; }
.kb-tip {
  display: flex; align-items: flex-start; gap: 7px;
  padding: 10px 12px; border-radius: 9px; background: var(--primary-softer);
  font-size: 11.5px; color: var(--text-2); line-height: 1.7;
}
.kb-tip > :deep(.app-icon) { margin-top: 2px; color: var(--primary); }
.kb-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.kb-foot .dim { font-size: 11.5px; }

@media (max-width: 560px) {
  .kb-list { grid-template-columns: 1fr; }
  .kb-foot .dim { display: none; }
}
</style>
