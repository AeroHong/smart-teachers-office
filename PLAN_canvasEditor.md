# 글쓰기 캔버스 — Notion/Slack 캔버스 스타일 재설계

> 상태: **1~2단계 완료(2026-08-26).** 3~5단계 진행 예정.
> 관련: [PLAN_composer.md](./PLAN_composer.md) · [PLAN_blockEditor.md](./PLAN_blockEditor.md)

## Context

`PostComposer.jsx`를 채널 3단 안에 심은 다음(PLAN_composer.md), 이번엔 그 안의 **본문 작성
경험 자체**를 Slack 캔버스·Notion 페이지에 가깝게 바꾼다 — 흰 캔버스 느낌, 표지, 제목 기반
목차, 선택 시 뜨는 서식 도구, 하단에 떠 있는 "+" 삽입 버튼, 표, 자동저장 + 별도
"알림 보내기". 사용자가 스스로 "생각보다 크다"고 판단해 계획부터 정리해 달라고 요청했다.

**확정된 답변 4가지** (AskUserQuestion으로 확인, 2026-08-26):
1. "+" 메뉴의 **'캔버스'** = 다른 업무 글을 카드로 삽입(채널 메시지의 CanvasCard와 같은 모양,
   본문 안에 심는다)
2. **파일 첨부**는 입구만 바꾼다 — `+파일`로 올리면 지금과 같은 `attachments` 배열에
   들어가고, 보는 화면(PostDetail의 첨부파일 섹션)은 손대지 않는다
3. **자동저장**: 제목·본문 등 무엇이든 처음 쓰는 순간 실제 문서가 만들어지고, 이후 모든
   변경(제목·본문·대상·요청/안내·마감일·표지)이 자동 저장된다. "알림 보내기"는 저장과
   무관하게 채널 메시지 탭에 알림 글을 남기는 별도 동작이고 여러 번 눌러도 된다.
4. **"날짜" 삽입 = 리마인더 칩**(더 큰 작업 쪽을 선택함) — 실제 알림 발송(푸시)까지는
   이번 범위 밖, 시각적 D-day 칩까지만.

## 설계 원칙 — RichTextEditor는 건드리지 않는다

`RichTextEditor.jsx`는 쪽지(`NoticeComposeModal.jsx`)도 같이 쓴다. 이번 변경은 고정
툴바 제거·선택 시 뜨는 서식 도구·표·리마인더 칩·상단 "+" 통합처럼 업무 글 전용 캔버스에만
맞는 것들이라, 쪽지까지 함께 바꾸면 요청받지 않은 화면이 깨진다.

→ **새 컴포넌트 `CanvasEditor.jsx`를 만들었다.** 재사용 가능한 로직(슬래시 명령 처리, 이미지
업로드, execCommand 래퍼, 엔터 시 서식 복귀)은 그대로 포팅하되, 툴바·목차·표·칩은 여기서만
만든다. `RichTextEditor.jsx`·쪽지는 완전히 그대로 둔다.

`SlashMenu.jsx`는 위치 계산·키보드 탐색 로직이 그대로 재사용 가치가 있으므로 **확장**한다 —
`extraItems` prop을 받게 해서, `CanvasEditor`만 표·날짜·캔버스삽입·파일 항목을 추가로 넘긴다
(3단계에서). 쪽지 쪽 `RichTextEditor`는 그 prop을 안 넘기므로 지금 메뉴 그대로 유지된다.

## 단계별 실행 순서

**단계마다 구현 → 빌드/테스트 → 커밋 → 배포 → 다음 단계**로 진행한다. 각 단계는 그
자체로 동작하는 증분이다.

### 1단계 — 캔버스 껍데기: 흰 캔버스 + 선택 시 서식 도구 ✅ 완료(2026-08-26)

- `CanvasEditor.jsx` 신설(RichTextEditor.jsx 포팅). 상단 고정 툴바를 없앴다. 바깥 테두리·
  헤더 바를 없애 페이지에 녹아드는 흰 캔버스 느낌으로 바꿨다. 편집기 자체의
  `overflowY:auto`/`maxHeight` 제한도 없앴다 — 부모(PostComposer의 스크롤 영역)가 대신
  스크롤한다. 상자 안에 또 스크롤 상자가 있으면 그게 "입력 상자"라는 인상을 준다.
