# 스마트 출결 시스템 - 상세 문서

## 개요
QR 코드·교시별 버튼 기반 실시간 출결 관리 시스템.
교사가 이벤트(조회, 수업, 방과후, 행사 등)를 생성하고 QR 코드를 통해 학생 출석을 실시간으로 관리합니다.

---

## 주요 기능

### 1. 이벤트 관리
- **이벤트 생성**: 조회, 수업, 방과후, 행사, 기타 유형 지원
- **반복 이벤트**: 요일별 스케줄 설정 (예: 매주 화·목 3교시)
- **학생 그룹 연결**: 특정 반/그룹만 출석 체크
- **지각 시간 설정**: 조회 이벤트의 경우 지각 기준 시간 설정

### 2. 출석 체크
- **QR 출석**: 학생이 QR 코드 스캔으로 자동 출석
- **수동 출석**: 교사가 미출석 학생 수동 체크
- **실시간 현황**: Firestore 실시간 구독으로 즉시 반영
- **출석률 계산**: 자동 계산 및 프로그레스 바 표시

### 3. 라이브 세션 (수업/방과후/행사)
- **출석 시작/마감**: 버튼으로 QR 코드 활성화/비활성화
- **임시 토큰**: 세션마다 고유 토큰 생성

### 4. 미출석 관리
- **사유 등록**: 질병결석, 조퇴, 지각 등 프리셋 + 직접 입력 (교사 수동)
- **지각 자동 처리**: 라이브 세션 1/3 경과 시점에만 미출석자 자동 기록

### 5. 출결 현황 대시보드
- **달력 뷰**: 반복 이벤트의 과거 출결 기록 조회
  - 2개월 슬라이드 캘린더 (PC 1200px 이상)
  - 1개월 슬라이드 캘린더 (모바일/작은 화면)
  - 이벤트 요일만 선택 가능 (허용된 요일 필터링)
- **3열 드래그 리사이즈**: QR 패널, 출석 목록, 미출석 목록 너비 조정(칸 경계 끌기, 두 번 클릭하면 원래대로, 브라우저별 기억)
- **등수·축하**: 출석 등수와 메달, 전원 출석 폭죽, **오늘의 행운번호** 추첨(당첨자 확정 전 비공개), **추가 뽑기**(출결 완료 후 1~3등·행운번호 당첨자를 뺀 출석 학생 중 1명, 5초 명단 훑기 애니메이션)
- **본인 이벤트 한정**: 교사 대시보드는 내가 만들었거나 공동 담당인 이벤트만, 관리자는 `/attendance/all`로 전체 현황

---

## Firestore 컬렉션 구조

```
/schools/seonyoo-hs/
  /studentGroups/{groupId}
    - name: "1학년 1반"
    - studentIds: ["2024001", "2024002", ...]
    - createdAt: Timestamp

  /events/{eventId}
    - name: "조회"
    - type: "조회" | "수업" | "방과후" | "행사" | "기타"
    - studentGroupId: "group123"
    - isRecurring: true
    - schedules: [
        { dayOfWeek: 2, period: 1, startTime: "08:30", endTime: "09:00" },
        { dayOfWeek: 4, period: 1, startTime: "08:30", endTime: "09:00" }
      ]
    - location: "각 교실"
    - qrToken: "uuid-..."
    - liveToken: "uuid-..." (라이브 세션용, nullable)
    - lateCheckTime: "08:40" (조회 전용)
    - createdBy: "teacher-uid"
    - createdAt: Timestamp

    /attendanceLogs/{logId}
      - studentId: "2024001"
      - studentName: "홍길동"
      - grade: 1
      - class: 1
      - number: 5
      - checkedAt: Timestamp
      - method: "QR" | "manual" | "absent"
      - qrToken: "uuid-..."
      - late: true (조회 전용, 지각 여부)
      - reason: "질병결석" (method=absent인 경우)
```

---

## 라우트 구조

