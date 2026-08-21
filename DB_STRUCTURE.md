# 선유고 스마트 교무실 - 데이터베이스 구조

> **작성 원칙**: 이 문서의 필드명·타입은 실제 read/write 코드에서 확인한 값만 적는다.
> 코드에서 확인하지 못한 항목은 `확인 필요`로 표시한다. (최종 대조: 2026-08-19)

## 한눈에 보는 구조

```
/users/{uid}                     ← 계정. schoolId·role의 단일 소스(source of truth)
/studentRegistrations/{email}    ← 학생 자동 등록 색인
/schoolDomains/{domain}          ← 도메인 → 학교 매핑
/kioskPairingCodes/{code}        ← 키오스크 페어링 (Admin SDK 전용)
/auditLogs/{logId}

/schools/{schoolId}              ← 모든 학교 데이터는 이 아래로 파티션된다
  ├─ 구성원   students · archivedStudents · studentGroups · preApproved · presence ·
  │           desktopClients
  ├─ 배정     teacherAssignments · teacherSubjects · officeLayouts   (학년도 스코프)
  ├─ 교육과정 subjects (입학년도 스코프) · courses
  ├─ 출결     events/{id}/attendanceLogs · notices/{id}/confirmations
  ├─ 보강     coverRequests
  ├─ 연수     trainings/{id}/signatures · trainingPresets
  ├─ 호출     callRequests
  ├─ 업무     requests/{id}/{completions,comments} · channels · personalNotices
  ├─ 대시보드 academicCalendar · dashboardModules
  ├─ 성취평가 asaSubjects · asaSubmissions · asaResults · asaCutoffs ·
  │           asaNeisImports · asaPrincipalSignature · minAchievementResults
  └─ 평가계획 evaluationPlans · evaluationPlanManagers
```

**설계 원칙 3가지**
1. **학교 파티션** — 학교 스코프 데이터는 예외 없이 `/schools/{schoolId}/...` 아래에 둔다.
   모듈이 늘어도 경로 패턴과 보안 규칙 헬퍼(`isTeacher(schoolId)` 등)를 그대로 재사용한다.
2. **계정은 최상위** — `/users/{uid}`만 학교 밖에 둔다. 로그인 시점에는 아직 소속이 없고,
   `schoolId`·`role`이 여기 한 곳에만 있어야 모든 모듈이 같은 값을 본다.
3. **경로·문서 ID는 코드로 강제** — `apps/shared/lib/schema.js`가 컬렉션 이름과 문서 ID
   규칙의 단일 소스다. 문자열 조합을 금지한다(밑줄 개수 차이로 데이터가 사라져 보였던 사례).

---

## 이대부고 컨설팅(2026-07-07) 이후 DB 구조 변경 이력

컨설팅 기록: [docs/컨설팅기록_이대부고_20260707.md](./docs/컨설팅기록_이대부고_20260707.md)

| 날짜 | 커밋 | 변경 내용 |
|------|------|-----------|
| 07-30 | `d719495` | **Phase 1A — students 문서 ID 마이그레이션**: 5자리 학번 → 21자리 Workspace User ID. `studentGroups`에 `workspaceUserIds` 추가(하위호환 `studentIds` 유지). 백업: `_migrated_students_backup` |
| 07-30 | `fa13502` | Google Workspace Directory 동기화 도입 → `preApproved`·`students`·`archivedStudents`에 `source: 'workspaceSync'` 계보 필드 추가 |
| 07-30~31 | `4072c27`, `87ecc09` | 대시보드 신설 — `academicCalendar`, `dashboardModules`, `personalNotices` 추가 |
| 07-31 | `d66dedb`, `36b244e` | **업무 요청 데이터 모델** — `requests` + 하위 `completions` 신설. 기존 `tasks` 컬렉션 폐지(규칙·코드에서 제거) |
| 07-31 | `c831ea3` | **스키마 규칙 모듈화** — `apps/shared/lib/schema.js` 도입. `teacherSubjects` ↔ `subjects` `subjectId` 참조 연결, `asaSubjects` 담당교사를 이메일 → uid 기준으로 전환 |
| 07-31 | `e4289cf` | `subjects` 스코프를 학년도(`year`)가 아닌 **입학년도(`entryYear`)** 로 확정. `students.electiveSubjects`를 문자열 배열 → `{subjectId, subjectName, classNo, semester}` 객체 배열로 확장 |
| 08-01 | `e85a39a` | 전체 공지를 업무 글로 통합 — 별도 공지 컬렉션 없이 `requests.kind: 'notice'` 로 표현 |
| 08-01 | `88d03dd` | **Custom Claims에 `schoolId`/`staff`/`admin` 주입**(`functions/userClaims.js`). Storage 규칙이 Firestore를 읽지 않고 토큰만 보도록 변경 |
| 08-02 | `c4b51e4`, `6e3a97e` | `channels` 신설(`requests.channelId`로 연결), `requests/{id}/comments` 하위 컬렉션 추가 |
| 08-02 | `d9b1aad` | 글 삭제를 Cloud Function(`deletePostDeep`)으로 이관 — 하위 컬렉션·Storage 첨부까지 정리 |
| 08-10 | `ed7918c` | 키오스크 학번 조회를 문서 ID가 아닌 `studentId` 필드 기준으로 수정 (Phase 1A 마이그레이션 후속) |
| 08-11 | `87042b4` | 쪽지 삭제를 문서 삭제가 아닌 각자 숨김(`deletedBySenderAt`/`deletedByRecipientAt`)으로 |
| 08-14 | `9f2d60e` | `students` 읽기 규칙을 문서 ID 비교 → `resource.data.studentId` 비교로 수정 (마이그레이션 후속) |
| 08-18 | `58d6f69` | **교수학습 및 평가 운영 계획** — `evaluationPlans`, `evaluationPlanManagers` 신설 + 확정 시 `teacherAssignments`/`teacherSubjects` 자동 반영 트리거 |

> 관통하는 방향: **① 사람을 가리키는 키를 이름·학번 같은 표시값에서 불변 ID(uid, Workspace User ID)로 옮기고,
> ② 경로·문서 ID 규칙을 코드 한 곳(`schema.js`)으로 모으고, ③ 새 모듈은 컬렉션을 늘리기 전에
> 기존 구조(`requests`의 `kind`, `channels`의 이름표)로 표현할 수 있는지 먼저 본다.**

## Firestore 컬렉션 전체 구조

### 최상위 컬렉션

#### `/users/{uid}`
사용자 계정 정보 (Firebase Auth UID 기반)

**필드:** (쓰기 위치: `apps/shared/contexts/AuthContext.jsx`, `apps/portal/src/pages/SchoolSetup.jsx`, `apps/portal/src/pages/admin/AdminAccounts.jsx`, `apps/dashboard/src/pages/DashboardHome.jsx`)
- `name` (string) - 이름 (Google displayName 우선)
- `email` (string)
- `role` (string) - `pending` / `teacher` / `admin` / `school_admin` / `principal` / `student` / `rejected`
- `schoolId` (string) - 소속 학교 ID (게스트 학교는 `guest_` 접두사)
- `staffType` (string) - `교사` / `교직원` / `''`
- `studentId` (string, 학생만) - 학번 (studentRegistrations에서 복사)
- `dashboardLayout` (array, 선택) - 대시보드 위젯 배치 (`DashboardHome.jsx`)
- `createdAt`, `updatedAt` (timestamp)

**인덱스:**
- `schoolId` + `role` (복합 인덱스)

**접근 권한:**
- Read: 본인만
- Create: 로그인한 사용자 (본인 UID, role: pending/student/teacher)
- Update: 슈퍼 어드민, 관리자, 본인 (role/schoolId 변경 불가)
- Delete: 슈퍼 어드민만
- List: 슈퍼 어드민, 관리자만

> ⚠️ **문서 정정**: 이전 문서에 적혀 있던 `workspaceUserId`, `fullStudentId`, `grade`/`class`/`number`,
> `migratedAt`, `emailHistory`는 **users 문서에 쓰는 코드가 없다.** 이 필드들은
> `/schools/{schoolId}/students/{workspaceUserId}` 쪽 필드다.

---

#### `/studentRegistrations/{email}`
학생 자동 등록용 이메일 색인 (문서 ID = 이메일 원문)

**필드:** (쓰기: `apps/portal/src/pages/attendance/StudentList.jsx:214, 330` / 읽기: `AuthContext.jsx:75, 131`)
- `schoolId` (string)
- `studentId` (string)
- `name` (string)

> ⚠️ **문서 정정**: 이전 문서의 `email`, `grade`, `class`, `number` 필드는 실제로 저장되지 않는다.
> 쓰는 쪽도 읽는 쪽도 위 3개 필드만 쓴다.

**접근 권한:**
- Get: 본인 이메일만
- List: 슈퍼 어드민
- Write: 슈퍼 어드민, 교사

---

#### `/schoolDomains/{domain}`
학교 도메인 매핑 (예: seonyoo.hs.kr → seonyoo-hs)

**필드:** (쓰기: `SuperAdminDomainSetup.jsx:145`, `SuperAdmin.jsx:209, 248`, `SuperAdminGuests.jsx:101`)
- `schoolId` (string)
- `schoolName` (string)
- `createdAt` (timestamp)
- `createdBy` (string) - 생성자 이메일

**접근 권한:**
- Get: 로그인한 사용자 (자기 도메인 조회용)
- List/Write: 슈퍼 어드민만

---

#### `/kioskPairingCodes/{code}`
호출 시스템 기기 페어링 코드 (문서 ID = 6자리 숫자 코드)

