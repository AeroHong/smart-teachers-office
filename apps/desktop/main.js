const { app, BrowserWindow, Tray, Menu, ipcMain, session, Notification, powerMonitor } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

// 설치본에는 콘솔이 없어서 무슨 일이 일어났는지 볼 방법이 없다. 알림이 안 뜨거나
// 클릭이 안 먹을 때 증상만 보고 추측하지 않도록 userData에 기록을 남긴다.
// 경로: %APPDATA%\smart-office-desktop\desktop.log  (앱 이름이 아니라 패키지 이름 기준)
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

// 토스트 알림에 넣는 로고. Windows가 직접 읽는 이미지라 app.asar 안에 있으면 안 되고
// (package.json의 asarUnpack), ICO는 지원하지 않아 PNG를 쓴다. dev 실행에는 asar 자체가
// 없으므로 치환이 일어나지 않는다.
const TOAST_LOGO_URI = 'file:///' + path
  .join(__dirname, 'assets', 'icon.png')
  .replace('app.asar', 'app.asar.unpacked')
  .replace(/\\/g, '/')

function escapeXml(value) {
  return String(value ?? '').replace(/[<>&'"]/g, (c) => (
    { '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]
  ))
}

/**
 * Windows 토스트 XML.
 *
 * 기본 알림은 제목·본문만 나오고 어느 앱이 보냈는지 흐릿하다. 앱 로고와 출처를 넣어
 * 교사가 여러 알림 사이에서 바로 알아보게 한다.
 *
 * urgent(호출)는 duration="long"으로 약 25초간 띄운다 — 학생이 앞에서 기다리는
 * 상황이라 기본 5초는 자리를 비운 사이에 지나가버린다.
 */
function buildToastXml({ title, body, detail, category, actionLabel, urgent }) {
  // 본문은 최대 두 줄. 쪽지는 보낸 사람과 내용 앞부분을 나눠 보여준다.
  const lines = [body, detail]
    .filter(Boolean)
    .map((line) => `      <text>${escapeXml(line)}</text>`)
    .join('\n')

  return `<toast${urgent ? ' duration="long"' : ''}>
  <visual>
    <binding template="ToastGeneric">
      <image placement="appLogoOverride" src="${escapeXml(TOAST_LOGO_URI)}"/>
      <text>${escapeXml(title)}</text>
${lines}
      <text placement="attribution">${escapeXml(category ? `스마트교무실 · ${category}` : '스마트교무실')}</text>
    </binding>
  </visual>
  <actions>
    <action content="${escapeXml(actionLabel || '열기')}" arguments="open" activationType="foreground"/>
  </actions>
</toast>`
}

let mainWindow = null
let tray = null
app.isQuitting = false
// 업데이트 준비 알림의 참조. 지역 변수로만 두면 핸들러가 반환된 뒤 GC 대상이 되어
// 토스트는 떠 있는데 클릭이 씹힌다 — notify IPC 핸들러(liveNotifications)에서 이미
// 확인된 문제라 여기도 같은 방식으로 붙잡아 둔다.
let updateNotification = null

// 재실 자동 감지 — OS 유휴시간·화면 잠금을 판정해 렌더러(웹 대시보드)에 IPC로 알려준다.
// Firestore 쓰기는 메인이 아니라 렌더러가 한다(useDesktopPresence.js) — 메인 프로세스는
// 로그인 세션이 없어 직접 쓸 수 없다(알림 파이프라인의 notify 핸들러와 같은 이유).
// 임계값 5분은 자동은 '재실'↔'자리 비움'만 오가게 하는 설계(수업 중은 사람이 직접 고른다)에서
// 너무 짧으면 자리에 앉아 화면만 보는 중에도 깜빡여 신뢰를 잃는다.
const PRESENCE_IDLE_THRESHOLD_SEC = 5 * 60
const PRESENCE_POLL_INTERVAL_MS = 60 * 1000
let lastPresenceStatus = null

function broadcastPresence() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const idleState = powerMonitor.getSystemIdleState(PRESENCE_IDLE_THRESHOLD_SEC)
  // 'active' 외(idle/locked/unknown)는 전부 자리 비움으로 취급 — 알 수 없으면 있다고
  // 우기지 않는 쪽이 안전하다.
  const status = idleState === 'active' ? 'available' : 'away'
  if (status !== lastPresenceStatus) {
    log(`재실 상태 변경: ${lastPresenceStatus || '(초기)'} → ${status} (idleState=${idleState})`)
    lastPresenceStatus = status
  }
  mainWindow.webContents.send('presence-status', { status })
}