- **선택 시 뜨는 서식 도구(bubble toolbar)**: `document`의 `selectionchange` 표준 이벤트를
  듣다가, 에디터 안에서 collapse 안 된 selection이 생기면 `range.getBoundingClientRect()`
  위에 작은 Paper를 띄운다(마우스든 Shift+화살표든 똑같이 잡힘). 담는 동작: 굵게·기울임·
  밑줄·취소선·글자색·링크(기존 `exec`/`addLink` 함수 그대로 재사용, 트리거와 위치만
  바꿨다). 버튼은 `onMouseDown` 기본 동작을 막아 클릭해도 선택이 안 풀리게 했다.
  우클릭 메뉴(블록 서식 변경)는 이 버블과 겹치지 않는 별개 기능이라 그대로 뒀다.
- 제목 티어를 3단으로: `SLASH_ITEMS`에 `h1`(→H2, "큰 제목")·`h2`(→H3, "중간 제목")·
  `h3`(→H4, "작은 제목") 셋. `richText.js`의 `ALLOWED_TAGS`에 `h4` 추가,
  `htmlToText`의 정규식도 `h[1-4]`로 확장. `richTextStyles.js`에 `& h4` 스타일 추가.
- 이미지는 이번 단계에서도 여전히 넣을 수 있다 — 붙여넣기·끌어놓기·"/이미지" 슬래시
  명령으로(전용 툴바 버튼만 없앴다). "+" 메뉴로 정식 편입은 3단계.
- `PostComposer.jsx`가 `RichTextEditor` 대신 `CanvasEditor`를 쓰도록 교체.

### 2단계 — 제목 기반 목차(TOC) ✅ 완료(2026-08-26)

- `CanvasEditor` 안에서 `editorRef.current.querySelectorAll('h2,h3,h4')`로 제목 목록을
  뽑아(`emit()`이 부를 때마다, 즉 모든 변경 경로에서 갱신) 왼쪽에 얇은(168px) 목차
  칼럼을 그린다. 클릭하면 `scrollIntoView({behavior:'smooth', block:'center'})`.
  본문을 부모가 처음 채워 넣을 때(고치기 화면 진입 등)도 목차가 비어 있지 않도록
  `value` 동기화 effect에서도 한 번 부른다.
- 제목 요소에 앵커 id는 **저장하지 않고** 매번 에디터 DOM에서 동적으로 부여한다(`h-0`,
  `h-1`…) — `richText.js`의 `ALLOWED_ATTR`는 안 건드렸다. 목차는 편집 중에만 필요하고
  읽기 화면(PostDetail)에는 요청되지 않았다.
- 제목이 하나도 없으면 목차 칼럼 자체를 안 그린다(빈 자리 낭비 방지 — 이 코드베이스
  전반의 관례). 칼럼은 `position: sticky`라 긴 글을 스크롤해도 계속 보인다.

### 3단계 — "+" 삽입 통합 + 표 · 날짜 칩 · 캔버스 삽입 · 파일

- **"+" 버튼과 "/" 를 같은 메뉴로 합친다.** `SlashMenu`에 `extraItems` prop을 추가하고,
  `CanvasEditor`가 아래 신규 항목을 얹어 넘긴다. 하단 플로팅 "+" 아이콘 버튼(캔버스
  스크롤 영역 안에 `position: sticky; bottom`)을 누르면 커서 위치에 같은 메뉴가 뜬다.
- **표**: 새 SLASH_ITEMS 항목("표", 3×3 기본) — `applyHtml`과 같은 방식으로 `<table>`을
  직접 만들어 끼운다. 최소 기능만: 셀 안 텍스트 편집, 표를 클릭하면(기존 이미지
  손잡이와 같은 오버레이 패턴 재사용) 표 바깥에 "행 추가"/"열 추가" 버튼이 뜬다.
  행·열 삭제·셀 병합은 이번 범위 밖.
  → `apps/shared/lib/richText.js`의 `ALLOWED_TAGS`에 `table,thead,tbody,tr,td,th` 추가,
  `htmlToText`에 표 셀 텍스트 추출 한 줄 추가.
