# 선유고 스마트 교무실 - 데이터베이스 구조

## Firestore 컬렉션 전체 구조

### 최상위 컬렉션

#### `/users/{uid}`
사용자 계정 정보 (Firebase Auth UID 기반)

**필드:**
- `schoolId` (string) - 소속 학교 ID
- `name` (string) - 이름
- `email` (string) - 이메일
- `role` (string) - 역할: `pending`, `teacher`, `admin`, `school_admin`, `principal`, `student`, `rejected`
- `studentId` (string, 학생만) - 학번 (5자리 → Workspace User ID로 마이그레이션)
- `workspaceUserId` (string, 학생만) - Google Workspace User ID (21자리)
- `fullStudentId` (string, 학생만) - 9자리 학번
- `grade`, `class`, `number` (number, 학생만) - 학년, 반, 번호
- `migratedAt` (timestamp, 마이그레이션된 학생만)
- `emailHistory` (array, 진급한 학생만) - 이전 이메일 이력

**인덱스:**
- `schoolId` + `role` (복합 인덱스)

**접근 권한:**
- Read: 본인만
- Create: 로그인한 사용자 (본인 UID, role: pending/student/teacher)
- Update: 슈퍼 어드민, 관리자, 본인 (role/schoolId 변경 불가)
- Delete: 슈퍼 어드민만
- List: 슈퍼 어드민, 관리자만

---

#### `/studentRegistrations/{email}`
학생 자동 등록용 이메일 색인

**필드:**
- `email` (string)
- `schoolId` (string)
- `studentId` (string)
- `grade`, `class`, `number` (number)

**접근 권한:**
- Get: 본인 이메일만
- List: 슈퍼 어드민
- Write: 슈퍼 어드민, 교사

---

#### `/schoolDomains/{domain}`
학교 도메인 매핑 (예: seonyoo.hs.kr → seonyoo-hs)

**필드:**
- `schoolId` (string)
- `schoolName` (string)

**접근 권한:**
- Get: 로그인한 사용자 (자기 도메인 조회용)
- List/Write: 슈퍼 어드민만

---

#### `/kioskPairingCodes/{code}`
호출 시스템 기기 페어링 코드 (6자리)

**필드:**
- `code` (string) - 6자리 코드
- `schoolId` (string)
- `office` (string) - 사무실명
- `deviceType` (string) - `input` (학생용) / `display` (현황판)
- `expiresAt` (timestamp) - 만료 시각 (10분)

**접근 권한:**
- 클라이언트 접근 전면 차단 (콜러블 함수만 Admin SDK로 처리)

---

#### `/auditLogs/{logId}`
시스템 감사 로그

**접근 권한:**
- Read: 슈퍼 어드민만
- Create: 로그인한 사용자
- Update/Delete: 슈퍼 어드민만

---

### `/schools/{schoolId}` 하위 컬렉션

#### `/schools/{schoolId}`
학교 정보

**필드:**
- `name` (string) - 학교명
- `createdAt` (timestamp)
- `createdBy` (string) - 생성자 이메일
- `ownerUid` (string, 게스트 학교만)
- `workspaceSync` (object) - Workspace 동기화 설정
  - `enabled` (boolean)
  - `studentOuPath` (string) - 학생 OU 경로
  - `lastSyncAt` (timestamp)

**접근 권한:**
- Get: 슈퍼 어드민, 소속 교사, 로그인한 사용자
- List: 슈퍼 어드민, 소속 교사, 미가입자 (SchoolSetup용)
- Create: 슈퍼 어드민, school-* 패턴 학교 생성 가능
- Update: 슈퍼 어드민, 학교 관리자
- Delete: 슈퍼 어드민만

---

#### `/schools/{schoolId}/teachers/{teacherId}`
교사 정보 (레거시, teacherAssignments로 대체 중)

**접근 권한:**
- Read/Write: 슈퍼 어드민, 소속 교사

---

#### `/schools/{schoolId}/students/{workspaceUserId}`
학생 정보 (문서 ID: Workspace User ID)

**필드:**
- `studentId` (string) - 학번 (5자리, 레거시)
- `workspaceUserId` (string) - Workspace User ID (21자리)
- `fullStudentId` (string) - 9자리 학번
- `name` (string)
- `grade`, `class`, `number` (number)
- `email` (string)
- `electiveSubjects` (array) - 선택과목 목록
- `migratedAt` (timestamp, 마이그레이션된 경우)
- `emailHistory` (array, 진급한 경우) - 이전 이메일 이력

**접근 권한:**
- Read: 슈퍼 어드민, 소속 교사, 학생 본인
- Write: 슈퍼 어드민, 소속 교사

