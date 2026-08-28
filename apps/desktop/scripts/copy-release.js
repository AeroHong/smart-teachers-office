// electron-builder는 "generic" provider로는 업로드를 대신해주지 않는다(다운로드용
// URL만 embed할 뿐, 파일을 어디로 올릴지는 모른다). dist/에 만들어진 설치 파일·blockmap·
// latest.yml을 Firebase Hosting(desktop-updates 타겟) 공개 디렉터리로 옮기면, 그다음은
// `firebase deploy --only hosting:desktop-updates`가 처리한다.
const fs = require('node:fs')
const path = require('node:path')

const distDir = path.join(__dirname, '..', 'dist')
const outDir = path.join(__dirname, '..', '..', '..', 'desktop-updates')
const { version } = require('../package.json')

fs.mkdirSync(outDir, { recursive: true })

// dist/는 electron-builder가 실행할 때마다 비우지 않아 예전 버전 빌드가 그대로 남는다
// (예: 0.1.5 빌드 뒤 dist/를 정리하지 않고 0.1.6을 빌드하면 둘 다 있다). 파일명에
// package.json의 현재 버전이 들어간 것만 골라, 안 쓰는 이전 exe(수십~백MB)까지
// 매번 다시 올리는 것을 막는다. latest.yml은 버전 문자열이 없어 이름으로 바로 잡는다.
const patterns = [new RegExp(`${version.replace(/\./g, '\\.')}.*\\.exe(\\.blockmap)?$`), /^latest\.yml$/]
const files = fs.readdirSync(distDir).filter((f) => patterns.some((re) => re.test(f)))

if (!files.length) {
  console.error('[copy-release] dist/에 배포할 파일이 없습니다 — 먼저 electron-builder 빌드가 끝났는지 확인하세요.')
  process.exit(1)
}

for (const f of files) {
  fs.copyFileSync(path.join(distDir, f), path.join(outDir, f))
  console.log(`[copy-release] ${f} → desktop-updates/`)
}

// 신규 PC 일괄 설치용 배치 파일(install-smart-office.bat)이 매번 같은 URL로 최신
// 설치 파일을 받아야 해서, 버전이 안 박힌 고정 파일명으로도 하나 더 둔다(한글 파일명은
// URL에서 계속 인코딩해야 해 번거롭고, 버전 번호가 바뀔 때마다 배치 파일 속 URL도
// 같이 고쳐야 하는 걸 피한다).
const installerFile = files.find((f) => /Setup .*\.exe$/.test(f) && !f.endsWith('.blockmap'))
if (installerFile) {
  fs.copyFileSync(path.join(distDir, installerFile), path.join(outDir, 'smart-office-setup-latest.exe'))
  console.log(`[copy-release] ${installerFile} → desktop-updates/smart-office-setup-latest.exe (고정 파일명)`)
}

// electron-updater는 새 버전을 받을 때 직전 버전과의 차이만 내려받는 차등 다운로드를
// 먼저 시도한다(수십~백MB를 매번 통째로 안 받아도 됨) — 그러려면 서버에 "직전 버전"의
// blockmap이 남아 있어야 한다(실측 확인: 0.1.6→0.1.7 테스트에서 이전 버전을 지워
// 뒀더니 blockmap 404로 차등 다운로드가 실패하고 전체 다운로드로 폴백했다). 그렇다고
// 전 버전을 다 쌓아두면 용량이 무한정 불어나니, 최신 2개 버전(현재+직전)만 남긴다 —
// 다음 업데이트의 차등 다운로드에 필요한 최소한이다.
const versionRe = /Setup (\d+\.\d+\.\d+)/
const allReleaseFiles = fs.readdirSync(outDir).filter((f) => f !== 'latest.yml')
const versions = [...new Set(allReleaseFiles.map((f) => f.match(versionRe)?.[1]).filter(Boolean))]
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
const keepVersions = new Set(versions.slice(-2))
for (const f of allReleaseFiles) {
  const v = f.match(versionRe)?.[1]
  if (v && !keepVersions.has(v)) {
    fs.rmSync(path.join(outDir, f))
    console.log(`[copy-release] 오래된 버전 정리: ${f}`)
  }
}
