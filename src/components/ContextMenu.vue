<template>
  <Teleport to="body">
    <Transition name="ctx">
      <div v-if="show" class="ctx-mask" @mousedown.self="close" @contextmenu.prevent="close">
        <div
          ref="panel"
          class="ctx-panel"
          role="menu"
          tabindex="-1"
          :style="{ left: pos.left + 'px', top: pos.top + 'px' }"
          @mousedown.stop
          @contextmenu.prevent
        >
          <div v-if="title" class="ctx-title">{{ title }}</div>
          <template v-for="(it, i) in items" :key="it.key || 'd' + i">
            <div v-if="it.divider" class="ctx-divider" />
            <button
              v-else
              class="ctx-item"
              :class="{ danger: it.danger, disabled: it.disabled, active: i === active }"
              role="menuitem"
              :disabled="it.disabled"
              @mouseenter="active = i"
              @click="pick(it)"
            >
              <span class="ci"><AppIcon v-if="it.icon" :name="it.icon" :size="15" /></span>
              <span class="cl">{{ it.label }}</span>
              <kbd v-if="it.hint" class="ch">{{ it.hint }}</kbd>
            </button>
          </template>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import type { ContextMenuItem } from './context-menu'

const props = withDefaults(
  defineProps<{ show: boolean; x: number; y: number; items: ContextMenuItem[]; title?: string }>(),
  { title: '' }
)
const emit = defineEmits<{ (e: 'update:show', v: boolean): void; (e: 'select', key: string): void }>()

const panel = ref<HTMLElement | null>(null)
const pos = ref({ left: 0, top: 0 })
const active = ref(-1)

function close() {
  emit('update:show', false)
}

function place() {
  const el = panel.value
  if (!el) return
  const m = 8
  const w = el.offsetWidth || 220
  const h = el.offsetHeight || 200
  pos.value = {
    left: Math.max(m, Math.min(props.x, window.innerWidth - w - m)),
    top: Math.max(m, Math.min(props.y, window.innerHeight - h - m))
  }
}

async function showAt() {
  pos.value = { left: props.x, top: props.y }
  active.value = -1
  await nextTick()
  place()
  panel.value?.focus({ preventScroll: true })
}

watch(() => props.show, (v) => { if (v) showAt(); else active.value = -1 })
watch(() => [props.x, props.y], () => { if (props.show) showAt() })

function pick(it: ContextMenuItem) {
  if (it.disabled || it.divider || !it.key) return
  emit('select', it.key)
  close()
}

function move(step: number) {
  const n = props.items.length
  if (!n) return
  let i = active.value
  // 首次用键盘时，向下从第一项开始，向上从最后一项开始
  if (i < 0) i = step > 0 ? -1 : 0
  for (let guard = 0; guard < n; guard++) {
    i = (i + step + n) % n
    const it = props.items[i]
    if (!it.divider && !it.disabled) { active.value = i; return }
  }
}

function onKey(e: KeyboardEvent) {
  if (!props.show) return
  if (e.key === 'Escape') {
    e.preventDefault()
    close()
  } else if (e.key === 'ArrowDown') {
    e.preventDefault(); move(1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault(); move(-1)
  } else if (e.key === 'Enter') {
    const it = props.items[active.value]
    if (it) { e.preventDefault(); pick(it) }
  }
}
function onClickOutside() { if (props.show) close() }

onMounted(() => {
  window.addEventListener('keydown', onKey)
  window.addEventListener('resize', onClickOutside)
  window.addEventListener('blur', onClickOutside)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('resize', onClickOutside)
  window.removeEventListener('blur', onClickOutside)
})
</script>

<style scoped>
.ctx-mask { position: fixed; inset: 0; z-index: 4200; }
.ctx-panel {
  position: fixed; min-width: 218px; max-width: 288px;
  padding: 5px; border-radius: 12px;
  background: var(--surface);
  border: 1px solid var(--outline-strong);
  box-shadow: var(--shadow-2);
  outline: none;
  user-select: none;
}
.ctx-title {
  padding: 6px 10px 7px; margin-bottom: 2px;
  font-size: 11.5px; font-weight: 700; color: var(--text-3);
  border-bottom: 1px solid var(--outline);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ctx-item {
  display: flex; align-items: center; gap: 9px; width: 100%;
  padding: 7px 9px; border: 0; border-radius: 8px;
  background: transparent; color: var(--text-1);
  font-family: inherit; font-size: 13px; text-align: left; cursor: pointer;
  transition: background-color .12s var(--ease), color .12s var(--ease);
}
.ctx-item:hover, .ctx-item.active { background: var(--primary-soft); }
.ctx-item.danger { color: var(--accent); }
.ctx-item.danger:hover, .ctx-item.danger.active { background: rgba(244, 63, 94, .1); }
.ctx-item.disabled { opacity: .42; cursor: not-allowed; }
.ci { width: 17px; display: inline-flex; justify-content: center; color: var(--text-2); flex-shrink: 0; }
.ctx-item.danger .ci { color: var(--accent); }
.ctx-item:hover .ci, .ctx-item.active .ci { color: inherit; }
.cl { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ch {
  font-family: var(--mono); font-size: 10px; color: var(--text-3);
  background: var(--surface-2); border: 1px solid var(--outline);
  border-radius: 4px; padding: 2px 5px; line-height: 1.2;
}
.ctx-divider { height: 1px; background: var(--outline); margin: 4px 6px; }

.ctx-enter-active, .ctx-leave-active { transition: opacity .13s var(--ease); }
.ctx-enter-active .ctx-panel, .ctx-leave-active .ctx-panel { transition: transform .13s var(--ease), opacity .13s var(--ease); }
.ctx-enter-from, .ctx-leave-to { opacity: 0; }
.ctx-enter-from .ctx-panel, .ctx-leave-to .ctx-panel { transform: scale(.97) translateY(-3px); opacity: 0; }
</style>
