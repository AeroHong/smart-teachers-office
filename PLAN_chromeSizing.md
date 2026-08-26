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

## 다음

값은 "근거 있는 1차 조정값"이라 실제로 보고 다음 라운드에서 미세조정하기로 했다
(이 세션 전체가 배포 → 실사용 확인 → 다음 라운드로 진행돼 왔다). 사용자 피드백 대기 중.

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
    반영되려면 실제로 새 설치본을 만들어(`npm run release:desktop`, electron-builder로
    NSIS 설치파일 빌드 + `firebase deploy --only hosting:desktop-updates`로 업데이트
    피드 갱신 → electron-updater가 실행 중인 앱들에 자동 배포) 버전을 올려 릴리스해야
    한다. 코드는 커밋해 뒀지만 **릴리스는 아직 안 돌렸다** — 실제 설치본을 새로 찍어
    배포하는 일이라 사용자 확인 후 진행하기로 함.
