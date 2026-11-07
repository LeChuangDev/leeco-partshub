import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const resolvePath = (p: string) => fileURLToPath(new URL(p, import.meta.url))

// 前端构建为纯静态产物；/api 在开发期由 tools/dev-server 提供，生产期由 EdgeOne 边缘函数提供。
// 前端始终使用相对路径 /api，无需环境判断。
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolvePath('./src'),
      '@server': resolvePath('./server')
    }
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8787', changeOrigin: true }
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // 拆分体积稳定的第三方依赖，避免业务代码每次发版都让用户重下整包
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('naive-ui') || id.includes('vueuc') || id.includes('seemly') || id.includes('css-render')) return 'naive'
          if (id.includes('/vue/') || id.includes('vue-router') || id.includes('/pinia/') || id.includes('@vue/')) return 'vue'
          if (id.includes('/qrcode') || id.includes('dijkstrajs') || id.includes('pngjs')) return 'qrcode'
          if (id.includes('/xlsx')) return 'xlsx'
        }
      }
    }
  }
})
