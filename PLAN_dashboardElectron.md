# 대시보드 기능 확장 + Electron 데스크톱 앱 — 계획

> 작성일: 2026-07-31 (2026-08-10 상태 갱신)
> 상태: Phase A 구현·배포 완료. Phase A-2는 구현 후 재설계됨(아래 "실제 경과" 참고).
> **Phase B 착수 가능 상태.**
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

**실제 구현 (Phase B-2, 2026-08-10)**:
- `apps/dashboard/src/lib/useDesktopNotifications.js` — `window.smartOfficeDesktop`이
  있을 때만 동작(일반 브라우저 사용자에게는 완전히 no-op). 5개 트리거:
  호출(`callRequests`), 새 공지·새 요청(`requests` + `kind`), 새 쪽지(`personalNotices`),
  마감임박(`workRequests.js`의 `dueState()`를 30분 간격 타이머로 재평가, `localStorage`로
  하루 1회 중복 방지). 창이 포그라운드일 때는 안 띄움(`document.hasFocus()`).
- `apps/dashboard/src/components/DesktopNotifications.jsx` — 위 훅을 마운트만 하는
  컴포넌트, `App.jsx`에 `<CommandPalette />`와 같은 자리(라우트 밖)에 둠.
- `apps/desktop/preload.js` — `window.smartOfficeDesktop.focusWindow()` 추가.
- `apps/desktop/main.js` — `ipcMain.on('focus-window', ...)`, 알림 권한만 명시적으로
  허용하는 `session.setPermissionRequestHandler` 추가.
- **알려진 한계**: 알림 클릭 시 딥링크가 가능한 건 `/posts/:requestId`(공지·요청)뿐이다.
  호출·쪽지는 전용 상세 라우트가 없어 각각 `/`, `/messages`(목록)로만 이동한다.

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
- [ ] `personalNotices` 보관 기간 — 무기한 / 학기별 삭제 / 사용자 선택 (현재 무기한, 삭제 로직 없음)
- [ ] `personalNotices` 관리자 열람 가능 여부 — 현재 배포된 규칙은 슈퍼관리자만 열람 가능
      (사실상 프라이버시 쪽으로 정해진 상태). `PLAN_messenger.md` §5와 동일 쟁점
- [ ] `academicCalendar` 입력 방식 — 관리자 수동 입력만 할지, 나이스 연동을 나중에 고려할지

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
      본인 PC 테스트 단계에서는 불필요하고, 전 교직원 배포 직전에 결정한다
- [x] Windows 검증(1차 범위) — 창 로드·트레이 아이콘·닫기→트레이 상주·자동시작 등록까지
      Windows에서 직접 확인 완료(2026-08-10). NSIS 인스톨러·SmartScreen 경고는 아직 미검증
      (아래 "Phase B 1차 진행 상황" 참고)

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
- **미검증**: `npm run dist`(electron-builder NSIS 설치 파일 생성), 설치 파일의 SmartScreen
  경고 문구, 실제 인스톨러 실행 후 사용자 단위 설치 여부

**재실 자동 감지 설계 메모** (Phase B 착수 시 참고)

메인 프로세스가 `powerMonitor.getSystemIdleTime()`과 화면 잠금 이벤트를 읽어 상태를
판정하고, IPC로 렌더러에 넘긴다. Firestore 쓰기는 **이미 로그인돼 있는 렌더러(웹 대시보드)가**
`presence/{uid}`에 `source: 'desktop'`으로 기록한다 — 메인 프로세스에 Firebase 인증을
따로 심지 않아도 되고, 웹앱은 `window.smartOfficeDesktop` 존재 여부만 보면 된다.

- 사용자가 직접 고른 '수업 중'은 자동 갱신이 덮어쓰지 않는다 (자동은 재실↔자리 비움만)
- 상태가 바뀔 때만 쓰고, TTL이 만료되지 않도록 10분 간격 하트비트를 더한다

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
   - ~~2차: Firestore 알림 파이프라인~~ — 완료(2026-08-10, 위 "알림 파이프라인" 참고).
     아직 안 한 것: 실제 Windows에서 알림 수신·클릭 동작 확인, `npm run dist` 설치 파일 검증
   - 3차: 재실 자동 감지(`powerMonitor`) — 미착수. 아래 "재실 자동 감지 설계 메모" 참고
5. 설치 현황 관리자 화면 (Phase B와 함께)
