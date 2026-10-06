/**
 * 구성원 구분(users.staffType).
 *
 * 권한은 role(teacher·principal·school_admin …)이 정하고, staffType은 사람의 구분만
 * 나타낸다. 강사는 role이 teacher라 교사와 권한이 같고, 도구마다 필요할 때만
 * staffType으로 가른다.
 */
export const STAFF_TYPES = ['교사', '강사', '교직원']

export const STAFF_TYPE_STYLE = {
  '교사':   { bg: '#e0f2fe', color: '#0369a1' },
  '강사':   { bg: '#fff7ed', color: '#c2410c' },
  '교직원': { bg: '#f0fdf4', color: '#15803d' },
}

/** 수업을 맡는 사람(교사·강사) — 보강교사 후보처럼 "교사"를 뜻하는 자리에서 쓴다. */
export function isTeachingStaff(staffType) {
  return staffType === '교사' || staffType === '강사'
}

/** 입력값을 알려진 구분으로 맞춘다. 모르는 값은 교사로 본다. */
export function normalizeStaffType(value) {
  return STAFF_TYPES.includes(value) ? value : '교사'
}