---

#### `/schools/{schoolId}/studentGroups/{groupId}`
학생 그룹 (출결 시스템용)

**필드:**
- `name` (string) - 그룹명
- `studentIds` (array) - 학번 배열 (레거시, 하위호환)
- `workspaceUserIds` (array) - Workspace User ID 배열
- `createdBy` (string) - 생성자 UID
- `createdAt` (timestamp)

**접근 권한:**
- Read: 슈퍼 어드민, 소속 교사, 생성자, 그룹 소속 학생
- Write: 슈퍼 어드민, 소속 교사, 생성자

---

#### `/schools/{schoolId}/subjects/{subjectId}`
**NEW** 과목 정보 (학년-학기별)

**필드:**
- `category` (string) - `공통과목` / `학생선택`
- `subjectGroup` (string) - 교과군 (국어, 수학, 영어, ...)
- `courseType` (string) - 과목 구분 (공통, 일반, 융합, 진로)
- `name` (string) - 과목명
- `subjectCode` (string) - 과목 코드
- `grade` (number) - 학년 (1/2/3)
- `semester` (number | string) - 학기 (1/2/`both`)
- `semesterClassMap` (object) - 양학기인 경우 `{ 1: [학급 배열], 2: [학급 배열] }`
- `baseCredits` (number) - 기본 학점
- `credits` (number) - 운영 학점
- `entryYear` (number) - 입학년도
- `selectionBlock` (object, 학생선택만) - 선택블록 정보
  - `grade` (number)
  - `semester` (number)
  - `pickCount` (number) - 택N
  - `blockNumber` (number) - 블록 번호
- `description` (string) - 비고
- `createdAt`, `updatedAt` (timestamp)

**접근 권한:**
- Read: 슈퍼 어드민, 소속 교사
- Write: 슈퍼 어드민, 학교 관리자

---

#### `/schools/{schoolId}/teacherAssignments/{assignmentId}`
교원 배정 정보 (연도별)

**필드:**
- `uid` (string) - users 컬렉션의 UID
- `year` (number) - 학년도
- `name` (string)
- `department` (string) - 부서
- `office` (string) - 사무실
- `positionLabel` (string) - 직함 (예: 교무부장, 학년부장)
- `subject` (string) - 담당 교과
- `homeroom` (object) - 담임 정보
  - `grade` (number)
  - `class` (number)

**인덱스:**
- `year` + `office` (복합 인덱스)

**접근 권한:**
- Read: 슈퍼 어드민, 소속 교사
- Write: 슈퍼 어드민, 학교 관리자

---

#### `/schools/{schoolId}/teacherSubjects/{subjectAssignmentId}`
교사 과목 배정 (학기별 담당 과목)

**필드:**
- `uid` (string)
- `year` (number)
- `semester` (number)
- `subjects` (array) - 과목 배열

**접근 권한:**
- Read: 슈퍼 어드민, 소속 교사
- Write: 슈퍼 어드민, 학교 관리자

---

#### `/schools/{schoolId}/officeLayouts/{layoutId}`
사무실 자리 배치 (문서 ID: `{year}__{office}`)

**필드:**
- `year` (number)
- `office` (string)
- `seats` (object) - `{ uid: { x: 0~1, y: 0~1 } }` (캔버스 비율 좌표)
- `confirmed` (boolean) - **NEW** 배치 완료 확정 여부
- `updatedAt` (timestamp)

**접근 권한:**
- Read: 슈퍼 어드민, 소속 교사
- Write: 슈퍼 어드민, 학교 관리자

---

#### `/schools/{schoolId}/presence/{uid}`
교사 재실 상태

**필드:**
- `status` (string) - `in` (재실) / `away` (자리비움) / `teaching` (수업중) / `out` (외근)
- `updatedAt` (timestamp)

**접근 권한:**
- Read: 슈퍼 어드민, 소속 교사, 키오스크 기기
- Write: 슈퍼 어드민, 본인만

---

#### `/schools/{schoolId}/callRequests/{requestId}`
선생님 호출 요청

**필드:**
- `office` (string)
- `studentId` (string)
- `studentName` (string)
- `grade`, `classNo`, `number` (number)
- `teacherUid` (string)
- `teacherName` (string)
- `status` (string) - `pending` / `acknowledged` / `done` / `expired`
- `createdAt` (timestamp)

**인덱스:**
- `office` + `createdAt DESC`
- `teacherUid` + `createdAt DESC`
- `teacherUid` + `status`
- `studentId` + `createdAt`
- `status` + `createdAt`

