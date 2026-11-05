/**
 * StudentHub 학생 이름 — schools/{schoolId}/students (학적의 기준은 StudentHub).
 * 작업의 학번에 해당하는 학년만 읽는다(학년 전체 스캔 대신 grade in [...] — 신청 당시 학년과 진급 뒤 학년).
 * 읽기 권한: 소속 교사(선택과목 담당자 포함) — firestore.rules students read.
 */
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '@shared/lib/firebase'
import { hubGradesOf, namesFromHub } from '@shared/lib/sectioning'

/** 이름이 없는 학생들의 이름을 StudentHub에서 찾는다. 반환 { [학번]: 이름 } (못 찾으면 빠짐) */
export async function loadHubNames(schoolId, project) {
  const ids = [...Object.keys(project.requests || {}), ...(project.excluded || []).map((x) => x.id)]
    .filter((sid) => !project.names?.[sid])
  const grades = hubGradesOf(ids)
  if (!schoolId || !ids.length || !grades.length) return {}
  const snap = await getDocs(query(collection(db, 'schools', schoolId, 'students'), where('grade', 'in', grades)))
  return namesFromHub(ids, snap.docs.map((d) => d.data()), project.entryYear)
}
