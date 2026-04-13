# 선유고 스마트 교무실 CHANGELOG

> 선유고등학교 교무 업무 통합 관리 시스템
> 배포 URL: https://seonyoo-system.web.app
> Firebase 프로젝트: `seonyoo-system`

---

## v2.3 출결 고도화 — 외출 관리 · 이력 조회 · QR 자동 마감 (2026-04-13)

### 학생 결석 이력 조회 모달
- 출결 통계 페이지(`StatsDashboard`)에서 결석 학생 이름 클릭 → 이력 모달 표시
- 결석 로그만 표시 (출석 제외): 날짜 / 이벤트 / 유형 / 요일·교시 / 사유
- 반복 이벤트의 경우 체크인 날짜 요일로 교시 정보 매칭하여 표시
- 기간 필터: 전체 / 이번 달 / 지난 달
- 학생 이메일로 결석 현황 `mailto:` 발송 버튼 (이메일 정보 Firestore 조회)
- 버그 수정: `method !== '결석'` → `method === 'absent'` (영문 값 정합성)

### 수업 중 외출 관리
- 출석 패널의 각 학생 행에 **[↗ 외출]** / **[↙ 복귀]** 버튼 추가 (교사 전용)
- 외출 유형 선택: 보건실 / 화장실 / 기타 + 메모 입력
- 외출 중 경과 시간 실시간 표시 (1초 갱신)
- 누적 외출 시간이 수업 시간의 1/3 초과 시 빨간 경고 배지 표시
- 수업 시간 직접 조정 버튼: 50 / 45 / 40 / 35분
- 외출 기록은 출결 로그의 `outings` 배열 필드에 저장 (`exitAt`, `returnAt`, `type`, `reason`)
- 1/3 초과 시 `outingOverLimit: true` DB 기록 (복귀 시 자동 또는 교사 수동 저장)
- 출석 마감 시 미복귀 외출 자동 마감 처리

### QR 자동 마감 시스템 (Cloud Functions)
- `startLiveSession` 호출 시 세션 필드 저장:
  - `liveOpenedAt`: 최초 오픈 시각 (재오픈 시 변경 없음)
  - `liveLateCutoff`: 수업 시간의 1/3 경과 시각
  - `liveClosesAt`: 수업 종료 시각
  - `lateWindowProcessed: false`
- **`autoManageLiveSessions`** Cloud Function 신규 추가 (1분 주기)
  - `liveLateCutoff` 도달 시:
    - QR 토큰 무효화 (`liveToken: null`)
    - `lateWindowProcessed: true`
    - 미출석 학생 전체 자동 결석 처리 (사유: `1/3 이상 지각 자동처리`)
  - `liveClosesAt` 도달 시:
    - 미복귀 외출 일괄 마감 + 1/3 초과 여부 기록
    - 세션 필드 전체 초기화
- **`autoCloseAttendance`** 수정: `liveOpenedAt` 설정된 이벤트는 중복 처리 방지를 위해 skip

### QR 패널 단계별 UI
- **진행 중** (0 ~ 1/3): QR 코드 표시 + "QR 마감까지 MM:SS" 카운트다운 + [⏹ 출석 마감]
- **일시 중지** (교사 수동 마감, 0~1/3 이내): [▶ 재오픈] + 재오픈 가능 시간 카운트다운
- **1/3 이후**: "QR 체크인 마감" 안내 + "수업 종료까지 MM:SS"
- **세션 종료** (완전 초기화): [▶ 출석 시작] 버튼
- 이벤트 문서를 `onSnapshot`으로 구독 → Cloud Function 변경 사항 실시간 반영

### 학생 체크인 페이지 개선
- 1/3 이상 경과로 QR 마감된 경우 `LATE_CUTOFF` 상태로 별도 안내:
  "수업 시간 1/3 이상 경과로 QR 체크인이 마감되었습니다. 선생님께 말씀해주세요."
- 1/3 이후 교사 수동 입력 처리 시 `lateOverLimit: true` 기록

---

## v2.2 UI/UX 개선 및 문서화 (2026-04-11)

### 출결 대시보드 달력 UI 개선
- **반응형 달력 컴포넌트 구현**
  - PC (≥1200px): 2개월 나란히 표시 (지난달 + 이번달)
  - 모바일/작은 화면: 1개월만 표시
  - 좌우 화살표로 월 이동 네비게이션
- **이벤트 요일 기반 날짜 필터링**
  - 이벤트 스케줄의 요일만 선택 가능
  - 허용되지 않은 날짜는 회색 처리 + 비활성화
