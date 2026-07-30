// asaSubjects 담당 교사 식별 유틸 — 이메일(teacherEmails) → uid(teacherUids) 전환용.
//
// 배경
//  asaSubjects는 담당 교사를 이메일 문자열 배열(teacherEmails)로만 들고 있었다. 반면
//  나머지 시스템(teacherAssignments·teacherSubjects·presence·officeLayouts)은 전부 Firebase
//  Auth uid로 교사를 식별한다. 두 세계를 잇는 이메일 문자열 매칭은 계정 이메일이 바뀌거나
//  대소문자가 다르면 아무 에러 없이 끊긴다.
//
// 전환 원칙 — 비파괴적(additive)
//  1) 쓰기: teacherEmails는 절대 지우지 않고 그대로 저장하되, 같은 시점에 해석한
//     teacherUids를 함께 저장한다. (기존 화면·Functions·보안 규칙이 계속 동작해야 함)
//  2) 읽기(목록/배정 해석): teacherUids가 있으면 그것을 쓰고, 없으면 teacherEmails로 폴백.
//  3) 읽기(본인이 담당 교사인지 판정): uid 또는 이메일 중 하나만 맞아도 담당으로 본다(합집합).
//     마이그레이션 도중 어느 한쪽만 최신인 문서 때문에 담당 교사가 잠기는 일을 막기 위함.
//
// 교사 목록(teachers)은 /users 에서 schoolId로 조회한 [{ uid, email, ... }] 형태를 기대한다.
// (기존 코드가 쓰는 패턴과 동일 — 이메일 비교는 항상 소문자로 정규화)

export function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : ''
}

/** [{ uid, email }] → Map(소문자 이메일 → 교사) */
export function buildEmailToTeacher(teachers) {
  const map = new Map()
  ;(teachers || []).forEach((t) => {
    const key = normalizeEmail(t?.email)
    if (key && !map.has(key)) map.set(key, t)
  })
  return map
}

/**
 * 이메일 배열 → uid 배열. 계정을 찾지 못한 이메일은 조용히 버리지 않고 따로 돌려준다.
 * @returns {{ uids: string[], unmatchedEmails: string[] }}
 */
export function resolveTeacherUids(emails, teachers) {
  const byEmail = teachers instanceof Map ? teachers : buildEmailToTeacher(teachers)
  const uids = []
  const unmatchedEmails = []
  ;(emails || []).forEach((raw) => {
    const key = normalizeEmail(raw)
    if (!key) return
    const teacher = byEmail.get(key)
    if (!teacher?.uid) {
      if (!unmatchedEmails.includes(raw)) unmatchedEmails.push(raw)
      return
    }
    if (!uids.includes(teacher.uid)) uids.push(teacher.uid)
  })
  return { uids, unmatchedEmails }
}

/**
 * 과목 문서 하나를 저장할 때 얹을 담당 교사 필드.
 * teacherEmails는 입력 그대로 유지하고 teacherUids를 함께 만든다.
 * @returns {{ fields: { teacherEmails: string[], teacherUids: string[] }, unmatchedEmails: string[] }}
 */
export function teacherRefFields(emails, teachers) {
  const list = (emails || []).filter(Boolean)
  const { uids, unmatchedEmails } = resolveTeacherUids(list, teachers)
  return { fields: { teacherEmails: list, teacherUids: uids }, unmatchedEmails }
}

/**
 * 과목 문서의 담당 교사 uid 목록.
 * teacherUids가 있으면 그것을 쓰고, 없으면(기존 데이터) teacherEmails로 해석해 폴백한다.
 * 폴백 과정에서 계정을 찾지 못한 이메일은 unmatchedEmails로 보고한다.
 * @returns {{ uids: string[], unmatchedEmails: string[], source: 'uids'|'emails'|'none' }}
 */
export function subjectTeacherUids(subject, teachers) {
  const stored = (subject?.teacherUids || []).filter(Boolean)
  if (stored.length > 0) {
    return { uids: [...new Set(stored)], unmatchedEmails: [], source: 'uids' }
  }
  const emails = subject?.teacherEmails || []
  if (emails.length === 0) return { uids: [], unmatchedEmails: [], source: 'none' }
  const { uids, unmatchedEmails } = resolveTeacherUids(emails, teachers)
  return { uids, unmatchedEmails, source: 'emails' }
}

/**
 * 로그인한 사용자가 이 과목의 담당 교사인가.
 * uid가 맞거나 이메일이 맞으면 담당으로 본다(합집합) — 전환 중 잠금 방지.
 */
export function isSubjectTeacher(subject, user) {
  if (!subject || !user) return false
  const uid = user.uid || null
  if (uid && (subject.teacherUids || []).includes(uid)) return true
  const email = normalizeEmail(user.email)
  if (!email) return false
  return (subject.teacherEmails || []).some((e) => normalizeEmail(e) === email)
}

/** 이메일은 있는데 uid 매핑이 아직 없는 문서 — 백필 대상 표시용 */
export function needsUidBackfill(subject) {
  return (subject?.teacherEmails || []).length > 0 && (subject?.teacherUids || []).length === 0
}
