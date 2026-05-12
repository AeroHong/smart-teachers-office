# 선유고 스마트 교무실

> 교무 업무 통합 관리 시스템 — 보강 신청 · 스마트 출결 · 연수 서명부

배포 URL: **https://seonyoo-system.web.app**

---

## 소개

선유고등학교 교사들의 반복적인 교무 업무를 디지털화한 웹 기반 통합 관리 시스템입니다.
기존 종이 대장·전화 연락 방식의 보강 신청과 호명 출석을 각각 **실시간 웹 플랫폼**과 **QR 코드 체크인**으로 대체하고,
연수 참석 서명까지 디지털로 처리합니다.

v3.0부터 **멀티테넌트 SaaS 구조**로 전환하여 학교 이메일 도메인을 자동 식별하고, 다수의 학교가 동일 시스템에서 독립적으로 운영 가능합니다.
학교 Google Workspace 계정으로 즉시 로그인하고, 역할(교사 / 학교관리자)에 따라 자동으로 권한이 분리됩니다.

---

## 주요 기능

### 1. 보강 신청 시스템

결강이 발생했을 때 보강 교사를 빠르게 배정하는 시스템입니다.
v3.0에서 Google Apps Script 의존성을 완전히 제거하고 Firestore 직접 연동으로 전환했습니다.

| 기능 | 설명 |
|------|------|
| 보강 일괄 등록 | 스프레드시트 형식으로 여러 건 동시 입력, 엑셀 붙여넣기 지원 |
| 오픈 예약 | 특정 시각 이후에만 신청 가능하도록 공개 시간 예약 |
| 실시간 카드 목록 | 신청 가능·예정·마감 상태를 색상으로 구분한 카드 UI |
| 신청 / 취소 | 교사가 원클릭으로 보강 신청, 취소 즉시 타인에게 재노출 |
| 관리자 수정·삭제 | 관리자가 등록된 보강 카드 직접 수정 및 삭제 |
| 내 신청 내역 | 본인이 신청한 보강 이력 조회 및 취소 |
| 보강 현황판 | 전체 이력 조회, 월별 필터, 페이지네이션 |
| 명예의 전당 | 월별·전체 보강 지원 횟수 랭킹 표시 |
| Excel 내보내기 | 관리자 전용 — 현재 필터·전체·직접 입력 구간 선택 후 다운로드 |

### 2. 스마트 출결 시스템

QR 코드 기반 실시간 출결 관리 시스템입니다.

| 기능 | 설명 |
|------|------|
| 이벤트 생성 | 조회·수업·방과후·행사·기타 유형, 단일/반복 스케줄 지원 |
| QR 체크인 | 학생이 QR 스캔으로 즉시 출석 처리 (별도 앱 불필요) |
| 라이브 세션 | 출석 시작 → 1/3 경과 시 QR 자동 마감 → 종료 자동 처리 |
| 외출 관리 | 학생 외출·복귀 기록, 수업 시간 1/3 초과 시 경고 |
| 실시간 현황 | 출석·미출석 목록 즉시 반영, 출석률 프로그레스 바 |
| 결석 사유 등록 | 프리셋(질병·조퇴·지각·체험학습 등) + 직접 입력 |
| 반복 이벤트 달력 | 날짜별 출결 이력 조회, PC 2개월·모바일 1개월 반응형 |
| 통계 대시보드 | 이벤트별·학생별 출결 통계, 결석 이력 모달 |
| 자동 미출석 처리 | Cloud Functions — 이벤트 종료 시 미출석 학생 자동 기록 |

### 3. 연수 서명부 시스템

연수·회의 참석 서명을 QR 코드로 디지털화한 시스템입니다.
v3.0에서 멀티테넌트 구조로 전환하여 학교별 데이터가 완전히 분리됩니다.

| 기능 | 설명 |
|------|------|
| 연수 생성 | 연수명·날짜·시간·장소·참석 대상 입력 |
| QR 서명 | 교사가 QR 스캔 후 직접 서명 입력 (react-signature-canvas) |
| 서명 현황 | 생성자만 전체 서명 현황 실시간 조회 |
| 명단 편집 | 생성자가 참석 대상 명단 직접 편집 |
| 프리셋 관리 | 관리자 전용 — 자주 쓰는 참석 명단 프리셋 저장·재사용 |
| 연수 목록 | 전체 연수 목록 조회 및 접근 |

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| Frontend | React 18 + Vite |
| 라우팅 | react-router-dom v6 |
| UI | MUI (Material-UI) v5 |
| 데이터베이스 | Firebase Firestore (실시간 구독) |
| 인증 | Firebase Authentication (Google OAuth) |
| 서버리스 함수 | Firebase Cloud Functions |
| 호스팅 | Firebase Hosting |
| QR 생성 | qrcode.react |
| 서명 입력 | react-signature-canvas |
| Excel 생성 | ExcelJS (브라우저 동적 로드) |

---

## 시스템 구조

```
선유고 스마트 교무실
├── Firebase Authentication   — Google 계정 로그인 · 역할 기반 접근 제어
├── Firebase Firestore         — 멀티테넌트 실시간 DB (/schools/{schoolId}/...)
├── Firebase Hosting           — SPA 배포 (https://seonyoo-system.web.app)
└── Firebase Cloud Functions
    ├── autoCloseAttendance    — 매일 자정: 미출석 자동 기록
    └── autoManageLiveSessions — 1분 주기: QR 자동 마감 · 세션 관리
```

### Firestore 컬렉션

