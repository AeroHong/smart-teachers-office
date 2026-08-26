# 2·3단 크롬 재정비 — 사이드바 폭·글자 크기, 상단바 재배치

> 상태: **1차 값 배포 완료(2026-08-26).** 실사용 피드백 받아 미세조정 예정.

## Context

캔버스 편집기 작업 중 사용자가 실제 화면과 Slack 화면을 나란히 캡처해 비교해 줬다
(`스크린샷 2026-08-25 145031.png`). 지적: **"2단(채널 목록)의 폭이 Slack보다 넓은데
글자는 오히려 더 작다"**, **"2·3단 위의 검색창·알림·사용자 표시줄을 전반적으로 다시
봐야 한다."**

검색창 위치는 **Slack처럼 창 전체 가로 가운데**로 하기로 확정(사용자, 2026-08-26).
상단바의 기능 구성(검색·호출벨·이름·재실 상태 — 무엇이 있는가)은 안 바꿨다 — 각자
이미 문서화된 이유가 있고, 사용자도 "없애라"가 아니라 "다시 보라"고 했다. 배치·크기만
조정했다.

## 한 곳만 고치면 화면 전체에 퍼지는 구조

사이드바(2단) 목록 UI는 `apps/dashboard/src/components/sidebarUi.jsx`
(`SidebarSection`/`SidebarItem`/`MiniChip`) 한 곳에 몰려 있다 — 홈(채널)·내 활동·
학사일정·요청 현황·쪽지·구성원이 전부 이걸 같이 쓴다. 여기 값을 고치면 화면마다
따로 손댈 필요 없이 전체에 일관되게 반영된다. `ChannelSidebar.jsx`도 전부
`SidebarItem`/`SidebarSection`을 통해 그리므로 직접 고칠 곳이 없었다.

테마(`apps/shared/theme.js`)에는 공통 typography 스케일이 없다 — 각 컴포넌트가
`fontSize` 문자열을 직접 쓴다. 그래서 전역 테마 변경 없이 컴포넌트 몇 곳만 고쳤다.

## 한 변경

### 1. 사이드바(2단) — 좁히고 키웠다

- `WorkspaceLayout.jsx`: `SIDEBAR_WIDTH` **268 → 240**.
- `sidebarUi.jsx`:
  - `SidebarItem` 줄: 글자 `0.83rem → 0.88rem`, 좌측 여백 `pl: 1.7+indent → 1.3+indent`,
    우측 `pr: 0.7 → 0.6`. 줄 높이(`py: 0.4`)는 그대로 뒀다 — Slack도 줄 자체는 촘촘하고,
    늘리면 화면에 보이는 채널 수가 줄어든다.
  - `SidebarSection` 머리("채널"·"다이렉트 메시지" 같은 분류 라벨): `0.73rem → 0.76rem`,
    가로 여백 `px: 0.6 → 0.5`. 항목보다는 계속 작게 뒀다 — 분류표 역할이지 읽을
    내용이 아니다.
  - `SidebarEmpty`도 같은 폭·글자로 맞췄다(`pl 1.7→1.3`, `0.78rem→0.8rem`).
  - `MiniChip`(D-3, 다시 알림 같은 보조 표시)은 그대로 뒀다.

### 2. 상단바 — 검색을 창 가운데로

`TopBar.jsx`를 `display: grid; gridTemplateColumns: 1fr auto 1fr`로 다시 짰다 — flex
스페이서가 아니라 grid를 쓴 이유: 오른쪽 그룹(호출벨·이름·재실 상태)의 폭과 무관하게
가운데 칸이 항상 창 정가운데에 오려면 양옆에 똑같이 `1fr`을 줘야 한다(왼쪽 스페이서
하나만 두는 flex 방식은 오른쪽 그룹 폭만큼 가운데가 밀린다).

- 왼쪽 칸: 비워서 균형만 잡는다.
- 가운데 칸: 검색 버튼. 폭 `maxWidth 420→480`, 글자 `0.83rem→0.86rem`,
  세로 여백 `py 0.55→0.62`.
