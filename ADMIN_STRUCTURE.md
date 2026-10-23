# 스마트 교무실 - 관리자 페이지 구조

> 2026-10-23 갱신: 탭 목록을 `AdminLayout.jsx`의 `MENU_ITEMS` 기준으로 맞췄다. 컬렉션 필드는 [DB_STRUCTURE.md](./DB_STRUCTURE.md)가 기준이다.

## 관리자 페이지 개요

**경로**: `/admin/*`
**레이아웃**: `AdminLayout.jsx` (탭 네비게이션)
**접근 권한**: `adminOnly` (role: `admin` 또는 `school_admin`)

---

## 페이지 구조

### 1. 홈 (`/admin`)
**파일**: `AdminHome.jsx`
**기능**: 신학기 준비 체크리스트 및 대시보드

#### 주요 기능
- **학년도 선택** (2026, 2027)
- **신학기 준비 체크리스트** (6개 항목)
  1. 승인 대기 계정
  2. 부서 미배정 교직원
  3. 담임 미배정 학급 (1-1 ~ 3-11, 총 33개 학급)
  4. 사무실 미배정 교직원
  5. **자리배치 미완료 사무실** (confirmed: false인 경우)
  6. 학생 OU 갱신 필요 여부

#### 데이터 소스
- `users` (role: pending)
- `teacherAssignments` (year 기준)
- `officeLayouts` (confirmed 필드 확인)
- `schools` (workspaceSync.studentOuPath)

#### 관리 도구 바로가기
- 분할점수 기준 관리
- 성취평가제 과목 관리
- 연수 명단 관리

---

### 2. 계정 관리 (`/admin/accounts`)
**파일**: `AdminAccounts.jsx`
**기능**: 4개 탭으로 구성된 계정 통합 관리

#### 탭 구성
1. **승인 대기** - role: `pending` 계정 승인/거부
2. **구성원 목록** - 교직원·학생, 역할 변경. 교직원은 staffType으로 **강사** 구분, 한 번도 접속 안 한 구성원도 로그인 없이 활성화 가능(b5972d0)
3. **사전 등록** - `preApproved` 명단 — 첫 로그인 시 승인 없이 활성화
4. **Workspace 동기화** - Google Workspace 학생 자동 동기화 설정

#### 주요 기능
- 계정 승인/거부 (role 변경)
- 교직원/학생 목록 조회
- Workspace 동기화 설정
  - `studentOuPath` 설정
  - 수동 동기화 실행 (Cloud Function 호출)

#### 데이터 소스
- `users` (schoolId 필터링)
- `schools` (workspaceSync 설정)

---

### 3. 과목 관리 (`/admin/subjects`)
**파일**: `AdminSubjects.jsx` (1019줄)
**기능**: 학년-학기별 과목 데이터 관리

#### 주요 기능
1. **과목 목록 조회** (입학년도별 필터링)
2. **과목 추가/수정/삭제**
3. **Excel 업로드** (2가지 방식)
   - **교육청 배당표**: 복잡한 merged cell 파싱
   - **간편 업로드**: 표준 형식 (다운로드 파일과 동일)
4. **Excel 다운로드** (현재 과목 목록)
5. **테이블 정렬** (useTableSort 훅)

#### Excel 업로드 - 교육청 배당표 파서
**함수**: `parseEducationExcel(arrayBuffer, targetGrade)`

**특징**:
- Merged cell 처리 (`_buildMergedMap`, `_readAllRows`)
- "구분" 헤더 자동 탐지
- 교과군 정규화 (`국어`, `수학` 등)
- 선택 블록 패턴 매칭 (`[택2]`, `(택3)` 등)
- 입학년도 자동 추출 (파일명에서 yyyy 패턴)

**파싱 로직**:
1. 모든 시트에서 "구분" 헤더 행 찾기
2. Merged cell map 구축
3. 과목 행마다 교과군, 과목명, 학점 추출
4. 학년-학기별 데이터 분리 (`_GS_COLS`: [1-1], [1-2], ..., [3-2])
5. 선택 블록 정보 추출 (정규식: `/[\[\(]택\s*(\d+)\s*[\]\)]/`)

#### Excel 업로드 - 간편 업로드 파서
**함수**: `parseSimpleSubjectExcel(arrayBuffer)`

**컬럼**:
- 구분, 교과군, 과목구분, 과목명, 과목코드
- 학년, 학기 (양학기/1/2)
- 1학기_학급, 2학기_학급 (쉼표 구분)
- 기본학점, 운영학점
- 입학년도
- 선택블록_학년, 선택블록_학기, 선택블록_택N, 선택블록_번호
- 비고