- **레이아웃 재구성**
  - 통계바(왼쪽) + 달력(오른쪽) 좌우 배치
  - 헤더 + 통계바를 달력과 하단 정렬
  - 달력 컴팩트화: 해당 월만 표시 (이전/다음 달 날짜 제거)
- **모바일 달력**: 버튼 토글 방식으로 팝업 표시

### 프로젝트 문서화 구조 개선
- **CLAUDE.md**: 전체 프로젝트 개요로 간소화
- **ATTENDANCE.md**: 스마트 출결 시스템 상세 문서 분리
- **SUBSTITUTE.md**: 보강 신청 시스템 상세 문서 분리
- 불필요한 파일 정리: 버그리포트.md, 추후개발.md, 기획서 삭제

---

## v1.1 추가 작업 (2026-04-08)

### 교사별 데이터 분리 (B방식)
- 교사/admin: 본인이 생성한 이벤트·학생그룹만 표시
- 이벤트·학생그룹 생성 시 `createdBy: user.uid` 저장, Firestore 쿼리에 `where` 필터 적용

### school_admin (학교 관리자) 역할 신설
- 전체 교사의 이벤트·학생그룹·출결 현황 열람 가능
- 관리자 페이지(/admin) 접근 권한 포함 (교사 승인·거절·역할 변경)
- 네비게이션 바에 "학교관리자" 뱃지 표시

### 관리자 페이지 개편
- "승인 대기" / "교사 목록" 탭 분리
- 승인 시 일반 교사 / 학교관리자 선택 가능
- 교사 목록에서 역할 변경 (교사 ↔ 학교관리자)

### 학교관리자 그룹 생성 시 담당 교사 지정
- 그룹 생성 시 교사 드롭다운으로 담당 교사 선택
- 선택한 교사의 `uid`로 `createdBy` 저장 → 해당 교사 로그인 시 본인 그룹으로 표시
- 그룹 목록에 담당 교사 이름 태그 표시

### 배포 관련 이슈 해결
- Firebase Auth COOP 오류: `firebase.json`에 `Cross-Origin-Opener-Policy: same-origin-allow-popups` 헤더 추가
- Firestore rules: `school_admin` 역할 추가, `isAdmin()` 함수에 포함

---

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| Frontend | React 18 + Vite |
| 라우팅 | react-router-dom v6 |
| DB / 실시간 | Firebase Firestore (onSnapshot) |
| 인증 | Firebase Authentication (Google 계정 전용) |
| 호스팅 | Firebase Hosting |
| QR 생성 | qrcode.react |

---

## 개발 단계별 작업 내역

### Phase 1 — Firebase 프로젝트 스캐폴딩
- Vite + React 프로젝트 초기화
- Firebase 초기화 (`src/lib/firebase.js`)
- 환경변수 구성 (`.env`, `.env.example`)
- Firestore 멀티테넌트 컬렉션 구조 설계
  ```
  /schools/{schoolId}/events/{eventId}/attendanceLogs/{logId}
  /schools/{schoolId}/students/{studentId}
  /schools/{schoolId}/studentGroups/{groupId}
  /users/{uid}
  ```

### Phase 2 — 인증 시스템
- Google 계정 전용 로그인 (학교 도메인 `@seonyoo.hs.kr` 강제)
- 교사/학생 자동 구분 로직
  - 이메일 로컬파트가 숫자 9자리(`202630107`) → 학생 자동 승인
  - 그 외 → 교사 pending 처리, 관리자 승인 필요
- ProtectedRoute: 역할별 접근 제어 (admin / teacher / student / pending)
- 관리자 페이지: 승인 대기 교사 목록 승인/거절

### Phase 3 — 학생 명단 관리
- CSV 파일 업로드로 학생 일괄 등록
- EUC-KR / UTF-8 인코딩 자동 감지 (BOM 처리)
- 학생 그룹(반) 생성 및 Firestore 저장
- 그룹 목록 조회 / 삭제

### Phase 4 — 이벤트 생성 + QR 발급
- 이벤트 유형: 조회 / 수업 / 방과후 / 행사 / 기타
- **단일 이벤트**: 시작~종료 datetime 지정
- **반복 이벤트**: 요일 선택 + 시간대 + 반복 종료일
- 이벤트별 학생 그룹 연결 (studentGroupId)
- QR 토큰 자동 생성 (`crypto.randomUUID()`)
- QR 코드 표시 / 링크 복사 / 인쇄 팝업

