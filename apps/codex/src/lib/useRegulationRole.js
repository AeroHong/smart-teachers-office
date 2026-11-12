/**
 * 규정집 권한 — 열람은 교직원 전원, 개정안 작성은 규정 담당자, 확정은 관리자.
 * 담당자 지정은 StudentHub 「담당자 지정」과 같은 studentHubManagers/{uid}.roles[]의 'regulation'.
 * firestore.rules의 hasHubRole(schoolId, 'regulation')과 같은 판정이다(관리자·교감은 지정 없이 담당자 권한).
 *  · canEdit: 개정안을 만들고 고친다
 *  · canApply: 개정안을 확정해 현행본으로 만든다, 규정집 가져오기·설정
 */
import { useEffect, useMemo, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '@shared/lib/firebase'
import { COL, HUB_ROLES, schoolPath } from '@shared/lib/schema'
import { useAuth } from '@shared/contexts/AuthContext'

export function useRegulationRole() {
  const { user, schoolId, isAdmin, isSuperAdmin, role } = useAuth()
  const [state, setState] = useState({ roles: [], loading: true })

  useEffect(() => {
    if (!schoolId || !user) { setState({ roles: [], loading: false }); return undefined }
    return onSnapshot(doc(db, ...schoolPath(schoolId, COL.STUDENT_HUB_MANAGERS), user.uid),
      (snap) => setState({ roles: snap.exists() ? snap.data().roles || [] : [], loading: false }),
      (e) => { console.error(e); setState({ roles: [], loading: false }) })
  }, [schoolId, user?.uid]) // eslint-disable-line react-hooks/exhaustive-deps

  return useMemo(() => {
    const canApply = !!(isAdmin || isSuperAdmin || role === 'principal')
    const canEdit = canApply || state.roles.includes(HUB_ROLES.REGULATION)
    return { canEdit, canApply, loading: state.loading }
  }, [state, isAdmin, isSuperAdmin, role])
}
