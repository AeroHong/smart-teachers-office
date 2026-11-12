import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

// 학교 규정집(Codex-Edu) — smart-codex-edu.web.app (호스팅 타깃 codex)
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
  server: { port: 5177 },
  build: {
    outDir: resolve(__dirname, '../../codex'),
    emptyOutDir: true,
  },
})
