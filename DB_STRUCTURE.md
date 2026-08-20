# 선유고 스마트 교무실 - 데이터베이스 구조

> **작성 원칙**: 이 문서의 필드명·타입은 실제 read/write 코드에서 확인한 값만 적는다.
> 코드에서 확인하지 못한 항목은 `확인 필요`로 표시한다. (최종 대조: 2026-07-31)

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
- `electiveSubjects` (array<string>) - 선택과목 **이름 문자열 배열** (subjects 문서 ID 참조가 아님)
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
- `source` (string) - `manual` / `desktop` (Electron 클라이언트 자동 판정, 현재 미구현)
- `lastActiveAt` (timestamp | null) - desktop 클라이언트만 기록 (현재 미구현)
- `updatedAt` (timestamp)

> ⚠️ **문서 정정**: 이전 문서의 `in` / `teaching` / `out`은 코드에 존재하지 않는 값이다.
> 저장값이 아닌 **계산값**으로 `unknown`이 있다 — `effectivePresence()`가 `updatedAt`이
> `PRESENCE_TTL_MS`(4시간)보다 오래됐으면 `unknown`으로 취급한다(퇴근 후 '재실' 잔류 방지).

**접근 권한:**
- Read: 슈퍼 어드민, 소속 교사, 키오스크 기기
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

#### `/schools/{schoolId}/tasks/{taskId}`
업무 관리

**필드:** (쓰기: `apps/dashboard/src/components/TaskModal.jsx:56`, `MyTasksWidget.jsx:48`)
- `title` (string), `description` (string | null)
- `createdBy` (string), `createdByName` (string)
- `assignees` (array<string>) - 담당자 UID
- `assigneeNames` (array<string>) - 담당자 이름 스냅샷
- `dueDate` (Date)
- `priority` (string | null)
- `status` (string) - `진행중` 등 (한글)
- `visibility` (string) - `전체공개` / `담당자만`
- `sourceModule` (string | null) - 다른 모듈에서 생성된 업무 표시용 (현재 항상 null)
- `createdAt`, `updatedAt` (timestamp)

**접근 권한:**
- Read: 슈퍼 어드민, 학교 관리자, 전체공개 또는 생성자/담당자
- Create: 슈퍼 어드민, 학교 관리자, 소속 교사 (본인 생성)
- Update: 슈퍼 어드민, 학교 관리자, 생성자, 담당자
- Delete: 슈퍼 어드민, 학교 관리자

---

#### 성취평가제(ASA) 관련 컬렉션

##### `/schools/{schoolId}/asaSubjects/{subjectId}`
성취평가제 체크리스트의 **제출 단위** (학년 × 학기 × 과목명)

**필드:** (쓰기: `apps/portal/src/pages/tools/AsaChecklistAdmin.jsx:323, 335, 430, 498, 628`)
- `name` (string) - 과목명
- `grade` (number), `semester` (number)
- `teacherEmails` (array<string>) - 배정 교사 이메일 (권한 판정의 실시간 소스)
- `achievementLevel` (number) - `5` 또는 `3` (성취도 단계)
- `createdAt`, `updatedAt` (timestamp)

> `code`·`classes` 필드는 **쓰는 코드가 없다** (읽는 쪽만 있음 — 위 "왜 셋이 따로 있는가" 절 참고).

**접근 권한:**
- Read: 슈퍼 어드민, 소속 교사
- Write: 슈퍼 어드민, 학교 관리자

---

##### `/schools/{schoolId}/asaSubmissions/{submissionId}`
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

##### `/schools/{schoolId}/asaPrincipalSignature/{uid}`
교감 서명 재사용 저장소

**필드:** (쓰기: `AsaChecklistPrincipal.jsx:135`)
- `dataUrl` (string) - 서명 이미지 data URL
- `name` (string)
- `savedAt` (timestamp)

**접근 권한:**
- Read: 슈퍼 어드민, 학교 관리자, 본인
- Write: 슈퍼 어드민, 교감 본인

---

##### `/schools/{schoolId}/asaCutoffs/{cutoffId}`
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

##### `/schools/{schoolId}/asaResults/{resultId}`
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

##### `/schools/{schoolId}/minAchievementResults/{resultId}`
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

##### `/schools/{schoolId}/asaNeisImports/{importId}`
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

### `functions/migrations/`
- **migrateStudentsToWorkspaceId** (onCall) - 학생 문서 ID 마이그레이션 (학번 → Workspace User ID)
- **rollbackStudentsMigration** (onCall) - 마이그레이션 롤백 (`_migrated_students_backup` 복원)
- **migrateStudentGroups** (onCall) - 학생 그룹에 `workspaceUserIds` 필드 추가

---

## 주요 마이그레이션 이력

### Phase 1A: Workspace User ID 마이그레이션 (2026-07-30)
- **students 컬렉션 문서 ID 변경**: 5자리 학번 → 21자리 Workspace User ID
- **studentGroups 컬렉션**: `workspaceUserIds` 필드 추가 (하위호환 유지)
- **마이그레이션 결과**: 598/620명 성공, 42개 그룹 100% 완료
- **백업**: `/schools/seonyoo-hs/_migrated_students_backup`

### teacherSubjects ↔ subjects 연결 (2026-07)
- `semester1Subjects` / `semester2Subjects` 배열 원소에 `subjectId` 추가
- 기존 자유 입력 데이터는 화면/저장 시점에 `matchCatalogSubject()`가 코드·이름으로 자동 보정
- 매칭 실패 시 `subjectId: ''`로 남고 UI에서 주황색 Chip으로 표시

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
| `asaPrincipalSignature` | `uid` | |
| `asaCutoffs` | `` `${year}_${semester}_${grade}_${subjectName}` `` | AsaSupport.jsx만 다른 규칙 사용 (버그) |
| `asaResults` | `encodeURIComponent(`${uid}_${grade}_${subjectName}`)` | |
| `minAchievementResults` | `` `${uid}_1_${subjectName}` `` | rules가 `{uid}_*` 패턴 검사 |
| `attendanceLogs` | 단발 `{studentId}` / 반복 `{YYYY-MM-DD}-{studentId}` | 결석은 뒤에 `-absent` |
| `kioskPairingCodes` | 6자리 숫자 코드 | |
| `studentRegistrations` | 이메일 원문 | |
| `schoolDomains` | 도메인 문자열 | |

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

---

## 보안 규칙 요약

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
