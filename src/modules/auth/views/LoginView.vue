<template>
  <div class="wrap">
    <div class="card login-card">
      <div class="login-mark"><BrandMark :size="60" /></div>
      <h1 class="title">{{ BRAND.name }}</h1>
      <p class="sub">{{ BRAND.english }} · {{ BRAND.tagline }}</p>

      <div v-if="devBypass" class="bypass">
        <AppIcon name="check" :size="18" />
        <span>{{ IS_OFFLINE ? '离线桌面版：数据保存在本机，无需令牌。' : '开发免密模式：本地服务已关闭令牌校验，可直接进入验证功能。' }}</span>
      </div>

      <n-input
        v-model:value="token"
        type="password"
        show-password-on="click"
        placeholder="请输入访问令牌 X-Auth-Token"
        size="large"
        :disabled="devBypass"
        @keyup.enter="submit"
      />
      <p class="hint">令牌由 EdgeOne 环境变量 <code>AUTH_TOKEN</code> 校验。<br/>本地默认：<code>dev-leeco-token</code></p>
      <n-button type="primary" size="large" block strong :loading="loading" @click="submit">
        {{ devBypass ? '直接进入系统' : '进入系统' }}
      </n-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NInput, NButton, useMessage } from 'naive-ui'
import { api } from '@/shared/api'
import { useAuth } from '@/modules/auth/stores/auth'
import AppIcon from '@/shared/ui/AppIcon.vue'
import BrandMark from '@/shared/ui/BrandMark.vue'
import { BRAND } from '@/shared/brand'
import { IS_OFFLINE } from '@/shared/offline'

const router = useRouter()
const route = useRoute()
const auth = useAuth()
const message = useMessage()
// 不预填开发令牌：生产环境该值无效，空输入框也更清晰
const token = ref('')
const loading = ref(false)
const devBypass = ref(false)

/** 记住进入登录页前想访问的地址，登录后原路返回 */
function goAfterLogin() {
  const target = typeof route.query.redirect === 'string' ? route.query.redirect : ''
  if (target && target !== '/login') router.replace(target)
  else router.replace({ name: 'dashboard' })
}

// 开发免密：本地服务关闭鉴权时，自动放行直接进入，免去输令牌步骤。
onMounted(async () => {
  try {
    const r = await api.authCheck()
    if (r.devBypass) {
      devBypass.value = true
      auth.login('dev-bypass')
      goAfterLogin()
      return
    }
    if (r.authenticated) goAfterLogin()
  } catch {
    /* 走正常登录流程 */
  }
})

async function submit() {
  if (!token.value.trim()) { message.warning('请输入令牌'); return }
  loading.value = true
  try {
    auth.login(token.value.trim())
    const r = await api.authCheck()
    if (r.authenticated) {
      message.success('验证通过')
      goAfterLogin()
    } else {
      message.error('令牌无效')
    }
  } catch (e: any) {
    message.error(e.message || '验证失败')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.wrap {
  height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px;
  background: radial-gradient(1100px 560px at 50% -10%, var(--primary-soft) 0%, var(--bg) 62%);
}
[data-theme='dark'] .wrap {
  background: radial-gradient(1100px 560px at 50% -10%, rgba(91, 108, 255, .16) 0%, var(--bg) 62%);
}
.login-card {
  width: 380px; max-width: 92vw; padding: 40px 32px; text-align: center;
  border: 1px solid var(--outline); border-radius: 20px; box-shadow: var(--shadow-2);
}
.login-mark { display: flex; justify-content: center; margin-bottom: 18px; }
.title { font-size: 23px; font-weight: 650; margin: 0; letter-spacing: .015em; }
.sub { color: var(--text-2); font-size: 13px; margin: 6px 0 24px; }
.hint { color: var(--text-3); font-size: 12px; margin: 14px 0 18px; line-height: 1.6; }
.hint code { background: rgba(120,128,140,.14); padding: 1px 6px; border-radius: 6px; color: var(--primary); }
.bypass { display: flex; align-items: center; gap: 8px; justify-content: center; color: var(--secondary); font-size: 12px; background: rgba(20,184,166,.12); padding: 8px 12px; border-radius: 10px; margin-bottom: 16px; }
</style>
