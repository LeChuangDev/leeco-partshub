import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './app/router'
import { setUnauthorizedHandler } from '@/shared/api'
import { useAuth } from '@/modules/auth/stores/auth'
import { BRAND, BRAND_TITLE } from '@/shared/brand'
import './styles/global.css'

// 品牌文案统一由常量驱动：index.html 里的静态值只在无 JS 时兜底
function syncHeadMeta() {
  const description = `${BRAND.name} ${BRAND.product} — 面向个人与小团队的元器件库存管理：分类参数模板、层级库位、BOM 齐套分析、订单导入与二维码标签打印。`
  document.title = BRAND_TITLE
  const set = (attr: 'name' | 'property', key: string, content: string) => {
    let el = document.head.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null
    if (!el) {
      el = document.createElement('meta')
      el.setAttribute(attr, key)
      document.head.appendChild(el)
    }
    el.setAttribute('content', content)
  }
  set('name', 'description', description)
  set('property', 'og:title', BRAND_TITLE)
  set('property', 'og:description', `个人与小团队元器件库存管理：${BRAND.tagline}、层级库位、BOM 齐套、订单导入与标签打印。`)
}

syncHeadMeta()

// 组件按需在各页面显式导入，不做全量注册，避免把整个 naive-ui 打进首屏
const app = createApp(App)
app.use(createPinia()).use(router)

// 传输层只发出「令牌失效」信号，登录态清理属于业务侧，避免 shared → modules 反向依赖
setUnauthorizedHandler(() => {
  useAuth().logout()
  router.push({ name: 'login' })
})

app.mount('#app')
