/**
 * Firestore 컬렉션 경로 · 문서 ID 규칙 단일 소스.
 *
 * 경로와 문서 ID를 문자열로 직접 조합하지 말고 이 파일의 상수/헬퍼를 쓴다.
 * 규칙이 주석에만 있고 코드로 강제되지 않으면 밑줄 개수 같은 사소한 차이로
 * "데이터가 있는데 없는 것처럼 보이는" 버그가 난다. (officeLayouts 사례)
 *
 * ─────────────────────────────────────────────────────────────
 *  year vs entryYear — 이름이 비슷하지만 완전히 다른 값이다
 * ─────────────────────────────────────────────────────────────
 *
 *  year (학년도, school year)
 *    그 해의 교육과정이 운영되는 연도. 3월 시작 ~ 다음 해 2월 종료.
 *    "2026학년도"는 2026-03-01 ~ 2027-02-28.
 *    → 매년 값이 바뀌며, 교원 배정/사무실 자리배치처럼
 *      "올해는 이렇게 운영한다"에 해당하는 데이터에 붙는다.
 *    → 사용 컬렉션: teacherAssignments, teacherSubjects, officeLayouts,
 *                  trainingPresets, asaCutoffs
 *
 *  entryYear (입학년도, 학번)
 *    학생이 입학한 연도. 그 학생 코호트에 고정되어 절대 바뀌지 않는다.
 *    2024년 입학생은 졸업할 때까지 계속 entryYear = 2024 (= 2024학번).
 *    → 교육과정(과목 편제)은 입학년도 단위로 고정되므로 subjects는
 *      year가 아니라 entryYear로 스코프한다.
 *    → 사용 컬렉션: subjects
 *
 *  두 값의 변환은 entryYearFor() / gradeFor() 를 쓴다.
 *  예) 2026학년도 1학년 = 2026학번, 2026학년도 3학년 = 2024학번.
 */

// ── 최상위 컬렉션 ─────────────────────────────────────────────

/** 학교 루트 컬렉션. 모든 학교 스코프 데이터는 schools/{schoolId} 아래에 둔다. */
export const SCHOOLS = 'schools'

/** 계정 컬렉션 — 학교 하위가 아니라 최상위. 문서 ID = Firebase Auth UID. */
export const USERS = 'users'

/**
 * 전교직원 채널의 문서 ID — 학교마다 하나씩, 고정 ID.
 *
 * 채널이 생기기 전의 글들은 `channelId`가 없었다. 그 예외를 남겨두면 "채널 없는 글"을 위한
 * 갈래가 검색·알림·홈 화면마다 하나씩 더 필요해진다. 전교직원 채널 하나를 두고 그리로 모으면
 * **모든 글이 채널을 갖는다**는 하나의 규칙만 남는다.
 *
 * 자동 ID를 쓰지 않는 이유: 마이그레이션과 클라이언트가 같은 문서를 가리켜야 하고, 여러 번
 * 돌려도 채널이 두 개 생기지 않아야 한다(DM의 결정적 ID와 같은 이유).
 */
export const ALL_STAFF_CHANNEL_ID = 'all-staff'

// ── schools/{schoolId} 하위 컬렉션 ────────────────────────────

/**
 * schools/{schoolId} 하위 컬렉션 이름.
 * 문자열 리터럴 대신 항상 이 상수를 쓴다.
 */