- 오른쪽 칸: `CallBell` + 이름 + 재실 상태, 기존과 같은 구성. 이름·재실 라벨 글자를
  `0.82~0.83rem → 0.85~0.86rem`로 사이드바와 같은 폭으로 키웠다.
- 바 전체 세로 padding도 `py 0.9→1.0`으로 살짝 키워 커진 사이드바와 비율을 맞췄다.

## 건드린 파일

| 파일 | 변경 |
|---|---|
| `apps/dashboard/src/components/WorkspaceLayout.jsx` | `SIDEBAR_WIDTH` 268→240 |
| `apps/dashboard/src/components/sidebarUi.jsx` | `SidebarItem`·`SidebarSection`·`SidebarEmpty` 글자 크기·여백 조정 |
| `apps/dashboard/src/components/TopBar.jsx` | 3분할 grid로 재배치, 검색창 중앙 정렬·확대, 글자 크기 조정 |

## 범위 밖 (이번엔 안 함)

- 상단바 구성 요소 자체를 늘리거나 빼는 것(예: 채널별 헤더에 검색·더보기 아이콘을
  새로 만드는 것) — 이미 있는 것의 배치·크기만 조정
- 레일(1단, 64px)·채널 3단 헤더 — 사용자가 짚은 건 2단·상단바뿐
- "+" 삽입 메뉴를 서랍(drawer) 스타일로 바꾸는 것(`PLAN_canvasEditor.md`에서 이월된
  항목) — 이번 라운드는 폭·크기·배치에 집중하고 그건 다음으로 넘겼다

## 3차 피드백 — 검색창 폭 재수정 + 1·2·3단 색상 재구성 (2026-08-26)

제목줄 제거를 실제로 적용해본 뒤 캡처(`스크린샷 2026-08-26 110110.png`)로 지적: 검색창이
너무 넓어져 오른쪽 이름·재실 상태가 잘리고 두 줄로 접혔다. 그리고 색상 방향 확정:
**1단(레일) 색이 상단바까지 그대로**, **2단은 같은 계열의 한 단계 밝은 색**, **3단은
흰색 유지 + 오른쪽·아래 테두리(1단과 같은 색) + 그 테두리 안쪽(오른쪽 위·아래) 모서리를
살짝 둥글게**.

### 검색창 잘림 — 원인과 수정

`1fr minmax(320px,640px) 1fr` grid에서 가운데 칸이 최대치(640)까지 커지면, 남는 공간을
좌우 `1fr`이 나눠 가지면서 오른쪽 칸이 실제 필요 폭(호출벨+이름+재실 상태 ≈195px +
titleBarOverlay 버튼 자리 138px ≈ 333px)보다 작아질 수 있었다 — 그게 잘림의 정체였다.

`TopBar.jsx`를 고정 대칭 3분할로 바꿨다 — `SIDE_COLUMN_WIDTH(360px) 1fr
SIDE_COLUMN_WIDTH(360px)`. 좌우 칸을 **고정폭**으로 주면 가운데(검색)가 아무리 커져도
오른쪽 칸이 밀리지 않는다(왼쪽도 같은 폭이라 가운데는 계속 창 정가운데). 360px는
오른쪽 묶음 실제 필요폭(≈333px)에 여유를 더한 값 — 1차 조정값이라 이후 실물 보고 또
다듬을 수 있다.

### 1·2·3단 색상 재구성

- **상단바(TopBar.jsx) 배경 → `rail.bg`**(1단과 완전히 같은 색). 레일에서 상단바로
  이어지는 어두운 띠 하나로 보인다. 그 위의 흰 검색 알약은 손대지 않았다 — 배경이
  어두워지면서 저절로 대비가 살아 Slack처럼 "어두운 바 위의 밝은 알약"이 됐다.
  호출벨·이름·재실 상태(원래 밝은 배경을 가정한 색)는 `TopBar.jsx` 안에서만 감싸는
  중첩 `ThemeProvider`로 `text.primary/secondary/disabled`·`action.hover`를 어두운
  배경용 값으로 바꿔치기했다 — `CallBell.jsx`나 그 팝오버 자체는 안 건드렸다(React
  context를 타고 팝오버도 자동으로 같이 어두워진다).
