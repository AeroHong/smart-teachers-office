/**
 * ClassFlow 사용자 로그 — StudentHub `src/lib/activity.js` 코드를 그대로 가져와 컬렉션만 따로 둔다(classflowLogs).
 *  · logHub(): 기다리지 않는다. 기록이 실패해도 사용자의 작업은 계속된다.
 *  · 시각은 서버 시각만(serverTimestamp — 규칙이 request.time과 같은지 본다), 지우거나 고치지 않는다.
 */
import { collection, doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { auth, db } from '@shared/lib/firebase'
import { COL, schoolPath } from '@shared/lib/schema'

/** 액션 → 라벨·칩 색. 색이 없으면 테두리만 */
export const ACTIONS = {
  login: { label: '접속' },
  sectioning_create: { label: '작업 만들기', color: 'primary' },
  sectioning_solve: { label: '배정 실행', color: 'warning' },
  sectioning_save: { label: '저장', color: 'primary' },
  sectioning_reset: { label: '배정 초기화', color: 'error' },
  sectioning_student_change: { label: '학생 과목 조정', color: 'warning' },
  sectioning_relax: { label: '배정 불가 대안 적용', color: 'warning' },
  sectioning_delete: { label: '작업 삭제', color: 'error' },
  sectioning_export: { label: '내보내기', color: 'success' },
}

// 표시 이름 — 구글 표시이름은 "교사홍길동"처럼 직책이 붙어 있어, AuthContext가 다듬은 이름을 셸이 넣어 준다
let currentName = ''
export const setLogUserName = (name) => { currentName = name || '' }

function payload(action, summary, details = [], targetId = null, name = '') {
  const u = auth.currentUser
  return {
    action,
    summary: String(summary || '').slice(0, 300),
    details: details.slice(0, 300).map((d) => String(d).slice(0, 500)),
    targetId,
    uid: u?.uid || '',
    email: (u?.email || '').toLowerCase(),
    name: name || currentName || u?.displayName || '',
    at: serverTimestamp(),
  }
}

export const logCol = (schoolId) => collection(db, ...schoolPath(schoolId, COL.CLASSFLOW_LOGS))

/** 기다리지 않는 기록 */
export function logHub(schoolId, { action, summary, details, targetId, name }) {
  if (!schoolId || !auth.currentUser) return
  setDoc(doc(logCol(schoolId)), payload(action, summary, details, targetId, name))
    .catch((e) => console.warn('사용자 로그 기록 실패:', e.message))
}

/** "방금 / N분 전 / 오늘 HH:MM / M/D HH:MM" */
export function relativeTime(ts, now = Date.now()) {
  const d = ts?.toDate ? ts.toDate() : ts ? new Date(ts) : null
  if (!d) return ''
  const diff = (now - d.getTime()) / 60000
  const hm = d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
  if (diff < 1) return '방금'
  if (diff < 60) return `${Math.floor(diff)}분 전`
  const today = new Date(now)
  if (d.toDateString() === today.toDateString()) return `오늘 ${hm}`
  const y = new Date(now - 86400000)
  if (d.toDateString() === y.toDateString()) return `어제 ${hm}`
  return `${d.getMonth() + 1}/${d.getDate()} ${hm}`
}

/** 로그에 쓰는 작업 이름 — "2027학년도 2학년 2학기"(없으면 작업명) */
export function workLabel(p) {
  const t = [p?.year && `${p.year}학년도`, p?.grade && `${p.grade}학년`, p?.semester && `${p.semester}학기`].filter(Boolean).join(' ')
  return t || p?.title || '분반 작업'
}
