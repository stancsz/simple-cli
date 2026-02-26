import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { join } from 'path'

export default defineConfig({
  plugins: [react()],
  publicDir: false, // Do not copy public folder (which contains the old dashboard)
  build: {
    outDir: 'dist_agency',
    rollupOptions: {
      input: {
        main: 'agency_index.html'
      }
    }
  },
  server: {
    port: 3002
  }
})
