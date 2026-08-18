// hwpx에서 추출한 담당교사 이름(문자열) 목록을 실제 교사 계정(uid)과 매칭한다.
// apps/portal/src/pages/tools/AsaChecklistAdmin.jsx의 buildNeisMatchRows(나이스 담당교사
// 매칭)와 동일한 방식 — cleanTeacherName으로 정규화한 이름을 키로 후보를 모으고, 후보가
// 정확히 1명일 때만 자동 확정한다. 동명이인·완전 미매칭은 관리자가 수동 배정한다.
import { cleanTeacherName } from '../../utils/nameUtils'

/**
 * @param {string[]} names hwpx meta.teachers
 * @param {{uid:string, name:string, email:string}[]} teachers 소속 학교 교직원 목록
 * @returns {{name:string, uid:string|null, candidateUids:string[], status:'matched'|'ambiguous'|'unmatched'}[]}
 */
export function matchTeacherNames(names, teachers) {
  const byName = new Map()
  teachers.forEach((t) => {
    const cleaned = cleanTeacherName(t.name || '')
    if (!cleaned) return
    if (!byName.has(cleaned)) byName.set(cleaned, [])
    byName.get(cleaned).push(t)
  })

  return [...new Set((names || []).filter(Boolean))].map((name) => {
    const candidates = byName.get(cleanTeacherName(name)) || []
    if (candidates.length === 1) {
      return { name, uid: candidates[0].uid, candidateUids: [], status: 'matched' }
    }
    return {
      name,
      uid: null,
      candidateUids: candidates.map((c) => c.uid),
      status: candidates.length > 1 ? 'ambiguous' : 'unmatched',
    }
  })
}
