import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
import { copyFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

function copyDirSync(src, dest) {
  if (!existsSync(src)) return
  if (!existsSync(dest)) mkdirSync(dest, { recursive: true })
  for (const entry of readdirSync(src)) {
    const srcPath = join(src, entry)
    const destPath = join(dest, entry)
    statSync(srcPath).isDirectory()
      ? copyDirSync(srcPath, destPath)
      : copyFileSync(srcPath, destPath)
  }
}

// 빌드 후 manual/ 폴더를 portal/manual/ 로 복사
function copyManualPlugin() {
  return {
    name: 'copy-manual',
    closeBundle() {
      const src = resolve(__dirname, '../../manual')
      const dest = resolve(__dirname, '../../portal/manual')
      copyDirSync(src, dest)
      console.log('✅ manual/ → portal/manual/ 복사 완료')
    },
  }
}

export default defineConfig({
  plugins: [react(), copyManualPlugin()],
  root: resolve(__dirname),
  base: '/',
  envDir: resolve(__dirname, '../../'),  // 프로젝트 루트의 .env 읽기
  build: {
    outDir: resolve(__dirname, '../../portal'),
    emptyOutDir: true,
  },
})