// 자동 업데이트 — "껍데기"(main.js/preload.js) 변경은 웹과 달리 재설치해야 반영되는데,
// 교사 수십 명에게 "다시 깔아주세요"는 현실적으로 불가능하다. GitHub Releases 대신
// Firebase Hosting(desktop-updates 타겟, apps/desktop/scripts/copy-release.js가 올림)을
// 쓴다 — 학교 네트워크가 GitHub 릴리스 CDN(objects.githubusercontent.com)을 자체 서명
// 인증서로 가로채는 것을 이미 빌드 단계에서 확인했고, 같은 차단이 설치된 앱의 백그라운드
// 업데이트 확인에서도 재현되면 정작 필요한 순간에 조용히 실패한다. Firebase 도메인은
// 대시보드·포털이 이미 이 네트워크에서 검증된 경로다.
const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000
// 코드 서명 여부는 아직 미정이다(PLAN_dashboardElectron.md 참고) — 미서명이어도 설치는
// 되므로 구조부터 만든다. 다만 실제 자동 설치(quitAndInstall)는 서명 없이 어떻게
// 동작하는지 이 세션에서는 검증하지 못했다(빌드 자체가 네트워크로 막힘).
function setupAutoUpdater() {
  // require를 여기(실제 packaged 실행 + whenReady 이후)까지 미룬다. electron-updater는
  // require되는 순간 내부적으로 NsisUpdater를 만들며 electron.app을 바로 읽으므로,
  // 모듈 최상단에서 미리 불러두면 dev 실행에서도 매번 그 과정을 타게 된다.
  // 이번에 새로 들어온 런타임 의존성이라 패키징 설정(files의 node_modules/** 포함 여부)이
  // 잘못돼도 창·트레이·알림 등 기존에 검증된 기능은 그대로 살아 있어야 한다 — 그래서
  // 실패를 여기서 흡수하고 자동 업데이트만 조용히 꺼진다.
  let autoUpdater
  try {
    ;({ autoUpdater } = require('electron-updater'))
  } catch (err) {
    log('[updater] electron-updater 로드 실패 — 자동 업데이트 비활성화:', err?.message || String(err))
    return
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  // 설치본은 콘솔이 없다 — 알림·재실과 같은 이유로 파일 로그를 남긴다.
  autoUpdater.logger = {
    info: (msg) => log('[updater]', msg),
    warn: (msg) => log('[updater] warn:', msg),
    error: (msg) => log('[updater] error:', msg),
  }

  autoUpdater.on('error', (err) => log('[updater] 오류:', err?.message || String(err)))
  autoUpdater.on('update-available', (info) => log(`[updater] 새 버전 발견: v${info.version}`))
  autoUpdater.on('update-downloaded', (info) => {
    log(`[updater] 다운로드 완료: v${info.version}`)
    if (!Notification.isSupported()) return
    // 트레이 상주 앱이라 완전 종료(autoInstallOnAppQuit이 실행될 시점)가 드물다 —
    // 알림을 눌러 바로 재시작·적용하는 경로를 함께 준다.
    const n = new Notification({
      title: '업데이트 준비됨',
      toastXml: buildToastXml({
        title: '업데이트 준비됨',
        body: `v${info.version} · 클릭하면 지금 다시 시작해 적용합니다`,
        category: '업데이트',
        actionLabel: '지금 재시작',
      }),
    })
    updateNotification = n
    n.on('click', () => {
      log('[updater] 알림 클릭 → 재시작 후 설치')
      app.isQuitting = true
      autoUpdater.quitAndInstall()
    })
    n.show()
  })

  const checkForUpdates = () => {
    autoUpdater.checkForUpdates().catch((err) => log('[updater] 확인 실패:', err?.message || String(err)))
  }
  // 시작 직후엔 창 로드·트레이 생성이 우선이라 30초 늦춘다.
  setTimeout(checkForUpdates, 30 * 1000)
  setInterval(checkForUpdates, UPDATE_CHECK_INTERVAL_MS)
}

// Windows 토스트 알림은 AppUserModelID로 앱을 식별한다. package.json의 appId와 같은
// 값이어야 NSIS가 만드는 시작 메뉴 바로가기의 AUMID와 일치한다.
//
// whenReady 안이 아니라 여기서 부른다 — Chromium이 알림 표시기를 초기화할 때 AUMID를
// 캐시하므로, 준비 이후에 바꾸면 이미 굳은 값이 쓰일 수 있다.
//
// 주의: Windows는 시작 메뉴에 같은 AUMID 바로가기가 있는 앱의 알림만 표시한다.
// 그래서 npm run dev:desktop(패키징 없이 electron.exe 직접 실행)에서는 알림이 뜨지
// 않는다. 알림 검증은 반드시 설치본(npm run build:desktop)으로 해야 한다.
app.setAppUserModelId('kr.seonyoo.smartoffice')

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
      // OS 기본 제목줄("업무 대시보드 · 스마트교무실" 글자 + 아이콘)을 없앤다 — Slack처럼
      // 메뉴가 곧바로 시작되는 인상을 준다(사용자 요청, 2026-08-26). frame:false만 쓰면
      // 최소화·최대화·닫기 버튼까지 같이 사라져 창을 다룰 방법이 없어지므로, Windows가
      // 그 버튼만 오른쪽 위에 겹쳐 그리게 하는 titleBarOverlay를 쓴다. 색은
      // apps/shared/theme.js의 rail.bg/rail.icon과 맞춰 우리 레일과 이어져 보이게 했다.
      // 대신 OS가 그리던 "잡아서 창을 옮기는" 영역이 사라지므로, 대시보드 쪽
      // TopBar.jsx에 -webkit-app-region: drag를 넣어 웹 콘텐츠 쪽에서 대신 담당한다.
      titleBarStyle: 'hidden',
      titleBarOverlay: {
        color: '#0f172a',
        symbolColor: '#94a3b8',
        height: 44,
      },
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
        // 문제가 생겼을 때 원격으로 봐줄 수단. 기본 메뉴를 없애면서 Ctrl+Shift+I도
        // 같이 사라지므로 여기 둔다.
        label: '개발자 도구',
        click: () => mainWindow?.webContents.openDevTools({ mode: 'detach' }),
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
    // 기본 메뉴(File·Edit·View·Window)를 없앤다. 웹 대시보드를 감싸는 껍데기라
    // 저 항목들이 하는 일이 없고, 창 위에 남아 있으면 웹앱이 아니라 별개 프로그램처럼
    // 보인다. 개발자 도구는 트레이 메뉴로 옮겼다(기본 메뉴의 단축키가 사라지므로).
    Menu.setApplicationMenu(null)

    trimLog()
    log(`앱 시작 v${app.getVersion()} packaged=${app.isPackaged} 알림지원=${Notification.isSupported()}`)
    log('argv=', process.argv.join(' '))

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

    // 페이지가 (재)로드될 때마다 렌더러의 재실 훅이 새로 마운트되므로, 다음 1분 폴링을
    // 기다리지 않고 현재 상태를 바로 알려준다.
    mainWindow.webContents.on('did-finish-load', broadcastPresence)
    setInterval(broadcastPresence, PRESENCE_POLL_INTERVAL_MS)
    // 잠금/해제는 폴링(최대 1분 지연)보다 먼저 즉시 반영한다 — 자리를 뜨며 잠그는 동작은
    // 유휴시간보다 확실한 신호다.
    powerMonitor.on('lock-screen', broadcastPresence)
    powerMonitor.on('unlock-screen', broadcastPresence)

    // dev 실행(electron.exe 직접)에서는 app-update.yml이 없어 electron-updater가 곧바로
    // 에러를 낸다 — 설치본에서만 켠다.
    if (app.isPackaged) setupAutoUpdater()
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

  ipcMain.handle('notify', (_event, opts = {}) => {
    if (!Notification.isSupported()) return false
    const { title, body, route } = opts
    // toastXml을 주면 title/body 옵션은 무시된다. 로그와 대조하기 위해 함께 넘긴다.
    const n = new Notification({ title, body, toastXml: buildToastXml(opts) })
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
