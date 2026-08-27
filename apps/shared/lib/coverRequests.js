/**
 * 보강신청 — 순수 로직만 담는다(날짜 파싱·오픈 판정·행 검증·집계). Firestore 읽기/쓰기는
 * `apps/dashboard/src/lib/coverActions.js`에 있다 — 이 파일은 firebase.js를 import하지
 * 않아서 `node --test`로 그대로 검증할 수 있다(workRequests.js와 같은 분리 방식 —
 * 그쪽도 newRequestPayload는 순수 함수고 실제 setDoc/updateDoc은 호출부가 한다).
 *
 * 관리자가 결강 슬롯을 등록해두면 교사가 선착순으로 신청(claim)한다. 승인/반려 개념은
 * 없다. `apps/portal/src/pages/cover/*.jsx`가 이 컬렉션을 이미 쓰고 있으므로 필드
 * 이름·의미를 그대로 따른다 — 대시보드와 포털이 같은 데이터를 본다.
 *
 * 저장 경로: schools/{schoolId}/coverRequests/{id}
 *   date              string        자유형식 날짜("2025-05-20" 등, 표준 아닐 수 있음
 *                                    — parseCoverDate로 관대하게 파싱)
 *   className         string        "2-3"
 *   period            number        교시
 *   absentTeacher     string        결강교사 "이름"만(uid/email 아님, 자유입력)
 *   subject           string        자유입력
 *   status            '대기중' | '마감'
 *   coverTeacher      string|null   신청 교사 "이름"
 *   coverTeacherEmail string|null   신청 교사 이메일 — "내 것" 판정·조회 키로 씀
 *   openAt            string|null   공개 예약 시각(비면 즉시 공개)
 *   appliedAt         Timestamp|null
 *   createdAt         Timestamp
 *   createdBy         uid
 */

export const COVER_STATUS = { OPEN: '대기중', CLOSED: '마감' }

/** "YYYY-MM-DD", "YYYY. M. D.", "YYYY/M/D" 등 비표준 형식도 관대하게 파싱한다. */
export function parseCoverDate(dateStr) {
  const s = String(dateStr || '').trim()
  if (!s) return null
  const m = s.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/)
  if (m) return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10))
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

const WEEKDAY_KR = ['일', '월', '화', '수', '목', '금', '토']

/** "(월)" 같은 요일 표기. 파싱 실패하면 빈 문자열. */
export function weekdayLabel(dateStr) {
  const d = parseCoverDate(dateStr)
  return d ? `(${WEEKDAY_KR[d.getDay()]})` : ''
}

/** openAt(공개 예약) 문자열을 Date로. 형식이 이상하면 null(=이미 공개된 것으로 본다). */
export function parseOpenAt(openAtStr) {
  if (!openAtStr) return null
  const d = new Date(String(openAtStr).replace(' ', 'T'))
  return isNaN(d.getTime()) ? null : d
}

/** 지금 이 슬롯이 신청 가능하게 공개돼 있는가. */
export function isCoverOpenNow(cover, now = new Date()) {
  const openAt = parseOpenAt(cover?.openAt)
  return !openAt || openAt <= now
}

export function isCoverMine(cover, email) {
  return !!email && cover?.coverTeacherEmail === email
}

export function isCoverClosed(cover) {
  return cover?.status === COVER_STATUS.CLOSED
}

const REQUIRED_FIELDS = ['date', 'className', 'period', 'absentTeacher', 'subject']

/** 필수 항목(날짜·반·교시·결강교사·교과)이 다 채워진 행만 남긴다. */
export function validCoverRows(rows) {
  return rows.filter(r => REQUIRED_FIELDS.every(k => String(r?.[k] || '').trim()))
}

/**
 * 등록 행 하나 → Firestore에 쓸 필드 객체. 시각(serverTimestamp)·작성자(createdBy)는
 * 호출부(coverActions.js)가 채운다 — 여기는 순수 계산만.
 */
export function buildCoverRowPayload(row, teachersList = []) {
  const coverTeacherName = (row.coverTeacher || '').trim()
  const matched = teachersList.find(t => t.name === coverTeacherName)
  return {
    date: row.date.trim(),
    className: row.className.trim(),
    period: Number(row.period) || 0,
    absentTeacher: row.absentTeacher.trim(),
    subject: row.subject.trim(),
    status: coverTeacherName ? COVER_STATUS.CLOSED : COVER_STATUS.OPEN,
    coverTeacher: coverTeacherName || null,
    coverTeacherEmail: matched?.email || null,
    openAt: (row.openAt || '').trim() || null,
  }
}

/**
 * "YYYY년 M월" 형태의 월 키. 표준 "YYYY-MM" 접두 형식을 우선 보되, 비표준 날짜도
 * parseCoverDate로 한 번 더 시도한다(포털의 원래 구현은 접두 형식만 봐서 비표준 날짜이
 * 월간 집계에서 조용히 빠졌다 — 여기서는 그 사각을 없앤다).
 */
export function monthKeyOf(dateStr) {
  const m = String(dateStr || '').match(/^(\d{4})-(\d{2})/)
  if (m) return `${parseInt(m[1], 10)}년 ${parseInt(m[2], 10)}월`
  const d = parseCoverDate(dateStr)
  return d ? `${d.getFullYear()}년 ${d.getMonth() + 1}월` : null
}

/**
 * coverTeacherEmail 기준 신청 횟수 집계(월간 · 전체) — "명예의 전당"용.
 * @returns {{ email: string, name: string, totalCount: number, monthCount: number }[]}
 */
export function coverStats(history, selectedMonthKey) {
  const map = {}
  history.filter(r => r.coverTeacher && r.coverTeacherEmail).forEach(r => {
    const key = r.coverTeacherEmail
    if (!map[key]) map[key] = { email: key, name: r.coverTeacher, totalCount: 0, monthCount: 0 }
    map[key].totalCount += 1
    if (monthKeyOf(r.date) === selectedMonthKey) map[key].monthCount += 1
  })
  return Object.values(map)
}