**필드:** (쓰기: `functions/callSystem.js:125` — Admin SDK)
- `schoolId` (string)
- `office` (string) - 사무실명
- `deviceType` (string) - `input` (학생용) / `display` (현황판)
- `createdBy` (string) - 발급 관리자 UID
- `createdAt` (timestamp)
- `expiresAt` (timestamp) - 만료 시각
- `used` (boolean)
- `usedByUid` (string) - 페어링한 익명 계정 UID (claim 시 추가)
- `usedAt` (timestamp) - 페어링 시각 (claim 시 추가)

**접근 권한:**
- 클라이언트 접근 전면 차단 (콜러블 함수만 Admin SDK로 처리)

---

#### `/auditLogs/{logId}`
시스템 감사 로그

**필드:** (쓰기: `SchoolSetup.jsx:102, 139`, `SuperAdmin.jsx:54`, `SuperAdminDomainSetup.jsx:33`, `SuperAdminGuests.jsx:33`)
- `action` (string) - 예: `school_setup_joined`, `school_domain_changed`, `cover_url_changed`
- `by` (string) - 실행자 이메일
- `at` (timestamp)
- 그 외 action별 부가 필드 (`schoolId`, `schoolName`, `domain`, `from`, `to`, `url` 등)

**접근 권한:**
- Read: 슈퍼 어드민만
- Create: 로그인한 사용자
- Update/Delete: 슈퍼 어드민만

---

### `/schools/{schoolId}` 하위 컬렉션

#### `/schools/{schoolId}`
학교 정보

**필드:** (쓰기: `SchoolSetup.jsx`, `SuperAdmin.jsx`, `SuperAdminDomainSetup.jsx`, `AdminAccounts.jsx:286`)
- `name` (string) - 학교명
- `adminEmail` (string) - 최초 생성자 이메일
- `createdAt` (timestamp)
- `createdBy` (string) - 생성자 이메일
- `domains` (array<string>) - 이 학교에 매핑된 도메인 목록
- `coverApiUrl` (string) - 보강 시스템 외부 API URL
- `ownerEmail`, `ownerUid`, `domain` (게스트 학교만)
- `workspaceSync` (object) - Workspace 동기화 설정
  - `enabled` (boolean)
  - `adminEmail` (string) - 도메인 위임 대리 인증용 Workspace 관리자 이메일
  - `staffOuPath` (string) - 교직원 OU 경로 (예: `/교원`)
  - `studentOuPath` (string) - 학생 OU 경로 (예: `/학생 2026`)

> ⚠️ **문서 정정**: `workspaceSync.lastSyncAt`을 쓰는 코드는 없다. 실제로는 `adminEmail`, `staffOuPath`가 있다.

**접근 권한:**
- Get: 슈퍼 어드민, 소속 교사, 로그인한 사용자
- List: 슈퍼 어드민, 소속 교사, 미가입자 (SchoolSetup용)
- Create: 슈퍼 어드민, school-* 패턴 학교 생성 가능
- Update: 슈퍼 어드민, 학교 관리자
- Delete: 슈퍼 어드민만

---

#### `/schools/{schoolId}/teachers/{teacherId}`
**레거시 / 사용 안 함.** `firestore.rules:141`에 규칙만 남아 있고, `apps/`·`functions/` 어디에서도
읽거나 쓰지 않는다. 교원 정보는 `/users` + `/schools/{id}/teacherAssignments`로 대체됐다.

**접근 권한:**
- Read/Write: 슈퍼 어드민, 소속 교사

---

#### `/schools/{schoolId}/students/{workspaceUserId}`
학생 정보 (문서 ID: Workspace User ID 21자리. Workspace ID를 못 찾으면 5자리 학번으로 fallback)

**필드:** (쓰기: `functions/workspaceSync.js:155~215`, `StudentList.jsx:210, 330`, `AdminStudents.jsx:165, 252`)
- `workspaceUserId` (string) - Workspace User ID (21자리)
- `studentId` (string) - 학번 (5자리: 학년1 + 반2 + 번호2)
- `fullStudentId` (string) - 9자리 학번
- `name` (string)
- `email` (string)
- `year` (number) - 해당 학년도
- `grade`, `class`, `number` (number) — 필드명이 `class`(예약어 아님, `classNo` 아님)
- `admissionYear` (number) - 첫 등록 시의 연도. 이후 불변
- `emailHistory` (array<{ email, year }>) - 진급으로 이메일이 바뀐 이력
- `source` (string) - `workspaceSync` (동기화가 만든 문서만 아카이브 대상)
- `nameEditedManually` (boolean, 선택) - true면 동기화가 이름을 덮어쓰지 않음
- `electiveSubjects` (array<object>) - 선택과목. **2026-07-31부터 객체 배열**
  (표준형은 `apps/shared/lib/subjectData.js`의 `normalizeElective()`가 정의한다)
  - `subjectId` (string) - `subjects` 문서 ID. 매칭 실패 시 `''`
  - `subjectName` (string), `classNo` (string) - 분반, `semester` (1|2)
  - 구형 데이터(문자열 배열)도 읽는 쪽에서
    `{subjectId:'', subjectName, classNo:'', semester:1}`로 자동 변환된다.
    2·3학년은 과목마다 분반이 달라 이름만으로는 명단을 만들 수 없어 확장했다.
- `electiveSubjectsUpdatedAt` (timestamp)
- `createdAt`, `updatedAt` (timestamp)

**접근 권한:**
- Read: 슈퍼 어드민, 소속 교사, 학생 본인
- Write: 슈퍼 어드민, 소속 교사

---

#### `/schools/{schoolId}/archivedStudents/{workspaceUserId}`
**미문서화였음.** Workspace OU에서 사라진(졸업/전출) 학생을 옮겨 두는 보관소.
쓰기: `functions/workspaceSync.js:231` (Admin SDK 전용, firestore.rules에 규칙 없음 → 클라이언트 접근 불가)

**필드:**
- students 문서 전체 복사본 + `archivedAt` (timestamp) + `archivedReason` (string, 현재 `workspace_sync_removed` 고정)

---

#### `/schools/{schoolId}/_migrated_students_backup/{studentId}`
**미문서화였음.** Workspace User ID 마이그레이션 백업 (문서 ID: 마이그레이션 전 5자리 학번).
쓰기/읽기: `functions/migrations/migrateStudentsToWorkspaceId.js:147, 288` (Admin SDK 전용)

**필드:** 마이그레이션 전 students 문서 전체 + `migratedAt` (timestamp) + `newDocId` (string)

---

#### `/schools/{schoolId}/studentGroups/{groupId}`
학생 그룹 (출결 시스템용)

**필드:** (쓰기: `StudentList.jsx:227, 266, 286, 354`)
- `name` (string) - 그룹명
- `workspaceUserIds` (array<string>) - Workspace User ID 배열 (신규 필드)
- `studentIds` (array<string>) - 학번 배열 (하위호환용. **firestore.rules의 학생 읽기 조건이 이 필드를 본다**)
- `shared` (boolean) - 학교 관리자가 만든 공유 그룹 여부
- `mainTeacherUid`, `mainTeacherName` (string, 공유 그룹만) - 주담당 교사
- `assignedTeacherName` (string, 개인 그룹만) - 배정 교사 이름
- `createdBy` (string) - 소유자 UID
- `createdAt` (timestamp)

**접근 권한:**
- Read: 슈퍼 어드민, 소속 교사, 생성자, `studentIds`에 포함된 학생
- Write: 슈퍼 어드민, 소속 교사, 생성자

---

#### `/schools/{schoolId}/subjects/{subjectId}`
**교육과정 과목 카탈로그** (입학년도 × 학년 × 학기 단위). 학교 교육과정 편제표가 원본.

접근 코드: `apps/shared/lib/subjectData.js` (loadSubjects / saveSubject / deleteSubject /
bulkSaveSubjectsByYear / deleteSubjectsByYear), UI는 `apps/portal/src/pages/admin/AdminSubjects.jsx`

**필드:**
- `category` (string) - **`학교지정` / `학생선택`** ← 이전 문서의 `공통과목`은 코드에 존재하지 않음
- `subjectGroup` (string) - 교과군 (국어, 수학, 영어, ...)
- `courseType` (string) - 과목 구분 (공통, 일반, 융합, 진로)
- `name` (string) - 과목명
- `subjectCode` (string) - 과목 코드 (교육청 양식 업로드 시엔 비어 있을 수 있음)
- `grade` (number) - 학년 (1/2/3)
- `semester` (number | `'both'`) - 학기
- `semesterClassMap` (object | null) - 양학기인 경우 `{ 1: [학급 번호], 2: [학급 번호] }` (간편 업로드 경로에서만 채워짐)
- `baseCredits` (number) - 기본 학점
- `credits` (number) - 운영 학점
- `entryYear` (number) - 입학년도 (일괄 저장/삭제의 기준 키)
- `selectionBlock` (object | null, 학생선택만) - `{ grade, semester, pickCount, blockNumber }`
- `description` (string) - 비고
- `createdAt`, `updatedAt` (timestamp | Date)

**접근 권한:**
- Read: 슈퍼 어드민, 소속 교사
- Write: 슈퍼 어드민, 학교 관리자

---

#### `/schools/{schoolId}/courses/{courseId}`
**출결 이벤트 분류용 과목 태그.** (이전 문서에 아예 누락돼 있던 컬렉션)

접근 코드:
- `apps/portal/src/pages/attendance/TeacherDashboard.jsx:25` (읽기 — 이벤트를 과목별로 묶어 표시)
- `apps/portal/src/pages/attendance/EventCreate.jsx:30, 54` (읽기 + 생성)
- `apps/portal/src/pages/attendance/EventEdit.jsx:36, 92` (읽기 + 생성)

**필드:** (전부. 이게 스키마의 전체다)
- `name` (string) - 교사가 자유 입력한 이름 (예: "물리학B분반")
- `createdBy` (string) - 생성 교사 UID
- `createdAt` (timestamp)

