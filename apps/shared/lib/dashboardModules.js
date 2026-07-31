/**
 * 대시보드 옵션 위젯 카탈로그 — 코드(컴포넌트 레지스트리)와 노출 제어(Firestore)를 분리한다.
 *
 * 문서 ID가 곧 componentKey다: schools/{schoolId}/dashboardModules/{componentKey}.
 * 관리자 화면(AdminDashboardModules)과 실제 렌더링(apps/dashboard DashboardHome)이
 * 이 카탈로그를 공유해 제목·이모지가 어긋나지 않게 한다.
 *
 * 새 옵션 위젯을 추가하려면:
 *   1. apps/dashboard/src/widgets/에 컴포넌트 작성
 *   2. 여기 MODULE_CATALOG에 항목 추가
 *   3. apps/dashboard DashboardHome.jsx의 OPTIONAL_WIDGETS에 Component 매핑 추가
 * 관리자는 재배포 없이 AdminDashboardModules에서 켜고 끄며 대상만 지정하면 된다.
 */
export const MODULE_CATALOG = {
  announcements: { title: '전체 공지', emoji: '📢' },
  calendar: { title: '학사일정', emoji: '📅' },
  notices: { title: '쪽지', emoji: '✉️' },
}

export const MODULE_VISIBILITY = {
  all: '전체 공개',
  department: '부서 지정',
  individual: '개인 지정',
}

export function isModuleVisibleToMe(mod, { uid, department }) {
  if (!mod?.enabled) return false
  if (mod.visibility === 'individual') return (mod.targetTeacherUids || []).includes(uid)
  if (mod.visibility === 'department') return !!department && (mod.targetDepartments || []).includes(department)
  return true // 'all' (기본값)
}