| 경로 | 컴포넌트 | 설명 |
|------|----------|------|
| `/attendance` | TeacherDashboard | 내 이벤트 목록 (과목별) |
| `/attendance/events/new` | EventCreate | 이벤트 생성 |
| `/attendance/events/:eventId/edit` | EventEdit | 이벤트 수정 |
| `/attendance/events/:eventId` | AttendanceDashboard | 출결 현황 (버튼 출석 모드면 PeriodSessionDashboard) |
| `/attendance/checkin/:schoolId/:eventId` | StudentCheckin | 학생 체크인 (구글 로그인) |
| `/attendance/stats` | StatsDashboard | 통계 대시보드 |
| `/attendance/students` | StudentList | 학생 그룹 관리 (CSV·엑셀 업로드) |
| `/attendance/all` | EventsOverview | 관리자용 전체 이벤트 현황 |

---

## 주요 컴포넌트

### AttendanceDashboard.jsx
- **기능**: 실시간 출결 현황 + QR 출석 + 미출석 관리
- **특징**:
  - 반응형 달력 (2개월/1개월 자동 전환)
  - 이벤트 요일 기반 날짜 필터링
  - 3열 드래그 리사이즈 레이아웃
  - 실시간 Firestore 구독
  - 라이브 세션 관리 (수업/방과후/행사)

### EventCreate.jsx / EventEdit.jsx
- **기능**: 이벤트 생성/수정
- **특징**:
  - 반복 일정 설정 (요일 + 교시 + 시간)
  - 학생 그룹 선택
  - 지각 시간 설정 (조회 전용)

### StudentCheckin.jsx
- **기능**: 학생 QR 체크인 페이지 (버튼 출석 모드면 `PeriodCheckinPanel`)
- **특징**:
  - URL 파라미터로 schoolId, eventId, token 전달
  - 학생 구글 계정 로그인 필요, 현재 로그인 계정 표시·계정 전환(ed83922)
  - 중복 체크인 방지, 체크인 등수 표시

### QRDisplay.jsx
- **기능**: QR 코드 생성 및 표시
- **특징**:
  - qrcode.react 사용
  - 체크인 URL 자동 생성

---

## Cloud Functions

### autoManageLiveSessions
- **트리거**: KST 06:00~21:59, 1분 주기 (Scheduled Function)
- **기능**: 교사가 연 라이브 세션(수업/방과후/행사/기타)의 자동 마감 처리
- **로직**:
  1. `collectionGroup('events')`에서 `liveOpenedAt`이 설정된 이벤트만 조회
  2. `liveLateCutoff`(수업 1/3 지점) 도달 → QR 마감 + 미출석자 `1/3 이상 지각 자동처리` 기록
  3. `liveClosesAt`(수업 종료) 도달 → 미복귀 외출 마감 + 세션 필드 초기화
  4. 전날 이후로 남아있는 세션은 강제 초기화
- **비용 주의**: 세션 필터를 반드시 쿼리 단계에서 적용할 것.
  전체 `events`를 읽고 JS에서 거르면 세션이 없는 시간에도 매분 전체 이벤트를
  읽어 Firestore 무료 할당량(읽기 5만/일)을 하루 만에 소진한다.

> **제거됨 — `autoCloseAttendance`**
> 종료 시각이 지난 이벤트의 미출석자를 전원 자동 결석 처리하던 함수.
> 교사가 QR을 한 번도 열지 않은 날에도 결석이 기록되는 문제가 있었고,
> 실제 운영은 교사 수동 확인 방식으로 정착해 2026-08-20 삭제했다.
> 미출석 사유는 대시보드에서 수동 등록한다.

---

## UI/UX 특징

### 반응형 달력
- **PC (≥1200px)**: 2개월 나란히 표시 (지난달 + 이번달)
- **모바일/작은 화면**: 1개월만 표시
- **좌우 화살표**: 월 이동 네비게이션
- **날짜 필터링**: 이벤트 요일만 활성화, 나머지는 회색 + 비활성
- **하단 정렬**: 헤더+통계바와 달력 하단 라인 맞춤