**용도:** 이벤트 생성/수정 화면의 "과목" 드롭다운. 목록에 없으면 `+ 새 과목` 버튼으로 즉석 생성한다.
저장되는 것은 `events.courseId` 한 개의 참조뿐이고, 대시보드에서 이벤트를 그룹핑하는 데만 쓰인다.

**접근 권한:** (`firestore.rules:227`)
- Read/Write: 슈퍼 어드민, 소속 교사 (관리자 전용이 아님 — 아무 교사나 만들 수 있다)

---

#### ⭐ `courses` vs `subjects` vs `asaSubjects` — 왜 셋이 따로 있는가

세 컬렉션 모두 "과목"이라는 단어를 쓰지만 **소유자·수명·정확도 요구가 전부 다르다.**
아래 한 줄씩이 각 컬렉션의 존재 이유다. 통합하지 말 것.

| 컬렉션 | 한 줄 정의 | 누가 만드나 | 수명 |
|--------|-----------|------------|------|
| `subjects` | **학교 교육과정 편제표의 정본(正本)** — 입학년도별 학점·교과군·선택블록까지 담는 행정 데이터 | 학교 관리자만 (교육청 엑셀 업로드) | 입학년도 단위, 연 단위로 통째 교체 |
| `courses` | **교사 개인이 QR 출결 이벤트를 묶으려고 즉석에서 만든 자유 입력 라벨** | 아무 교사나 (이벤트 만들다가) | 이벤트와 함께 굴러다님, 정리 주체 없음 |
| `asaSubjects` | **성취평가제 체크리스트의 "제출 단위"** — 담당 교사 이메일과 성취도 단계(5/3)를 붙인 학년-학기별 항목 | 학교 관리자 (ASA 관리 화면) | 학기 단위 |

**판단: `courses`는 `subjects`와 별개로 유지한다.**
근거 — ① `courses`는 필드가 `{name, createdBy, createdAt}` 뿐이고 학년·학기·학점 개념이 없다.
② 쓰기 권한이 **교사 전체**(`firestore.rules:227`)인데 `subjects`는 **관리자 전용**(`:180`)이다.
`courses`를 `subjects`로 흡수하면 교사가 학교 교육과정 정본에 임의로 행을 추가할 수 있게 된다.
③ `courses`의 값은 "물리학B분반"처럼 교육과정 과목명이 아닌 **분반/수업 단위** 이름이다.
→ 통합이 아니라, 나중에 필요하면 `courses`에 `subjectId` (nullable)를 얹어 **선택적으로** 카탈로그를
가리키게 하는 편이 맞다. `teacherSubjects`가 이미 이 방식을 쓰고 있다.

**판단: `asaSubjects`도 `subjects`와 별개로 유지한다.**
근거 — `asaSubjects`는 과목 정의가 아니라 **제출물의 키**다. `asaSubmissions.subjectId`가 이 문서를
가리키고, 삭제하면 제출물도 함께 지운다(`AsaChecklistAdmin.jsx:353`). `teacherEmails`, `achievementLevel`
같은 필드는 교육과정 편제표에 존재하지 않는 성취평가제 고유 개념이다.
연결은 **참조가 아니라 이름·코드 매칭**으로 한다 — `AdminStaffSubjects.jsx`의 `importFromASA`가
`matchCatalogSubject()`로 asaSubjects → subjects를 맞춰보고, 못 찾으면 이름만 남긴다.

> ⚠️ **알려진 불일치**: `AdminStaffSubjects.jsx:325`의 `importFromASA`는 `data.code`, `data.classes`를
> 읽는데, `asaSubjects` 문서에는 **`code`·`classes` 필드를 쓰는 코드가 없다**(항상 undefined).
> 결과적으로 ASA 가져오기는 이름+학년으로만 매칭된다. 코드 수정 대상이지 문서 수정 대상이 아니라 여기 기록만 남긴다.

---

#### `/schools/{schoolId}/teacherAssignments/{year}_{uid}`
교원 배정 정보 (연도별). **문서 ID = `` `${year}_${uid}` `` — 밑줄 1개**

**필드:** (쓰기: `apps/portal/src/pages/admin/AdminStaffBasic.jsx:134, 191, 299` — 전부 `{ merge: true }`)
- `uid` (string) - users 컬렉션의 UID
- `year` (number) - 학년도
- `positionLabel` (string) - 직함 (예: 교무부장, 학년부장)
- `department` (string) - 부서
- `subject` (string) - 담당 교과 (자유 입력 문자열, subjects 참조 아님)
- `office` (string) - 사무실
- `isHomeroom` (boolean) - 담임 여부
- `homeroomGrade` (number | null) - 담임 학년
- `homeroomClassNo` (number | null) - 담임 반
- `updatedAt` (timestamp)

> ⚠️ **문서 정정**: 이전 문서의 `name` 필드와 `homeroom: { grade, class }` 중첩 객체는 존재하지 않는다.
> 이름은 `/users/{uid}.name`에서 조인해 쓰고, 담임 정보는 위 3개의 **평평한 필드**다.

**인덱스:** `year` + `office` (복합)

**접근 권한:**
- Read: 슈퍼 어드민, 소속 교사
- Write: 슈퍼 어드민, 학교 관리자

---

#### `/schools/{schoolId}/teacherSubjects/{year}_{teacherUid}`
교사 과목 배정 (한 문서 안에 1·2학기를 모두 담는다). **문서 ID = `` `${year}_${teacherUid}` ``**

접근 코드: `apps/portal/src/pages/admin/AdminStaffSubjects.jsx:162, 285, 306, 359`

**필드:**
- `year` (number) - 학년도
- `teacherUid` (string) - 담당 교사 UID  ← 이전 문서의 `uid` 아님
- `teacherName` (string) - 교사 이름 스냅샷
- `semester1Subjects` (array<SubjectAssignment>) - 1학기 담당 과목
- `semester2Subjects` (array<SubjectAssignment>) - 2학기 담당 과목
- `updatedAt` (timestamp)

> ⚠️ **문서 정정**: 이전 문서에 적힌 `uid`, `semester`(number), `subjects`(array)는 **전부 틀렸다.**
> 학기별 배열이 한 문서에 함께 들어가므로 `semester` 스칼라 필드는 존재하지 않는다.

**`SubjectAssignment` 원소 구조** (`AdminStaffSubjects.jsx:271-279`의 `normalize()`가 만드는 형태):
- `subjectId` (string) - **`subjects` 컬렉션 문서 ID.** 카탈로그에서 못 찾으면 **빈 문자열 `''`** (null 아님)
- `subjectCode` (string) - 과목 코드 (카탈로그 매칭 시 카탈로그 값으로 덮어씀)
- `subjectName` (string) - 과목명
- `grade` (number) - 학년
- `classes` (array<number>) - 담당 학급 번호
- `studentRange` (string) - 학생 범위 자유 입력 (예: "1~15번")
- `hoursPerWeek` (number) - 주당 시수

`subjectId` 매칭 규칙 (`matchCatalogSubject`, 같은 파일 56~74행):
`subjectId` → `subjectCode|grade` → `subjectCode` → `subjectName|grade` → `subjectName` 순으로 탐색.
UI에서는 매칭 실패한 과목이 주황색 외곽선 Chip으로 표시된다.

**접근 권한:**
- Read: 슈퍼 어드민, 소속 교사
- Write: 슈퍼 어드민, 학교 관리자

---

#### `/schools/{schoolId}/officeLayouts/{year}__{office}`
사무실 자리 배치. **문서 ID = `` `${year}__${office}` `` — 밑줄 2개 (주의)**

**필드:** (쓰기: `apps/portal/src/pages/attendance/OfficeLayoutEditor.jsx:194, 216`)
- `year` (number)
- `office` (string)
- `seats` (object) - `{ [uid]: { x, y } }` (캔버스 비율 좌표 0~1). 저장 시 현재 사무실 명단에 없는 uid는 제거된다
- `confirmed` (boolean) - 배치 완료 확정 여부
- `updatedAt` (timestamp)

**접근 권한:**
- Read: 슈퍼 어드민, 소속 교사 (키오스크는 `getKioskTeachers` 콜러블을 통해서만 받음)
- Write: 슈퍼 어드민, 학교 관리자

---

#### `/schools/{schoolId}/presence/{uid}`
교사 재실 상태. 정의: `apps/shared/lib/presence.js`

**필드:** (쓰기: `apps/dashboard/src/widgets/PresenceWidget.jsx:36`)
- `uid` (string)
- `status` (string) - **`available` (재실) / `busy` (수업 중) / `away` (자리 비움)**
- `source` (string) - `manual` / `desktop` (Electron 클라이언트가 OS 유휴시간·화면 잠금으로 자동 판정.
  2026-08-21 구현 — `apps/dashboard/src/lib/useDesktopPresence.js`. 사람이 직접 고른 `busy`는 덮어쓰지 않는다)
- `lastActiveAt` (timestamp | null) - desktop 클라이언트만 기록
- `updatedAt` (timestamp)

> ⚠️ **문서 정정**: 이전 문서의 `in` / `teaching` / `out`은 코드에 존재하지 않는 값이다.
> 저장값이 아닌 **계산값**으로 `unknown`이 있다 — `effectivePresence()`가 `updatedAt`이
> `PRESENCE_TTL_MS`(4시간)보다 오래됐으면 `unknown`으로 취급한다(퇴근 후 '재실' 잔류 방지).

**접근 권한:**
- Read: 슈퍼 어드민, 소속 교사, 키오스크 기기
- Write: 슈퍼 어드민, 본인만

---