**특징**:
- XLSX.utils.sheet_to_json으로 간단히 파싱
- 양학기 처리 (`semester: 'both'`)
- 선택블록 객체 자동 구성

#### ImportModal 컴포넌트
**기능**: 업로드 모드 선택 → 미리보기 → 저장

**단계**:
1. **select**: 업로드 모드 선택 (교육청 배당표 / 간편 업로드)
2. **preview**: 파싱 결과 테이블 미리보기 (오류 표시)
3. **saving**: Firestore 저장 중

**입학년도별 저장**:
- `bulkSaveSubjectsByYear(schoolId, subjects, entryYear)`
- 기존 입학년도 데이터 삭제 → 새 데이터 일괄 저장

#### Excel 다운로드
**함수**: `handleDownloadExcel()`

**형식**: 간편 업로드와 동일 (17개 컬럼)

**파일명**: `과목목록_YYYYMMDD_HHmmss.xlsx`

#### 데이터 소스
- `schools/{schoolId}/subjects` 컬렉션
- `schools/{schoolId}/students` (학급 정보 확인용)

#### 공유 모듈
- `@shared/lib/subjectData.js` - Firestore CRUD 함수
- `@shared/hooks/useTableSort.js` - 테이블 정렬 훅

---

### 4. 교직원 관리 (`/admin/staff`)
**파일**: `AdminStaff.jsx` (3개 탭 — 기본 배정 · 과목 배정 · 표시 순서)

#### 탭 구성
1. **기본 정보** (`AdminStaffBasic.jsx`)
   - 부서, 사무실, 담임, 직함 배정
   - 연도별 관리 (teacherAssignments)

2. **과목 배정** (`AdminStaffSubjects.jsx`)
   - 학기별 담당 과목 배정, 시수 표시
   - 연도별, 학기별 필터링

3. **표시 순서** (`AdminRosterOrder.jsx`)
   - 업무 메신저 구성원 화면의 조직도(사무실/교과/부서) 하위 그룹 순서를 드래그로 지정(35ef5d3)

#### 주요 기능 (기본 정보 탭)
- 교직원 목록 조회 (users 컬렉션 + role 필터)
- 부서 배정 (드롭다운)
- 사무실 배정 (자유 입력)
- 담임 배정 (학년-반 선택)
- 직함 설정 (교무부장, 학년부장 등)
- 일괄 저장 (WriteBatch)

#### 주요 기능 (과목 배정 탭)
- 학기별 담당 과목 배정
- 과목 다중 선택
- 교사별 저장

#### 데이터 소스
- `users` (role: teacher/admin/school_admin/principal)
- `teacherAssignments` (year 기준)
- `teacherSubjects` (year + semester 기준)

---

### 5. 학생 관리 (`/admin/students`)
**파일**: `AdminStudents.jsx` (618줄)

#### 주요 기능
1. **학생 목록 조회** (학년, 반, 번호 정렬)
2. **선택과목 편집** (학생별 선택과목 배열)
3. **학급 필터** (학년-반 드롭다운)
4. **검색** (이름, 이메일)

#### 선택과목 편집 다이얼로그
**필드**: `electiveSubjects` (array)

**UI**: 과목명 입력 → 추가/삭제

**저장**: Firestore `updateDoc`

#### 제거된 기능
- ~~이름 수정~~ (Phase 1B에서 제거)

#### 데이터 소스
- `schools/{schoolId}/students` (workspaceUserId 기반)

---

### 6. 공간 관리 (`/admin/spaces`)
**파일**: `AdminSpaces.jsx` (3개 탭)

#### 탭 구성
1. **사무실 목록**
   - teacherAssignments에서 자동 수집
   - 카드 형태 표시

2. **자리 배치** (`OfficeLayoutEditor.jsx`)
   - 드래그 앤 드롭으로 교사 카드 배치
   - 자석 스냅 기능 (SNAP_THRESHOLD, SNAP_GAP_X/Y)
   - 캔버스 비율 좌표 (0~1) 저장
   - **확정 버튼** (confirmed: true 설정)

3. **호출 기기**
   - 페어링 코드 발급 (6자리, 10분 유효)
   - 기기 유형: 학생용 입력 / 사무실 현황판
   - 최근 호출 내역 (30건)

#### 자리 배치 에디터 (OfficeLayoutEditor)
**좌표 시스템**:
- 캔버스 크기 대비 비율 (x: 0~1, y: 0~1)
- 카드 크기: `CARD_W_PCT: 0.19`, `CARD_H_PCT: 0.18`
- 화면 크기가 달라도 동일 배치 유지 (관리자 PC ↔ 키오스크)