```
/schools/{schoolId}
  /coverRequests/{id}      — 보강 신청 내역
  /events/{id}             — 출결 이벤트
    /attendanceLogs/{id}   — 출결 로그 (QR·수동·결석)
  /studentGroups/{id}      — 학생 그룹(반)
  /students/{id}           — 학생 명단
  /trainings/{id}          — 연수 정보
    /signatures/{uid}      — 교사별 서명 데이터
  /preApproved/{docId}     — 사전 등록 교직원 명단
/schoolDomains/{domain}    — 이메일 도메인 → 학교 매핑
/users/{uid}               — 교사 프로필 · 역할
```

---

## 라우트 구조

| 경로 | 설명 | 권한 |
|------|------|------|
| `/` | 메인 대시보드 | 로그인 |
| `/login` | Google 로그인 | 공개 |
| `/cover` | 보강 신청 목록 | 로그인 |
| `/cover/mypage` | 내 신청 내역 | 로그인 |
| `/cover/status` | 보강 현황판 | 로그인 |
| `/attendance` | 출결 이벤트 목록 | 교사 이상 |
| `/attendance/events/new` | 이벤트 생성 | 교사 이상 |
| `/attendance/events/:id` | 출결 대시보드 | 교사 이상 |
| `/attendance/events/:id/edit` | 이벤트 수정 | 교사 이상 |
| `/attendance/stats` | 출결 통계 | 교사 이상 |
| `/attendance/students` | 학생 명단 | 교사 이상 |
| `/attendance/checkin/:schoolId/:eventId` | 학생 QR 체크인 | 공개 |
| `/training` | 연수 목록 | 로그인 |
| `/training/new` | 연수 생성 | 로그인 |
| `/training/:id` | 연수 상세·서명 현황 | 로그인 |
| `/training/:id/sign` | 연수 서명 페이지 | 로그인 |
| `/training/presets` | 서명 명단 프리셋 | 관리자 |
| `/admin` | 교사 승인·관리 | 관리자 |
| `/super-admin` | 전체 학교·도메인 관리 | 슈퍼 어드민 |

---

## 권한 체계

| 역할 | 내용 |
|------|------|
| `super_admin` | 슈퍼 어드민 — 전체 학교·도메인 등록·관리, DB 이전 도구 (`hckgood@gmail.com`) |
| `school_admin` | 학교 관리자 — 전체 교사 이벤트 열람, 교사 승인·역할 변경, 사전 등록 관리, Excel 다운로드 |
| `teacher` | 일반 교사 — 본인 이벤트·그룹 관리, 보강 신청, 연수 서명 |
| `student` | 학생 — QR 체크인 전용 (학번 형식 이메일 자동 감지) |
| `pending` | 승인 대기 — 관리자 승인 전 접근 제한 |

**도메인 자동 매핑**: 이메일 도메인으로 학교를 자동 배정 (`@seonyoo.hs.kr` → `seonyoo-hs`).
미등록 도메인은 개인 체험 학교(`guest_*`)로 자동 생성되어 기능을 즉시 사용할 수 있습니다.

**사전 등록(preApproved)**: 학교 관리자가 교직원 이메일 명단을 미리 등록해 두면,
해당 교사가 처음 로그인하는 즉시 `pending` 없이 자동 승인됩니다.

---

## 주요 설계 결정

**멀티테넌트 SaaS 구조**
모든 데이터를 `/schools/{schoolId}` 하위에 격리하여 학교 간 데이터가 완전히 분리됩니다.
이메일 도메인 기반 자동 학교 식별로 별도의 온보딩 없이 즉시 운영 가능합니다.

**Apps Script 의존성 제거**
보강 시스템을 Google Sheets + Apps Script에서 Firestore 직접 연동으로 완전히 전환했습니다.
외부 스크립트 의존 없이 실시간 데이터 처리와 관리자 편집이 가능합니다.

**실시간 데이터**
Firestore `onSnapshot`으로 출결 현황, 보강 신청 상태, 연수 서명 현황을 새로고침 없이 즉시 반영합니다.

**QR 자동 마감**
수업 시작 후 1/3 시간이 경과하면 Cloud Functions가 QR 토큰을 자동 무효화하고 미출석 학생을 자동 처리합니다.
프론트엔드는 이벤트 문서를 실시간 구독하여 단계별 UI를 즉시 반영합니다.

**Lazy Loading**
출결·연수·슈퍼어드민 모듈은 `React.lazy`로 분리하여 초기 번들 크기를 최소화합니다.
ExcelJS도 다운로드 버튼 클릭 시에만 동적 로드합니다.

---

## 로컬 개발

```bash
# 의존성 설치
npm install

# 개발 서버 실행
npm run dev

# 프로덕션 빌드
npm run build

# 빌드 + Firebase 배포
npm run deploy
```

---

## 버전 이력

| 버전 | 내용 |
|------|------|
| v3.0 | 멀티테넌트 SaaS 전환, 사전 등록 자동 승인, 보강 Firestore 전환, 연수 멀티테넌트 전환, SuperAdmin DB 이전 도구 |
| v2.4 | 연수 서명부 시스템 (QR 서명·현황·명단·프리셋), 보강 현황 Excel 내보내기 |
| v2.3.2 | 명예의 전당 데이터 미표시 버그 수정 |
| v2.3 | 외출 관리, 결석 이력 조회 모달, QR 자동 마감 Cloud Functions |
| v2.2 | 반응형 달력 UI, 프로젝트 문서 구조 개선 |
| v1.1 | school_admin 역할, 교사별 데이터 분리, 관리자 페이지 개편 |
| v1.0 | 스마트 출결 시스템 최초 배포 |

---

개발: **홍창기** (선유고등학교)