export const COL = {
  // 구성원 / 배정 (학년도 스코프)
  TEACHER_ASSIGNMENTS: 'teacherAssignments', // ID: teacherAssignmentId(year, uid)
  TEACHER_SUBJECTS: 'teacherSubjects',       // ID: teacherSubjectId(year, uid)
  OFFICE_LAYOUTS: 'officeLayouts',           // ID: officeLayoutId(year, office)
  TRAINING_PRESETS: 'trainingPresets',       // auto-ID + year 필드

  // 교육과정 (입학년도 스코프)
  SUBJECTS: 'subjects',                      // auto-ID + entryYear 필드
  COURSES: 'courses',

  // 구성원 데이터
  STUDENTS: 'students',
  STUDENT_GROUPS: 'studentGroups',
  PRE_APPROVED: 'preApproved',
  PRESENCE: 'presence',

  // 출결 / 보강 / 연수
  EVENTS: 'events',
  COVER_REQUESTS: 'coverRequests',
  TRAININGS: 'trainings',
  NOTICES: 'notices',

  // 호출 시스템
  CALL_REQUESTS: 'callRequests',

  // 대시보드 — 일정/모듈 노출 제어
  // (전체 공지는 REQUESTS의 kind='notice'로 통합됐다)
  ACADEMIC_CALENDAR: 'academicCalendar',    // 학사일정 (관리자 작성)
  COVER_TEMPLATES: 'coverTemplates',        // 캔버스 표지 템플릿 라이브러리 (관리자 작성)
  DASHBOARD_MODULES: 'dashboardModules',    // 위젯 노출 제어 (enabled + visibility)

  // 쪽지 — 교사 상호간 1:1. 위젯이 아니라 별도 탭(/messages)에서 다룬다.
  PERSONAL_NOTICES: 'personalNotices',

  // 업무 글 — 안내(kind='notice')와 요청(kind='request')을 함께 담는다.
  // 둘 다 제목·내용·자료·대상이 같고 "완료 확인을 받느냐"만 달라 컬렉션을 나누지 않았다.
  REQUESTS: 'requests',
  REQUEST_COMPLETIONS: 'completions',       // requests/{id}/completions/{uid} — ID가 곧 uid
  REQUEST_COMMENTS: 'comments',             // requests/{id}/comments/{commentId} — auto-ID
  // requests/{id}/blockReactions/{blockId} — ID는 캔버스 블록의 data-block-id(blockReactions.js)
  REQUEST_BLOCK_REACTIONS: 'blockReactions',

  // 채널 — 업무 글이 모이는 곳. requests.channelId 로 연결한다.
  // 글에 붙는 이름표일 뿐이라 별도 글 컬렉션을 두지 않았다 (channels.js 참고).
  CHANNELS: 'channels',
  // channels/{id}/messages/{messageId} — 채널 안의 대화 (auto-ID).
  //
  // requests와 달리 하위 컬렉션인 이유: 메시지는 항상 채널 하나 안에서만 조회되어
  // channelId가 경로에 고정된다. 그래야 보안 규칙이 채널 문서를 get()으로 읽어도
  // 쿼리당 한 번이면 끝난다. 의도된 비대칭이다 (channelMessages.js 참고).
  CHANNEL_MESSAGES: 'messages',
  // channels/{id}/messageReactions/{messageId} — 메시지 반응(이모지). blockReactions와
  // 같은 이유로 메시지 문서 자체가 아니라 서브컬렉션이다 — 메시지는 allow update:
  // if false라 애초에 필드로 못 넣는다(firestore.rules).
  CHANNEL_MESSAGE_REACTIONS: 'messageReactions',

  // 성취평가제(ASA)
  ASA_SUBJECTS: 'asaSubjects',
  ASA_SUBMISSIONS: 'asaSubmissions',
  ASA_RESULTS: 'asaResults',
  ASA_CUTOFFS: 'asaCutoffs',                 // ID: asaCutoffId(year, semester, grade, subjectName)
  ASA_NEIS_IMPORTS: 'asaNeisImports',
  ASA_PRINCIPAL_SIGNATURE: 'asaPrincipalSignature',
  MIN_ACHIEVEMENT_RESULTS: 'minAchievementResults',

  // 데스크톱 클라이언트 설치 현황 — ID: uid.
  // 재실(presence)과 문서를 나눈 이유: 재실은 4시간 TTL로 신뢰도가 죽는 "지금" 값이지만
  // 설치 현황은 마지막 목격 시점을 계속 보존해야 하고, 열람 범위도 관리자로 좁다.
  DESKTOP_CLIENTS: 'desktopClients',

  // 교수학습 및 평가 운영 계획
  EVALUATION_PLANS: 'evaluationPlans',                 // auto-ID
  EVALUATION_PLAN_MANAGERS: 'evaluationPlanManagers',  // ID: uid (학교 전체 단일 담당자 목록)

  // 검·인정도서 선정
  TEXTBOOK_ADOPTIONS: 'textbookAdoptions',  // auto-ID + cycleYear 필드. 하위에 scores/{uid} 서브컬렉션
  TEXTBOOK_DEPT_HEADS: 'textbookDeptHeads',            // ID: sanitizeSubjectGroup(교과군) — 교과군당 1명
  TEXTBOOK_PRINCIPAL_SIGNATURE: 'textbookPrincipalSignature', // ID: uid — asaPrincipalSignature와 동일 모양

  // 생기부 세특 점검 도구
  SETUK_CHECKS: 'setukChecks',   // auto-ID(업로드 배치 1개). 하위에 records/{id}, items/{id} 서브컬렉션
  SETUK_DICTIONARY: 'setukDictionary', // 단일 문서 'default' — 금지어/오타 사전(관리자 편집)
}

