<template>
  <n-config-provider :theme="naiveTheme" :theme-overrides="themeOverrides">
    <n-message-provider>
      <n-dialog-provider>
        <router-view />
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { darkTheme, lightTheme, NConfigProvider, NMessageProvider, NDialogProvider } from 'naive-ui'
import { useTheme } from '@/shared/stores/theme'

const themeStore = useTheme()
themeStore.init()

const naiveTheme = computed(() => (themeStore.dark ? darkTheme : lightTheme))

const themeOverrides = computed(() => {
  const dark = themeStore.dark
  return {
    common: {
      primaryColor: '#5b6cff',
      primaryColorHover: '#7480ff',
      primaryColorPressed: '#4655e8',
      primaryColorSuppl: '#7480ff',
      borderRadius: '9px',
      borderRadiusSmall: '7px',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif"
    },
    Button: {
      borderRadiusMedium: '9px',
      borderRadiusSmall: '7px',
      fontWeight: '600',
      fontWeightStrong: '650'
    },
    Input: { borderRadius: '9px' },
    Select: { peers: { InternalSelection: { borderRadius: '9px' } } },
    Card: { borderRadius: '12px' },
    DataTable: {
      borderRadius: '10px',
      thColor: dark ? '#1c2028' : '#fafbfc',
      thTextColor: dark ? '#99a2b0' : '#656d7b',
      thFontWeight: '600',
      tdColorHover: dark ? 'rgba(91, 108, 255, .10)' : 'rgba(91, 108, 255, .05)',
      borderColor: dark ? '#272b34' : '#e7e9ee'
    },
    Menu: {
      borderRadius: '9px',
      itemHeight: '40px',
      itemColorActive: dark ? 'rgba(91, 108, 255, .18)' : 'rgba(91, 108, 255, .10)',
      itemColorActiveHover: dark ? 'rgba(91, 108, 255, .24)' : 'rgba(91, 108, 255, .14)',
      itemColorHover: dark ? '#22262f' : '#f2f4f7',
      itemTextColorActive: '#5b6cff',
      itemTextColorActiveHover: '#5b6cff',
      itemIconColorActive: '#5b6cff',
      itemIconColorActiveHover: '#5b6cff'
    },
    Tree: { nodeBorderRadius: '8px' },
    Drawer: { borderRadius: '14px' }
  }
})
</script>
