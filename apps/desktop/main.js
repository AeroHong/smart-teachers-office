const { app, BrowserWindow, Tray, Menu, ipcMain, session } = require('electron')
const path = require('node:path')

// 대시보드 웹앱을 그대로 로드한다 — UI는 항상 배포된 최신 버전과 동기화된다.
const DASHBOARD_URL = 'https://smart-school-dashboard.web.app'

let mainWindow = null
let tray = null
app.isQuitting = false

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })

  function createWindow() {
    mainWindow = new BrowserWindow({
      width: 1280,
      height: 860,
      icon: path.join(__dirname, 'build', 'icon.ico'),
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    })

    mainWindow.loadURL(DASHBOARD_URL)

    // 닫기(X)는 종료가 아니라 트레이로 최소화. 완전 종료는 트레이 메뉴에서만.
    mainWindow.on('close', (event) => {
      if (!app.isQuitting) {
        event.preventDefault()
        mainWindow.hide()
      }
    })
  }

  function createTray() {
    tray = new Tray(path.join(__dirname, 'build', 'icon.ico'))
    tray.setToolTip('스마트교무실')
    tray.setContextMenu(Menu.buildFromTemplate([
      {
        label: '열기',
        click: () => {
          mainWindow.show()
          mainWindow.focus()
        },
      },
      { type: 'separator' },
      {
        label: '종료',
        click: () => {
          app.isQuitting = true
          app.quit()
        },
      },
    ]))
    tray.on('double-click', () => {
      mainWindow.show()
      mainWindow.focus()
    })
  }

  app.whenReady().then(() => {
    // Windows 토스트 알림은 AppUserModelID로 앱을 식별한다. package.json의 appId와
    // 같은 값이어야 NSIS가 만드는 시작 메뉴 바로가기의 AUMID와 일치한다.
    //
    // 주의: Windows는 "시작 메뉴에 같은 AUMID 바로가기가 있는 앱"의 알림만 표시한다.
    // 그래서 `npm run dev:desktop`(패키징 없이 electron.exe 직접 실행)에서는 이 값을
    // 지정해도 알림이 뜨지 않고 Notification의 error 이벤트만 발생한다
    // (Notification.permission은 'granted'로 나오므로 권한 문제로 오인하기 쉽다).
    // 알림 검증은 반드시 설치본(npm run build:desktop)으로 해야 한다.
    app.setAppUserModelId('kr.seonyoo.smartoffice.desktop')

    // 설치본에서만 자동시작을 등록한다. dev 실행(electron.exe 직접)에서 등록하면
    // 레지스트리에 인자 없는 electron.exe 경로가 박혀, 로그인할 때마다 이 앱이 아니라
    // Electron 기본 앱이 뜬다.
    if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: true })

    // 대시보드 origin에서 알림 권한만 명시적으로 허용, 나머지(카메라·위치 등)는 거부.
    // 요청(requestPermission)과 조회(Notification.permission)가 서로 다른 핸들러를
    // 타므로 둘 다 둔다 — 조회 쪽이 없으면 'denied'가 나와 알림 코드가 첫 줄에서 멈춘다.
    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
      callback(permission === 'notifications')
    })
    session.defaultSession.setPermissionCheckHandler((_wc, permission) => (
      permission === 'notifications'
    ))

    createWindow()
    createTray()
  }).catch((err) => {
    // 여기서 던진 예외는 기본적으로 삼켜져 "창이 안 뜨는데 에러도 없는" 상태가 된다.
    console.error('[main] 초기화 실패:', err)
  })

  // 알림 클릭(useDesktopNotifications.js) → 트레이로 숨겨진 창을 다시 보여준다.
  ipcMain.on('focus-window', () => {
    if (!mainWindow) return
    mainWindow.show()
    mainWindow.focus()
  })

  // 창을 전부 닫아도(트레이로 숨겨도) 앱은 계속 상주한다.
  app.on('window-all-closed', () => {})
}
