# 대시보드 기능 확장 + Electron 데스크톱 앱 — 계획

> 작성일: 2026-07-31 (2026-08-10 상태 갱신)
> 상태: Phase A 구현·배포 완료. Phase A-2는 구현 후 재설계됨(아래 "실제 경과" 참고).
> **Phase B 1차(트레이 셸)·2차(OS 알림) 완료 — Windows 실동작 검증됨.**
> 다음은 3차 재실 자동 감지. 알림이 안 뜨던 원인 6가지는
> "알림이 안 뜨던 원인 6가지" 절에 정리돼 있다 — 데스크톱 쪽을 다시 만질 때 먼저 읽을 것.
> 관련 문서: [PLAN_messenger.md](./PLAN_messenger.md) (0단계 Electron 클라이언트·1단계 쪽지 로드맵과 통합)

---

## 진행 상황 갱신 (2026-08-10)

작성일(7/31) 이후 아래 변화가 있었다. Phase B를 다시 논의할 때 이 문서와 실제 코드가
어긋나 있던 것이 혼란의 원인이었어서, 실제 경과를 남긴다.

- `87ecc09 feat: 대시보드 3분할 셸 · 구성원 명단 · 위젯 그리드`로 Phase A-2가 계획대로
  일단 구현됐다.
- 이후 `a243ff6 refactor: 위젯 대시보드를 목록/상세 구조로 교체`,
  `af9056c style: 곡률·밀도 정리 — Slack 수준의 업무 도구 인상으로`를 거치며 **캔버스형
  위젯 그리드(12열, S/M/L 리사이즈)는 폐기**되고, **레일(64px) + 사이드바(268px, 조건부)
  + 상세(가변)** 패턴으로 재설계됐다.
- **구성원 명단**(쿨메신저식 조직도 토글 트리)은 계획대로 구현되어 살아있다
  (`apps/dashboard/src/pages/Members.jsx` + `apps/dashboard/src/lib/rosterTree.js`).
  다만 계획이 말한 "상시 노출되는 우측 고정 패널"이 아니라 `/members` 전용 페이지다.
- 레일 색상 규칙(어두운 슬레이트 + 밝은 본문, `rail.*` 테마 토큰)은 계획대로 전 화면
  공통 적용됐다.
- 계획서에 없던 **채널**(`Channels.jsx`, 업무 글이 모이는 협업 공간)이 새 축으로
  추가됐다. 계획의 기존 항목(공지/학사일정/쪽지)을 대체한 게 아니라 별도로 병존한다.
- **Phase B 착수 조건은 충족됨** — 명단(조직도 데이터)은 존재하고, `presence.js`/
  `usePresence.js`에는 이미 `source: 'desktop'` 필드와 "추후 Electron 클라이언트가
  자동 갱신"이라는 설계 주석까지 있다. 캔버스형 셸이 아니게 됐다는 사실은 Electron
  wrapper(URL 로드 + 트레이 + 알림) 착수와 무관하다.

---

## 진행 상황 (2026-07-31)

**Phase A 배포 완료.**

- [x] `firestore.rules` 배포 — 새 컬렉션 4종
      (`announcements`/`academicCalendar`/`personalNotices`/`dashboardModules`) 규칙 반영
- [x] `firestore.indexes.json` 배포 — `personalNotices` 복합 인덱스 2종
      (`recipientUid`+`createdAt` 받은함, `senderUid`+`createdAt` 보낸함)
- [x] `apps/portal`, `apps/dashboard` Hosting 배포
- [x] 신규 위젯 3종 기본 노출 — `MODULE_CATALOG`에 `defaultEnabled: true`를 둬서 관리자가
      설정을 만들지 않아도 보인다. 끄고 싶을 때만 `/admin/dashboard-modules`에서 끈다
      (이전에는 기본값이 `false`라 배포해도 아무에게도 안 보였다)
- [ ] 실제 공지/학사일정 콘텐츠 입력 — 아직 비어 있음. 빈 화면에서 관리자에게는
      등록 페이지 링크가 뜨므로 화면이 막다른 길로 끝나지는 않는다

### 실사용 다듬기 (Phase B 전에 먼저 한 작업)

- 기본 레이아웃을 6개 위젯 전부로 확장 — 왼쪽 열은 직접 손대는 것(내 업무·전체 공지),
  오른쪽 열은 훑어보는 것(내 상태·호출·쪽지·학사일정)
- 위젯 공용 UI(`apps/dashboard/src/components/widgetUi.jsx`) 신설 —
  리스트 행·빈 화면·상태 칩이 위젯마다 복제돼 있던 것을 통일. 색은 테마 팔레트에서만 읽는다
  (`adminUi.jsx`와 같은 규칙). 테마에 `divider` 토큰 추가
- 위젯 제목 옆 배지 — 안읽음 쪽지·미완료 업무·대기 중 호출 건수
- 빈 화면에 다음 행동 제공 — 관리자에게는 포털 등록 페이지 링크, 교사에게는 안내 문구
- 쪽지: 받은함/보낸함 구분, 답장, 보낸 쪽지의 읽음 여부 표시
- 전체 공지: 5건까지만 접어서 보여주고 더보기
- 실패 알림(`ToastProvider`) — 그동안 `console.error`로만 남아 조용히 실패하던
  전송·읽음 처리·상태 변경·배치 저장 오류를 사용자에게 알린다

구현된 코드:
- `apps/shared/lib/schema.js` — `COL.ANNOUNCEMENTS`/`ACADEMIC_CALENDAR`/`PERSONAL_NOTICES`/`DASHBOARD_MODULES`
- `apps/shared/lib/dashboardModules.js` — 모듈 카탈로그(`MODULE_CATALOG`) + 노출 판정(`isModuleVisibleToMe`) 단일 소스
- `apps/dashboard/src/widgets/{AnnouncementsWidget,CalendarWidget,NoticesWidget}.jsx`
- `apps/dashboard/src/components/NoticeComposeModal.jsx`
- `apps/dashboard/src/pages/DashboardHome.jsx` — `dashboardModules` 구독 + department 조회로
  옵션 위젯 노출 필터링, 기존 드래그 배치 로직과 통합
- `apps/portal/src/pages/admin/{AdminAnnouncements,AdminAcademicCalendar,AdminDashboardModules}.jsx`
  + `AdminLayout.jsx`/`App.jsx` 라우트 배선

`npm run build`, `npm run build:dashboard` 모두 정상 빌드 확인됨(원격 환경에서 검증 가능한
범위 — 실제 Firestore 데이터로의 동작 확인은 PC 환경 필요).

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

### 모듈 노출 제어 (관리자가 대상 지정)

공지·학사일정·쪽지 외에도, 대시보드에 없는 다른 스마트교무실 기능(예: 보강 신청 현황,
출결 미체크 요약 등)을 "요약 위젯" 형태로 계속 추가하게 될 것을 감안해, 위젯 노출 자체를
관리자가 켜고 끄고 대상 교사를 지정할 수 있게 만든다.

