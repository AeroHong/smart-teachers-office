import React from 'react'
import ReactDOM from 'react-dom/client'
import { ThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import { AuthProvider } from '@shared/contexts/AuthContext'
import { theme } from '@shared/theme'
import App from './App'

// 라우트마다 lazy()로 코드 스플리팅돼 있어(App.jsx), 탭을 열어둔 채로 새 버전을
// 배포하면 예전 index.html이 참조하던 청크 파일 이름이 그새 다른 해시로 바뀌어 있어
// "Failed to fetch dynamically imported module" 오류가 난다(실측, 2026-09-04 —
// 하루에도 여러 번 배포하는 이 프로젝트 특성상 자주 발생). Vite가 이런 동적 import
// 실패 시 쏘는 vite:preloadError 이벤트를 받아 새로고침해서 최신 파일 목록을 다시
// 받게 한다. 10초 내 재시도는 건너뛰어 배포와 무관한 실패(네트워크 문제 등)로 인한
// 무한 새로고침 루프를 막는다.
window.addEventListener('vite:preloadError', () => {
  const key = 'vitePreloadReloadAt'
  const last = Number(sessionStorage.getItem(key) || 0)
  if (Date.now() - last < 10000) return
  sessionStorage.setItem(key, String(Date.now()))
  window.location.reload()
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <App />
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>
)