**접근 권한:**
- Read: 슈퍼 어드민, 소속 교사, 키오스크 (자기 사무실만)
- Create: 콜러블 함수만 (클라이언트 create 금지)
- Update: 슈퍼 어드민, 소속 교사
- Delete: 슈퍼 어드민, 학교 관리자

---

#### `/schools/{schoolId}/coverRequests/{requestId}`
보강 신청

**필드:**
- `date` (string)
- `period` (number)
- `requesterEmail` (string)
- `coverTeacherEmail` (string)
- `status` (string)
- `createdAt` (timestamp)

**인덱스:**
- `coverTeacherEmail` + `date DESC`

**접근 권한:**
- Read: 슈퍼 어드민, 소속 교사
- Create: 슈퍼 어드민, 학교 관리자
- Update: 슈퍼 어드민, 소속 교사
- Delete: 슈퍼 어드민, 학교 관리자

---

#### `/schools/{schoolId}/events/{eventId}`
출결 이벤트

**필드:**
- `name` (string)
- `createdBy` (string)
- `targetGroups` (array) - 대상 그룹 ID 배열
- `qrToken` (string)
- `liveToken` (string)
- `createdAt` (timestamp)

**인덱스:**
- `createdBy` + `createdAt DESC`

**하위 컬렉션:**
- `/attendanceLogs/{logId}` - 출결 로그
  - `eventId`, `studentId`, `timestamp`, `qrToken`

**접근 권한:**
- Get: 공개 (QR 체크인용)
- List: 슈퍼 어드민, 소속 교사, 학생
- Write: 슈퍼 어드민, 소속 교사

---

#### `/schools/{schoolId}/notices/{noticeId}`
스마트 공지

**필드:**
- `teacherId` (string)
- `title` (string)
- `content` (string)
- `targetGroups` (array)
- `createdAt` (timestamp)

**인덱스:**
- `teacherId` + `createdAt DESC`
- `eventId` + `createdAt DESC`

**하위 컬렉션:**
- `/confirmations/{studentId}` - 확인 기록

**접근 권한:**
- Read: 슈퍼 어드민, 소속 교사, 학생
- Write: 슈퍼 어드민, 본인만

---

#### `/schools/{schoolId}/trainings/{trainingId}`
연수 서명부

**필드:**
- `title` (string)
- `date` (string)
- `createdBy` (string)
- `participants` (array) - UID 배열
- `createdAt` (timestamp)

**하위 컬렉션:**
- `/signatures/{uid}` - 서명 데이터

**접근 권한:**
- Read: 슈퍼 어드민, 소속 교사
- Create/Update: 슈퍼 어드민, 소속 교사
- Delete: 슈퍼 어드민, 관리자, 생성자

---

#### `/schools/{schoolId}/trainingPresets/{presetId}`
연수 명단 프리셋

**접근 권한:**
- Read: 슈퍼 어드민, 소속 교사
- Write: 슈퍼 어드민, 관리자

---

#### `/schools/{schoolId}/preApproved/{emailId}`
사전 승인 이메일 목록

**필드:**
- `email` (string)
- `role` (string)

**접근 권한:**
- Get: 본인 이메일만 (문서의 email 필드로 확인)
- List/Write: 슈퍼 어드민, 학교 관리자

---

#### `/schools/{schoolId}/tasks/{taskId}`
업무 관리

**필드:**
- `title` (string)
- `visibility` (string) - `전체공개` / `담당자만`
- `createdBy` (string)
- `assignees` (array) - 담당자 UID 배열

**접근 권한:**
- Read: 슈퍼 어드민, 학교 관리자, 전체공개 또는 생성자/담당자
- Create: 슈퍼 어드민, 학교 관리자, 소속 교사 (본인 생성)
- Update: 슈퍼 어드민, 학교 관리자, 생성자, 담당자
- Delete: 슈퍼 어드민, 학교 관리자, 생성자

---

#### 성취평가제 관련 컬렉션

##### `/schools/{schoolId}/asaSubjects/{subjectId}`
ASA 체크리스트 과목

**필드:**
- `name` (string)
- `teacherEmails` (array)

**접근 권한:**
- Read: 슈퍼 어드민, 소속 교사
- Write: 슈퍼 어드민, 학교 관리자

---

##### `/schools/{schoolId}/asaSubmissions/{submissionId}`
ASA 체크리스트 제출물

**필드:**
- `subjectId` (string)
- `status` (string) - `locked` 시 수정 불가
- `teacherEmails` (array) - 스냅샷 (배정 확인은 asaSubjects 참조)

