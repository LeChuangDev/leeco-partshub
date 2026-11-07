<template>
  <div class="page-head">
    <div class="ph-left">
      <div v-if="eyebrow" class="ph-eyebrow">{{ eyebrow }}</div>
      <h1 class="ph-title">{{ title }}</h1>
      <p v-if="subtitle" class="ph-sub">{{ subtitle }}</p>
    </div>
    <div v-if="$slots.default" class="ph-actions">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ title: string; subtitle?: string; eyebrow?: string }>()
</script>

<style scoped>
.ph-left { min-width: 0; }
.ph-eyebrow {
  font-size: 11px; font-weight: 700; letter-spacing: .1em;
  color: var(--text-3); text-transform: uppercase; margin-bottom: 4px;
}
</style>