/**
 * 교과군 이름을 Firestore 문서 ID/rules 경로 세그먼트로 쓸 수 있게 다듬는다.
 *
 * 교과군 10개 중 3개("기술가정/정보" 등)에 '/'가 들어 있어 그대로 문서 ID나 보안 규칙의
 * `$(subjectGroup)` 경로 세그먼트로 쓰면 경로가 여러 단계로 쪼개져 깨진다 — officeLayoutId()가
 * 사무실 이름의 '/'를 '_'로 치환하는 것과 같은 이유. 화면에는 원래 이름을 보여주고, 저장·쿼리·
 * rules 경로에는 항상 이 함수를 거친 값을 쓴다. 고정 10개 목록 어디에도 '_'가 없어 되돌릴 때도
 * 안전하다(`.replace(/_/g, '/')`로 원래 표기 복원 가능).
 *
 * @param {string} subjectGroup
 * @returns {string}
 */
export function sanitizeSubjectGroup(subjectGroup) {
  return String(subjectGroup || '').replace(/\//g, '_')
}

/**
 * schools/{schoolId}/... 경로 세그먼트 배열.
 *
 * Firestore 호출에 스프레드해서 쓴다.
 *   collection(db, ...schoolPath(schoolId, COL.SUBJECTS))
 *   doc(db, ...schoolPath(schoolId, COL.OFFICE_LAYOUTS), officeLayoutId(year, office))
 *
 * @param {string} schoolId
 * @param {...string} segments 하위 컬렉션/문서 세그먼트
 * @returns {string[]}
 */
export function schoolPath(schoolId, ...segments) {
  return [SCHOOLS, schoolId, ...segments]
}

// ── 학년도 스코프 문서 ID 빌더 ────────────────────────────────
//
// 공통 규칙: 한 해에 대상(교원/사무실)당 문서 1개.
// 연도를 앞에 두어 문서 ID만 봐도 어느 학년도 데이터인지 알 수 있게 한다.
// 문서 ID와 별개로 문서 안에도 year 필드를 함께 저장한다(연도별 쿼리용).

/**
 * 교원 배정(부서/담임/사무실 등) 문서 ID.
 * schools/{schoolId}/teacherAssignments/{year}_{uid}   ← 밑줄 1개
 *
 * @param {number|string} year 학년도
 * @param {string} uid Firebase Auth UID
 * @returns {string}
 */
export function teacherAssignmentId(year, uid) {
  return `${year}_${uid}`
}

/**
 * 교원 담당 과목 문서 ID.
 * schools/{schoolId}/teacherSubjects/{year}_{uid}       ← 밑줄 1개
 *
 * @param {number|string} year 학년도
 * @param {string} uid Firebase Auth UID
 * @returns {string}
 */
export function teacherSubjectId(year, uid) {
  return `${year}_${uid}`
}

/**
 * 사무실 자리 배치 문서 ID.
 * schools/{schoolId}/officeLayouts/{year}__{office}     ← 밑줄 2개 (주의)
 *
 * 사무실 이름은 자유 입력이라 '/'가 들어갈 수 있는데, '/'는 문서 경로
 * 구분자라 그대로 쓰면 경로가 깨진다. 그래서 '_'로 치환한다.
 * 치환 뒤 이름과 연도 사이 구분자가 '_' 하나면 "2026_교무실_2층"처럼
 * 경계가 모호해지므로 구분자를 '__' 두 개로 둔다.
 *
 * ⚠ functions/callSystem.js 의 officeLayoutId() 와 반드시 같아야 한다.
 *    Cloud Functions는 별도 npm 패키지라 이 모듈을 import할 수 없어
 *    같은 함수를 손으로 복제해 두었다. 규칙을 바꾸면 두 곳을 함께 고칠 것.
 *
 * @param {number|string} year 학년도
 * @param {string} office 사무실 이름
 * @returns {string}
 */
export function officeLayoutId(year, office) {
  return `${year}__${office.replace(/\//g, '_')}`
}

/**
 * 성취평가제 분할점수 기준 문서 ID.
 * schools/{schoolId}/asaCutoffs/{year}_{semester}_{grade}_{subjectName}
 *
 * @param {number|string} year 학년도
 * @param {number|string} semester 학기 (1|2)
 * @param {number|string} grade 학년
 * @param {string} subjectName 과목명
 * @returns {string}
 */
export function asaCutoffId(year, semester, grade, subjectName) {
  return `${year}_${semester}_${grade}_${subjectName}`
}

// ── 학년도 · 학기 계산 ────────────────────────────────────────

/**
 * 임의의 시각이 속하는 학년도.
 *
 * 학년도는 3월에 시작하므로 1~2월은 아직 전년도 학년도다. `currentYearSemester()`가 "지금"
 * 기준으로만 쓸 수 있던 것을, 업무 글에 `year`를 백필할 때는 그 글이 **쓰인 시점**
 * (`createdAt`) 기준으로 물어야 해서 날짜를 받는 형태로 뺐다.
 *
 * @param {Date|import('firebase/firestore').Timestamp|number} date
 * @returns {number}
 */
export function schoolYearFor(date) {
  const d = typeof date?.toDate === 'function' ? date.toDate() : new Date(date)
  const month = d.getMonth() + 1
  return month <= 2 ? d.getFullYear() - 1 : d.getFullYear()
}

/**
 * 임의의 시각이 속하는 학기. 3~8월이 1학기, 9~2월이 2학기.
 * `schoolYearFor`와 짝이다 — 둘 다 순수 함수로 빼둬야 "오늘"에 기대지 않고 테스트할 수 있다.
 *
 * @param {Date|import('firebase/firestore').Timestamp|number} date
 * @returns {1|2}
 */
export function semesterFor(date) {
  const d = typeof date?.toDate === 'function' ? date.toDate() : new Date(date)
  const month = d.getMonth() + 1
  return (month >= 3 && month <= 8) ? 1 : 2
}

/**
 * 오늘 기준 학년도와 학기.
 * 예) 2027-01-15 → { year: 2026, semester: 2 }
 *
 * asaCutoffs처럼 학년도·학기로 스코프되는 데이터를 조회할 때 기본값으로 쓴다.
 *
 * @returns {{ year: number, semester: number }}
 */
export function currentYearSemester() {
  const now = new Date()
  return { year: schoolYearFor(now), semester: semesterFor(now) }
}

/**
 * 오늘 기준 학년도. currentYearSemester().year 와 같다.
 * 학기가 필요 없는 화면에서 쓴다.
 *
 * @returns {number}
 */
export function currentSchoolYear() {
  return currentYearSemester().year
}

// ── year ↔ entryYear 변환 ─────────────────────────────────────

/**
 * 학년도 + 학년 → 입학년도(학번).
 * 예) entryYearFor(2026, 1) === 2026, entryYearFor(2026, 3) === 2024
 *
 * subjects는 entryYear로 스코프되므로, 학년도 기준 화면에서 과목을 찾을 때
 * 이 함수로 학번을 계산해 매칭한다.
 *
 * @param {number} year 학년도
 * @param {number|string} grade 학년 (1|2|3)
 * @returns {number} 입학년도
 */
export function entryYearFor(year, grade) {
  return year - Number(grade) + 1
}

/**
 * 입학년도(학번) + 학년도 → 해당 학년도의 학년.
 * entryYearFor()의 역함수. 3을 넘으면 졸업생이다.
 * 예) gradeFor(2024, 2026) === 3
 *
 * @param {number} entryYear 입학년도
 * @param {number} year 학년도
 * @returns {number} 학년
 */
export function gradeFor(entryYear, year) {
  return year - Number(entryYear) + 1
}