#### `/schools/{schoolId}/desktopClients/{uid}`
데스크톱 앱 설치 현황. 정의: `apps/shared/lib/desktopClients.js`

**필드:** (쓰기: `apps/dashboard/src/lib/useDesktopClientReport.js`)
- `uid` (string)
- `version` (string) - 실행 중인 앱 버전 (예: `0.1.7`). preload가 노출하는 값
- `platform` (string) - `navigator.platform` (예: `Win32`)
- `firstSeenAt` (timestamp) - 처음 보고한 시점. **이후 갱신하지 않는다**
- `lastSeenAt` (timestamp) - 마지막 보고 시점 (앱 실행 중 6시간 주기)
- `updatedAt` (timestamp)

재실(`presence`)과 문서를 나눈 이유는 수명주기가 달라서다 — 재실은 4시간 TTL로 신뢰도가
죽는 "지금" 값이지만, 설치 현황은 마지막 목격 시점을 계속 보존해야 한다.

> **왜 필요한가**: 자동 업데이트(`electron-updater`)는 **0.1.7부터** 들어갔다. 그 미만은
> 업데이트를 확인하러 가지도 않으므로 영원히 옛 버전에 머문다 — 수동 재설치 안내 대상을
> 골라내려면 누가 몇 버전인지 알아야 한다. 조회 화면: `/admin/desktop` (관리자 전용)

**접근 권한:**
- Read: 슈퍼 어드민, 학교 관리자 (배포·지원용 정보라 교사 전체에 열지 않는다)
- Write: 슈퍼 어드민, 본인만

---

#### `/schools/{schoolId}/callRequests/{requestId}`
선생님 호출 요청

**필드:** (생성: `functions/callSystem.js:238` / 갱신: `apps/dashboard/src/widgets/CallsWidget.jsx:44`, `CallAlert.jsx:50`, `functions/callSystem.js:271`)
- `office` (string)
- `teacherUid` (string)
- `teacherName` (string) - 호출 시점 스냅샷
- `studentId` (string)
- `studentName` (string) - 호출 시점 스냅샷
- `grade` (number | null), `classNo` (number | null), `number` (number | null)
  — students 문서의 `class`를 `classNo`로 **이름을 바꿔** 담는다
- `status` (string) - `pending` → `acknowledged` → `done`, 또는 5분 미확인 시 `expired`
- `createdAt` (timestamp)
- `acknowledgedAt`, `doneAt`, `expiredAt` (timestamp, 상태 전이 시 추가)

**인덱스:**
- `office` + `createdAt DESC`
- `teacherUid` + `createdAt DESC`
- `teacherUid` + `status`
- `studentId` + `createdAt ASC`
- `status` + `createdAt ASC`

**접근 권한:**
- Read: 슈퍼 어드민, 소속 교사, 키오스크 (자기 사무실만 — office 필터 없는 list는 거부됨)
- Create: 콜러블 `submitCallRequest`만 (rules에 `allow create: if false`)
- Update: 슈퍼 어드민, 소속 교사
- Delete: 슈퍼 어드민, 학교 관리자

---

#### `/schools/{schoolId}/coverRequests/{requestId}`
보강 신청

**필드:** (쓰기: `apps/portal/src/pages/cover/CoverMain.jsx:342, 358, 382, 427`)
- `date` (string) - 날짜 문자열
- `className` (string) - 반 (예: "2-3")
- `period` (number) - 교시
- `absentTeacher` (string) - 결강 교사 **이름**
- `subject` (string) - 교과명 (자유 입력)
- `status` (string) - **`대기중` / `마감`** (한글 값)
- `coverTeacher` (string | null) - 보강 교사 이름
- `coverTeacherEmail` (string | null) - 보강 교사 이메일
- `openAt` (string | null) - 공개 시각
- `appliedAt` (timestamp | null) - 보강 신청 시각
- `createdAt` (timestamp), `createdBy` (string)

> ⚠️ **문서 정정**: 이전 문서의 `requesterEmail` 필드는 존재하지 않는다(결강 교사는 이름 문자열 `absentTeacher`).
> `status`도 영문이 아니라 한글 `대기중`/`마감`이다.

**인덱스:** `coverTeacherEmail` + `date DESC`

**접근 권한:**
- Read: 슈퍼 어드민, 소속 교사
- Create: 슈퍼 어드민, 학교 관리자
- Update: 슈퍼 어드민, 소속 교사
- Delete: 슈퍼 어드민, 학교 관리자

---

#### `/schools/{schoolId}/events/{eventId}`
출결 이벤트

**필드:** (쓰기: `EventCreate.jsx:153`, `EventEdit.jsx:139`, `AttendanceDashboard.jsx:654`, `functions/index.js`)
- `name` (string) - 이벤트명
- `type` (string) - `조회` / `수업` / `방과후` / `행사` / `기타`
- `courseId` (string | null) - **`courses` 컬렉션 참조**
- `studentGroupId` (string | null) - **`studentGroups` 컬렉션 참조 (단수)**
- `location`, `description` (string)
- `isRecurring` (boolean)
- `qrToken` (string) - 고정 QR 토큰 (조회형)
- `createdBy` (string), `createdAt` (timestamp)
- `lateCheckTime` (string | null) - `HH:mm`, 유형이 `조회`일 때만
- `archived` (boolean, 선택) - 보관함 이동 여부
- **반복 이벤트일 때**
  - `schedules` (array<{ dayOfWeek, period, startTime|null, endTime|null }>)
  - `recurringDays` (array<number>) - schedules에서 파생된 요일 목록
  - `recurringEndDate` (Date)
  - `recurringTimeStart`, `recurringTimeEnd` — **구형 필드**, 현재는 항상 null로 덮어씀
- **단발 이벤트일 때**: `startTime`, `endTime` (Date)
- **라이브 세션 필드** (수업/방과후/행사/기타 유형, `AttendanceDashboard.jsx:654` + `functions/index.js:210~`)
  - `liveToken` (string | null) - 열려 있는 동안만 값이 있음
  - `liveOpenedAt`, `liveLateCutoff`, `liveClosesAt` (timestamp | null)
  - `classDuration` (number) - 분 단위
  - `lateWindowProcessed` (boolean | null)

> ⚠️ **문서 정정**: 이전 문서의 `targetGroups` (array)는 코드 어디에도 없다. 실제로는 단수 `studentGroupId`다.

**인덱스:** `createdBy` + `createdAt DESC`

**하위 컬렉션:** `/attendanceLogs/{logId}`
- 문서 ID 규칙: 단발 = `{studentId}`, 반복 = `{YYYY-MM-DD}-{studentId}`, 결석 사유는 뒤에 `-absent` 접미사
- 필드: `studentId`, `studentName`, `grade`, `class`, `number`,
  `checkedAt` (timestamp), `method` (`QR` / `manual` / `absent`), `qrToken`,
  `late` (boolean, QR 체크인만), `reason` (string, `absent`만),
  `lateOverLimit` (boolean, 1/3 경과 후 수동 입력),
  `outings` (array<{ id, type, reason, exitAt, returnAt }>) - 수업 중 외출,
  `outingOverLimit` (boolean), `outingWarnedAt` (timestamp)

**접근 권한:**
- Get: 공개 (QR 체크인용, 미로그인 학생 접근)
- List: 슈퍼 어드민, 소속 교사, 학생
- Write: 슈퍼 어드민, 소속 교사

---

#### `/schools/{schoolId}/notices/{noticeId}`
스마트 공지

**필드:** (쓰기: `apps/portal/src/pages/notices/NoticeList.jsx:92`)
- `teacherId` (string) - 작성 교사 UID
- `eventId` (string | null) - 연결된 출결 이벤트
- `eventName` (string | null) - 이벤트명 스냅샷
- `title`, `content` (string)
- `targetType` (string) - `all` / `individual`
- `targetStudentIds` (array<string>)
- `emailSent` (boolean)
- `createdAt` (timestamp)

> ⚠️ **문서 정정**: 이전 문서의 `targetGroups`는 존재하지 않는다 (`targetType` + `targetStudentIds`).

**인덱스:** `teacherId` + `createdAt DESC` / `eventId` + `createdAt DESC`

**하위 컬렉션:** `/confirmations/{studentId}` — `{ studentId, confirmedAt }` (`StudentCheckin.jsx:227`)

**접근 권한:**
- Read: 슈퍼 어드민, 소속 교사, 학생
- Write: 슈퍼 어드민, 본인만

---

#### `/schools/{schoolId}/trainings/{trainingId}`
연수 서명부

**필드:** (쓰기: `apps/portal/src/pages/training/TrainingCreate.jsx:110`)
- `title` (string), `date` (string), `startTime`, `endTime` (string), `location`, `description` (string)
- `members` (array<{ uid?, name, email?, staffType? }>) - 서명 대상자 명단 ← 이전 문서의 `participants` 아님
- `signedCount` (number) - 서명 완료 수 (서명 시 재계산)
- `status` (string) - `open`
- `createdBy` (string), `createdByName` (string), `createdAt` (timestamp)

**하위 컬렉션:** `/signatures/{uid}` — `{ uid, name, email, signedAt, signatureData }`
(`signatureData` = PNG data URL, `TrainingSign.jsx:197`)

**접근 권한:**
- Read: 슈퍼 어드민, 소속 교사
- Create/Update: 슈퍼 어드민, 소속 교사
- Delete: 슈퍼 어드민, 관리자, 생성자

---

#### `/schools/{schoolId}/trainingPresets/{presetId}`
연수 명단 프리셋

**필드:** (쓰기: `apps/portal/src/pages/training/TrainingPresets.jsx:218, 223`)
- `name` (string)
- `members` (array) - trainings.members와 같은 형태
- `createdBy` (string), `createdAt` (timestamp)

