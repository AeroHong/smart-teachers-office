// 교수학습 및 평가 운영 계획 제출 — 공용 유틸.

export const STATUS_LABELS = {
  draft: '임시저장',
  confirmed: '확정',
}

export const STATUS_COLORS = {
  draft: 'warning',
  confirmed: 'success',
}

export const GRADE_OPTIONS = [1, 2, 3]

// 교과(군) 고정 목록 — 전체 현황 집계·교직원 관리 "담당교과" 연동 기준.
// (참고: apps/portal/src/pages/tools/asaUtils.js의 SUBJECT_GROUPS(10개, 성취평가제 전용)와는
//  목록이 다르다 — 이쪽은 제2외국어/한문을 분리하고 전문교과(직업계)를 포함한 12개.)
export const SUBJECT_GROUPS = [
  '국어', '수학', '영어', '사회(한국사/도덕포함)', '과학', '체육', '예술',
  '기술·가정/정보', '제2외국어', '한문', '교양', '전문교과(직업계)',
]

// 성적산출방법 필드 순서 — 파서 출력(evaluationPlanParser.js parseGradeMethod)과 동일한 순서/키.
export const GRADE_METHOD_FIELDS = [
  ['rankGrade', '석차등급(1~5등급)'],
  ['achievementLevel5', '성취도 5단계(A~E)'],
  ['cutScoreEstimated', '성취 분할 점수(추정)'],
  ['cutScoreFixed', '성취 분할 점수(고정)'],
  ['achievementLevel3', '성취도 3단계(A~C)'],
  ['passFailOnly', '이수여부(P/F)'],
]

/** 성적산출방법상 성취도/분할점수를 산출하는 과목인지 — 최소성취수준 보장지도 섹션이 의미 있는 경우. */
export function needsMinAchievementPlan(gradeMethod) {
  if (!gradeMethod) return false
  return Boolean(
    gradeMethod.achievementLevel5?.enabled ||
    gradeMethod.achievementLevel3?.enabled ||
    gradeMethod.cutScoreEstimated?.enabled ||
    gradeMethod.cutScoreFixed?.enabled,
  )
}

/** hwpx 확장자 검증. 통과하면 아무것도 반환하지 않고, 문제가 있으면 사용자에게 보여줄 메시지를 반환한다. */
export function validateHwpxFile(file) {
  if (!file) return '파일을 선택해주세요.'
  if (!/\.hwpx$/i.test(file.name)) {
    return 'hwpx 파일만 업로드할 수 있습니다. 한글(HWP)에서 "다른 이름으로 저장" → 파일 형식을 "한글 표준 문서(*.hwpx)"로 선택해 다시 저장한 뒤 업로드해주세요.'
  }
  return null
}

/** "2학년" 같은 파싱 원문에서 학년 숫자를 뽑는다. 다중 학년("1~2학년" 등)도 대응. */
export function parseGradeNumbers(raw) {
  if (!raw) return []
  const nums = [...String(raw).matchAll(/[123]/g)].map((m) => Number(m[0]))
  return [...new Set(nums)].sort()
}

/** "1학기" 같은 파싱 원문에서 학기 숫자를 뽑는다. 못 찾으면 null. */
export function parseSemesterNumber(raw) {
  const m = String(raw || '').match(/[12]/)
  return m ? Number(m[0]) : null
}

/** "4" / "4시간" 같은 파싱 원문에서 주당수업시수(학점)를 숫자로 뽑는다. 못 찾으면 null. */
export function parseWeeklyHoursNumber(raw) {
  const m = String(raw || '').match(/\d+(\.\d+)?/)
  return m ? Number(m[0]) : null
}

