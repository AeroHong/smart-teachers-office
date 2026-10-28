/** 업무분장 화면·인쇄 공통 색과 문구 */
import { STAGES, homeroomGradeOf, homeroomMark } from '@shared/lib/dutyPlan'

export const ACCENT = '#9a3412'
export const ACCENT_BG = '#fff7ed'

/** 구분(교무행정지원·교육활동) 머리 색 */
export const CATEGORY_STYLE = {
  교무행정지원: { fg: '#1e3a8a', bg: '#eff6ff', bd: '#bfdbfe' },
  교육활동: { fg: '#14532d', bg: '#f0fdf4', bd: '#bbf7d0' },
}

/** 직급 칩 — 부장·기획만 표시 */
export const ROLE_STYLE = {
  부장: { bg: '#9a3412', fg: '#fff' },
  기획: { bg: '#fed7aa', fg: '#7c2d12' },
}

export const STAGE_STYLE = {
  draft: { label: '1차 초안', color: 'default', variant: 'outlined' },
  review: { label: '2차 공람', color: 'info', variant: 'filled' },
  confirmed: { label: '확정', color: 'success', variant: 'filled' },
}
export const stageLabel = (key) => STAGES.find((s) => s.key === key)?.label || '1차 초안'

/** 카드에 붙는 담임 표기 — 담임 명단(homerooms)에서 찾고, 교직원(실무사 등)은 빈칸 */
export function markOf(data, duty) {
  if (!duty.assigneeUid && !duty.assigneeName) return ''
  const g = homeroomGradeOf(data, { uid: duty.assigneeUid, name: duty.assigneeName })
  return homeroomMark(g, duty.staffKind)
}

export const fmtTime = (ts) => {
  const d = ts?.toDate ? ts.toDate() : ts instanceof Date ? ts : null
  return d ? d.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''
}