### Phase 5 — 학생 QR 출석 체크인
- 공개 URL: `/checkin/:schoolId/:eventId?token=xxx`
- 학교 Google 계정 로그인 후 자동 즉시 출석 처리
- QR 토큰 유효성 검증
- 이벤트 활성 시간 검증 (단일: startTime~endTime, 반복: 오늘 요일 + 시간대)
- 반복 이벤트: 날짜별 로그 ID (`${date}-${studentId}`)로 중복 방지
- 이미 출석 처리된 경우 재출석 방지

### Phase 6 — 실시간 출결 대시보드
- 이벤트별 출석 현황 실시간 조회 (onSnapshot)
- 출석 / 미출석 패널 분리
- 출석률 통계 + 진행 바
- 수동 출석 처리 / 취소
- 결석 사유 등록: 프리셋 버튼(질병결석·조퇴·지각·미인정결석·체험학습·기타) + 직접 입력
- 반복 이벤트: 날짜 선택기로 날짜별 출결 조회

### 추가 기능
- 이벤트 수정 페이지 (`/events/:id/edit`)
- 대시보드 카드 세부 내용 토글 (펼치기/접기)
- Firestore 보안 규칙 작성 및 배포

---

## Firestore 보안 규칙 요약

| 경로 | 읽기 | 쓰기 |
|------|------|------|
| `/users/{uid}` | 본인만 | 본인(pending 생성) / 관리자(승인) |
| `/schools/{schoolId}/**` | 해당 학교 교사 | 해당 학교 교사 |
| `/attendanceLogs` | 교사 | 교사 또는 qrToken 일치 학생 |

---

## 배포 이슈 및 해결

| 이슈 | 원인 | 해결 |
|------|------|------|
| 잘못된 호스팅 도메인 배포 | `firebase.json`에 `site` 미지정 | `"site": "seonyoo-system-attendance"` 추가 |
| OAuth 도메인 미등록 | Firebase Auth Authorized domains 누락 | Console에서 `seonyoo-system-attendance.web.app` 추가 |
| `window.close` COOP 차단 | 호스팅 COOP 헤더 기본값 문제 | `Cross-Origin-Opener-Policy: same-origin-allow-popups` 헤더 추가 |
| Firestore 권한 오류 | `studentGroups` 컬렉션 rules 누락 | rules에 `studentGroups` 경로 추가 후 배포 |

---

## v2.0 추후 구현 예정 기능

### 핵심 기능
- [ ] **출결 엑셀/CSV 내보내기** — 날짜별·학생별 출결 현황 다운로드
- [x] **이벤트 삭제** — 대시보드에서 이벤트 보관(archive) 처리 및 복원
- [ ] **학생 개별 출결 이력** — 학생별 누적 출결 통계 조회
- [ ] **알림 기능** — 미출석 학생 알림 (이메일 또는 푸시)

### 편의 기능
- [x] **이벤트 복제** — 기존 이벤트를 템플릿으로 빠른 생성 (새 QR 자동 발급)
- [ ] **QR 코드 자동 갱신** — 보안을 위한 시간 제한 토큰
- [ ] **모바일 최적화** — 반응형 레이아웃 개선
- [ ] **다크 모드**

### 확장 기능
- [ ] **멀티 학교 지원** — 타 학교 onboarding 흐름
- [ ] **학부모 알림 연동** — 결석 시 자동 문자/이메일
- [ ] **Google Sheets 연동** — 출결 데이터 자동 동기화
- [ ] **통계 대시보드** — 월별·이벤트별 출석률 그래프

---

## 프로젝트 구조

```
출석체크 프로젝트/
├── CLAUDE.md                  # Claude Code 프로젝트 지침
├── CHANGELOG.md               # 이 파일
├── firebase.json              # Hosting + Firestore 설정
├── .firebaserc                # Firebase 프로젝트 연결 (seonyoo-system)
├── firestore.rules            # 보안 규칙
├── firestore.indexes.json
├── package.json
├── vite.config.js
├── .env                       # Firebase config (gitignore 대상)
└── src/
    ├── main.jsx
    ├── App.jsx                # 라우터 정의
    ├── lib/
    │   └── firebase.js        # Firebase 초기화
    ├── contexts/
    │   └── AuthContext.jsx    # 인증 상태 전역 관리
    ├── components/
    │   ├── Layout.jsx         # 네비게이션 레이아웃
    │   ├── ProtectedRoute.jsx # 역할 기반 접근 제어
    │   └── QRDisplay.jsx      # QR 코드 표시 + 인쇄
    └── pages/
        ├── Login.jsx
        ├── PendingApproval.jsx
        ├── Admin.jsx
        ├── TeacherDashboard.jsx
        ├── StudentList.jsx
        ├── EventCreate.jsx
        ├── EventEdit.jsx
        ├── AttendanceDashboard.jsx
        └── StudentCheckin.jsx
```
