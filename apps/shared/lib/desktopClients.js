/**
 * 데스크톱 클라이언트 설치 현황
 *
 * 저장 위치: schools/{schoolId}/desktopClients/{uid}
 *   uid: string
 *   version: string        // 예: '0.1.7' — preload.js가 노출하는 앱 버전
 *   platform: string       // navigator.platform (예: 'Win32')
 *   firstSeenAt: timestamp // 처음 보고한 시점 (이후 갱신하지 않는다)
 *   lastSeenAt: timestamp  // 마지막 보고 시점
 *   updatedAt: timestamp
 *
 * 실행 중인 Electron 클라이언트가 스스로 기록한다(apps/dashboard/src/lib/useDesktopClientReport.js).
 * 재실(presence)과 문서를 나눈 이유는 수명주기가 달라서다 — 재실은 4시간 TTL로 신뢰도가
 * 죽는 "지금" 값이지만, 설치 현황은 마지막 목격 시점을 계속 보존해야 한다.
 *
 * 열람은 관리자만(firestore.rules) — 배포·지원용 정보라 교사 전체에 열 이유가 없다.
 */

// 자동 업데이트(electron-updater)가 들어간 첫 버전.
// 이 미만은 업데이트를 확인하러 가지도 않으므로 한 번은 수동 재설치가 필요하다.
export const MIN_AUTO_UPDATE_VERSION = '0.1.7'

// 이만큼 보고가 없으면 지금도 쓰는 중인지 알 수 없다(퇴직·PC 교체·앱 삭제).
// 보고 주기가 6시간이라 하루를 넘겨 조용하면 꺼져 있다고 본다.
export const STALE_MS = 7 * 24 * 60 * 60 * 1000

/**
 * 점으로 끊어 숫자로 비교한다. 이 앱의 버전은 electron-builder가 요구하는
 * `major.minor.patch` 형식뿐이라 프리릴리스 표기는 고려하지 않는다.
 *
 * @returns {number} a<b이면 음수, 같으면 0, a>b이면 양수
 */
export function compareVersions(a, b) {
  const pa = String(a || '').split('.').map(n => parseInt(n, 10) || 0)
  const pb = String(b || '').split('.').map(n => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const diff = (pa[i] || 0) - (pb[i] || 0)
    if (diff !== 0) return diff
  }
  return 0
}

/**
 * 지금 배포된 최신 버전이 적힌 파일. electron-updater가 업데이트를 판단할 때 읽는 바로
 * 그 파일이라(apps/desktop/package.json의 build.publish.url), 여기를 보면 "무엇이 최신인가"에
 * 대한 답이 릴리즈와 절대 어긋나지 않는다. 코드에 최신 버전을 적어 두는 방식은 릴리즈 때
 * 같이 고치는 것을 잊으면 조용히 틀린 값을 보여준다(appVersion.js가 해시로 판정하는 것과
 * 같은 이유). firebase.json이 이 파일에만 교차 출처 읽기를 열어 둔다.
 */
export const LATEST_YML_URL = 'https://smart-school-updates.web.app/latest.yml'

/** latest.yml에서 버전만 뽑는다. 형식이 다르면 null — 모르면 모른다고 답한다. */
export function parseLatestVersion(yml) {
  const m = /^version:\s*['"]?([0-9]+\.[0-9]+\.[0-9]+)['"]?\s*$/m.exec(String(yml || ''))
  return m ? m[1] : null
}

/**
 * 설치 현황 화면에 적을 상태.
 *
 *   'manual'  — 자동 업데이트가 없던 버전. 사람이 설치 파일을 직접 안내해야 한다
 *   'old'     — 자동 업데이트는 받지만 아직 최신이 아니다(앱이 켜지면 스스로 올라간다)
 *   'latest'  — 최신
 *   'unknown' — 최신 버전을 못 읽었다. 이때 '최신'이라고 단정하지 않는다
 *
 * 예전에는 0.1.7 이상이면 전부 '최신'이라고 적었다 — 0.2.3을 배포한 뒤에도 0.2.2가
 * '최신'으로 보여 누가 업데이트를 받았는지 알 수 없었다(사용자 지적, 2026-09-21).
 */
export function versionState(version, latestVersion) {
  if (needsManualReinstall(version)) return 'manual'
  if (!latestVersion) return 'unknown'
  return compareVersions(version, latestVersion) < 0 ? 'old' : 'latest'
}

/** 자동 업데이트를 못 받는 버전인가 (= 수동 재설치 안내 대상) */
export function needsManualReinstall(version) {
  if (!version || version === 'unknown') return true
  return compareVersions(version, MIN_AUTO_UPDATE_VERSION) < 0
}

/** 마지막 보고가 오래된 문서인가 */
export function isStale(doc, now = Date.now()) {
  const ms = doc?.lastSeenAt?.toMillis?.() ?? doc?.lastSeenAt ?? 0
  if (!ms) return true
  return now - ms > STALE_MS
}

/**
 * window.smartOfficeDesktop이 노출하는 버전. 일반 브라우저(Electron 밖)에서는 null —
 * useDesktopClientReport.js·useDesktopUpdateGate.js가 함께 쓴다.
 */
export function currentDesktopVersion() {
  if (typeof window === 'undefined') return null
  const v = window.smartOfficeDesktop?.version
  return typeof v === 'string' && v ? v : null
}

/**
 * 지금 버전이 최소 버전보다 낮은가 (강제 업데이트 관문, useDesktopUpdateGate.js).
 *
 * 최소 버전이 안 정해졌거나(관리자가 설정 안 함) 지금 버전을 모르면(일반 브라우저,
 * preload가 버전을 못 읽은 아주 옛 빌드) 막지 않는다 — 판단이 애매한 쪽은 항상 열어
 * 둔다. 반대로 잘못 판단해 막으면 그 사람은 앱을 아예 못 쓰게 되어 되돌릴 방법이 없다.
 */
export function isBelowMinVersion(version, minVersion) {
  if (!minVersion || !version || version === 'unknown') return false
  return compareVersions(version, minVersion) < 0
}
