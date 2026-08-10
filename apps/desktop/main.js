const { app, BrowserWindow, Tray, Menu, ipcMain, session, Notification } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

// 설치본에는 콘솔이 없어서 무슨 일이 일어났는지 볼 방법이 없다. 알림이 안 뜨거나
// 클릭이 안 먹을 때 증상만 보고 추측하지 않도록 userData에 기록을 남긴다.
// 경로: %APPDATA%\스마트교무실\desktop.log
const LOG_MAX_BYTES = 512 * 1024
let logPath = null

function log(...parts) {
  try {
    if (!logPath) logPath = path.join(app.getPath('userData'), 'desktop.log')
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${parts.join(' ')}\n`)
  } catch {
    // 기록 실패가 앱 동작을 막을 이유는 없다
  }
}

// 상주 앱이라 그냥 두면 계속 커진다 — 시작할 때 커진 로그는 버리고 새로 쓴다.
function trimLog() {
  try {
    logPath = path.join(app.getPath('userData'), 'desktop.log')
    if (fs.existsSync(logPath) && fs.statSync(logPath).size > LOG_MAX_BYTES) fs.rmSync(logPath)
  } catch {
    // 무시
  }
}

// 대시보드 웹앱을 그대로 로드한다 — UI는 항상 배포된 최신 버전과 동기화된다.
const DASHBOARD_URL = 'https://smart-school-dashboard.web.app'

// 런타임에 읽는 아이콘은 assets/에 둔다. build/는 electron-builder가 빌드 리소스
// 전용으로 취급해 앱 패키지(app.asar)에 넣지 않으므로, 거기서 읽으면 설치본에서만
// Tray 생성이 실패한다 (dev에서는 파일이 있어 멀쩡히 동작해 눈치채기 어렵다).
const ICON_PATH = path.join(__dirname, 'assets', 'icon.ico')

let mainWindow = null
let tray = null
app.isQuitting = false

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    // 알림 클릭 시 Windows가 exe를 새로 띄우면 여기로 들어온다(단일 인스턴스 락).
    log('second-instance argv=', argv.join(' '))
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
      icon: ICON_PATH,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        // 샌드박스 preload는 package.json을 require할 수 없어 버전을 인자로 넘긴다.
        additionalArguments: [`--app-version=${app.getVersion()}`],
        // 트레이로 숨겨진 동안에도 렌더러가 온전히 돌아야 한다. 기본값(true)이면 숨김
        // 상태에서 처리가 조여지고, 그 여파로 Firestore 연결이 끊겼다 붙기를 반복하며
        // 알림이 늦거나 같은 문서가 다시 흘러들어온다. 알림을 받으려고 상주시키는
        // 앱이라 여기서 아끼면 목적 자체가 없어진다.
        backgroundThrottling: false,
      },
    })

    mainWindow.loadURL(DASHBOARD_URL)

    // 닫기(X)는 종료가 아니라 트레이로 최소화. 완전 종료는 트레이 메뉴에서만.
    // 단 트레이가 없으면 숨긴 창을 되살릴 수단이 없어 앱이 유령이 되므로 그냥 종료한다.
    mainWindow.on('close', (event) => {
      if (!app.isQuitting && tray) {
        event.preventDefault()
        mainWindow.hide()
      }
    })
  }

  function createTray() {
    tray = new Tray(ICON_PATH)
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
    trimLog()
    log(`앱 시작 v${app.getVersion()} packaged=${app.isPackaged} 알림지원=${Notification.isSupported()}`)
    log('argv=', process.argv.join(' '))
    // Windows 토스트 알림은 AppUserModelID로 앱을 식별한다. package.json의 appId와
    // 같은 값이어야 NSIS가 만드는 시작 메뉴 바로가기의 AUMID와 일치한다.
    //
    // 주의: Windows는 "시작 메뉴에 같은 AUMID 바로가기가 있는 앱"의 알림만 표시한다.
    // 그래서 `npm run dev:desktop`(패키징 없이 electron.exe 직접 실행)에서는 이 값을
    // 지정해도 알림이 뜨지 않고 Notification의 error 이벤트만 발생한다
    // (Notification.permission은 'granted'로 나오므로 권한 문제로 오인하기 쉽다).
    // 알림 검증은 반드시 설치본(npm run build:desktop)으로 해야 한다.
    //
    // package.json의 appId와 반드시 같아야 한다 — NSIS가 이 값으로 바로가기의 AUMID를
    // 쓰고, Windows는 그 둘이 일치할 때만 알림을 표시한다. 값을 바꾸면 Windows 입장에서
    // 완전히 다른 앱이 되므로 알림 이력·활성화 등록도 새로 시작된다.
    app.setAppUserModelId('kr.seonyoo.smartoffice')

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
    // 트레이 실패가 창까지 못 쓰게 만들면 안 된다 — 창은 이미 떠 있으므로 앱은 쓸 수 있고,
    // 닫기 동작만 '트레이 상주' 대신 '종료'로 떨어진다.
    try {
      createTray()
    } catch (err) {
      console.error('[main] 트레이 생성 실패 — 닫기가 종료로 동작한다:', err)
    }
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

  // 알림 표시는 렌더러의 웹 Notification이 아니라 메인 프로세스가 맡는다.
  // 렌더러 경로는 Notification.permission이 'granted'여도 Windows에서 토스트가
  // 뜨지 않는 것을 확인했다(show/error 이벤트조차 오지 않음). 메인 프로세스 경로는
  // 정상 동작하므로, 렌더러는 "언제 알릴지"만 판단하고 표시는 여기에 위임한다.
  // 표시 중인 알림의 참조를 붙들어 둔다. 지역 변수로만 두면 핸들러가 반환된 뒤
  // GC 대상이 되어, 토스트는 화면에 떠 있는데 클릭해도 click 이벤트가 오지 않는다.
  const liveNotifications = new Set()

  ipcMain.handle('notify', (_event, { title, body, route } = {}) => {
    if (!Notification.isSupported()) return false
    const n = new Notification({ title, body })
    liveNotifications.add(n)
    const release = () => liveNotifications.delete(n)

    log(`notify 수신: "${title}" route=${route || '(없음)'}`)

    n.on('show', () => log('  → show (Windows가 표시함)'))
    n.on('failed', (_e, err) => { log('  → failed:', err); release() })
    n.on('close', () => { log('  → close'); release() })
    n.on('click', () => {
      log('  → click')
      release()
      if (!mainWindow) { log('     mainWindow 없음 — 무시'); return }
      mainWindow.show()
      mainWindow.focus()
      if (route) {
        mainWindow.webContents.send('navigate', route)
        log(`     창 복원 + navigate ${route}`)
      }
    })

    n.show()
    return true
  })

  // 창을 전부 닫아도(트레이로 숨겨도) 앱은 계속 상주한다.
  app.on('window-all-closed', () => {})
}