**접근 권한:**
- Read: 슈퍼 어드민, 소속 교사
- Write: 슈퍼 어드민, 관리자

---

#### `/schools/{schoolId}/preApproved/{emailDocId}`
사전 승인 교직원 목록. 문서 ID = `emailToDocId(email)` (이메일을 문서 ID로 인코딩)

**필드:** (쓰기: `apps/portal/src/pages/admin/AdminAccounts.jsx:256`, `functions/workspaceSync.js:90`)
- `email` (string)
- `name` (string)
- `role` (string) - `teacher`
- `staffType` (string) - `교사` / `교직원`
- `source` (string, 선택) - `workspaceSync` (동기화가 만든 항목만 자동 갱신·정리 대상)
- `createdAt`, `updatedAt` (timestamp)

**접근 권한:**
- Get: 본인 이메일만 (문서의 email 필드로 확인)
- List/Write: 슈퍼 어드민, 학교 관리자

---

#### `/schools/{schoolId}/tasks/{taskId}` — **폐지됨**
업무 관리 시험판. `36b244e`(2026-07-31)에서 `requests`로 대체되며 코드·firestore.rules
양쪽에서 제거됐다. 남아 있는 문서가 있다면 규칙이 없어 클라이언트에서 접근되지 않는다.

---

### 업무 · 소통 컬렉션 (대시보드 앱)

#### `/schools/{schoolId}/requests/{requestId}`
**업무 글** — 안내(공지)와 요청을 한 컬렉션에 담는다. 정의: `apps/shared/lib/workRequests.js`

> 컬렉션을 나누지 않은 이유: 제목·내용·자료·대상까지 똑같고 다른 것은 "완료 확인을 받느냐"
> 하나뿐이다. 작성 화면·목록·상세를 한 벌만 유지하면 되고, 쓰는 사람도 "공지냐 요청이냐"가
> 아니라 "이거 확인받아야 하나"만 판단하면 된다.

**필드:** (쓰기: `apps/dashboard/src/pages/PostNew.jsx:257, 270`,
`apps/dashboard/src/components/NoticeComposeModal.jsx:123`, `apps/dashboard/src/lib/requestActions.js`)
- `kind` (string) - `'notice'`(안내) / `'request'`(요청). **없는 문서는 요청으로 본다**(구형)
- `title` (string), `description` (string) - 목록·미리보기용 **평문**
- `bodyHtml` (string) - 서식 본문. 저장 전 `sanitizeHtml()`, 그릴 때 한 번 더 통과시킨다
- `dueDate` (Date | null) - 요청만. 안내는 항상 null
- `pinned` (boolean) - 안내만. 요청은 항상 false
- `status` (string) - `'open'` / `'closed'`
- `attachments` (array<{ name, size, path, url, uploadedAt }>) - Storage 첨부
- `links` (array)
- `targetRule` (object) - `{ conditions[], includeUids[], excludeUids[] }` (재계산·감사용)
- `targetRuleText` (string) - 조건을 사람이 읽는 문장으로
- `targetUids` (array<string>) - **발송 시점에 고정된 대상 명단**
- `targetNames` (array<string>) - 이름 스냅샷 (계정이 지워져도 누구였는지 남는다)
- `completedUids` (array<string>) - 완료자 uid (요청만)
- `channelId` (string | null) - `channels` 문서 참조
- `remindedAt` (timestamp) - '다시 알림'을 누른 시각
- `createdBy`, `createdByName` (string), `createdAt`, `updatedAt` (timestamp)

> `completedUids`를 문서에 함께 두는 이유는 "요청받은 일" 위젯 때문이다. 없으면 요청마다
> 완료 문서를 한 번씩 더 읽어야 한다. 대신 규칙에서 **본인 uid만** 넣고 뺄 수 있게 막는다
> (`selfOnlyUidChange()` 헬퍼).

**대상 조건(`targetRule.conditions`)** — `apps/shared/lib/targeting.js`
`department`(부서) / `subject`(교과) / `rank`(직급) / `teachingGrade`(수업 학년).
값은 `teacherAssignments`·`teacherSubjects`에서 조인해 판정한다.
조건은 저장만 하고 **자동 재계산하지 않는다** — 마감이 지난 요청에 사람이 조용히 추가되면
받은 적도 없는데 미완료로 찍히기 때문. 재계산은 작성자가 명시적으로 실행한다.

**인덱스:**
- `targetUids` CONTAINS + `status` + `dueDate`
- `targetUids` CONTAINS + `kind` + `status`
- `targetUids` CONTAINS + `kind`
- `createdBy` + `createdAt DESC`

**접근 권한:** (`firestore.rules:269`)
- Read: 슈퍼 어드민, 소속 교사 전체
- Create: 소속 교사 누구나 (단 `createdBy`가 본인, `completedUids`는 빈 배열이어야 함)
- Update: 슈퍼 어드민, 학교 관리자, 작성자 —
  **대상 교사는 `completedUids`·`updatedAt`만, 그 안에서도 자기 uid만** 넣고 뺄 수 있다
- Delete: 슈퍼 어드민, 학교 관리자, 작성자

---

##### `/schools/{schoolId}/requests/{requestId}/completions/{uid}`
완료 상세. **문서 ID = uid**

**필드:** (`workRequests.js`의 `newCompletionPayload()`, `requestActions.js:45`)
- `uid`, `name` (string)
- `doneBy` (string) - `'self'`(본인 체크) / `'manager'`(담당자가 대신 체크)
- `markedByUid`, `markedByName` (string) - 실제로 누른 사람
- `note` (string)
- `doneAt` (timestamp) - 해제 시 `deleteField()`로 지운다
- `updatedAt` (timestamp)

**접근 권한:** Read - 소속 교사 전체 / Write - 슈퍼 어드민, 학교 관리자,
문서 ID가 본인 uid인 교사, 그리고 **그 요청을 만든 사람**(완료 버튼을 안 누르는 사람이 반드시 있다)

---

##### `/schools/{schoolId}/requests/{requestId}/comments/{commentId}`
업무 글 댓글 (auto-ID). 정의: `apps/shared/lib/comments.js`

**필드:**
- `body` (string) - **평문**. HTML이 아니다 (최대 1000자)
- `authorUid` (string) - 삭제 권한 판정 근거
- `authorName` (string) - 작성 시점 스냅샷
- `createdAt` (timestamp)

> 본문을 평문으로 둔 이유: 서식을 허용하면 편집기·정화기·저장 형식이 한 벌 더 늘고,
> `sanitizeHtml`을 한 군데라도 빠뜨리면 그대로 XSS가 된다. 한두 줄짜리 되묻기라
> 굵게·목록·이미지를 넣을 이유가 없다.

**접근 권한:**
- Read: 소속 교사 전체 / Create: 본인 이름으로, 빈 본문 금지
- **Update: 금지(`allow update: if false`)** — 편집 화면이 없다. 규칙이 코드보다 넓으면
  나중에 콘솔이나 SDK로 남의 눈에 안 띄게 말을 바꿔놓을 수 있다
- Delete: 슈퍼 어드민, 학교 관리자, 댓글 작성자 (**글쓴이에게는 주지 않는다** —
  자기 글에 달린 불편한 질문을 지울 수 있으면 "답을 모두가 함께 본다"가 깨진다)

---

#### `/schools/{schoolId}/channels/{channelId}`
**채널** — 업무 글이 모이는 곳. 정의: `apps/shared/lib/channels.js`

> 새 글 종류가 아니라 **기존 글에 붙는 이름표**다. 요청·안내는 그대로 두고
> (`requests.channelId`로 연결) 한 줄로 모아 볼 뿐이라, 별도 글 컬렉션을 두지 않았다.

**필드:**
- `name` (string, ≤24자), `description` (string, ≤120자)
- `memberRule` (object) - `requests.targetRule`과 **같은 형식**(targeting.js를 공유한다)
- `memberRuleText` (string)
- `memberUids` (array<string>) - "내가 속한 채널"을 `array-contains`로 뽑기 위한 평면 배열
- `leftUids` (array<string>) - 나간 사람. **명단 수정과 나가기를 규칙에서 가르려고 별도 필드로 둔다**
  (`memberUids`에서 자기를 빼는 방식이면 나갈 수 있는 사람은 남을 내보낼 수도 있게 된다)
- `archived` (boolean)
- `createdBy`, `createdByName` (string), `updatedAt` (timestamp)

**접근 권한:** (`firestore.rules:241`)
- Read: 소속 교사 전체 (참여자만 읽게 하면 채널 이름조차 못 봐서 "넣어달라"는 말을 꺼낼 수 없다)
- Create: 소속 교사 (본인이 `createdBy`, `leftUids`는 비어 있어야 함)
- Update: 슈퍼 어드민, 학교 관리자, 만든 사람 — **그 외 교사는 `leftUids`에서 자기만** 넣고 뺀다
- Delete: 슈퍼 어드민, 학교 관리자, 만든 사람

---

#### `/schools/{schoolId}/personalNotices/{noticeId}`
**쪽지** — 교사 사이의 1:1 전달. 정의: `apps/shared/lib/personalNotices.js`

> **받는 사람 한 명당 문서 하나**를 만들고 `batchId`로 묶는다. 한 문서에 수신자 배열을 담으면
> 읽음 하나를 바꿀 때마다 남의 읽음까지 든 문서를 통째로 쓰게 되고, 받는 사람 전원이 서로의
> 쪽지 내용·읽음 상태를 볼 수 있어 1:1이라는 전제가 깨진다.