**핵심 원칙: 컴포넌트 레지스트리(코드)와 노출 제어(DB)를 분리한다.**
실제 React 컴포넌트 매핑은 지금처럼 코드에 고정해두고 — Firestore에서 임의 코드를
실행하는 구조가 아니므로 보안 문제가 없다. Firestore 쪽은 "그 컴포넌트를 누구에게 보여줄지"만
결정한다.

```
schools/{schoolId}/dashboardModules/{moduleId}
  componentKey: string        // 코드 쪽 WIDGETS 레지스트리 키 (예: 'substituteSummary')
  title, emoji                // 표시용 메타 (관리자가 문구만 바꿀 수 있게)
  enabled: boolean             // 마스터 온/오프
  visibility: 'all' | 'department' | 'individual'
  targetDepartments: array<string>   // visibility='department'일 때
  targetTeacherUids: array<string>   // visibility='individual'일 때
  order: number
```

**동작 흐름**
1. 클라이언트는 `dashboardModules`에서 `enabled == true`인 문서를 구독
2. `visibility` 규칙(전체/부서/개인)을 로그인한 교사의 `department`/`uid`와 대조해 필터링
3. 통과한 모듈만 `componentKey`로 코드 레지스트리에서 컴포넌트를 찾아 기존 `WidgetFrame`으로
   감싸서 렌더링 — 디자인은 셸이 강제하므로 어떤 모듈을 추가해도 통일감 유지
4. 개인별 배치(`users/{uid}.dashboardLayout`)는 그 위에서 그대로 동작 — 노출 여부(관리자)와
   배치 순서(개인)는 별개 레이어

**관리자 화면**
- 새 Admin 탭 `AdminDashboardModules.jsx` — 모듈 목록 테이블 + 켜고 끄기 스위치 + 대상 지정
  (부서 선택 또는 교사 Autocomplete, `NEXT_STEPS.md`에 이미 있는 패턴 재사용)

**새 모듈을 추가하는 절차 (예: 보강 신청 현황 요약)**
1. 원본 기능(`/cover/*`)은 그대로 두고, 핵심 정보만 뽑아 보여주는 얇은 위젯 컴포넌트를 새로 작성
2. `WIDGETS` 레지스트리에 `componentKey`로 등록 (코드 배포 1회)
3. 이후로는 관리자가 `AdminDashboardModules`에서 켜고 끄고 대상만 지정 — 재배포 불필요

---

## Phase A-2 — 3분할 셸 + 구성원 명단 (2026-07-31 결정)

Phase A로 위젯은 갖춰졌지만 화면 구조는 아직 "위젯을 2열로 쌓은 것"이다. 여기서
구성원 명단이 들어갈 자리가 없고, 모듈이 늘어나도 갈 곳이 없다. 골격을 먼저 바꾼다.

### 골격 — 3분할

```
┌────┬──────────────────────────────────┬──────────────────┐
│ ▣  │  대시보드            [편집] [＋]  │ 구성원   [사무실▾]│
│ 📋 │ ┌──────────┐ ┌──────────┐        │ ⌕ 이름 검색       │
│ 📊 │ │ 내 업무   │ │ 내 상태   │        │ ▾ 1교무실        │
│ 🗓  │ └──────────┘ └──────────┘        │   김선유  국어    │
│ ⚙  │                                  │ ▾ 2교무실        │
└────┴──────────────────────────────────┴──────────────────┘
  64px            가변 (위젯 캔버스)          280px
```

영역마다 성격을 다르게 둔다. 왼쪽은 **이동**(고정), 가운데는 **내 작업**(내가 배치),
오른쪽은 **사람**(항상 같은 자리). 역할이 갈려 있어야 화면이 커져도 볼 곳을 안 헤맨다.

### 색 — 어두운 레일 + 밝은 본문

Slack도 왼쪽만 어둡고 오른쪽 패널은 밝다. 60명 명단처럼 촘촘한 목록은 밝은 배경이
읽기 편하므로 같은 방식을 따른다.

```
레일 배경   #0f172a   짙은 슬레이트
레일 아이콘 #94a3b8   평소
레일 활성   #ffffff   + 왼쪽 인디고 3px 바 + 배경 살짝 밝게
레일 구분선 #1e293b
캔버스      #f8fafc   (현행 유지)
명단        #ffffff   (현행 카드와 동일)
```

