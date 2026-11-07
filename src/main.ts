import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './app/router'
import { setUnauthorizedHandler } from '@/shared/api'
import { useAuth } from '@/modules/auth/stores/auth'
import './styles/global.css'

// 组件按需在各页面显式导入，不做全量注册，避免把整个 naive-ui 打进首屏
const app = createApp(App)
app.use(createPinia()).use(router)

// 传输层只发出「令牌失效」信号，登录态清理属于业务侧，避免 shared → modules 反向依赖
setUnauthorizedHandler(() => {
  useAuth().logout()
  router.push({ name: 'login' })
})

app.mount('#app')
