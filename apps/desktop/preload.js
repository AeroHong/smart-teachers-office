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
  //
  // 필드를 하나씩 옮겨 적으므로 새 옵션을 추가할 때 여기도 같이 고쳐야 한다.
  // (urgent를 여기 안 넣어서 호출 알림의 긴 표시 시간이 조용히 무시된 적이 있다.)
  //  - title/body/detail: 토스트 본문 세 줄
  //  - category: 출처 줄에 "스마트교무실 · 쪽지"처럼 덧붙는다
  //  - actionLabel: 버튼 문구
  //  - route: 클릭 시 이동할 경로
  //  - urgent: 오래 띄운다(호출)
  notify: ({ title, body, detail, category, actionLabel, route, urgent }) => ipcRenderer.invoke(
    'notify', { title, body, detail, category, actionLabel, route, urgent },
  ),

  // 알림 클릭으로 메인이 요청한 화면 이동을 받는다. 해제 함수를 돌려준다.
  onNavigate: (handler) => {
    const listener = (_event, route) => handler(route)
    ipcRenderer.on('navigate', listener)
    return () => ipcRenderer.removeListener('navigate', listener)
  },

  // 재실 자동 감지. 메인이 OS 유휴시간·화면 잠금으로 판정한 상태('available'|'away')를
  // 약 1분 간격(+ 잠금/해제 즉시)으로 보낸다. Firestore 쓰기는 렌더러가 한다
  // (useDesktopPresence.js) — 메인에는 로그인 세션이 없다.
  onPresenceStatus: (handler) => {
    const listener = (_event, payload) => handler(payload)
    ipcRenderer.on('presence-status', listener)
    return () => ipcRenderer.removeListener('presence-status', listener)
  },
})
