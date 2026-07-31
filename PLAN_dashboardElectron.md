# 대시보드 기능 확장 + Electron 데스크톱 앱 — 계획

> 작성일: 2026-07-31
> 상태: 계획만 (미착수)
> 관련 문서: [PLAN_messenger.md](./PLAN_messenger.md) (0단계 Electron 클라이언트·1단계 쪽지 로드맵과 통합)

---

## 결론 먼저

`apps/dashboard`(교사 개인용 위젯 대시보드)에 공지·학사일정·쪽지 위젯을 추가하고,
이를 교사 개인 PC에 상주시키는 Electron wrapper를 만든다.

이 계획은 별개 작업이 아니라 **`PLAN_messenger.md`의 0단계(Electron 클라이언트)와
1단계(쪽지)를 구체화한 것**이다. 개인별 공지(교사 상호간 발신)가 곧 그 문서가 말하는
"쪽지"이고, Electron 앱의 목적도 거기서 이미 "재실 자동감지 목적, 메신저를 안 하더라도
어차피 필요한 작업"으로 전제돼 있었다. 두 계획이 자연스럽게 합쳐진다.

**시작 방식은 wrapper + 트레이 상주** — 기존 `apps/dashboard` 웹앱을 그대로
`BrowserWindow`로 감싸고, Electron 메인 프로세스에는 트레이 아이콘·자동 시작·
OS 네이티브 알림만 추가한다. 별도 UI를 새로 설계하지 않아도 되고, 웹과 기능이
100% 동기화되므로 개발 범위가 작다.

---

## 배경

기존 대시보드(`apps/dashboard`)에는 이미 세 가지 위젯이 있다:

| 위젯 | 데이터 소스 | 상태 |
|---|---|---|
| 내 업무 (MyTasksWidget) | `schools/{id}/tasks` | 완성 (마감·담당자·전체공개/개인 지원) |
| 호출 알림 (CallsWidget) | `schools/{id}/callRequests` | 완성 (사무실 방문 알림) |
| 내 상태 (PresenceWidget) | `presence` | 완성 |

여기에 추가로 필요하다고 확인된 것:

- **전체 공지** — 일과 시간표 등 게시성 정보. `tasks`의 "전체공개"와 성격이 다름(할 일이 아님)
- **학사일정** — 현재 관련 컬렉션/위젯 전무
- **개인별 공지** — 교사 상호간 발신 가능한 쪽지. `PLAN_messenger.md` 1단계와 동일 개념
- 위 알림들을 **PC에 상주하며 OS 알림으로 받는 수단** — Electron 앱

---

## Phase A — 데이터 모델 + 웹 위젯 (Electron 없이 먼저 검증)

### 신규 Firestore 컬렉션

```
schools/{schoolId}/announcements/{id}     — 전체 공지
  title, content, category, pinned (boolean)
  authorUid, authorName, createdAt
  # 작성: 관리자만

schools/{schoolId}/academicCalendar/{id}  — 학사일정
  title, date | {startDate, endDate}, type (시험/휴업일/행사 등)
  authorUid, createdAt
  # 작성: 관리자만

schools/{schoolId}/personalNotices/{id}   — 개인 쪽지 (PLAN_messenger.md §2 참고)
  senderUid, senderName, recipientUid
  title, content
  readAt: null | timestamp
  createdAt
  # 작성: 모든 교사 (수신자만 지정, 실시간 채팅 아님 — "보내고 확인" 모델)
```

`students` 대상 기존 `notices` 컬렉션과는 별개다 (그건 교사→학생, 이번 건 교사↔교사).

### 위젯 추가

`apps/dashboard/src/pages/DashboardHome.jsx`의 `WIDGETS` 레지스트리에 3개 항목만 추가하면
드래그 배치·레이아웃 저장 로직은 그대로 재사용된다:

```javascript
const WIDGETS = {
  tasks:        { title: '내 업무',   emoji: '📋', Component: MyTasksWidget },
  calls:        { title: '호출 알림', emoji: '🔔', Component: CallsWidget },
  presence:     { title: '내 상태',   emoji: '🟢', Component: PresenceWidget },
  announcements:{ title: '전체 공지', emoji: '📢', Component: AnnouncementsWidget },
  calendar:     { title: '학사일정',  emoji: '📅', Component: CalendarWidget },
  notices:      { title: '쪽지',     emoji: '✉️', Component: NoticesWidget },
}
```

### 관리 화면

- 전체 공지·학사일정 작성/수정은 관리자 전용 — `apps/portal/src/pages/admin/`에 탭 추가
  (기존 `AdminSubjects.jsx` 등과 같은 패턴)
- 쪽지 작성은 대시보드 위젯 안에서 바로 (수신자는 `teacherAssignments` 조직도에서 선택 —
  `PLAN_messenger.md`가 이미 이 용도로 재사용 가능하다고 확인해둔 데이터)

---

## Phase B — Electron wrapper (`PLAN_messenger.md` 0단계)

### 구조

- 기존 `apps/dashboard` 빌드 산출물(`vite build`)을 로드하는 최소 Electron shell
  - 개발 중엔 `localhost:xxxx` 로드, 배포 시 프로덕션 URL(`smart-school-dashboard.web.app`)
    또는 로컬 정적 파일 로드 — 둘 중 택1 결정 필요 (아래 "착수 전 결정" 참고)
- 메인 프로세스 역할은 최소한으로:
  - 트레이 아이콘 (창 닫기 → 트레이로 최소화, 완전 종료는 트레이 메뉴에서만)
  - Windows 시작 프로그램 자동 등록 (`app.setLoginItemSettings`)
  - Firestore `onSnapshot` 구독 (`callRequests`, `tasks` 마감임박, `announcements` 신규,
    `academicCalendar` D-day, `personalNotices` 신규) → OS 네이티브 `Notification` 발송
- Firebase Auth 세션은 Electron의 Chromium에 그대로 유지되므로 재로그인 부담 적음
- 패키징: `electron-builder`, Windows 전용 NSIS 인스톨러

### 알림 파이프라인 (Phase A 위젯과 공유)

렌더러(웹 UI)와 메인 프로세스가 같은 `onSnapshot` 로직을 쓰게 되므로,
알림 판단 로직(신규/마감임박 여부 계산)은 `apps/shared/lib/`에 두고
웹 위젯과 Electron 메인 프로세스 양쪽에서 재사용한다.

---

## 착수 전 결정해야 할 것

Phase A:
- [ ] `personalNotices` 보관 기간 — 무기한 / 학기별 삭제 / 사용자 선택
- [ ] `personalNotices` 관리자 열람 가능 여부 (감사 vs 프라이버시) — `PLAN_messenger.md` §5와 동일 쟁점
- [ ] `academicCalendar` 데이터 입력 방식 — 관리자 수동 입력만 할지, 나이스 연동을 나중에 고려할지

Phase B:
- [ ] 배포 URL 방식 — 프로덕션 웹 URL 로드 vs 로컬 정적 빌드 번들 (후자는 웹 배포와 버전이
      어긋날 수 있음, 전자는 오프라인 시 완전히 못 씀)
- [ ] 자동 업데이트 — `electron-updater` + 배포 채널(GitHub Releases / Firebase Hosting 정적 파일)
- [ ] 코드 서명 — 미서명 시 Windows SmartScreen 경고 발생, 교내 배포용이라 감수 가능한지 확인

---

## 다음 단계 제안

`PLAN_messenger.md` §6 권장사항을 그대로 따른다: **여기(전체공지·학사일정·쪽지·Electron
wrapper)까지만 만들고 멈춰서 반응을 볼 것.** 실시간 1:1 채팅(메신저 2단계)은 이 단계의
실사용 반응을 보고 나서 별도로 판단.

1. Phase A 데이터 모델 + 웹 위젯부터 구현 (Electron 없이 웹에서 먼저 검증 가능)
2. Firestore Rules에 `announcements`/`academicCalendar`/`personalNotices` 권한 규칙 추가
3. Phase A 안정화 후 Phase B(Electron wrapper) 착수