- **날짜 칩(리마인더)**: 작은 날짜 선택 팝오버 → `<span data-date="YYYY-MM-DD">📅 8/28(금)
  · D-2</span>` 형태로 커서 위치에 삽입. D-day 표시·색은 기존 `workRequests.js`의
  `dueState`/`DUE_TONE` 패턴을 재사용해 매 렌더마다 다시 계산한다(저장은 날짜 문자열만,
  "D-2" 문구는 항상 그때그때 계산 — 다음날 다시 열어도 틀어지지 않는다). 클릭하면 팝오버로
  날짜 수정·삭제.
  **범위 명시**: 이번 단계는 시각적 칩까지다. 정해진 날짜가 되면 실제로 알림을 쏘는
  것(푸시·데스크톱 알림 연동)은 새 백엔드(예약 실행) 인프라가 필요한 별도 작업이라
  포함하지 않는다. → `richText.js` sanitize 설정에 `ALLOWED_ATTR`로 `data-date` 추가.
- **캔버스 삽입**: 이 채널(또는 다른 채널)의 기존 업무 글을 골라 카드로 심는다. 채널
  메시지 탭의 `CanvasCard`(ChannelMessages.jsx)와 같은 생김새·같은 데이터
  (`refRequestId`/`refTitle`/`refChannelId`)를 본문 안 커스텀 요소로 넣는다 — 저장은
  `<div data-canvas-ref="{id}" data-canvas-title="…" data-canvas-channel="…">` 형태,
  렌더는 CanvasCard와 동일 컴포넌트를 재사용(뷰 모드 PostDetail에서도 같은 카드가
  보이도록 새 렌더 컴포넌트 하나만 공유). 고를 목록은 `useChannels()`가 이미 들고 있는
  채널·글 데이터를 그대로 쓴다(추가 구독 없음).
- **파일**: `+파일` → 기존 `uploadAttachment` 그대로 사용, 결과를 `attachments` 배열에
  추가(질문 2 답변대로 데이터 모델은 안 바꾼다). `AttachmentPicker.jsx`의 폼형 UI(파일첨부
  버튼 + 링크 붙여넣기 입력칸)는 `PostComposer.jsx`에서 뺀다 — 대신 제목 바로 아래에
  얇은 칩 줄(아이콘+파일명+용량, ×로 제거)만 남긴다. "링크 붙여넣기" 입력칸은 삭제하고
  대체하지 않는다(하이퍼링크는 1단계의 선택 서식 도구 '링크'로 충분 — 텍스트를 골라
  주소를 문다).

### 4단계 — 표지(Cover)

- 캔버스 맨 위(목차보다도 위, 제목 필드보다는 아래—본문 캔버스 영역의 시작)에 배너
  자리. 비어 있으면 "+ 표지 추가" 텍스트 버튼만, 있으면 이미지 + 마우스 오버 시
  "바꾸기"/"삭제".
- 업로드는 `uploadAttachment` 재사용(동일 Storage 경로 패턴). 새 필드
  `coverImageUrl`/`coverImagePath`를 `workRequests.js`의 `newRequestPayload` 기본값에
  추가(둘 다 `null` 기본).
- `PostDetail.jsx`(읽기 화면) 맨 위에 표지가 있으면 그린다 — 작은 추가만.

### 5단계 — 자동저장 + 알림 보내기 (가장 큰 동작 변화)

- `PostComposer.jsx`에서 "보내기"/"취소" 버튼과 `canSave`/`blockReason` 게이팅,
  `discardAndLeave`/`keptFiles` 정리 로직을 **없앤다** — 더 이상 저장을 막거나 되돌릴
  필요가 없다(무엇을 올리든 그 순간 이미 저장된 문서에 딸린 것이라 "취소해서 지운다"가
  성립하지 않는다).
- **생성 트리거**: 제목·본문·대상·표지·첨부 중 무엇이든 처음 바뀌는 순간(첫 dirty)
  `setDoc`으로 즉시 문서를 만든다 — 디바운스 없이 1회. 만들자마자 기존
  `onSaved(requestId)`을 호출해 `Channels.jsx`가 주소를 `/new`에서 실제 캔버스 주소로
  조용히 바꾼다(이미 있는 배선, 손 안 댐).
  단, **완전히 빈 상태**(제목 공백 + 본문 비어 있음 + 표지 없음 + 첨부 없음)에서는 아직
  안 만든다 — Notion처럼 "빈 문서가 즉시 생긴다"까지는 가지 않는다(목록·탭에 제목 없는
  글이 쌓이는 걸 막는다).