export function fmtDate(ts) {
  if (!ts) return '-'
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

function emptyRatioCell() {
  return { ratio: null, maxScore: null }
}

function emptyMidtermFinal() {
  return { essayType: emptyRatioCell(), objectiveType: emptyRatioCell(), total: emptyRatioCell() }
}

function emptyPerformanceRatio() {
  return { essayType: emptyRatioCell(), otherType: emptyRatioCell(), total: emptyRatioCell() }
}

/** 파서가 해당 표를 못 찾아 examRatio가 null일 때 교사가 직접 채울 수 있도록 빈 구조를 만든다. */
export function emptyExamRatio() {
  return { midterm: emptyMidtermFinal(), final: emptyMidtermFinal(), performance: emptyPerformanceRatio() }
}

/**
 * 파서 결과의 examRatio는 그룹(중간/기말/수행) 단위로 감지 여부가 갈린다 — 정기시험이
 * 없는 과목은 midterm/final이 개별적으로 null일 수 있다. 그룹별로 따로 빈 값을 채운다.
 */
function mergeExamRatio(extracted) {
  const base = emptyExamRatio()
  if (!extracted) return base
  return {
    midterm: extracted.midterm || base.midterm,
    final: extracted.final || base.final,
    performance: extracted.performance || base.performance,
  }
}

export function emptyGradeMethod() {
  const method = {}
  GRADE_METHOD_FIELDS.forEach(([key, label]) => { method[key] = { label, enabled: false } })
  return method
}

// additionalStudy(학점수/추가학습 시수/예방지도 인정시수/이수 인정 기준 시수)는 hwpx의
// 개요 표에서 자동 추출된다. 이 표 하나가 학년에 따라 "최소성취수준 보장지도"(1학년) 또는
// "추가학습"(2학년) 두 이름 중 하나로 불린다 — UI 라벨만 grades로 분기(EvalPlanForm 참고).
export function emptyMinAchievementPlan() {
  return {
    additionalStudy: { credits: '', extraStudyHours: '', preventionHoursRecognized: '', creditRecognitionHours: '' },
  }
}

// 반영비율 검증에 쓰는 그룹 순서 — 각 그룹의 "그 외 유형" 필드명이 정기시험(objectiveType)과
// 수행평가(otherType)에서 다르다(파서 출력 스키마 그대로 유지).
const RATIO_CHECK_GROUPS = [
  { key: 'midterm', label: '중간고사', otherKey: 'objectiveType' },
  { key: 'final', label: '기말고사', otherKey: 'objectiveType' },
  { key: 'performance', label: '수행평가', otherKey: 'otherType' },
]

/**
 * 정기시험·수행평가 반영비율을 검증한다.
 * - 행 단위: 서·논술형 + 그 외 유형 == 소계
 * - 전체: 중간 소계 + 기말 소계 + 수행 소계 == 100
 *
 * 중간고사 없이 기말고사만 보는 과목처럼, 한 그룹 전체(서논술형·그외·소계 모두)가 비어
 * 있으면 "해당 시험이 없다"는 뜻이라 0으로 보고 합계에 포함한다. 반대로 일부 값만 채워진
 * 그룹(작성 중)이 있으면 아직 판정할 수 없으니 합계 자체를 보류한다.
 */
export function checkExamRatio(examRatio) {
  const rows = RATIO_CHECK_GROUPS.map(({ key, label, otherKey }) => {
    const group = examRatio?.[key] || {}
    const essay = group.essayType?.ratio ?? null
    const other = group[otherKey]?.ratio ?? null
    const total = group.total?.ratio ?? null
    const isEmpty = essay == null && other == null && total == null
    const expected = (essay != null && other != null) ? essay + other : null
    const ok = expected == null || total == null || expected === total
    return { key, label, essay, other, total, expected, ok, isEmpty }
  })

  const stillEditing = rows.some((r) => !r.isEmpty && r.total == null)
  const sum = stillEditing ? null : rows.reduce((acc, r) => acc + (r.isEmpty ? 0 : r.total), 0)

  return { rows, sum, sumOk: sum == null || sum === 100 }
}

/** extractedRaw → 편집용 data 초기값. 비어 있는 섹션은 빈 구조로 채운다(사람 검토 단계에서 직접 입력). */
export function buildInitialData(extracted) {
  return {
    examRatio: mergeExamRatio(extracted?.examRatio),
    performanceAreas: extracted?.performanceAreas?.length ? extracted.performanceAreas : [],
    gradeMethod: extracted?.gradeMethod || emptyGradeMethod(),
    minAchievementPlan: {
      additionalStudy: extracted?.additionalStudyOverview || emptyMinAchievementPlan().additionalStudy,
    },
  }
}
