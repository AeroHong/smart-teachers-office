const { contextBridge } = require('electron')
const { version } = require('./package.json')

// 웹 대시보드(usePresence.js 등)가 Electron 안에서 실행 중인지 감지하는 용도.
// 재실 자동 갱신 등 후속 기능은 이 마커를 보고 분기한다.
contextBridge.exposeInMainWorld('smartOfficeDesktop', {
  version,
})