Slack의 자주색(#3F0E40)은 쓰지 않는다. 기존 포털·키오스크가 인디고(#4f46e5) 계열이라
자주색을 넣으면 앱마다 색이 따로 논다. `theme.js`에 `palette.rail.*` 커스텀 키를 둔다.

### 캔버스 — 12열 그리드 + 위젯 크기 3단계

완전 자유 배치(태블릿 바탕화면)는 하지 않는다. 아이콘과 달리 위젯은 내용에 따라 높이가
제각각이라 자유 배치하면 빈칸이 생기고 사용자가 정리에 시간을 쓴다. iOS 위젯도 자유
배치가 아니라 크기 3단계 + 그리드 스냅이다.

```
S = 4열    내 상태, 호출 알림
M = 6열    학사일정, 쪽지
L = 12열   내 업무, 전체 공지
```

- 드래그로 위치 이동(현행) + 모서리 드래그로 크기 변경(신규)
- 빈칸은 자동으로 위로 당김
- '편집' 버튼을 눌러야 배치 모드 — 평소엔 실수로 안 움직임

**마이그레이션 필요**: `users/{uid}.dashboardLayout`이 지금 `[[id]]` 2차원 배열이라
`[{id, size}]` 형태로 바꿔야 한다. 기존 저장값을 읽어 변환하는 코드를 현재
`normalizeLayout` 자리에 둔다.

### 구성원 명단

**재실 점 없이 먼저 만든다.** 자동 재실 감지(Phase B)가 붙기 전까지는 이름·사무실·과목만
보여준다. 조직도 겸 쪽지 창구로 그것만으로도 쓸모가 있고, Phase B가 붙을 때 추가되는
것은 점 하나뿐이다. (수동 재실 값은 4시간 TTL이라 명단에 그리면 대부분 회색이 된다.)

**구조 — 쿨메신저식 조직도 토글 트리** (결정 2026-07-31)

기준을 드롭다운으로 전환하지 않는다. 사무실·교과·부서가 **동시에 최상위 토글로 존재**하고,
각 토글 안에서 사람이 중복 등장하는 것을 허용한다. 교사들이 이미 쿨메신저에서 쓰던
구조라 학습 비용이 없다 — `PLAN_messenger.md` §3.4의 "전환 비용" 문제에 대한 대응이다.

```
⌕ 이름 검색
─────────────────────────────
▾ 사무실
   ▾ 1교무실              3/5
      ● 김선유    국어
      ◐ 박바다    영어
   ▸ 2교무실              2/4
▸ 교과
   ▾ 국어과
      ● 김선유           ← 중복 등장 (같은 사람)
      ● 이하늘
   ▸ 수학과
▸ 부서
```

- 데이터 출처: 사무실 `teacherAssignments.office` / 부서 `department` /
  교과 `teacherSubjects.semester{1,2}Subjects`
- **중복 허용** — 교과는 배열이라 국어·문학을 함께 맡으면 두 그룹에 나온다.
  '대표 과목' 필드를 새로 만들지 않는다
- 중복 등장한 같은 사람의 상태는 `presence/{uid}` 하나를 보므로 자동으로 함께 움직인다.
  렌더링만 여러 번 될 뿐 동기화 문제는 없다

**펼침 상태**

60명 × 기준 3개면 전부 펼쳤을 때 180줄이라 280px 패널에서 감당이 안 된다.

- 첫 접속 기본값: **`사무실 > 내 사무실`만 펼침**, 나머지 전부 접힘
  (매일 보는 건 사실상 같은 사무실 사람들)
- 펼침/접힘 상태는 `users/{uid}`에 저장해 다음 접속에 유지 — 매번 다시 접히면 못 쓴다.
  위젯 배치(`dashboardLayout`)를 이미 같은 문서에 저장하고 있으므로 그 옆에 둔다

**검색은 트리를 무시하고 평평하게** — 이름을 치면 트리 어디에 있든 사람 목록으로 바로
나온다. 검색 중에 트리 계층을 유지하면 오히려 못 찾는다.

**이름 클릭 → 쪽지 보내기** — 지금은 쪽지마다 Autocomplete에서 이름을 찾아야 한다.
명단에서 바로 누르면 조직도와 쪽지가 자연스럽게 붙는다.

### Phase B가 붙은 뒤의 재실 표시 — 회색 두 종류를 구분할 것

교사 PC에 앱을 설치하는 방식이 "부탁드리면 웬만하면 해주시는" 형태라, **전원 설치가
아니라 부분 설치**가 된다. 그러면 성격이 다른 두 상태가 생긴다.

| 상태 | 뜻 | 표시 |
|---|---|---|
| 재실 | 앱이 있고 활동 중 | ● 초록 점 |
| 수업 중 | 앱이 있고 수업 중 | ◐ 주황 점 |
| 자리 비움 | 앱이 있고, 지금 자리에 없음 (정보) | ○ 회색 점 |
| 앱 미설치 | 알 방법이 없음 (정보 없음) | 점 없음 + '미설치' 흐린 라벨 |

둘을 같은 회색 점으로 그리면 "저 선생님은 늘 자리에 없다"로 오해받는다. 반드시 구분한다.

**미설치는 표시하되 조용하게 한다.** 명시하면 오해가 없고 설치 현황도 한눈에 보이지만,
초기에는 거의 전원이 미설치라 라벨을 진하게 넣으면 명단이 그 글자로 도배돼 정작 이름이
안 읽힌다.

```
▾ 1교무실                      3/5 사용 중
   ● 김선유    국어         재실
   ◐ 박바다    영어       수업 중
   ○ 최산      과학     자리 비움
     정들      체육        미설치      ← 점 없음, 흐린 회색 작은 글씨
```

- 점을 안 그려서 상태 있는 사람과 시각적으로 층이 갈린다 — 미설치가 많아도 눈이 먼저
  재실 있는 사람에게 간다
- 섹션 헤더를 `3/5 사용 중`으로 두면 분모가 전체 인원이라 설치 진행률이 저절로 드러난다
- "누가 안 깔았나"를 실제로 조치하는 건 관리자이므로, 설치 현황 표는 관리자 페이지에
  따로 둔다 (명단에서 훑어 찾는 용도가 아님)

---

## Phase B — Electron wrapper (`PLAN_messenger.md` 0단계)

### 구조

- 기존 `apps/dashboard` 빌드 산출물(`vite build`)을 로드하는 최소 Electron shell
  - 개발 중엔 `localhost:xxxx` 로드, 배포 시 프로덕션 URL(`smart-school-dashboard.web.app`)
    또는 로컬 정적 파일 로드 — 둘 중 택1 결정 필요 (아래 "착수 전 결정" 참고)
- 메인 프로세스 역할은 최소한으로:
  - 트레이 아이콘 (창 닫기 → 트레이로 최소화, 완전 종료는 트레이 메뉴에서만)
  - Windows 시작 프로그램 자동 등록 (`app.setLoginItemSettings`)
  - IPC로 렌더러가 요청하면 숨겨진 창을 다시 보여주기(`focus-window`) — 알림 클릭 시 사용
- Firebase Auth 세션은 Electron의 Chromium에 그대로 유지되므로 재로그인 부담 적음
- 패키징: `electron-builder`, Windows 전용 NSIS 인스톨러

### 알림 파이프라인 — 정정: 메인 프로세스가 아니라 렌더러(웹앱)가 구독한다 (2026-08-10)

착수 전에는 "메인 프로세스가 Firestore를 구독한다"고 적혀 있었는데, 실제로는 불가능하다 —
메인 프로세스는 로그인 세션이 없고, `BrowserWindow`가 원격 URL을 그대로 로드하므로 메인
프로세스 쪽에 별도로 Firebase 인증을 심을 수도 없다. **이미 로그인돼 있는 렌더러
(=apps/dashboard 웹앱 코드)가 구독하고 `Notification` API를 직접 호출**하는 구조로
구현했다 — 재실 자동 감지 설계 메모가 애초에 이렇게 하기로 했던 것과 같은 이유(아래
"재실 자동 감지 설계 메모" 참고)다.

또한 착수 전 문서가 언급한 `tasks`/`announcements`/`academicCalendar` D-day는 실제
스키마와 다르다: 안내(공지)와 업무 요청은 `requests` 컬렉션 하나에 `kind`
(`'notice'`|`'request'`) 필드로 통합돼 있고(`apps/shared/lib/schema.js`), 별도
`tasks`/`announcements` 컬렉션은 존재하지 않는다. `academicCalendar` D-day 알림은
이번 범위에서 제외했다(요청받지 않음).

**실제 구현 (Phase B-2, 2026-08-10) — Windows 실동작 검증 완료**:
- `apps/dashboard/src/lib/useDesktopNotifications.js` — `window.smartOfficeDesktop`이
  있을 때만 동작(일반 브라우저 사용자에게는 완전히 no-op). 5개 트리거:
  호출(`callRequests`), 새 공지·새 요청(`requests` + `kind`), 새 쪽지(`personalNotices`),
  마감임박(`workRequests.js`의 `dueState()`를 30분 간격 타이머로 재평가).
  창이 포그라운드일 때는 안 띄움(`document.hasFocus()`).
- `apps/dashboard/src/components/DesktopNotifications.jsx` — 위 훅을 마운트만 하는
  컴포넌트, `App.jsx`에 `<CommandPalette />`와 같은 자리(라우트 밖)에 둠.
- **표시는 메인 프로세스가 한다.** 렌더러의 웹 `Notification`은 권한이 `granted`여도
  Windows에서 토스트가 뜨지 않았다(`show`/`error` 이벤트조차 오지 않음. 권한 핸들러
  유무와 무관하게 재현). 렌더러는 "언제 알릴지"만 판단하고
  `window.smartOfficeDesktop.notify({title, body, route})`로 넘긴다.
- 알림 클릭 → 메인이 창을 복원하고 `route`를 렌더러로 돌려줘(`navigate` IPC) 이동한다.
- 딥링크: 공지·요청 `/posts/:requestId`, 쪽지 `/messages/:noticeId`(이번에 신설 —
  목록으로만 가면 직전에 보던 쪽지가 선택돼 있어 새 것을 다시 찾아야 했다).
  호출은 전용 상세 라우트가 없어 `/`로 간다.

#### 알림이 안 뜨던 원인 6가지 (2026-08-10, 전부 실측으로 확인)

하나가 아니라 여섯이 겹쳐 있었다. **각각이 독립적으로 알림을 완전히 죽이는 것들**이라
하나를 고쳐도 증상이 그대로여서 원인 판단이 계속 어긋났다.

| 원인 | 왜 못 잡았나 |
|---|---|
| preload가 `require('./package.json')`으로 로드 실패 → `window.smartOfficeDesktop` 미주입 → 훅 전체 no-op | Electron 20+ 렌더러는 기본 샌드박스라 preload의 `require`가 제한된다. 콘솔에 `Unable to load preload script` 한 줄만 남는다 |
| 렌더러 웹 `Notification`이 Windows에서 표시 안 됨 | `Notification.permission`은 `granted`로 나와 권한 문제로 오인하기 쉽다 |
| `index.html`이 1시간 캐시(Firebase 기본 `max-age=3600`) | 배포해도 옛 번들이 로드된다. Electron은 HTTP 캐시가 userData에 남아 재설치해도 유지돼 증상이 길게 간다 |
| 설치본에 트레이 아이콘 미포함(`build/`는 app.asar에 안 들어감) | dev에서는 파일이 디스크에 있어 정상 동작. 설치본에서만 `new Tray()`가 죽고, 트레이가 없으니 X가 종료처럼 보인다 |
| 트레이 상주 중 Firestore 재연결 시 기존 문서가 다시 `added`로 유입 | 포그라운드에서는 연결이 안정적이라 재현되지 않는다. 같은 쪽지가 30초~1분마다 반복 |
| `setAppUserModelId`를 `whenReady()` 안에서 호출 | Chromium이 알림 표시기 초기화 때 AUMID를 캐시하므로 이미 늦다. **이게 마지막 원인이었고, 모듈 최상단으로 옮기자 즉시 동작했다** |

부수적으로 `Notification` 객체를 지역 변수로만 두면 GC돼서 토스트는 떠 있는데 `click`
이벤트가 오지 않는 문제도 있었다(메인에서 `Set`으로 참조 유지).

**핵심 교훈 — 설치본에 로그부터 넣을 것.** 설치본은 콘솔이 안 보여서 위 원인들을 증상만
보고 추측했고, 그 과정에서 진단용으로 저장소의 `electron.exe`를 같은 AUMID로 실행해
Windows의 토스트 활성화 등록(`HKCU\Software\Classes\CLSID`)까지 오염시켰다. 알림을
클릭하면 Electron 기본 앱이 뜨는 엉뚱한 증상이 여기서 나왔다. `%APPDATA%\smart-office-desktop\desktop.log`를
넣은 뒤로는 매번 한 번에 판정됐다.

**AUMID 취급 주의**: `package.json`의 `appId`와 `main.js`의 `setAppUserModelId`는 반드시
같아야 하고(NSIS가 그 값으로 바로가기 AUMID를 쓴다), **패키징 없이 실행하는
`npm run dev:desktop`으로 알림을 검증할 수 없다** — Windows는 시작 메뉴에 같은 AUMID
바로가기가 있는 앱의 알림만 표시한다. 진단 스크립트에도 실제 AUMID를 쓰면 안 된다.

---

## 결정된 것 (2026-07-31)

- [x] 화면 골격 — 3분할(좌측 레일 + 캔버스 + 명단)
- [x] 색 — 어두운 레일 + 밝은 본문. Slack 자주색 대신 기존 인디고에 맞춘 짙은 슬레이트
- [x] 순서 — Electron(Phase B)을 명단의 재실 연동보다 먼저. 단 3분할 셸과 명단 자체는
      재실 없이 Phase A-2에서 먼저 만든다
- [x] 명단 구조 — 쿨메신저식 조직도 토글 트리. 사무실·교과·부서가 동시에 최상위 토글로
      있고 각 토글 안에서 사람 중복 등장 허용 ('대표 과목' 필드를 새로 만들지 않음)
- [x] 앱 미설치 표시 — 점 없이 '미설치' 흐린 라벨. 설치 현황 표는 관리자 페이지에 별도
- [x] 설치 방식 — 교사에게 부탁해 각자 설치. 전원이 아니라 **부분 설치**를 전제로 설계

## 아직 안 정한 것

Phase A:
- [ ] `personalNotices` 보관 기간 — 2026-08-11에 삭제 기능이 생겼으나 **각자 숨기기**라
      문서는 그대로 남는다(`deletedByRecipientAt`/`deletedBySenderAt`). 양쪽 다 지운 지
      오래된 건만 Cloud Function으로 정리하는 정도가 무난하다. 아직 미결
- [ ] `personalNotices` 관리자 열람 가능 여부 — 현재 배포된 규칙은 슈퍼관리자만 열람 가능
      (사실상 프라이버시 쪽으로 정해진 상태). `PLAN_messenger.md` §5와 동일 쟁점
- [x] `academicCalendar` 입력 방식 — **구글 캘린더 읽기 전용 동기화 + 부장 교사 직접 등록**
      (2026-08-11 결정, 아래 "학사일정 — 구글 캘린더 연동" 참고)

Phase B (착수는 Phase A-2 완료 후):
- [x] 플랫폼 — **Electron으로 확정**. PWA는 창을 닫으면 재실이 끊기는 구조적 한계 때문에 탈락
      (설치·서명·업데이트는 PWA가 유리했으나 재실이 이 기능의 핵심)
- [x] 로드 방식 — 프로덕션 URL(`smart-school-dashboard.web.app`) 로드. 웹 배포와 항상
      동기화되고 UI 업데이트가 자동으로 따라온다
- [x] 자동 업데이트 — 1차에는 없음. URL 로드라 UI는 자동 최신이고, 껍데기만 가끔 갱신하면 된다
- [x] 설치 범위 — 사용자 단위 설치(NSIS `perMachine: false`). 관리자 권한이 필요 없어
      학교 PC 설치 권한 문제를 피한다
- [ ] 코드 서명 — 미서명 시 Windows SmartScreen 경고("추가 정보"를 눌러야 실행 버튼이 나옴).
      교사가 직접 설치하는 방식이라 "이거 바이러스 아니냐" 문의가 반드시 나온다.
      **다만 2026-08-10 본인 PC 설치에서는 경고가 뜨지 않았다** — 다른 PC에서도 그런지
      확인이 필요하다(같은 파일이라도 평판이 쌓이지 않은 PC에서는 뜰 수 있다).
      전 교직원 배포 직전에 결정한다
- [x] Windows 검증 — 창 로드·트레이 상주·자동시작·**NSIS 인스톨러 생성·설치·알림 수신·
      알림 클릭**까지 전부 확인 완료(2026-08-10)
- [x] 설치 형태 — **사용자 단위 설치로 할 것**(설치 마법사에서 "현재 사용자만" 선택).
      전체 사용자로 깔면 `C:\Program Files`에 들어가고 시작 메뉴 바로가기가
      ProgramData에도 생기는데, 그 바로가기에는 `ToastActivatorCLSID`가 없어서 같은
      AUMID를 가진 바로가기가 둘이 되고 알림 클릭이 동작하지 않을 수 있다

### Phase B 1차 진행 상황 (2026-08-10)

**최소 셸 구현·검증 완료.**

- `apps/desktop/` 신설(독립 `package.json`) — `main.js`(BrowserWindow + 트레이 + 자동시작),
  `preload.js`(`window.smartOfficeDesktop` 마커 노출), `build/icon.ico`
  (`apps/dashboard/public/favicon.svg` 기반 변환)
- 루트 `package.json`에 `dev:desktop`/`build:desktop` 스크립트 추가
- Windows에서 직접 확인됨: 창이 `smart-school-dashboard.web.app`을 로드 / 닫기(X) → 트레이로
  상주 / 트레이 메뉴 "열기"·"종료" 정상 동작 / Windows 시작 프로그램 자동 등록
- **네트워크 주의사항**: 학교 네트워크에서 Electron 바이너리(및 electron-builder가 쓰는
  NSIS 등) 다운로드 호스트(`objects.githubusercontent.com`, `npmmirror.com` 등)가
  자체 서명 인증서로 가로채져 차단됨 — 일반 웹 접속(`github.com`, `registry.npmjs.org`)은
  막히지 않았으므로 실행파일 CDN만 선택적으로 차단하는 네트워크 필터로 보인다. 최초 설치는
  다른 네트워크(가정용 회선 등)에서 한 번 받아두면 이후 로컬 캐시로 재사용 가능
- ~~**미검증**: `npm run dist`~~ — 2026-08-10 검증 완료. NSIS 인스톨러(약 95MB) 생성,
  사용자 단위 설치(`%LOCALAPPDATA%\Programs\smart-office-desktop\`), 자동시작 등록까지
  정상. electron·NSIS·7zip 다운로드도 이날은 차단되지 않았다
- **빌드 시 주의**: 백신이 `dist/win-unpacked/resources/app.asar`을 잡고 있으면
  `EBUSY`로 실패한다. `electron-builder --config.directories.output=dist-new`처럼 다른
  출력 폴더를 쓰면 우회된다(`.gitignore`에 `dist-*/` 있음)

**재실 자동 감지 설계 메모** (Phase B 착수 시 참고)

메인 프로세스가 `powerMonitor.getSystemIdleTime()`과 화면 잠금 이벤트를 읽어 상태를
판정하고, IPC로 렌더러에 넘긴다. Firestore 쓰기는 **이미 로그인돼 있는 렌더러(웹 대시보드)가**
`presence/{uid}`에 `source: 'desktop'`으로 기록한다 — 메인 프로세스에 Firebase 인증을
따로 심지 않아도 되고, 웹앱은 `window.smartOfficeDesktop` 존재 여부만 보면 된다.

- 사용자가 직접 고른 '수업 중'은 자동 갱신이 덮어쓰지 않는다 (자동은 재실↔자리 비움만)
- 상태가 바뀔 때만 쓰고, TTL이 만료되지 않도록 10분 간격 하트비트를 더한다

### Phase B-3 진행 상황 (2026-08-21)

설계 메모대로 구현. 메인은 판정만, 쓰기는 렌더러만 — 알림 파이프라인과 같은 원칙.

- `apps/desktop/main.js` — `powerMonitor.getSystemIdleState(300)`(5분 임계값)를 1분마다
  폴링 + `lock-screen`/`unlock-screen` 이벤트 즉시 반영. `active` 외(idle/locked/unknown)는
  전부 자리 비움으로 판정. `did-finish-load`에서도 즉시 한 번 보내 렌더러가 다음 폴링까지
  기다리지 않게 함
- `apps/desktop/preload.js` — `onPresenceStatus(handler)` 추가(`onNavigate`와 같은 구독/해제 패턴)
- `apps/dashboard/src/lib/useDesktopPresence.js` 신설 — `presence/{uid}` 문서를 `onSnapshot`으로
  구독해 현재 `status`를 추적하고, `status === 'busy'`(수동 지정)면 자동 갱신을 건너뜀.
  상태가 바뀌었거나 마지막 쓰기 후 10분이 지났을 때만 `setDoc(merge)`로 `source: 'desktop'`
  기록. `useDesktopNotifications.js`와 같은 `window.smartOfficeDesktop` 마커 가드
- `apps/dashboard/src/components/DesktopPresence.jsx` 신설, `App.jsx`에 `<DesktopNotifications />`
  옆에 마운트
- `apps/dashboard` 웹 배포 완료(`smart-school-dashboard.web.app`) — 데스크톱 마커 없는
  일반 브라우저 사용자에게는 완전히 no-op이라 설치본 갱신 전에 먼저 배포해도 안전
- `apps/desktop/package.json` 버전 0.1.5 → 0.1.6 (main.js/preload.js 변경 — 재설치 필요한
  "껍데기" 변경)
- **빌드 해결**: 학교에서도 같은 날 오후 재시도 끝에 통과했고(0.1.6·0.1.7 인스톨러 생성),
  저녁에 집 네트워크에서도 `npm run build:desktop`이 통과했다. 다만 **당시 세운 가설
  ("`winCodeSign` 캐시를 채워야 한다")은 맞지 않았다** — 빌드 후에도
  `%LOCALAPPDATA%\electron-builder\Cache`에 `winCodeSign`은 여전히 없다. 서명에 쓰인 signtool은
  npm으로 깔리는 `node_modules/@electron/windows-sign/vendor/signtool.exe`였고, 이번 빌드는
  `winCodeSign`을 받으러 가지도 않았다. 첫 실패가 간헐적 차단이었는지 `node_modules` 상태
  차이였는지는 미확정이지만, 어느 쪽이든 **캐시를 채워야 한다는 처방은 불필요했다**
- **설치본 실동작 (2026-08-21 저녁)**: 0.1.7 설치 후 `desktop.log`로 확인
  - 확인됨: 앱 시작(`packaged=true 알림지원=true`), 재실 초기 판정(`(초기) → available`),
    업데이터의 `latest.yml` 조회(집 네트워크)
  - 미확인: 유휴 5분 → 자리 비움 전환, 화면 잠금 즉시 반영, 수동 '수업 중' 보호
- `desktop.log` 실제 경로는 `%APPDATA%\smart-office-desktop\`이다(앱 이름이 아니라 패키지
  이름 기준). main.js 상단 주석이 `%APPDATA%\스마트교무실\`로 적혀 있어 고쳤다

---

## 학사일정 — 구글 캘린더 연동 (2026-08-11 결정, 미착수)

**읽기 전용 동기화를 기본으로 하되, 부장 교사는 대시보드에서 바로 등록할 수 있게 한다.**

학교가 이미 구글 캘린더로 학사일정을 관리하고 있다. 관리자가 같은 일정을 우리 시스템에
또 입력하게 하면 두 곳이 어긋나고, 어긋나는 순간 아무도 우리 쪽을 믿지 않는다.

- **동기화 방향**: 구글 → 우리(`academicCalendar`). 주기 실행 함수가 학교 공용 캘린더를
  읽어 넣는다. 양방향은 하지 않는다 — 어느 쪽이 원본인지 흐려지고 충돌 처리가 따라붙는다
- **부장 교사 직접 등록**: 부서 행사처럼 급히 알려야 하는 건 캘린더 담당자를 거치지 않고
  대시보드에서 바로 등록한다. 동기화로 들어온 일정과 구분되게 `source` 필드를 둔다
  (`'googleCalendar'` | `'manual'`). 동기화가 수동 등록분을 지우면 안 되므로 이 구분이 없으면
  기능이 성립하지 않는다
- **권한**: 등록은 부장 이상. `targeting.js`의 `deriveRank`가 이미 직급을 뽑고 있어 그대로 쓴다
- **인증**: `functions/migrations/migrateStudentsToWorkspaceId.js`가 서비스 계정으로 Directory
  API를 부르는 방식이 이미 있다(`workspace-sync-key` 시크릿). Calendar 스코프만 더하면 된다

### 홈 화면 달력 (2026-08-11 결정, 미착수)

**중간 열(사이드바) 아래쪽에 학사일정 섹션과 함께 둔다. 홈에서만 보인다.**

지금 레이아웃은 `레일 → 중간 목록 → 오른쪽 상세`인데, 중간 열 하단이 늘 비어 있다.
목록은 위에서부터 차므로 아래는 남는 자리다. 달력은 항상 같은 자리에 있어야 눈이
찾아가고, 크기도 작게 유지된다(월 단위 미니 달력).

- 오른쪽 상세 자리에 넣지 않는다 — 거기는 고른 것 하나를 보는 곳이라, 달력이 차지하면
  글을 읽는 동안 달력이 사라지거나 글이 밀린다
- 전용 `/calendar` 탭도 만들지 않는다. 매일 여는 화면에서 지나가며 보는 정보라,
  일부러 찾아가야 하면 안 보게 된다
- 날짜를 누르면 그날 일정이 오른쪽 상세에 뜬다

---

## 업데이트를 어떻게 전달할 것인가 (2026-08-11 논의, 2026-08-21 껍데기 자동 업데이트 구조 구현)

이 앱은 **껍데기(Electron)와 내용(웹 대시보드)이 분리**돼 있어 업데이트 성격이 둘로 갈린다.

| | 재설치 | 비고 |
|---|---|---|
| 웹 내용 (기능·버그 수정 대부분) | 불필요 | 원격 URL을 로드하므로 배포하면 다음 실행부터 최신 |
| 껍데기 (`main.js`/`preload.js`) | 필요 | 알림 파이프라인을 만드는 동안 잦았으나 앞으로는 드물다 |

`index.html`을 `no-cache`로 바꿔둔 것이 웹 쪽 자동 갱신을 보장한다(위 "알림이 안 뜨던 원인" 참고).

**그래도 실재하는 문제 둘**

1. **하루 종일 켜둔 앱은 오래된 코드로 돈다.** 트레이 상주가 전제라 껐다 켜는 일이 드물다.
   아침에 켜고 종일 두면 그날 배포한 수정이 다음 날까지 반영되지 않는다.
2. **껍데기 업데이트를 알릴 방법이 없다.** 지금은 "새 설치 파일 깔아주세요"라고 말하는 게
   전부다. 교사 수십 명에게는 통하지 않는다.

**권장 순서**

- [ ] **웹 갱신 감지** — 배포된 번들 해시를 주기적으로 확인해 바뀌었으면 "업데이트가 있습니다ㆍ
      새로고침" 띠를 띄운다. 기존 알림 파이프라인을 그대로 쓸 수 있고 일반 브라우저
      사용자에게도 똑같이 이롭다. **효과 대비 비용이 가장 낮아 먼저 한다**
- [x] **설치 현황 관리자 화면** (2026-08-21) — `/admin/desktop`. 아래 "설치 현황 구현 상세" 참고.
      **데스크톱 앱은 손대지 않았다** — `preload.js`가 이미 `version`을 노출하고 있어
      웹 배포만으로 배포된다(0.1.5 사용자도 재설치 없이 자동으로 잡힌다)
- [x] **껍데기 자동 업데이트(`electron-updater`) 구조** (2026-08-21) — 구현·실동작 검증 완료.
      **학교 노트북(학교 네트워크)에서 v0.1.6→v0.1.7 종단 검증**을 마쳤다 — 확인·다운로드·알림까지.
      Firebase Hosting을 배포처로 고른 판단이 실제로 통했다는 뜻이다(GitHub 릴리스 CDN은 같은
      네트워크에서 가로채지는 것을 빌드 중 겪었다). 같은 날 저녁 집 네트워크에서도 `latest.yml`
      조회가 정상임을 로그로 확인 — 두 네트워크 모두에서 동작한다. 아래 상세 참고.
      코드 서명은 여전히 미정 — 서명 없이도 설치·업데이트 자체는 되지만, 매번 SmartScreen
      경고를 볼 수 있다(전 교직원 배포 전 결정 필요, "다른 PC 검증" 항목과 연결됨)

### `electron-updater` 구현 상세 (2026-08-21)

**GitHub Releases 대신 Firebase Hosting 신규 사이트**(`smart-school-updates.web.app`,
호스팅 타겟 `desktop-updates`)를 업데이트 배포처로 택했다. 학교 네트워크가 GitHub 릴리스
CDN(`objects.githubusercontent.com`)을 자체 서명 인증서로 가로채는 것을 이 세션의
`npm run build:desktop` 첫 시도에서 직접 겪었다(`winCodeSign` 다운로드 실패, 재시도했더니
통과 — 간헐적 차단으로 보인다). 빌드 도구조차 이런데, 설치된 앱이 교사 PC에서 매번
백그라운드로 GitHub CDN에 업데이트를 확인하러 가면 같은 차단을 상시 겪을 위험이 있다.
Firebase `.web.app` 도메인은 대시보드·포털이 이미 이 네트워크에서 검증된 경로라 그 위험이
없다. (참고로 저장소 origin이 이미 GitHub PAT를 포함한 URL이라 push 자체는 문제없이
가능했다 — 그 자체가 별도로 짚어야 할 보안 이슈다.)

**구성**
- `firebase hosting:sites:create smart-school-updates` + `firebase target:apply hosting
  desktop-updates smart-school-updates` — `.firebaserc`/`firebase.json`에 새 호스팅
  타겟 추가(SPA 리라이트 없음, 정적 파일만, `Cache-Control: no-cache`로 `latest.yml`이
  안 묵도록)
- `apps/desktop/package.json` — `electron-updater` 런타임 의존성 추가,
  `build.publish = { provider: 'generic', url: 'https://smart-school-updates.web.app/' }`,
  `files`에 `node_modules/**` 추가(런타임 의존성이 처음 생겨서 필요 — electron-builder는
  `dependencies`만 자동으로 골라 담고 `devDependencies`(electron 등)는 알아서 뺀다),
  `release` 스크립트(`electron-builder && node scripts/copy-release.js`) 신설
- `apps/desktop/scripts/copy-release.js` 신설 — generic provider는 업로드를 대신해주지
  않으므로, `dist/`의 최신 버전 설치 exe·blockmap·`latest.yml`만(버전 문자열로 필터링 —
  `dist/`가 이전 빌드 잔여물을 안 지우므로 다 긁으면 옛 파일까지 같이 올라간다) 리포지토리
  루트 `desktop-updates/`로 복사. 이 디렉터리는 `.gitignore` 처리(설치 exe만 수십~백MB라
  커밋하면 저장소가 영구히 불어난다 — portal/dashboard의 index.html과 달리 diff로 볼
  이유도 없다)
- 루트 `package.json`에 `release:desktop` 스크립트 — 위 복사 + `firebase deploy --only
  hosting:desktop-updates`
- `apps/desktop/main.js` — `setupAutoUpdater()`. `require('electron-updater')`를 모듈
  최상단이 아니라 이 함수 안(= 설치본 + `whenReady` 이후에만 호출됨)으로 미뤘다 — require되는
  순간 내부적으로 `electron.app`을 읽는 `NsisUpdater`를 바로 만들기 때문에, 최상단에 두면
  dev 실행에서도 매번 그 과정을 탄다. 실패해도 try/catch로 흡수해 자동 업데이트만 꺼지고
  창·트레이·알림·재실 등 기존 기능은 그대로 살아 있게 했다(이번에 처음 들어온 런타임
  의존성이라 패키징 설정이 잘못될 위험이 상대적으로 큼).
  - 시작 30초 후 1회 확인, 이후 4시간 간격
  - `autoDownload: true`, `autoInstallOnAppQuit: true`
  - 다운로드 완료 시 OS 토스트(`buildToastXml` 재사용) — 클릭하면 즉시
    `autoUpdater.quitAndInstall()`. 트레이 상주라 자연스러운 완전 종료가 드물어 클릭
    경로를 같이 뒀다
  - 이 토스트도 `notify` IPC 핸들러와 같은 GC 함정이 있어(지역 변수만으로는 핸들러 반환 후
    수거돼 클릭이 안 먹음) 모듈 스코프 변수(`updateNotification`)로 참조를 붙잡아 둔다

**검증 상태 (2026-08-21, 실제 설치본으로 종단 검증 완료)**: v0.1.6 설치본이 이미 이 PC에서
돌고 있는 상태에서 v0.1.7을 빌드·배포하고, 앱을 재시작하지 않고 그냥 둔 채(4시간 주기
자동 확인이 자연스럽게 걸리도록) `desktop.log`를 지켜봤다.

- 재실 감지(Phase B-3)도 같은 로그에서 함께 확인됨 — `available ↔ away`가 실제로
  여러 시간에 걸쳐 정확히 오갔다(설치 후 4시간 동안 자연 발생한 이벤트, 인위적 테스트 아님)
- `05:58:27` 자동 확인 → `Found version 0.1.7` → 다운로드 시작 → **차등(블록맵 diff)
  다운로드 시도가 old blockmap 404로 실패 → "fallback to full download"로 자동 복구** →
  25초 만에 전체 다운로드 완료 → `update-downloaded` 핸들러(`다운로드 완료: v0.1.7` 로그) 발화
- 차등 다운로드가 실패한 원인은 버그가 아니라 `copy-release.js`가 매 배포마다 이전 버전
  파일을 지웠기 때문(직전 버전 blockmap이 서버에 없어야 할 이유가 없었다) — **수정 완료**:
  이제 최신 2개 버전(현재+직전)을 남겨, 다음 업데이트부터는 차등 다운로드가 정상 동작할
  것으로 기대(수십~백MB 매번 전체 다운로드 대신 변경분만 — 전 교직원 규모에서 학교
  네트워크 부하 차이가 큼). 재검증은 다음 버전 배포 때 자연히 확인됨
- **미확인**: 실제 Windows 토스트가 화면에 떴는지, 클릭 시 `quitAndInstall()`로 재시작·
  설치까지 이어지는지는 사용자 확인 대기 중(로그상 `n.show()`까지는 호출됨)

---

## 쪽지 → 업무 요청 전환 (2026-08-11 논의, 미착수)

쪽지로 온 부탁("○○까지 제출해주세요")을 업무 요청으로 옮길 수 있게 한다. 쪽지와 요청은
이미 거의 같은 모양이라(제목·본문·대상, 요청에 `dueDate`·`status`가 더 있다) 전환 자체는
어렵지 않다.

**자동으로 만들지 않는다. 사람이 확인하고 누른다.**

- 쪽지 상세에 "업무로 만들기" — 제목·본문이 채워진 요청 작성창이 열린다
- 본문에서 뽑아낸 날짜를 마감일에 **미리 채우되 고칠 수 있게** 한다. `8월 15일`, `8/15`,
  `15일까지`, `금요일까지` 정도의 한국어 표현을 정규식으로 잡는다. 틀려도 사람이 고치므로
  위험이 낮다
- 원본 쪽지에 만들어진 업무 링크를 남겨 맥락을 되찾을 수 있게 한다

**"이거 업무 같은데 등록할까요?" 식의 자동 감지는 하지 않는다** — 적어도 버튼을 만들어
실제로 얼마나 쓰는지 본 뒤에 판단한다. 오탐이 잦으면 무시하게 되고, 한 번 무시하기
시작하면 기능이 죽는다.

---

## 설치 현황 구현 상세 (2026-08-21)

**계기**: 자동 업데이트가 0.1.7부터라, 그 미만은 업데이트를 확인하러 가지도 않아 영원히
옛 버전에 머문다. 전 교직원 배포 전에 "누가 아직 구버전인가"를 알아야 수동 재설치를
안내할 수 있는데, 지금은 그걸 알 방법이 전혀 없었다.

**데스크톱 앱은 한 줄도 고치지 않았다.** `preload.js`가 이미 `version`을 노출하고 있어서
(0.1.0부터) 웹 쪽만 붙이면 됐다. 웹 배포만으로 배포되고, 재설치가 필요 없다.

- `apps/shared/lib/desktopClients.js` 신설 — 스키마 주석 + `compareVersions`,
  `needsManualReinstall`, `isStale`. `presence.js`와 같은 구성
- `apps/shared/lib/desktopClients.test.js` — 버전 비교를 문자열로 하면 `'0.1.10' < '0.1.7'`로
  조용히 뒤집히는데 화면으로는 안 잡히는 종류의 오류라 테스트로 막았다
- `apps/dashboard/src/lib/useDesktopClientReport.js` 신설 — 마운트 시 1회 + 6시간 주기로
  `desktopClients/{uid}` 기록. `firstSeenAt`은 문서가 없을 때만 넣는다(merge 쓰기가 매번
  덮으면 "언제부터 쓰는지"가 사라진다)
- **감지 조건이 `useDesktopPresence.js`와 다르다** — 저쪽은 `onPresenceStatus`(0.1.6 신설)를
  보지만 여기서는 `version`만 본다. `onPresenceStatus`로 판정했다면 정작 찾아야 할 0.1.5
  이하가 통째로 안 잡힌다. 이 훅에서 가장 틀리기 쉬운 지점이다
- `apps/dashboard/src/pages/AdminDesktop.jsx` 신설 — 대시보드 첫 관리자 화면
  (`/admin`은 그동안 `/requests`로 리다이렉트만 했다). 구성원 명단(`useSchoolMembers`)과
  맞대어 **미설치까지 보여준다** — 설치한 사람만 나열하면 정작 알아야 할 안 깐 사람이
  화면에 없다. 손을 써야 하는 사람이 위로 오도록 정렬(구버전 → 미설치 → 조용함 → 최신)
- `firestore.rules` — 본인만 쓰기, **관리자만 읽기**. 재실과 달리 배포·지원용 정보라
  교사 전체에 열 이유가 없다
- 레일 버튼은 관리자에게만 보인다(`useAuth().isAdmin`)

**미배포**: 웹 빌드·테스트는 통과했으나 `firebase deploy`는 하지 않았다. Firestore 규칙과
대시보드를 함께 올려야 한다(규칙 없이 웹만 올리면 보고 쓰기가 전부 거부된다).

---

## 다음 단계

`PLAN_messenger.md` §6 권장사항은 그대로 유효하다: **쪽지·Electron wrapper까지만 만들고
멈춰서 반응을 볼 것.** 실시간 1:1 채팅(메신저 2단계)은 그 뒤에 별도 판단.

1. ~~Phase A 데이터 모델 + 웹 위젯~~ — 완료·배포됨
2. ~~Firestore Rules 권한 규칙~~ — 완료·배포됨
3. ~~Phase A-2~~ — 어두운 레일 + 구성원 명단은 구현됨. 12열 캔버스 그리드는 목록/상세
   구조로 재설계되며 폐기됨(2026-08-10 갱신 참고). Phase B 착수에는 지장 없음
4. **Phase B** — Electron wrapper.
   - ~~1차: URL 로드 + 트레이 + 자동시작~~ — 완료·Windows 검증됨(2026-08-10)
   - ~~2차: Firestore 알림 파이프라인~~ — **완료·실동작 검증됨**(2026-08-10).
     쪽지 알림 수신 → 클릭 → 창 복원 → 해당 쪽지 열림까지 확인. `npm run dist` 검증 완료
   - 3차: 재실 자동 감지(`powerMonitor`) — **코드 구현·웹 배포 완료(2026-08-21), 설치본
     실동작 검증 대기.** 아래 "Phase B-3 진행 상황" 참고
5. 설치 현황 관리자 화면 (Phase B와 함께)
6. **학사일정 — 구글 캘린더 읽기 전용 동기화 + 홈 화면 달력** (위 절 참고)
7. **쪽지 → 업무 요청 전환** (위 절 참고)

### 쪽지 진행 상황 (2026-08-11)

- 데스크톱 알림에 제목·보낸 사람·내용 앞부분을 보여주고, '답장' 버튼으로 작성창까지 바로 간다
- 삭제 — 각자 숨기기. 문서 하나를 양쪽이 함께 보므로 진짜 지우면 받은 사람이 보낸 사람의
  기록까지 없앤다
- 여러 개 선택해 한 번에 삭제
- **알림창 안에서 바로 답장을 입력하는 것은 Windows에서 불가능하다** — 토스트 자체는 입력을
  지원하지만 Electron이 값을 전달하지 않는다(`reply` 이벤트는 macOS 전용). 같은 이유로
  버튼과 본문 클릭도 구분할 수 없다(`click` 하나뿐)

### Phase B-2 이후 남은 확인·작업 (2026-08-10 기준)

- [x] **트리거 실동작 확인 (2026-08-10)** — 새 쪽지·새 공지·새 업무 요청·호출 4종은
      알림 표시·클릭·화면 이동까지 확인 완료. 남은 것은 아래 둘
- [ ] **마감임박** 실동작 확인 — 오늘 마감인 열린 요청이 있어야 한다.
      `overdue`(마감 지남)는 알리지 않는데, 이대로 둘지 정하지 않았다
- [ ] **다시 알림**(구 독촉) 실동작 확인 — `remindedAt` 변경을 보고 알린다.
      2026-08-10에 구현했고 아직 안 떠봤다

**호출 시스템 관련 발견 (2026-08-10)**: `migrateStudentsToWorkspaceId`로 학생 문서 키가
학번에서 `workspaceUserId`로 바뀌었는데 `functions/callSystem.js`가 여전히 학번을 문서
ID로 조회하고 있어서 **호출 기능 전체가 막혀 있었다**. `findStudentByStudentId()`로
필드 조회하도록 고쳤다. 학생 문서를 다루는 다른 코드에도 같은 가정이 남아 있을 수 있으니
`students` 컬렉션을 문서 ID로 찾는 곳이 더 있는지 한 번 훑어볼 것.
- [ ] **알림 디자인** — 현재는 제목·본문뿐이다. `toastXml`로 앱 아이콘, "열기" 버튼,
      큰 이미지까지 넣을 수 있다. 색·폰트·레이아웃을 자유롭게 바꾸는 것은 불가능
      (원하면 테두리 없는 항상-위 `BrowserWindow`를 직접 그려야 하는데, 알림 센터 기록과
      방해 금지 존중 등 OS 통합을 잃는다)
- [ ] 다른 PC에서 설치·알림 검증 — SmartScreen 경고 여부 포함