**자석 스냅**:
- `SNAP_THRESHOLD: 0.028` - 흡착 임계값
- `SNAP_GAP_X: 0.014` - 좌우 간격
- `SNAP_GAP_Y: 0.024` - 상하 간격
- 다른 카드 및 캔버스 가장자리 스냅

**확정 기능** (NEW):
- `confirmed` 필드 (boolean)
- 확정 버튼 클릭 시 `confirmed: true` 저장
- AdminHome의 "자리배치 미완료 사무실" 체크리스트에 반영

**드래그 앤 드롭**:
- `handlePointerDown`, `handlePointerMove`, `handlePointerUp`
- Pointer Capture API 사용
- 실시간 정렬선 표시 (guides.x, guides.y)

**미배치 교원**:
- 클릭하면 자동 배치 (격자 칸 찾기)
- "모두 놓기" 버튼

**저장**:
- 사무실에 없는 교사 자동 제거 (cleaned)
- `officeLayouts/{year}__{office}` 문서 저장

#### 호출 기기 페어링
**함수**: `generatePairingCode` (Cloud Function)

**프로세스**:
1. 관리자: 사무실 + 기기 유형 선택 → 코드 발급
2. 키오스크: 코드 입력 → `verifyPairingCode` 호출
3. Custom Claims 부여 (`kioskSchoolId`, `kioskOffice`, `kioskDeviceType`)
4. 재부팅 후에도 유지

#### 데이터 소스
- `teacherAssignments` (사무실 목록 추출)
- `officeLayouts` (자리 배치 저장)
- `callRequests` (호출 내역)
- `kioskPairingCodes` (페어링 코드, Admin SDK만 접근)

---

### 7. 학사일정 (`/admin/academic-calendar`)
**파일**: `AdminAcademicCalendar.jsx`

**기능**: 학교 구글 캘린더 연결 설정과 동기화 — 업무 메신저 학사일정 화면에 표시된다.
동기화는 Cloud Function `syncAcademicCalendar`(정기)·`runAcademicCalendarSyncNow`(수동). 공휴일과 채널 마감일도 같은 화면에 합쳐진다.

---

### 8. 대시보드 모듈 (`/admin/dashboard-modules`)
**파일**: `AdminDashboardModules.jsx`

**기능**: 업무 메신저에 어떤 모듈(보강·호출 등)을 누구에게 보일지 지정. 로직은 `apps/shared/lib/dashboardModules.js`

---

### 9. 평가계획 담당자 (`/admin/evaluation-plan-managers`)
**파일**: `AdminEvalPlanManagers.jsx`

**기능**: 평가 운영 계획(`/evalplan`) 전체 현황을 볼 수 있는 업무 담당자 지정

---

### 10. 교과서 선정 (`/admin/textbook-subjects`)
**파일**: `AdminTextbookSubjects.jsx`, `AdminTextbookBulkImport.jsx`

**기능**: 검·인정도서 선정 건(과목·후보·위원·대표교사) 등록, 엑셀/붙여넣기 일괄 등록. 로직은 `apps/shared/lib/textbookAdoption.js`

### 11. 교과부장 지정 (`/admin/textbook-dept-heads`)
**파일**: `AdminTextbookDeptHeads.jsx` — 교과군별 교과부장(선정 건 확인 권한) 지정

### 12. 인정도서 목록 (`/admin/textbook-catalog`)
**파일**: `AdminTextbookCatalog.jsx` — 공식 인정도서 목록 가져오기(3c95f8b). 로직은 `apps/shared/lib/textbookCatalog.js`

---

### 13. 분할점수 기준 (`/admin/asa-cutoffs`)
**경로**: `/admin/asa-cutoffs` (리다이렉트: `/tools/asa-support/cutoffs`)

**기능**: 성취평가제 분할점수 기준 관리

**데이터 소스**: `schools/{schoolId}/asaCutoffs`

---

### 14. ASA 체크리스트 (`/admin/asa-checklist`)
**경로**: `/admin/asa-checklist` (리다이렉트: `/tools/asa-checklist/admin`)

**기능**: 성취평가제 운영 체크리스트 과목 관리

**데이터 소스**: `schools/{schoolId}/asaSubjects`, `asaSubmissions`

---

### 15. 연수 명단 (`/admin/training-presets`)
**경로**: `/admin/training-presets` (리다이렉트: `/training/presets`)

**기능**: 연수 참가자 명단 프리셋 관리

**데이터 소스**: `schools/{schoolId}/trainingPresets`

---