**접근 권한:**
- Read: 슈퍼 어드민, 학교 관리자, 교감, 배정된 교사
- Create: 슈퍼 어드민, 학교 관리자, 배정된 교사
- Update: 슈퍼 어드민, 학교 관리자, 교감, 배정된 교사 (locked 아닐 때만)
- Delete: 슈퍼 어드민, 학교 관리자

---

##### `/schools/{schoolId}/asaPrincipalSignature/{uid}`
교감 서명 재사용 저장소

**접근 권한:**
- Read: 슈퍼 어드민, 학교 관리자, 본인
- Write: 슈퍼 어드민, 교감 본인

---

##### `/schools/{schoolId}/asaCutoffs/{cutoffId}`
분할점수 기준

**접근 권한:**
- Read: 슈퍼 어드민, 소속 교사
- Write: 슈퍼 어드민, 학교 관리자

---

##### `/schools/{schoolId}/asaResults/{resultId}`
ASA 분석 결과 (업로드 파일)

**인덱스:**
- `createdBy` + `createdAt DESC`

**접근 권한:**
- Read: 슈퍼 어드민, 학교 관리자, 생성자
- Create: 슈퍼 어드민, 생성자 본인
- Update/Delete: 슈퍼 어드민, 학교 관리자, 생성자

---

##### `/schools/{schoolId}/minAchievementResults/{resultId}`
최소성취수준 보장지도 결과

**접근 권한:**
- Read: 슈퍼 어드민, 소속 교사
- Write: 슈퍼 어드민, 학교 관리자, 본인 (문서 ID가 `{uid}_*` 패턴)

---

##### `/schools/{schoolId}/asaNeisImports/{importId}`
나이스 담당과목 업로드 이력

**접근 권한:**
- Read/Write: 슈퍼 어드민, 학교 관리자

---

## Cloud Functions

### `functions/index.js`
- **workspaceSync** - Google Workspace 동기화 (학생 계정)
- **migrateStudentsToWorkspaceId** - 학생 문서 ID 마이그레이션 (학번 → Workspace User ID)
- **rollbackStudentsMigration** - 마이그레이션 롤백
- **migrateStudentGroups** - 학생 그룹 마이그레이션 (workspaceUserIds 필드 추가)

### `functions/callSystem.js`
- **generatePairingCode** - 키오스크 페어링 코드 발급
- **verifyPairingCode** - 페어링 코드 검증 및 Custom Claims 부여
- **submitCallRequest** - 선생님 호출 요청 생성
- **getKioskTeachers** - 키오스크용 교사 목록 조회

### `functions/workspaceSync.js`
- **syncWorkspaceStudents** - Workspace 학생 자동 동기화

---

## 주요 마이그레이션 이력

### Phase 1A: Workspace User ID 마이그레이션 (2026-07-30)
- **students 컬렉션 문서 ID 변경**: 5자리 학번 → 21자리 Workspace User ID
- **studentGroups 컬렉션**: `workspaceUserIds` 필드 추가 (하위호환 유지)
- **마이그레이션 결과**: 598/620명 성공, 42개 그룹 100% 완료
- **백업**: `/schools/seonyoo-hs/_migrated_students_backup`

---

## 인덱스 요약

| 컬렉션 | 필드 조합 |
|--------|----------|
| users | schoolId + role |
| events | createdBy + createdAt DESC |
| coverRequests | coverTeacherEmail + date DESC |
| notices | teacherId + createdAt DESC<br>eventId + createdAt DESC |
| asaResults | createdBy + createdAt DESC |
| teacherAssignments | year + office |
| callRequests | office + createdAt DESC<br>teacherUid + createdAt DESC<br>teacherUid + status<br>studentId + createdAt<br>status + createdAt |

---

## 보안 규칙 요약

### 역할별 권한
- **슈퍼 어드민** (`superAdmin: true` Custom Claim): 모든 컬렉션 전체 권한
- **학교 관리자** (`admin`, `school_admin`): 소속 학교 관리 권한
- **교감** (`principal`): ASA 제출물 읽기/수정 권한
- **교사** (`teacher`): 소속 학교 조회, 본인 데이터 수정
- **학생** (`student`): 본인 정보 조회, 출결/공지 확인
- **키오스크 기기** (`kioskSchoolId`, `kioskOffice` Custom Claim): 해당 사무실 호출 읽기

### 주요 보안 패턴
- **본인 데이터만**: presence, asaResults, minAchievementResults
- **생성자만 수정/삭제**: tasks, trainings
- **배정된 교사만**: asaSubmissions (실시간 asaSubjects 확인)
- **잠금 상태 확인**: asaSubmissions (locked 시 수정 불가)
- **클라이언트 create 금지**: kioskPairingCodes, callRequests
