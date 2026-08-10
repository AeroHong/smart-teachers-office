const { contextBridge, ipcRenderer } = require('electron')

// 샌드박스 preload의 require는 electron과 일부 내장 모듈만 지원한다. 여기서
// require('./package.json')을 하면 preload 전체가 로드에 실패하고, 그러면
// window.smartOfficeDesktop이 아예 주입되지 않아 데스크톱 기능이 통째로 죽는다
// (렌더러 콘솔에 "Unable to load preload script"만 남아 알아채기 어렵다).
// 버전은 메인이 additionalArguments로 넘겨준다 (main.js createWindow 참고).
const VERSION_FLAG = '--app-version='
const version = process.argv.find((a) => a.startsWith(VERSION_FLAG))?.slice(VERSION_FLAG.length) || 'unknown'

// 웹 대시보드(usePresence.js, useDesktopNotifications.js 등)가 Electron 안에서
// 실행 중인지 감지하는 용도. 재실 자동 갱신 등 후속 기능은 이 마커를 보고 분기한다.
contextBridge.exposeInMainWorld('smartOfficeDesktop', {
  version,
  // 트레이로 숨겨진 창은 렌더러의 window.focus()만으로 안 돌아올 수 있어
  // 메인 프로세스가 직접 show()해야 한다 (알림 클릭 시 사용).
  focusWindow: () => ipcRenderer.send('focus-window'),

  // OS 알림 표시. 렌더러의 웹 Notification은 권한이 granted여도 Windows에서 표시되지
  // 않아(main.js의 'notify' 핸들러 주석 참고) 메인 프로세스에 위임한다.
  // route를 주면 알림 클릭 시 창을 복원하고 그 경로로 이동한다.
  notify: ({ title, body, route }) => ipcRenderer.invoke('notify', { title, body, route }),

  // 알림 클릭으로 메인이 요청한 화면 이동을 받는다. 해제 함수를 돌려준다.
  onNavigate: (handler) => {
    const listener = (_event, route) => handler(route)
    ipcRenderer.on('navigate', listener)
    return () => ipcRenderer.removeListener('navigate', listener)
  },
})
