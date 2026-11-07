<template>
  <!--
    品牌标记 v2：单色印章式设计。
    - 一条圆角 L 形路径 = Leeco 首字母，也是料架的侧板与底板；
    - 右上小方点 = 一枚元件 / 当前料位，是全图唯一的强调色。
     刻意去掉渐变、高光与 2×2 方格堆叠，只保留两个几何元素。
  -->
  <span class="brand-mark" :style="{ '--mark-size': size + 'px' }" aria-hidden="true">
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M7.4 5.5v10.7a2.6 2.6 0 0 0 2.6 2.6H19.2"
        stroke="#fff"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <rect x="14.5" y="5.4" width="4.7" height="4.7" rx="1.5" fill="#b9fff0" />
    </svg>
  </span>
</template>

<script setup lang="ts">
// 纯装饰性标记：默认 36px，登录页用 60px；无禁用态与加载态（不承载交互状态）。
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
  border-radius: calc(var(--mark-size) * .3);
  /* 单层纯色：不做多色渐变，也不叠高光 */
  background: #3f49c9;
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, .14),
    0 2px 6px rgba(38, 46, 130, .18);
  transition: transform .24s cubic-bezier(.2, 0, 0, 1), box-shadow .24s cubic-bezier(.2, 0, 0, 1);
}

.brand-mark svg {
  position: relative;
  width: 68%;
  height: 68%;
}

/* Hover：仅 1px 位移，阴影仍保持单层 */
.brand:hover .brand-mark {
  transform: translateY(-1px);
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, .2),
    0 4px 10px rgba(38, 46, 130, .24);
}

.brand:active .brand-mark { transform: scale(.97); }

/* 若未来被链接包裹，仍可给出清晰焦点环 */
.brand-mark:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}

/* 暗色主题：底色提亮一档，避免与深色侧栏融为一体 */
[data-theme='dark'] .brand-mark {
  background: #5d66e8;
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, .18),
    0 2px 8px rgba(0, 0, 0, .28);
}

[data-theme='dark'] .brand:hover .brand-mark {
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, .26),
    0 4px 12px rgba(0, 0, 0, .34);
}

@media (prefers-reduced-motion: reduce) {
  .brand-mark { transition: none; }
  .brand:hover .brand-mark { transform: none; }
  .brand:active .brand-mark { transform: none; }
}
</style>