**필드:**
- `batchId` (string) - 같이 보낸 쪽지 묶음 (한 명에게 보내도 채운다)
- `senderUid`, `senderName` (string)
- `recipientUid`, `recipientName` (string)
- `recipientCount` (number) - 명단을 통째로 넣으면 쪽지 하나가 수신자 명부가 되므로 **인원수만** 남긴다
- `title` (string, ≤100자), `bodyHtml` (string), `content` (string) - 목록·미리보기용 평문
- `attachments` (array) - Storage `schools/{schoolId}/notices/{batchId}/...`
- `readAt` (timestamp | null)
- `deletedBySenderAt`, `deletedByRecipientAt` (timestamp | null) - **각자 숨김**.
  문서 하나를 양쪽이 함께 보므로, 진짜 지우면 받은 사람이 보낸 사람의 기록까지 없앤다
- `createdAt` (timestamp)

**인덱스:** `recipientUid` + `createdAt DESC` / `senderUid` + `createdAt DESC`

**접근 권한:** (`firestore.rules:198`)
- Read: 발신자·수신자 본인만
- Create: 본인을 `senderUid`로
- Update: 발신자는 전체 / **수신자는 `readAt`·`deletedByRecipientAt`만**
  (열어두면 받은 쪽지의 제목·본문을 고쳐놓을 수 있고, 그 값이 보낸함에도 그대로 보인다)
- Delete: 발신자만

---

#### `/schools/{schoolId}/academicCalendar/{eventId}`
학사일정 (관리자 작성, auto-ID)

**필드:** (쓰기: `apps/portal/src/pages/admin/AdminAcademicCalendar.jsx:90, 95`)
- `title` (string), `type` (string)
- `date` (Date), `endDate` (Date | null)
- `authorUid` (string), `createdAt`, `updatedAt` (timestamp)

**접근 권한:** Read - 슈퍼 어드민, 소속 교사 / Write - 슈퍼 어드민, 학교 관리자

---

#### `/schools/{schoolId}/dashboardModules/{componentKey}`
대시보드 위젯 노출 제어. **문서 ID = 위젯 키**(`announcements`, `calendar`).
카탈로그: `apps/shared/lib/dashboardModules.js`의 `MODULE_CATALOG`

**필드:** (쓰기: `apps/portal/src/pages/admin/AdminDashboardModules.jsx:50`, `{ merge: true }`)
- `enabled` (boolean)
- `visibility` (string) - `'all'` / `'department'` / `'individual'`
- `targetDepartments` (array<string>), `targetTeacherUids` (array<string>)

> 문서가 없으면 `defaultModuleSettings()`의 기본값으로 동작한다. 새 위젯을 배포했는데
> 관리자가 켜기 전까지 아무에게도 안 보이면 "배포됐는데 화면이 그대로"인 것처럼 보이기 때문.

**접근 권한:** Read - 소속 교사 / Write - 슈퍼 어드민, 학교 관리자
(대상 여부 판정은 클라이언트가 하고, 서버는 `enabled`만 강제한다)

---

### 교수학습 및 평가 운영 계획 (2026-08-18 신설)

#### `/schools/{schoolId}/evaluationPlans/{planId}`
hwpx 계획서 업로드 → 파싱 → 검토 → 확정 흐름의 제출물 (auto-ID)

**필드:** (쓰기: `apps/portal/src/pages/evalplan/EvalPlanSubmit.jsx:186`)
- `year` (number), `semester` (1|2)
- `grades` (array<number>), `gradeRaw` (string) - 파싱 원문
- `subjectGroup` (string) - 교과(군). 12개 고정 목록(`evalPlanUtils.js`의 `SUBJECT_GROUPS`)
- `subject` (string), `weeklyHours` (number | null), `classes`
- `teacherNames` (array<string>) - hwpx에 적힌 이름 원문
- `teacherMatches` (array<{ name, status, uid, ... }>) - 이름 → 계정 매칭 결과
- `matchedTeacherUids` (array<string>) - **매칭된 uid만 뽑은 평면 배열.**
  Firestore 규칙은 배열 안 객체의 필드를 조회하지 못해, "공동 지도교사도 열람 가능"을
  판정하려면 이 형태가 필요하다
- `uploaderUid`, `uploaderName` (string)
- `status` (string) - `'draft'`(임시저장) / `'confirmed'`(확정)
- `confirmedAt` (timestamp | null)
- `sourceFile` (object) - Storage에 올린 원본 hwpx
- `extractedRaw` (object) - 파서 원출력
- `data` (object) - 사람이 검토·수정한 값 (`evalPlanUtils.js`의 `buildInitialData()`)
  - `examRatio` - `{ midterm, final, performance }`, 각 `{ essayType, objectiveType|otherType, total }`,
    셀은 `{ ratio, maxScore }`
  - `performanceAreas` (array)
  - `gradeMethod` - `rankGrade` / `achievementLevel5` / `cutScoreEstimated` /
    `cutScoreFixed` / `achievementLevel3` / `passFailOnly`, 각 `{ label, enabled }`
  - `minAchievementPlan.additionalStudy` - `{ credits, extraStudyHours,
    preventionHoursRecognized, creditRecognitionHours }`
- `createdAt`, `updatedAt` (timestamp)

**인덱스:**
- `uploaderUid` + `createdAt DESC`
- `matchedTeacherUids` CONTAINS + `createdAt DESC`
- `year` + `semester` + `createdAt DESC`

**접근 권한:** (`firestore.rules:556`)
- Read: 슈퍼 어드민, 학교 관리자, **업무 담당자**(`evaluationPlanManagers`에 문서가 있으면),
  제출자 본인, `matchedTeacherUids`에 든 공동 지도교사
- Create: 본인을 `uploaderUid`로, `year`는 int, `semester`는 1|2, `status`는 draft|confirmed
- Update: 관리자 또는 제출자 본인 — **`uploaderUid` 변경 금지**
- Delete: 슈퍼 어드민, 학교 관리자, 제출자 본인

**연계 트리거:** `functions/evaluationPlanSync.js`의 `syncEvaluationPlanToStaff`
(`onDocumentWritten`). `status === 'confirmed'`가 되면 매칭된 교사 전원의
`teacherAssignments/{year}_{uid}.subject`와
`teacherSubjects/{year}_{uid}.semester{N}Subjects`에 자동 반영한다.
이 두 컬렉션은 규칙상 관리자만 쓸 수 있어 **Admin SDK 서버 트리거로 우회**한다.

---

#### `/schools/{schoolId}/evaluationPlanManagers/{uid}`
평가 운영 계획 업무 담당자. **문서 ID = uid, 존재 여부만으로 담당자인지 판정한다**

**필드:** (쓰기: `apps/portal/src/pages/admin/AdminEvalPlanManagers.jsx:57`)
- `uid`, `name`, `email` (string)
- `addedBy`, `addedByName` (string), `addedAt` (timestamp)

**접근 권한:** Read - 소속 교사 전체 ("담당자에게 문의하세요"를 보여주려면 이름 조회가 필요)
/ Write - 슈퍼 어드민, 학교 관리자

---

### 성취평가제(ASA) 관련 컬렉션

#### `/schools/{schoolId}/asaSubjects/{subjectId}`
성취평가제 체크리스트의 **제출 단위** (학년 × 학기 × 과목명)

**필드:** (쓰기: `apps/portal/src/pages/tools/AsaChecklistAdmin.jsx:323, 335, 430, 498, 628`)
- `name` (string) - 과목명
- `grade` (number), `semester` (number)
- `teacherEmails` (array<string>) - 배정 교사 이메일 (권한 판정의 실시간 소스)
- `teacherUids` (array<string>) - 배정 교사 uid. `c831ea3`(2026-07-31)에서 추가.
  **비파괴적 전환** — `teacherEmails`는 지우지 않고 함께 저장하며, 읽을 때는 uid가 있으면
  그것을, 없으면 이메일로 폴백한다. 담당 여부 판정은 둘의 합집합
  (`apps/shared/lib/asaTeacherRefs.js`). 이메일 문자열 매칭은 계정 이메일이 바뀌거나
  대소문자가 다르면 아무 에러 없이 끊기기 때문
- `achievementLevel` (number) - `5` 또는 `3` (성취도 단계)
- `createdAt`, `updatedAt` (timestamp)

> `code`·`classes` 필드는 **쓰는 코드가 없다** (읽는 쪽만 있음 — 위 "왜 셋이 따로 있는가" 절 참고).

**접근 권한:**
- Read: 슈퍼 어드민, 소속 교사
- Write: 슈퍼 어드민, 학교 관리자

---

#### `/schools/{schoolId}/asaSubmissions/{submissionId}`
ASA 체크리스트 제출물

**필드:** (쓰기: `AsaChecklistForm.jsx:116`, `AsaChecklistFormResult.jsx:145`)
- `subjectId` (string) - **asaSubjects 문서 ID**
- `subjectName` (string) - 스냅샷
- `checklistType` (string) - `process` (붙임1) / `result` (붙임2)
- `schoolName` (string)
- `status` (string) - `draft` / `submitted` / `locked` (`locked` 시 수정 불가)
- `teacherEmails` (array<string>) - 생성 시점 스냅샷 (권한 판정은 asaSubjects 실시간 참조)
- `answers` (object) - `{ [questionId]: { value, evidenceChecks[] } }`
- `signatures` (object) - `{ [email or uid]: ... }`  ※ 정확한 원소 구조 확인 필요
- `principalSignature` (object | null)
- `checkDate` (string) - `YYYY-MM-DD`
- `createdAt`, `updatedAt` (timestamp)

**접근 권한:**
- Read: 슈퍼 어드민, 학교 관리자, 교감, 배정된 교사
- Create: 슈퍼 어드민, 학교 관리자, 배정된 교사
- Update: 슈퍼 어드민, 학교 관리자, 교감, 배정된 교사 (locked 아닐 때만)
- Delete: 슈퍼 어드민, 학교 관리자

---