- **사이드바(2단, `WorkspaceLayout.jsx`의 `nav`) 배경 → `rail.border`**(`#1e293b`,
  `rail.bg`보다 한 단계 밝은 같은 계열 — 이미 있던 토큰을 그대로 재사용해 새 색을
  안 만들었다). 예전에 있던 "레일에서 사이드바로 옅게 번지는 그라데이션"은 흰
  사이드바를 어두운 레일에 자연스럽게 잇던 장치였는데, 이제 사이드바 자체가
  어두우니 필요 없어져 없앴다.
  **`sidebarUi.jsx`·`ChannelSidebar.jsx`는 한 줄도 안 고쳤다** — 이미
  `text.primary`/`secondary`/`disabled`·`action.hover` 같은 의미 있는 토큰만 쓰고
  있어서, `WorkspaceLayout.jsx`가 사이드바를 감싸는 중첩 다크 테마 하나로 그 토큰들의
  실제 색만 바꿔치기하면 하위 컴포넌트 전체(채널 목록뿐 아니라 내 활동·학사일정·
  요청 현황·쪽지·구성원 등 같은 `sidebarUi`를 쓰는 모든 화면)가 자동으로 뒤집힌다.
  채널 줄 메뉴 같은 팝업도 같은 이유로 자동으로 어두워진다.
- **본문(3단) → 흰 배경 그대로.** 오른쪽·아래 가장자리에만 `rail.bg` 색 테두리를
  둘렀다(위·왼쪽은 상단바·사이드바가 이미 어두워서 경계가 저절로 생겨 테두리가 필요
  없다). 그 오른쪽 위·아래 모서리만 살짝 둥글게(`borderTopRightRadius`/
  `borderBottomRightRadius: 10`) — 어두운 틀 안에 흰 카드가 얹힌 인상.

### 건드린 파일 (3차)

| 파일 | 변경 |
|---|---|
| `apps/dashboard/src/components/TopBar.jsx` | 고정 대칭 3분할 grid, 배경 `rail.bg`, 오른쪽 묶음 전용 중첩 다크 테마 |
| `apps/dashboard/src/components/WorkspaceLayout.jsx` | 사이드바 배경 `rail.border` + 중첩 다크 테마, 옛 그라데이션 제거, 본문(3단)에 오른쪽·아래 테두리 + 모서리 라운드 |

## 다음

값(360px, 라운드 10px 등)은 여전히 "근거 있는 조정값"이라 실제로 보고 다음 라운드에서
미세조정한다(이 세션 전체가 배포 → 실사용 확인 → 다음 라운드로 진행돼 왔다). 사용자
피드백 대기 중.

## 2차 피드백 (2026-08-26)

- **검색창이 너무 좁았다.** 원인: `1fr auto 1fr` grid에서 가운데 칸이 `auto`라 내용
  칸이 실제로 넓어질 이유가 없었다(버튼에 준 `width:'100%', maxWidth:480`은 채울
  트랙 자체가 좁으니 소용없었다). `gridTemplateColumns`를 `1fr minmax(320px, 640px)
  1fr`로 바꿔 가운데 칸 자체가 320~640px를 차지하게 고쳤다.
