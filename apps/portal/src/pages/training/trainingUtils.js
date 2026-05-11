import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '../../lib/firebase'

export const SCHOOL_ID = 'seonyoo-hs'
export const APPROVED_ROLES = ['teacher', 'school_admin', 'admin']
export const STAFF_TYPES = ['교사', '교직원']

/**
 * 승인된 구성원 목록 로드 (/users 컬렉션 기준)
 * staffType 필터 적용 가능: '교사' | '교직원' | '전체'
 */
export async function loadMembers(staffTypeFilter = '전체') {
  const snap = await getDocs(
    query(collection(db, 'users'), where('schoolId', '==', SCHOOL_ID))
  )
  return snap.docs
    .map(d => ({ uid: d.id, name: d.data().name, email: d.data().email, staffType: d.data().staffType || '' }))
    .filter(u => {
      const role = snap.docs.find(d => d.id === u.uid)?.data().role
      if (!APPROVED_ROLES.includes(role)) return false
      if (staffTypeFilter !== '전체' && u.staffType !== staffTypeFilter) return false
      return true
    })
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'))
}

/** 검색어 + 이미 추가된 목록 제외해서 필터링 */
export function filterBySearch(members, search, alreadyAdded = []) {
  if (search.length < 1) return []
  const addedUids = new Set(alreadyAdded.map(m => m.uid).filter(Boolean))
  return members
    .filter(m =>
      (m.name?.includes(search) || m.email?.includes(search)) &&
      !addedUids.has(m.uid)
    )
    .slice(0, 8)
}
