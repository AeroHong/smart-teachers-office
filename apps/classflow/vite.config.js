import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

// 선택과목 분반 배정 — smart-class-flow.web.app (호스팅 타깃 classflow)
export default defineConfig({
  plugins: [react()],
  root: resolve(__dirname),
  base: '/',
  envDir: resolve(__dirname, '../../'),  // 프로젝트 루트의 .env 읽기
  resolve: {
    alias: {
      '@shared': resolve(__dirname, '../shared'),
    },
  },
  server: { port: 5176 },
  build: {
    outDir: resolve(__dirname, '../../classflow'),
    emptyOutDir: true,
  },
})
