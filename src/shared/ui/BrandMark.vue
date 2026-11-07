<template>
  <!-- 品牌标记：2×2 料格构成 L（Leeco / 元件仓），虚线格 + 青色点表示待取料位 -->
  <span class="brand-mark" :style="{ '--mark-size': size + 'px' }" aria-hidden="true">
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3.2" y="3.2" width="7.6" height="7.6" rx="2.3" fill="#fff" />
      <rect x="3.2" y="13.2" width="7.6" height="7.6" rx="2.3" fill="#fff" fill-opacity=".9" />
      <rect x="13.2" y="13.2" width="7.6" height="7.6" rx="2.3" fill="#fff" fill-opacity=".78" />
      <rect x="13.65" y="3.65" width="6.7" height="6.7" rx="1.95" stroke="#fff" stroke-opacity=".5" stroke-width="1.1" />
      <circle cx="17" cy="7" r="2.05" fill="#b9fff0" />
    </svg>
  </span>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ size?: number }>(), { size: 36 })
</script>

<style scoped>
.brand-mark {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--mark-size);
  height: var(--mark-size);
  flex: 0 0 var(--mark-size);
  border-radius: calc(var(--mark-size) * .32);
  overflow: hidden;
  background: linear-gradient(145deg, #7d8dff 0%, #5b6cff 46%, #8b63f0 100%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, .34),
    inset 0 -1px 0 rgba(35, 28, 110, .16),
    0 3px 8px rgba(74, 88, 220, .2),
    0 10px 22px rgba(91, 108, 255, .18);
  transition: transform .26s cubic-bezier(.2, 0, 0, 1), box-shadow .26s cubic-bezier(.2, 0, 0, 1);
}

/* 顶部微光：只在高光区出现，不做整块廉价渐变叠加 */
.brand-mark::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(115% 85% at 16% 6%, rgba(255, 255, 255, .24), transparent 62%);
}

.brand-mark::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .16);
}

.brand-mark svg {
  position: relative;
  width: 66%;
  height: 66%;
}

.brand:hover .brand-mark {
  transform: translateY(-1px);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, .4),
    inset 0 -1px 0 rgba(35, 28, 110, .16),
    0 5px 12px rgba(74, 88, 220, .26),
    0 14px 28px rgba(91, 108, 255, .24);
}

.brand:active .brand-mark { transform: scale(.98); }

[data-theme='dark'] .brand-mark {
  background: linear-gradient(145deg, #6c7df2 0%, #4f46d8 48%, #7c4de0 100%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, .24),
    inset 0 -1px 0 rgba(10, 8, 40, .3),
    0 4px 14px rgba(66, 56, 180, .38);
}

@media (prefers-reduced-motion: reduce) {
  .brand-mark { transition: none; }
  .brand:hover .brand-mark { transform: none; }
}
</style>