- **갱신**: 문서가 있으면 이후 모든 변경을 약 700ms 디바운스로 `updateDoc`.
- **대상 0명**은 더 이상 저장을 막지 않는다 — 대신 대상 줄 옆에 "아직 아무에게도 가지
  않습니다" 같은 경고 문구만 상시 표시(막지 않고 알리기만, 기존 `blockReason` 문구를
  재활용).
- 저장 상태 표시: "저장됨"/"저장 중…" 작은 텍스트(제목 옆 또는 상단 오른쪽).
- **알림 보내기** 버튼 신설(상단, 요청/안내·마감일 옆) → 기존
  `apps/dashboard/src/lib/channelActions.js`의 `shareCanvasToChannel({ schoolId,
  targetChannelId: channel.id, post: {id, title, channelId}, author, note: '' })`를
  **그대로** 호출한다(같은 채널로 "전달"하는 것과 동일한 함수 — 새 백엔드 로직 불필요).
  이 호출이 채널 메시지 탭에 `refRequestId`가 걸린 메시지를 만들고 `lastMessageAt`을
  갱신해 다른 참여자 사이드바에 안읽음 점이 뜬다. 여러 번 눌러도 매번 새 메시지가
  쌓인다(토글 아님).

## 건드리는 파일 요약

| 파일 | 변경 |
|---|---|
| `apps/dashboard/src/components/CanvasEditor.jsx` | **신설(1단계 완료)**. RichTextEditor.jsx 포팅 + 툴바 제거 + 선택 서식 도구. 2~3단계에서 목차·표·칩·삽입 추가 예정 |
| `apps/dashboard/src/components/RichTextEditor.jsx` | 변경 없음 (쪽지 전용으로 계속 씀) |
| `apps/dashboard/src/components/SlashMenu.jsx` | 1단계: 제목 3단(h1/h2/h3 항목 라벨·매핑 조정). 3단계: `extraItems` prop 추가 예정 |
| `apps/shared/lib/richText.js` | 1단계: `ALLOWED_TAGS`에 `h4`, `htmlToText` 정규식 확장. 3단계: 표 태그·`data-date` 추가 예정 |
| `apps/dashboard/src/components/richTextStyles.js` | 1단계: `& h4` 스타일 추가 |
| `apps/shared/lib/workRequests.js` | 4단계: `newRequestPayload`에 `coverImageUrl`/`coverImagePath` 기본값 추가 예정 |
| `apps/dashboard/src/components/PostComposer.jsx` | 1단계: `CanvasEditor`로 교체. 3~5단계: 첨부 칩 줄, 표지 UI, 자동저장 엔진, 알림 보내기 예정 |
| `apps/dashboard/src/components/PostDetail.jsx` | 4단계: 표지 렌더 추가, (필요시) 캔버스삽입 카드 렌더 공유 예정 |
| `apps/dashboard/src/components/AttachmentPicker.jsx` | 변경 없음(다른 곳에서 쓰는지 3단계에서 확인) |

## 이번 범위가 아닌 것 (명시적으로 미룸)

- 날짜 칩의 실제 알림 발송(예약 실행 백엔드)
- 표의 행·열 삭제, 셀 병합
- 목차의 드래그 재정렬(단순 클릭-이동 목록만)
- 쪽지(`NoticeComposeModal.jsx`) 쪽 에디터 개선 — 완전히 별개로 남긴다

## 검증

- 매 단계 `npm test`(기존 239개 회귀 확인) + `npm run build:dashboard`.
- 브라우저 수동 확인은 실제 교사 계정 로그인이 필요해 직접 클릭 검증은 못 한다 —
  단계별 배포 후 사용자가 실제로 캔버스를 하나 써보고 피드백을 주는 방식으로 검증한다.
- 5단계(자동저장) 배포 전에는 특히 "완전히 빈 새 글 만들고 아무것도 안 쓰고 다른 탭
  클릭" 같은 경계 케이스를 사용자가 한 번 확인해 주면 좋다 — 문서가 안 만들어져야 정상.