### 드래그 리사이즈
- **QR 패널 / 출석 목록 / 미출석 목록** 3개 열 너비 조정 가능
- sticky 드래그 핸들 (QR 코드 중앙 고정)

### 실시간 업데이트
- Firestore `onSnapshot`으로 출석 로그 실시간 구독
- 출석/미출석 목록 즉시 반영

---

## 개발 가이드

### 새 이벤트 타입 추가
1. `EventCreate.jsx`에서 type 옵션 추가
2. 필요시 타입별 추가 필드 설정
3. `AttendanceDashboard.jsx`에서 타입별 UI 로직 추가

### 새 출석 방법 추가
1. `StudentCheckin.jsx`에서 체크인 로직 추가
2. `attendanceLogs`의 `method` 필드에 새 값 추가
3. `AttendanceDashboard.jsx`에서 메소드별 배지 스타일 추가

### 통계 기능 확장
1. `StatsDashboard.jsx` 수정
2. Firestore 쿼리 최적화 (인덱스 추가)
3. 차트 라이브러리 추가 시 `package.json` 업데이트

---

## 알려진 이슈 & TODO

- [ ] 엑셀 내보내기 (하루 단위 출결) — 버튼 출석 모드의 전체 기록은 엑셀 지원
- [x] 학생 일괄 업로드 (CSV/Excel) — 그룹 만들기·그룹에 추가 모두 엑셀 지원
- [ ] 출석 통계 차트 (월별/주별)
- [ ] 알림 기능 (미출석 학생 자동 알림)
- [ ] 다크 모드 지원

---

## 시간표 칸: 조회 ~ 종례 (2026-10-21)
요일별 시간표의 교시 선택지는 **조회 · 1~7교시 · 종례**. 저장값은 숫자 그대로 `0 = 조회, 1~7 = 교시, 8 = 종례`
(`eventHelpers.js`의 `PERIOD_OPTIONS`, `periodLabel()`). 0은 예전부터 조회 이벤트만 쓰던 값이고 8은 쓰인 적이 없어
기존 이벤트·출석 기록 ID·규칙은 바뀌지 않는다. 화면에 교시를 표시할 때는 항상 `periodLabel()`을 쓴다.

## 공동 담당교사 (2026-10-21)
이벤트 생성/수정의 **공동 담당교사**에서 여러 명을 검색해 지정한다.
- 이벤트에 `coTeacherUids: [uid]`(조회용), `coTeachers: [{ uid, name }]`(표시용) 저장 — `CoTeacherPicker.jsx`
- TeacherDashboard는 `createdBy == 나` + `coTeacherUids array-contains 나` 두 쿼리를 합쳐 보여주고, 공동 담당 이벤트에 「👥 공동 담당」 배지
- 공동 담당교사: 출결 현황·출석 시작/마감·수동 처리·수정·복제 가능. **보관·삭제는 만든 교사만**(화면 제한)
- 규칙 변경 없음 — 이벤트 쓰기는 원래 같은 학교 교사 전체에 열려 있다

## 교시별 버튼 출석 모드 (2026-10-21)

체험학습 잔류학생 지도처럼 40명 이상이 한 교실에서 여러 교시를 연달아 하는 경우용.
이벤트 생성/수정에서 유형이 조회가 아닐 때 **출석 방식 → 교시별 버튼 출석**을 켠다 (`checkinMode: 'button'`, 학생 그룹 필수).

