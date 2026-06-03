import { defineConfig } from 'vite'

export default defineConfig({
  // 根目录直接作为前端项目
  server: {
    port: 5173,
    host: true,
  },
  build: {
    target: 'es2020',
  },
})