- **앱 최상단이 Slack과 다르다** — 우리는 OS 기본 제목줄("업무 대시보드 · 스마트교무실"
  글자 + 창 조절 버튼)이 그대로 보이는데 Slack은 그게 없이 곧바로 메뉴가 시작된다.
  이건 웹 화면(dashboard) 문제가 아니라 **데스크톱 앱 셸**(`apps/desktop/main.js`)의
  `BrowserWindow` 설정 문제였다 — `titleBarStyle`을 아예 안 줘서 OS 기본 제목줄을
  그대로 썼다.
  - `main.js`: `titleBarStyle: 'hidden'` + `titleBarOverlay`(색은 `apps/shared/
    theme.js`의 `rail.bg`/`rail.icon`과 맞춤, `height: 44`)로 바꿨다. `frame: false`만
    쓰면 최소화·최대화·닫기 버튼까지 같이 사라져 창을 다룰 수 없게 되므로, Windows가
    그 버튼만 오른쪽 위에 겹쳐 그리게 하는 `titleBarOverlay`를 썼다.
  - OS가 그리던 "잡아서 창을 옮기는" 영역도 같이 사라지므로, `TopBar.jsx`의 빈
    공간에 `-webkit-app-region: drag`를 주고 그 안의 버튼들(검색·호출벨·이름·재실
    상태)에는 `no-drag`를 걸어 클릭이 여전히 먹히게 했다. 오른쪽 그룹에는
    `titleBarOverlay` 버튼 폭(약 138px)만큼 오른쪽 여백도 더해 겹치지 않게 했다.
    이 CSS는 일반 브라우저 탭에서는 그냥 무시된다(웹 사용자에게 영향 없음).
  - **웹 쪽 변경(검색창 폭, TopBar CSS)은 이미 배포됨** — `firebase deploy`만으로
    끝나서 데스크톱 앱도 곧바로 최신 화면을 받는다(데스크톱은 `DASHBOARD_URL`을 그대로
    불러오는 얇은 셸이라 별도 빌드 없이도 웹 배포가 그대로 반영된다).
  - **`main.js` 변경은 다르다** — 이건 데스크톱 앱 자체의 코드라, 이미 설치된 PC에
    반영되려면 실제로 새 설치본을 만들어 버전을 올려 릴리스해야 한다. 사용자에게
    먼저 확인받은 뒤 진행: `apps/desktop/package.json` **0.1.7 → 0.1.8**,
    `npm run release:desktop`(electron-builder로 NSIS 설치파일 빌드 + `firebase
    deploy --only hosting:desktop-updates`로 업데이트 피드 갱신) 실행 ✅
    **완료(2026-08-26)**. 이미 설치된 PC들은 electron-updater가 다음 확인 때 0.1.8을
    받아간다.
  - **적용 안 되는 문제 발생 → 원인 규명**: 사용자가 트레이 앱을 "재시작"했는데도
    안 바뀐다고 보고. `%APPDATA%\smart-office-desktop\desktop.log`를 직접 읽어
    확인 — 0.1.8 다운로드는 이미 성공했는데 설치가 안 걸려 있었다. 원인: 이 앱은
    창을 닫아도(X) 종료가 아니라 트레이로 숨기만 하도록 설계돼 있어서(`main.js`의
    `close` 핸들러), "재시작"이 실은 프로세스를 안 죽이는 숨기기→열기였다.
    electron-updater는 앱이 **완전히 종료**될 때만 설치한다. 해결: 트레이 아이콘
    우클릭 → "종료"로 진짜 종료한 뒤 다시 실행 → 적용 확인됨.
  - **테두리 1px → 3px, UpdateBanner 버튼이 titleBarOverlay에 가려짐**: 위 색상 재구성
    라운드에서 3단 테두리가 너무 얇아 안 보였고(`WorkspaceLayout.jsx` 1px→3px),
    `UpdateBanner.jsx`의 새로고침·닫기 버튼이 오른쪽 위 창 조절 버튼과 겹쳐 안
    눌렸다(`TopBar.jsx`와 같은 `pr:'138px'` 추가로 해결) ✅ 완료(2026-08-26).

## 3차 피드백 — 2단 텍스트·구조 정비 + 나와의 대화 (2026-08-26)

사용자가 2단(사이드바)을 콕 집어 다시 지적: "+ 아이콘이 색 문제로 안 보인다",
"채널에 아이콘이 없다(#)", "글씨크기 통일·확대, 줄간격 확대", "채널/DM 추가
버튼을 목록 아래로", "DM에 나와의 대화(셀프 메모) 기능을 넣자", "섹션 제목이
접고 펼 수 있다는 게 안 보인다".

- **"+" 안 보임 — 근본 원인**: `WorkspaceLayout.jsx`의 `sidebarTheme`은
  `createTheme(outer, {palette:{mode:'dark', ...}})` 형태로 쓰는데, 이 2-인자
  형태는 `outer.palette`(이미 완성된 밝은 팔레트)를 얕게 deepmerge만 한다 —
  `mode`를 바꿔도 `action.active`처럼 직접 안 적은 토큰은 MUI가 다시 계산해
  주지 않고 밝은 테마 값(거의 검정)이 그대로 남는다. 색을 안 지정한 아이콘
  버튼(`ChannelSidebar.jsx`의 +, ⋮)은 기본색으로 `action.active`를 쓰므로
  어두운 배경 위에서 안 보였다. `action.active`(+ disabled/disabledBackground)를
  다크 기본값으로 명시해 해결.
