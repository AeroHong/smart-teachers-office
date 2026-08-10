const { contextBridge, ipcRenderer } = require('electron')
const { version } = require('./package.json')

// 웹 대시보드(usePresence.js, useDesktopNotifications.js 등)가 Electron 안에서
// 실행 중인지 감지하는 용도. 재실 자동 갱신 등 후속 기능은 이 마커를 보고 분기한다.
contextBridge.exposeInMainWorld('smartOfficeDesktop', {
  version,
  // 트레이로 숨겨진 창은 렌더러의 window.focus()만으로 안 돌아올 수 있어
  // 메인 프로세스가 직접 show()해야 한다 (알림 클릭 시 사용).
  focusWindow: () => ipcRenderer.send('focus-window'),
})
