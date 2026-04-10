import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  plugins: [react()],
  root: resolve(__dirname),
  base: '/attendance/',
  build: {
    outDir: resolve(__dirname, '../../portal/attendance'),
    emptyOutDir: true,
  },
})