### 흐름
1. 학생: 입장 QR(고정 `qrToken`)을 **처음 한 번만** 찍고 구글 로그인 → 그룹 명단 확인 → **출석 대기 화면** (`PeriodCheckinPanel.jsx`)
2. 교사: 날짜·교시 탭 선택 → **[N교시 출석 시작]** → 2자리 코드를 교실 화면에 크게 표시 (`PeriodSessionDashboard.jsx`)
3. 학생 화면: 이벤트 문서 구독으로 즉시 버튼 활성화 → 코드 입력 + [출석] → 누른 시각(서버 시각)으로 기록
4. 교사: [출석 마감] (자동 마감 없음). 다른 교시를 시작하면 이전 교시 세션은 교체된다
5. 미출석자 수동 출석·사유 등록, **전체 기록** 탭에서 학생 × 날짜·교시 표 + 엑셀 다운로드

지각 자동 판정은 없다 — 시각만 기록하고 교사가 표시한다. 등수·행운번호도 없다.

**지각·조퇴 (2026-10-22)**: 지각은 결석 사유가 아니라 **출석 + `late`** — 출석 행 [지각] 토글, 미출석 행 [지각 출석].
출석 후 나간 경우는 출석 행 [조퇴] → 이 교시 `earlyLeave` + 다음 칸부터 끝까지 「조퇴」(다시 누르면 되돌림).
수업 전에 나간 경우는 미출석에서 「조퇴」 → 「N교시부터 끝까지」. 엑셀 칸 예: `08:12 (지각)`, `10:05 (조퇴)`, `조퇴`.

### 데이터
```
events/{eventId}
  checkinMode: 'button'
  periodSession: { date: 'YYYY-MM-DD', period, sessionId, openedAt } | null   ← 공개 get, 코드 없음
  /periodSessionSecrets/{sessionId}  { code, period, date }                  ← 교사만 읽기/쓰기
  /periodLogs/{date}-p{period}-{studentId}
    studentId, studentName, grade, class, number, date, period,
    sessionId, code, method: 'button' | 'manual' | 'absent', reason?, checkedAt,
    late?(지각 — 출석의 한 형태), earlyLeave?(이 교시 출석 후 조퇴), fromPeriod?(사유 일괄 등록 시작 칸)
```
하루 단위 `attendanceLogs`와 섞지 않는다 — StatsDashboard·TeacherDashboard 출석률에는 반영되지 않는다.

### 규칙 (`periodCheckinOk`)
학생 create는 다음을 모두 만족해야 한다: 열린 세션의 sessionId·date·period 일치, 본인 학번,
코드 일치(secret 문서와 대조), 그룹 명단 포함, 문서 ID 형식, `checkedAt == request.time`, 정해진 필드만.
학생은 본인 기록 get만 가능(목록 불가), 수정·삭제 불가. 테스트: `tests/firestore.rules.test.js`의 「교시 출석」.

---

## 학생 공지 · 학생 포털 (2026-06 구현, 36265e0)

2026-06-15에 기획한 "개인별 공지 + 학생 포털" 중 1·2단계가 구현됐다.
- **공지** (`/notices`, `NoticeList.jsx`) — 교사가 이벤트에 공지 작성, 수정 시 확인 초기화, 학생별 확인 현황 모달
- **학생 포털** (`/student`, `StudentPortal.jsx`) — 학생 role은 `/student`와 체크인 외 접근 차단(ProtectedRoute), 내 그룹·이벤트의 공지와 확인한 공지 표시
- **학생 자동 등록** — `studentRegistrations` 색인으로 첫 로그인 학생을 학교·학번에 연결 (구조는 [DB_STRUCTURE.md](./DB_STRUCTURE.md))
- 3단계(공지 이메일 발송)는 별도 모듈 **이메일 발송**(`/emails`, Gmail API 도메인 위임)으로 구현됐다 — 출결 공지와 자동 연결은 안 돼 있다

## 관련 모듈로 분리된 것
- **학습평가 운영계획 DB화**(옛 "개발 예정" 아이디어) → `/evalplan` 모듈로 구현(58d6f69). hwpx 파싱은 Cloud Function `parseEvaluationPlan`. 설계 아이디어 원문은 git 기록(`git show 05e47e3:ATTENDANCE.md`)에 있다
