import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { join } from 'path'

export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
        '/api': {
            target: process.env.HEALTH_MONITOR_URL || 'http://localhost:3004',
            changeOrigin: true
        }
    }
  },
  resolve: {
    alias: {
        '@': join(__dirname, 'src')
    }
  }
})
