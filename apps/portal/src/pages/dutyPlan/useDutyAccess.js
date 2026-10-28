import { useAuth } from '@shared/contexts/AuthContext'

/**
 * 업무분장 권한 — firestore.rules isDutyAdmin / isDutyPlanEditor와 같은 판정.
 *   관리자 = 슈퍼·학교 관리자·교감·교장(편집자 명단에 없어도 편집·단계 결정)
 *   편집자 = 관리자 + 그 학년도 editorUids(교무기획부장·인사자문위원)
 * yearDoc이 아직 안 왔으면(undefined) ready=false — 편집자 여부에 따라 목록 조회 조건이 달라서 기다려야 한다.
 */
export default function useDutyAccess(yearDoc) {
  const { user, userName, photoURL, isAdmin, isSuperAdmin, isPrincipal, isHeadmaster } = useAuth()
  const dutyAdmin = Boolean(isAdmin || isSuperAdmin || isPrincipal || isHeadmaster)
  const isEditor = dutyAdmin || (yearDoc?.editorUids || []).includes(user?.uid)
  return {
    ready: yearDoc !== undefined,
    dutyAdmin,
    isEditor,
    me: { uid: user?.uid, name: userName || user?.email || '', photoURL: photoURL || null },
  }
}
