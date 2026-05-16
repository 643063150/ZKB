import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/knowledge': {
        target: 'http://172.29.84.122:8080',
        changeOrigin: true,
      },
    },
  },
})