#### `/schools/{schoolId}/asaPrincipalSignature/{uid}`
교감 서명 재사용 저장소

**필드:** (쓰기: `AsaChecklistPrincipal.jsx:135`)
- `dataUrl` (string) - 서명 이미지 data URL
- `name` (string)
- `savedAt` (timestamp)

**접근 권한:**
- Read: 슈퍼 어드민, 학교 관리자, 본인
- Write: 슈퍼 어드민, 교감 본인

---

#### `/schools/{schoolId}/asaCutoffs/{cutoffId}`
분할점수 기준

**필드:** (쓰기: `AsaSupportCutoffs.jsx:118, 145, 182`)
- `subjectName` (string) - 나이스 표기 그대로 (운영학점이 `"(4)"` 형태로 뒤에 붙어 있음. 매칭 키라 지우면 안 됨)
- `grade` (number), `year` (number), `semester` (number)
- `source` (string) - `estimated` 등
- `boundaries` (object/array) - 분할점수 경계값 ※ 정확한 형태는 `apps/portal/src/pages/tools/` 파서 참고
- `sourceFileName` (string)
- `updatedBy` (string), `updatedAt` (timestamp)

> ⚠️ **문서 ID 규칙이 코드 간에 불일치한다.**
> - `AsaSupportCutoffs.jsx:118, 145` / `MinAchievement.jsx:148` → `` `${year}_${semester}_${grade}_${subjectName}` ``
> - `AsaSupport.jsx:92` → `` `${grade}_${subjectName}` ``
> 후자로 조회하면 전자로 저장된 문서를 찾지 못한다. **코드 수정 필요 항목**으로 기록만 남긴다.

**접근 권한:**
- Read: 슈퍼 어드민, 소속 교사
- Write: 슈퍼 어드민, 학교 관리자

---

#### `/schools/{schoolId}/asaResults/{resultId}`
ASA 분석 결과. 문서 ID = `encodeURIComponent(`{uid}_{grade}_{subjectName}`)`

**필드:** (쓰기: `AsaSupport.jsx:125`)
- `subjectName` (string), `grade` (number)
- `classLabels` (array), `teacherName` (string), `sourceFileNames` (array)
- `createdBy` (string), `createdByName` (string)
- 집계 필드 (`computeAggregate()` 결과): `totalCount`, `withdrawnCount`, `gradeACount`,
  `gradeARatio`, `subjectAverage`, `abCutoff`, `averageVsAB`
- `belowLowest`, `lowestBoundary` (1학년만, 그 외 null)
- `createdAt` (timestamp)

**인덱스:** `createdBy` + `createdAt DESC`

**접근 권한:**
- Read: 슈퍼 어드민, 학교 관리자, 생성자
- Create: 슈퍼 어드민, 생성자 본인
- Update/Delete: 슈퍼 어드민, 학교 관리자, 생성자

---

#### `/schools/{schoolId}/minAchievementResults/{resultId}`
최소성취수준 보장지도 결과. 문서 ID = `` `${uid}_1_${subjectName}` `` (rules가 `{uid}_*` 패턴을 검사)

**필드:** (쓰기: `apps/portal/src/pages/tools/MinAchievement.jsx:236, 270`)
- `subjectName` (string), `grade` (number, 현재 1 고정)
- `uploadedBy` (string), `uploadedByName` (string), `uploadedAt` (timestamp)
- `cutoffValue` (number), `cutoffSource` (string)
- `totalStudents` (number)
- `belowCutoffStudents` (array<{ classNumber, total, note }>)

**접근 권한:**
- Read: 슈퍼 어드민, 소속 교사
- Write: 슈퍼 어드민, 학교 관리자, 본인 (문서 ID가 `{uid}_*` 패턴)

---

#### `/schools/{schoolId}/asaNeisImports/{importId}`
나이스 담당과목 업로드 이력

**필드:** (쓰기: `AsaChecklistAdmin.jsx:562, 635`)
- `fileName` (string)
- `uploadedBy` (string), `uploadedByName` (string), `uploadedAt` (timestamp)
- `rows` (array) - 파일 안의 학년+과목 조합 스냅샷 (런타임 전용 `matchingDocs` 필드는 제외하고 저장)
- `appliedKeys` (array<string>) - 실제로 적용된 행의 키 (재적용 시 `arrayUnion`으로 누적)

**접근 권한:**
- Read/Write: 슈퍼 어드민, 학교 관리자

---

## Cloud Functions

리전: `asia-northeast3`

### `functions/index.js` (진입점 — 대부분 재export)
- **bootstrapSuperAdmin** (onCall) - 최초 슈퍼 어드민 Custom Claim 부여
- **autoManageLiveSessions** (onSchedule) - 라이브 세션 지각 마감(`liveToken: null`) 및 세션 종료 시 필드 초기화.
  KST 06:00~21:59 1분 주기이며, `collectionGroup('events')` + `liveOpenedAt` 필터로 진행 중인 세션만 읽는다
  (전체 스캔 시 읽기 할당량 소진 — 2026-08-20)
- **generateAsaChecklistPdf** (onCall) - 성취평가제 체크리스트 PDF 생성 (Puppeteer, 1GiB)
- **parseEvaluationPlan** (onCall) - 업로드한 hwpx 계획서에서 반영비율·성적산출방법 표 추출
  (`functions/evaluationPlanParser.js`)

### `functions/workspaceSync.js`
- **syncWorkspaceDirectory** (onSchedule) - Google Workspace Directory 정기 동기화
- **runWorkspaceSyncNow** (onCall) - 관리자 수동 실행
  - 교직원 → `preApproved` upsert/정리, 학생 → `students` upsert + `archivedStudents` 이동
  - 서비스계정 키는 Secret Manager `workspace-sync-key`에 보관

### `functions/callSystem.js`
- **generatePairingCode** (onCall) - 키오스크 페어링 코드 발급
- **claimKioskDevice** (onCall) - 페어링 코드 검증 및 Custom Claims 부여 ← 이전 문서의 `verifyPairingCode` 아님
- **getKioskTeachers** (onCall) - 키오스크용 교사 목록 + 자리 배치 조회
- **lookupStudentName** (onCall) - 학번으로 학생 이름 확인
- **submitCallRequest** (onCall) - 선생님 호출 요청 생성 (1분 재호출 쿨다운, 재실 상태 검사)
- **expireCallRequests** (onSchedule, 1분) - 5분 미확인 호출 자동 `expired` 처리

### `functions/userClaims.js`
- **syncUserClaims** (onDocumentWritten `users/{uid}`) - `schoolId`/`staff`/`admin`을 Custom Claims에 심는다
- **refreshMyClaims** (onCall) - 본인 클레임 재발급
  > Storage 규칙 안의 `firestore.get()`이 이 프로젝트에서 동작하지 않아 업로드가 전부 거부됐다.
  > 토큰에 값을 심으면 규칙이 외부를 읽지 않고 `request.auth.token`만 보면 된다.
  > `setCustomUserClaims`는 기존 클레임을 통째로 갈아치우므로 항상 병합해서 쓴다
  > (안 그러면 슈퍼 어드민·키오스크 클레임이 조용히 사라진다).

### `functions/evaluationPlanSync.js`
- **syncEvaluationPlanToStaff** (onDocumentWritten `schools/{schoolId}/evaluationPlans/{planId}`)
  - `status === 'confirmed'`가 되면 매칭된 교사 전원의 `teacherAssignments`·`teacherSubjects`에 반영
  - 두 컬렉션은 규칙상 관리자만 쓸 수 있어 Admin SDK로 우회한다

### `functions/postDeletion.js`
- **deletePostDeep** (onCall) - 업무 글 삭제. 하위 `completions`·`comments`와
  Storage 첨부까지 함께 지운다 (클라이언트에서는 하위 컬렉션을 완전히 지울 수 없다)

### `functions/migrations/`
- **migrateStudentsToWorkspaceId** (onCall) - 학생 문서 ID 마이그레이션 (학번 → Workspace User ID)
- **rollbackStudentsMigration** (onCall) - 마이그레이션 롤백 (`_migrated_students_backup` 복원)
- **migrateStudentGroups** (onCall) - 학생 그룹에 `workspaceUserIds` 필드 추가

---

## Cloud Storage 구조

규칙: `storage.rules`. 소속·직군은 **Firestore가 아니라 인증 토큰(Custom Claims)** 에서 읽는다.

| 경로 | 용도 | 쓰기 | 읽기 |
|------|------|------|------|
| `schools/{schoolId}/requests/{requestId}/{file}` | 업무 글 첨부·본문 이미지 | 소속 교직원 (20MB 이하) | 소속 구성원 |
| `schools/{schoolId}/notices/{batchId}/{file}` | 쪽지 첨부 (폴더 = 쪽지 묶음 ID) | 소속 교직원 (20MB 이하) | 소속 구성원 |
| `schools/{schoolId}/evaluationPlans/{planId}/{file}` | 평가 운영 계획 원본 hwpx | 소속 교직원 (20MB 이하) | 소속 구성원 |
| `schools/{schoolId}/**` | 그 밖의 학교 파일 | 학교 관리자만 | 소속 구성원 |
| 그 외 전체 | — | 금지 | 금지 |

> ⚠️ **다운로드 토큰 URL은 이 규칙을 우회한다.** `getDownloadURL()`이 돌려주는
> `?alt=media&token=...` 주소는 링크를 가진 사람이면 누구나 열 수 있다. 위 규칙은 SDK 접근과
> 목록 열람만 막을 뿐이므로, **고사 원안처럼 유출되면 안 되는 파일은 여기 올리지 않는다.**

