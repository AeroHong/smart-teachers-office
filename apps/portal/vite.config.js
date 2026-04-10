import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  plugins: [react()],
  root: resolve(__dirname),
  base: '/',
  envDir: resolve(__dirname, '../../'),  // 프로젝트 루트의 .env 읽기
  build: {
    outDir: resolve(__dirname, '../../portal'),
    emptyOutDir: true,
  },
})
