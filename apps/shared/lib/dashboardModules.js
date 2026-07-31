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
 *
 * defaultEnabled — Firestore에 설정 문서가 아직 없을 때의 값.
 * 처음 배포했을 때 관리자가 아무 것도 안 해도 위젯이 보이게 하려면 true로 둔다.
 * (false로 두면 관리자가 켜기 전까지 아무에게도 보이지 않아, 배포됐는데 화면이
 *  그대로인 것처럼 보인다.)
 */
export const MODULE_CATALOG = {
  announcements: { title: '전체 공지', emoji: '📢', defaultEnabled: true },
  calendar: { title: '학사일정', emoji: '📅', defaultEnabled: true },
}

export const MODULE_VISIBILITY = {
  all: '전체 공개',
  department: '부서 지정',
  individual: '개인 지정',
}

/** 설정 문서가 없을 때 쓰는 기본값. 카탈로그의 defaultEnabled를 반영한다. */
export function defaultModuleSettings(key) {
  return {
    enabled: MODULE_CATALOG[key]?.defaultEnabled ?? false,
    visibility: 'all',
    targetDepartments: [],
    targetTeacherUids: [],
  }
}

/**
 * 카탈로그 전체를 Firestore 설정과 합쳐 돌려준다.
 * 문서가 없는 모듈도 기본값으로 채워지므로, 호출부는 "문서 있음/없음"을 따로 다루지 않아도 된다.
 * @param {Array} moduleDocs dashboardModules 컬렉션 문서들 ({ id, ...data })
 */
export function mergeModuleSettings(moduleDocs = []) {
  const byId = Object.fromEntries(moduleDocs.map(d => [d.id, d]))
  return Object.entries(MODULE_CATALOG).map(([key, meta]) => ({
    key,
    ...meta,
    ...defaultModuleSettings(key),
    ...byId[key],
  }))
}

export function isModuleVisibleToMe(mod, { uid, department }) {
  if (!mod?.enabled) return false
  if (mod.visibility === 'individual') return (mod.targetTeacherUids || []).includes(uid)
  if (mod.visibility === 'department') return !!department && (mod.targetDepartments || []).includes(department)
  return true // 'all' (기본값)
}