> 파일 형식을 제한하지 않는 이유: 학교 주력이 한글(.hwp)인데 브라우저가 붙이는 contentType이
> `application/x-hwp`, `application/haansofthwp`, `application/octet-stream` 등 환경마다 달라
> 형식으로 거르면 정상 파일이 막힌다. 크기만 제한한다.

---

## 주요 마이그레이션 이력

### Phase 1A: Workspace User ID 마이그레이션 (2026-07-30)
- **students 컬렉션 문서 ID 변경**: 5자리 학번 → 21자리 Workspace User ID
- **studentGroups 컬렉션**: `workspaceUserIds` 필드 추가 (하위호환 유지)
- **마이그레이션 결과**: 598/620명 성공, 42개 그룹 100% 완료
- **백업**: `/schools/seonyoo-hs/_migrated_students_backup`

### 문서 ID 마이그레이션의 후속 여파 (기록해 둘 것)
students 문서 ID를 바꾸자 **문서 ID를 학번으로 가정하던 코드가 뒤늦게 하나씩 터졌다.**
- `ed7918c` (08-10) 키오스크 호출에서 학번으로 학생을 못 찾음
- `9f2d60e` (08-14) 학생 QR 체크인이 "명단에 없는 학생"으로 거부됨
  — firestore.rules가 문서 ID와 `users.studentId`를 비교하고 있었다.
    `resource.data.studentId` 비교로 고침

> 교훈: **문서 ID를 값으로 쓰지 말 것.** 조회 키가 필요하면 같은 값을 필드로도 저장하고,
> 규칙과 쿼리는 필드를 본다.

### teacherSubjects ↔ subjects 연결 (2026-07)
- `semester1Subjects` / `semester2Subjects` 배열 원소에 `subjectId` 추가
- 기존 자유 입력 데이터는 화면/저장 시점에 `matchCatalogSubject()`가 코드·이름으로 자동 보정
- 매칭 실패 시 `subjectId: ''`로 남고 UI에서 주황색 Chip으로 표시

---

## 학년도(year) vs 입학년도(entryYear)

이름이 비슷하지만 완전히 다른 값이다. 정의와 변환 함수는 `apps/shared/lib/schema.js`에 있다.

| | `year` (학년도) | `entryYear` (입학년도 = 학번) |
|---|---|---|
| 뜻 | 교육과정이 운영되는 해. 3월~다음 해 2월 | 학생이 입학한 해. 코호트에 고정되어 안 바뀐다 |
| 예 | 2026학년도 = 2026-03-01 ~ 2027-02-28 | 2024년 입학생은 졸업할 때까지 2024 |
| 붙는 데이터 | "올해는 이렇게 운영한다" | "이 코호트의 교육과정은 이렇다" |
| 사용 컬렉션 | `teacherAssignments`, `teacherSubjects`, `officeLayouts`, `trainingPresets`, `asaCutoffs` | `subjects` |

변환: `entryYearFor(year, grade)` / `gradeFor(entryYear, year)`.
예) 2026학년도 1학년 = 2026학번, 2026학년도 3학년 = 2024학번.

오늘 기준 값은 `currentYearSemester()` / `currentSchoolYear()`를 쓴다
(1~2월은 아직 전년도 학년도, 3~8월이 1학기).

> 교육과정 편제는 입학 코호트 단위로 고정되므로 `subjects`만 `entryYear`로 스코프한다.
> 이걸 `year`로 두면 학년이 올라갈 때마다 편제표를 복제해야 하고, 어느 쪽이 정본인지 흐려진다.

---

## 문서 ID 규칙 요약 (실수 잦은 부분)

| 컬렉션 | 문서 ID | 비고 |
|--------|---------|------|
| `students` | `workspaceUserId` (21자리) | Workspace ID 없으면 5자리 학번 fallback |
| `teacherAssignments` | `` `${year}_${uid}` `` | **밑줄 1개** |
| `teacherSubjects` | `` `${year}_${teacherUid}` `` | **밑줄 1개** |
| `officeLayouts` | `` `${year}__${office}` `` | **밑줄 2개** |
| `preApproved` | `emailToDocId(email)` | |
| `presence` | `uid` | |
| `desktopClients` | `uid` | |
| `asaPrincipalSignature` | `uid` | |
| `asaCutoffs` | `` `${year}_${semester}_${grade}_${subjectName}` `` | AsaSupport.jsx만 다른 규칙 사용 (버그) |
| `asaResults` | `encodeURIComponent(`${uid}_${grade}_${subjectName}`)` | |
| `minAchievementResults` | `` `${uid}_1_${subjectName}` `` | rules가 `{uid}_*` 패턴 검사 |
| `attendanceLogs` | 단발 `{studentId}` / 반복 `{YYYY-MM-DD}-{studentId}` | 결석은 뒤에 `-absent` |
| `kioskPairingCodes` | 6자리 숫자 코드 | |
| `studentRegistrations` | 이메일 원문 | |
| `schoolDomains` | 도메인 문자열 | |
| `requests/{id}/completions` | `uid` | 문서 ID가 곧 완료자 |
| `dashboardModules` | 위젯 키 (`announcements`, `calendar`) | 코드의 `MODULE_CATALOG` 키와 일치 |
| `evaluationPlanManagers` | `uid` | 문서 존재 여부 = 담당자 |
| `requests` / `channels` / `personalNotices` / `academicCalendar` / `evaluationPlans` | auto-ID | |

> 이 규칙들은 주석이 아니라 **`apps/shared/lib/schema.js`의 함수로 강제한다.**
> `teacherAssignmentId()` · `teacherSubjectId()` · `officeLayoutId()` · `asaCutoffId()` ·
> `schoolPath()` 를 쓰고, 경로 문자열을 직접 조합하지 않는다.
> (`functions/callSystem.js`만 별도 npm 패키지라 `officeLayoutId()`를 손으로 복제해 두었다 —
> 규칙을 바꾸면 두 곳을 함께 고칠 것.)

---

## 인덱스 요약

`firestore.indexes.json` 기준 (전부 COLLECTION 스코프)

| 컬렉션 | 필드 조합 |
|--------|----------|
| users | schoolId ASC + role ASC |
| events | createdBy ASC + createdAt DESC |
| coverRequests | coverTeacherEmail ASC + date DESC |
| notices | teacherId ASC + createdAt DESC<br>eventId ASC + createdAt DESC |
| asaResults | createdBy ASC + createdAt DESC |
| teacherAssignments | year ASC + office ASC |
| callRequests | office ASC + createdAt DESC<br>teacherUid ASC + createdAt DESC<br>teacherUid ASC + status ASC<br>studentId ASC + createdAt ASC<br>status ASC + createdAt ASC |
| personalNotices | recipientUid ASC + createdAt DESC<br>senderUid ASC + createdAt DESC |
| requests | targetUids CONTAINS + status ASC + dueDate ASC<br>targetUids CONTAINS + kind ASC + status ASC<br>targetUids CONTAINS + kind ASC<br>createdBy ASC + createdAt DESC |
| evaluationPlans | uploaderUid ASC + createdAt DESC<br>matchedTeacherUids CONTAINS + createdAt DESC<br>year ASC + semester ASC + createdAt DESC |

---

## 보안 규칙 요약

### 권한의 출처 두 가지
- **Firestore 규칙** — `/users/{uid}` 문서를 `get()`으로 읽어 `role`·`schoolId`를 확인한다
  (`isTeacher(schoolId)` 등 공통 헬퍼). 모든 모듈이 같은 헬퍼를 쓴다.
- **Custom Claims** — `superAdmin`, 키오스크(`kioskSchoolId`/`kioskOffice`/`kioskDeviceType`),
  그리고 `schoolId`/`staff`/`admin`(`functions/userClaims.js`가 users 문서에 맞춰 유지).
  **Storage 규칙은 토큰만 본다** — 규칙 안 `firestore.get()`이 동작하지 않았기 때문.
  클레임이 갱신돼도 이미 발급된 토큰에는 최대 1시간까지 반영되지 않는다(`getIdToken(true)` 필요).

### 역할별 권한
- **슈퍼 어드민** (`superAdmin: true` Custom Claim): 모든 컬렉션 전체 권한
- **학교 관리자** (`admin`, `school_admin`): 소속 학교 관리 권한
- **교감** (`principal`): ASA 제출물 읽기/수정 권한
- **교사** (`teacher`): 소속 학교 조회, 본인 데이터 수정
- **학생** (`student`): 본인 정보 조회, 출결/공지 확인
- **키오스크 기기** (`kioskSchoolId`, `kioskOffice`, `kioskDeviceType` Custom Claim): 해당 사무실 호출 읽기

### 주요 보안 패턴
- **본인 데이터만**: presence, asaResults, minAchievementResults
- **생성자만 수정/삭제**: tasks, trainings
- **배정된 교사만**: asaSubmissions (실시간 asaSubjects 확인)
- **잠금 상태 확인**: asaSubmissions (locked 시 수정 불가)
- **클라이언트 create 금지**: kioskPairingCodes, callRequests
- **관리자 전용 쓰기**: subjects, teacherSubjects, teacherAssignments, officeLayouts
- **교사 전체 쓰기 허용**: courses, events, studentGroups
- **rules 없음(Admin SDK 전용)**: archivedStudents, _migrated_students_backup
- **필드 단위 제한**: `diff().affectedKeys().hasOnly([...])`로 바뀔 수 있는 필드를 못 박고,
  `selfOnlyUidChange(field)` 헬퍼로 배열에서 **자기 uid만** 넣고 뺄 수 있게 한다.
  - requests `completedUids` (완료 체크) / channels `leftUids` (채널 나가기) /
    personalNotices `readAt`·`deletedByRecipientAt` (읽음·숨김)
  - 이게 없으면 대상 교사가 남의 완료를 대신 체크하거나, 남을 채널에서 내보낼 수 있다