## 공통 컴포넌트 및 훅

### AdminLayout.jsx
**기능**: 관리자 페이지 공통 레이아웃

**구성**:
- `Layout` (wide 모드)
- 탭 네비게이션 (MUI Tabs)
- 승인 대기 배지 (Badge)

**메뉴 항목** (MENU_ITEMS): 홈 · 계정 관리(pending 배지) · 과목 관리 · 교직원 관리 · 학생 관리 · 공간 관리 · 학사일정 · 대시보드 모듈 · 평가계획 담당자 · 교과서 선정 · 교과부장 지정 · 인정도서 목록 · 분할점수 기준 · ASA 체크리스트 · 연수 명단

> 업무 메신저 쪽 관리자 화면: `/admin/desktop` (`apps/dashboard/src/pages/AdminDesktop.jsx`) — 데스크톱 앱 설치 현황, 전체/개별 업데이트 확인 강제(aeb3af3, 5be9ea2)

### useTableSort 훅
**파일**: `@shared/hooks/useTableSort.js`

**기능**: 테이블 컬럼 클릭 정렬

**반환값**:
- `sort` - { key, dir: 'asc'|'desc' }
- `toggle(key)` - 정렬 토글
- `sortData(arr, getters)` - 배열 정렬
- `Ind(col)` - 정렬 표시 아이콘 (↑/↓/↕)
- `thSort` - th 스타일 (cursor, userSelect)

**정렬 로직**:
- 한글 localeCompare ('ko')
- null/빈 문자열 최하위
- 숫자형 자동 감지

---

## 데이터 흐름 및 의존성

### 신학기 준비 작업 순서 (AdminHome 체크리스트 기준)

```
1. 계정 관리 - 승인 대기 계정 승인
   ↓
2. 과목 관리 - 학년-학기별 과목 데이터 입력 ★ (교직원 배정 전 필수)
   ↓
3. 교직원 관리 - 부서/사무실/담임/직함/과목 배정
   ↓
4. 학생 관리 - 선택과목 배정 (과목 데이터 참조)
   ↓
5. 공간 관리 - 자리 배치 + 확정
   ↓
6. Workspace 동기화 - 학생 OU 경로 설정
```

### 컬렉션 의존성

```
teacherAssignments (교직원 배정)
  ├─ 사무실 목록 추출 → officeLayouts
  ├─ 담임 배정 확인 → AdminHome (미배정 학급)
  └─ 부서 배정 확인 → AdminHome (미배정 교직원)

officeLayouts (자리 배치)
  ├─ teacherAssignments (사무실별 교사 목록)
  └─ confirmed 필드 → AdminHome (미완료 사무실)

subjects (과목 정보) ★ NEW
  ├─ teacherSubjects (과목 배정 시 참조)
  └─ students.electiveSubjects (선택과목 배정 시 참조)

students (학생 정보)
  ├─ workspaceUserId (문서 ID, Phase 1A 마이그레이션)
  └─ electiveSubjects (과목명 배열, subjects 참조)

users (계정)
  ├─ role: pending → AdminHome 승인 대기
  ├─ role: teacher → teacherAssignments 생성
  └─ role: student → students 문서 매핑
```

---

## 이력
2026-07-30~31 Admin.jsx(1,776줄)를 위 모듈들로 분리한 Phase 1B 리팩토링과 과목 관리·자리 배치 확정 추가의 경과는
[docs/archive/PLAN_adminRefactor_final.md](./docs/archive/PLAN_adminRefactor_final.md), [docs/archive/MIGRATION_COMPLETE.md](./docs/archive/MIGRATION_COMPLETE.md) 참고.

---

## 기술 스택

### UI 프레임워크
- React 18
- Material-UI (MUI)
  - Dialog, Select, TextField, Button
  - Tabs, Tab, Badge
  - CircularProgress, Alert, Card
  - Grid, Box, Typography

### 라이브러리
- **XLSX** (SheetJS) - Excel 파싱/생성
- **react-router-dom** - 라우팅
- **firebase/firestore** - DB
- **firebase/functions** - Cloud Functions

### 상태 관리
- React Hooks (useState, useEffect, useCallback, useRef)
- AuthContext (schoolId, role 제공)

---

## 향후 개선 과제
[ROADMAP.md](./ROADMAP.md)의 "관리자" 절로 옮겼다.

---

## 참고 문서

- [전체 DB 구조](./DB_STRUCTURE.md)
- [보안·가입 승인 설계](./SECURITY.md)
- [보강 신청 시스템](./SUBSTITUTE.md)
- [스마트 출결 시스템](./ATTENDANCE.md)
