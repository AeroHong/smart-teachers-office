/**
 * 사무실 자리 배치 문서 ID 규칙.
 *
 * 저장 위치: schools/{schoolId}/officeLayouts/{year}__{office}
 * 사무실 이름에 '/'가 들어가면 문서 경로가 깨지므로 '_'로 바꾼다.
 *
 * functions/callSystem.js의 officeLayoutId()와 반드시 일치해야 한다.
 * 규칙을 바꾸면 두 파일을 함께 고쳐야 한다.
 */
export function officeLayoutId(year, office) {
  return `${year}__${office.replace(/\//g, '_')}`
}
