/**
 * 교사 재실 상태
 *
 * 저장 위치: schools/{schoolId}/presence/{uid}
 *   status: 'available' | 'away' | 'busy'
 *   source: 'manual' | 'desktop'   // desktop = Electron 클라이언트가 OS 유휴시간으로 자동 판정
 *   lastActiveAt: timestamp | null // desktop 클라이언트만 기록
 *   updatedAt: timestamp
 *
 * 웹만으로는 브라우저 밖(다른 프로그램)의 입력을 감지할 수 없어 자동 판정이 불가능하다.
 * 지금은 교사가 직접 고르는 수동 방식이고, 추후 Electron 데스크톱 클라이언트가
 * powerMonitor.getSystemIdleTime()으로 같은 문서를 자동 갱신하도록 설계했다.
 */

// 마지막 갱신이 이만큼 지나면 신뢰하지 않는다 (퇴근 후 '재실'로 남는 것 방지)
export const PRESENCE_TTL_MS = 4 * 60 * 60 * 1000

export const PRESENCE = {
  available: { label: '재실',     short: '재실',   color: '#16a34a', bg: '#dcfce7' },
  busy:      { label: '수업 중',  short: '수업',   color: '#ea580c', bg: '#ffedd5' },
  away:      { label: '자리 비움', short: '비움',   color: '#64748b', bg: '#f1f5f9' },
  unknown:   { label: '확인 안 됨', short: '—',     color: '#94a3b8', bg: '#f8fafc' },
}

export const PRESENCE_ORDER = ['available', 'busy', 'away']

/** 저장된 문서에서 실제로 표시할 상태를 계산 (오래된 값은 unknown 처리) */
export function effectivePresence(doc) {
  if (!doc?.status || !PRESENCE[doc.status]) return 'unknown'
  const ms = doc.updatedAt?.toMillis?.() ?? doc.updatedAt ?? 0
  if (!ms || Date.now() - ms > PRESENCE_TTL_MS) return 'unknown'
  return doc.status
}