- **채널 "#" 아이콘**: `channelRow()`의 라벨을 비공개(자물쇠)뿐 아니라 공개
  채널에도 `TagIcon`(Channels.jsx 채널 헤더에서 이미 쓰던 것과 동일)을 달도록
  바꿈.
- **글씨 크기·줄간격**: `sidebarUi.jsx` — 섹션 제목(`SidebarSection` label)
  0.76rem→0.82rem, 항목(`SidebarItem` label) 0.88rem→0.9rem, 두 곳 다 줄
  높이(`py`) 확대(0.45/0.4 → 0.55/0.6). "제목 아래 내용 텍스트가 조금
  작아야 함"은 섹션 안이 비었을 때 뜨는 안내 문구(`SidebarEmpty`, 0.8rem)가
  제목·항목보다 작게 유지되는 것으로 해석해 반영 — 항목 자체를 제목보다
  작게 하면 이번 라운드 전에 이미 확보한 가독성(Slack 대비 작다던 지난 지적)이
  후퇴하므로. **해석이 다르면 다음 라운드에서 바로 고침.**
- **섹션 토글 신호 부재**: `SidebarSection`이 커스텀 아이콘이 있으면 꺾쇠를
  아예 안 그려서, 접고 펼 수 있는 기능은 처음부터 있었는데(`onToggle`/`open`)
  신호가 없었다. 커스텀 아이콘 옆에 꺾쇠를 항상 함께 그리도록 수정.
- **추가 버튼 위치**: "새 채널"을 채널 목록(+새 섹션 버튼) 아래로, DM의 "+"
  아이콘(헤더)을 없애고 목록 맨 아래 "새 대화 시작" 버튼으로 이동.
- **나와의 대화(셀프 DM)**: 데이터모델은 이미 준비돼 있었다 — `channels.js`의
  `dmTitle()`이 `memberUids`에 상대가 없으면(`[uid, uid]`) 이미 '나와의 대화'를
  반환하게 짜여 있었다. 막힌 곳은 딱 하나, `firestore.rules`의
  `isValidDmCreate()`가 `memberUids[0] < memberUids[1]`로 엄격 비교해 두 값이
  같은 셀프 DM을 거부했다 — `<=`로 완화(서로 다른 두 사람 사이에서는 동작이
  똑같아 기존 정렬 보장은 안 깨짐). `read`/`update`/`messages` 규칙은 전부
  `uid in memberUids` 패턴이라 셀프 DM에서도 자연히 통과함을 코드 리뷰로 확인.
  `tests/firestore.rules.test.js`에 회귀 테스트 추가(`★` 표시).
  - **`ChannelSidebar.jsx`**: `dms`에서 `memberUids`가 전부 나인 문서를
    `selfDm`으로 분리해 목록 맨 위에 고정 항목으로 그린다(정렬에 따라 자리가
    흔들리면 메모장 용도로 못 씀). 아직 문서가 없으면 클릭 시 `onSelfDm`
    (=Channels.jsx의 기존 `startDm(자기 자신)`)으로 그 자리에서 만든다.
  - **`Channels.jsx`**: `isSelfDm` 판정 추가, 헤더 부제("둘만"→"나만")와 빈
    대화 안내 문구(Slack의 "Notes to self" 설명을 우리 말로 각색)를 분기.
  - **⚠️ 로컬 환경에 Java가 없어 `npm run test:rules`(Firestore 에뮬레이터)를
    이번 세션에서 직접 돌리지 못했다** — 규칙 자체는 코드 리뷰로 안전성을
    확인했고 회귀 테스트도 추가해 뒀지만, 이 세션이 지켜온 "규칙 변경은 테스트
    통과 후 배포" 원칙대로 **`firestore.rules` 배포는 사용자 확인 후 진행**
    (커밋만 하고 `firebase deploy --only firestore:rules`는 아직 안 함).
