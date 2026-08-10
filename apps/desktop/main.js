const { app, BrowserWindow, Tray, Menu } = require('electron')
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
    app.setLoginItemSettings({ openAtLogin: true })
    createWindow()
    createTray()
  })

  // 창을 전부 닫아도(트레이로 숨겨도) 앱은 계속 상주한다.
  app.on('window-all-closed', () => {})
}
