import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './styles/global.css'

// 组件按需在各页面显式导入，不做全量注册，避免把整个 naive-ui 打进首屏
createApp(App).use(createPinia()).use(router).mount('#app')
