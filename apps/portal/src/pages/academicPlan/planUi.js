/** 학사일정 화면·인쇄 공통 색과 문구 */
export const ACCENT = '#0f766e'
export const ACCENT_BG = '#f0fdfa'

/**
 * 일정 유형별 칩 색 — 인쇄(academicPlanPrint.js)도 같은 값을 쓴다.
 * 배경(흰 칸)·칸 선과 확실히 구분되게 채도를 올리고 테두리(bd)를 둔다.
 */
export const KIND_STYLE = {
  일반: { bg: '#e2e8f0', fg: '#0f172a', bd: '#94a3b8' },
  개학: { bg: '#bfdbfe', fg: '#1e3a8a', bd: '#3b82f6' },
  방학식: { bg: '#bfdbfe', fg: '#1e3a8a', bd: '#3b82f6' },
  종업식: { bg: '#bfdbfe', fg: '#1e3a8a', bd: '#3b82f6' },
  졸업식: { bg: '#bfdbfe', fg: '#1e3a8a', bd: '#3b82f6' },
  정기고사: { bg: '#fde68a', fg: '#713f12', bd: '#d97706' },
  재량휴업: { bg: '#fecaca', fg: '#7f1d1d', bd: '#ef4444' },
  공휴일: { bg: '#fecaca', fg: '#7f1d1d', bd: '#ef4444' },
  요일교체: { bg: '#ddd6fe', fg: '#4c1d95', bd: '#8b5cf6' },
}

/**
 * 관련 부서 색 — 학년도 설정(academicPlanYears.deptColors: { 부서: 키 })에 키로 저장.
 * '일반' 일정만 부서 색을 입는다(개학·고사·휴업 등 유형 색이 더 중요).
 */
export const DEPT_PALETTE = {
  teal: { name: '청록', bg: '#ccfbf1', fg: '#134e4a', bd: '#14b8a6' },
  green: { name: '초록', bg: '#dcfce7', fg: '#14532d', bd: '#22c55e' },
  lime: { name: '연두', bg: '#ecfccb', fg: '#365314', bd: '#84cc16' },
  orange: { name: '주황', bg: '#ffedd5', fg: '#7c2d12', bd: '#f97316' },
  pink: { name: '분홍', bg: '#fce7f3', fg: '#831843', bd: '#ec4899' },
  purple: { name: '보라', bg: '#f3e8ff', fg: '#581c87', bd: '#a855f7' },
  sky: { name: '하늘', bg: '#e0f2fe', fg: '#0c4a6e', bd: '#0ea5e9' },
  indigo: { name: '남색', bg: '#e0e7ff', fg: '#312e81', bd: '#6366f1' },
  brown: { name: '갈색', bg: '#f1e7dd', fg: '#5b3a1e', bd: '#a16207' },
  gray: { name: '회색', bg: '#e5e7eb', fg: '#1f2937', bd: '#6b7280' },
}

/** 일정 한 건의 칩 색 — 일반 일정은 부서 색이 있으면 부서 색 */
export function eventStyle(ev, deptColors) {
  if ((ev.kind || '일반') === '일반' && ev.dept && DEPT_PALETTE[deptColors?.[ev.dept]]) return DEPT_PALETTE[deptColors[ev.dept]]
  return KIND_STYLE[ev.kind] || KIND_STYLE.일반
}

export const KIND_HELP = {
  일반: '교육행사·회의 등. 하루 종일 수업이 없으면 "전일행사"를 체크하세요.',
  개학: '학기 시작일(시업식·입학식·2학기 개학). 이날부터 수업일을 셉니다.',
  방학식: '1학기 마지막 날. 다음 날부터 2학기 개학 전날까지 방학입니다.',
  종업식: '2학기 마지막 날(대상 학년). 3학년은 졸업식으로 등록하세요.',
  졸업식: '3학년 2학기 마지막 날.',
  정기고사: '중간·기말고사. 실수업일에서 빠지고, 중간-기말 사이 일수 계산에 쓰입니다.',
  재량휴업: '수업일에서 빠집니다. 일부 학년만이면 대상 학년만 고르고, 나머지 학년 일정은 따로 등록하세요.',
  공휴일: '공휴일 목록에 없는 휴일(선거일·임시공휴일 등). 수업일에서 빠집니다.',
  요일교체: '그날을 다른 요일 시간표로 운영합니다(예: 수요일에 목요일 수업). 요일별 수업일에 반영됩니다.',
}

/** 유형을 고를 때 기본으로 제안하는 전일행사 여부 — 엑셀 각주(전일행사일수)의 관행 */
export const DEFAULT_FULL_DAY = { 방학식: true, 종업식: true, 졸업식: true }

export const gradeText = (grades) => (grades?.length && grades.length < 3 ? `${grades.join(',')}학년` : '전 학년')
