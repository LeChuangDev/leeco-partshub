import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'
import { useAuth } from '../stores/auth'

const routes: RouteRecordRaw[] = [
  { path: '/login', name: 'login', component: () => import('../views/LoginView.vue') },
  { path: '/labels', name: 'labels', component: () => import('../views/LabelPrintView.vue'), meta: { title: '打印标签' } },
  {
    path: '/',
    component: () => import('../components/AppLayout.vue'),
    children: [
      { path: '', redirect: 'dashboard' },
      { path: 'dashboard', name: 'dashboard', component: () => import('../views/DashboardView.vue'), meta: { title: '总览看板', icon: 'dashboard' } },
      { path: 'parts', name: 'parts', component: () => import('../views/PartsView.vue'), meta: { title: '元器件管理', icon: 'parts' } },
      { path: 'projects', name: 'projects', component: () => import('../views/ProjectsView.vue'), meta: { title: '项目 BOM', icon: 'project' } },
      { path: 'bom', name: 'bom', component: () => import('../views/BomView.vue'), meta: { title: 'BOM 齐套', icon: 'bom' } },
      { path: 'locations', name: 'locations', component: () => import('../views/LocationsView.vue'), meta: { title: '存储位置', icon: 'location' } },
      { path: 'import', name: 'import', component: () => import('../views/ImportView.vue'), meta: { title: '订单导入', icon: 'import' } },
      { path: 'backup', name: 'backup', component: () => import('../views/BackupView.vue'), meta: { title: '备份与设置', icon: 'settings' } }
    ]
  },
  { path: '/:pathMatch(.*)*', redirect: '/dashboard' }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

router.beforeEach((to) => {
  const auth = useAuth()
  if (to.name !== 'login' && !auth.authenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (to.name === 'login' && auth.authenticated) return { name: 'dashboard' }
  return true
})

export default router
