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
