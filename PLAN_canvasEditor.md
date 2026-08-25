# 글쓰기 캔버스 — Notion/Slack 캔버스 스타일 재설계

> 상태: **1~3, 5단계 완료(2026-08-26).** 4단계(표지)만 남음 — 사용자가 5단계(자동저장)를
> 먼저 요청해 순서를 앞당겼다. 아래 "1~3단계 사용자 피드백 반영" 절도 참고.
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

### 3단계 — "+" 삽입 통합 + 표 · 날짜 칩 · 캔버스 삽입 · 파일 ✅ 완료(2026-08-26)

- **"+" 버튼과 "/" 를 같은 메뉴로 합쳤다.** `SlashMenu`에 `extraItems` prop을 추가했고
  (기본값 빈 배열이라 쪽지 쪽 `RichTextEditor`는 그대로), `CanvasEditor`가
  `CANVAS_EXTRA_ITEMS`(표·날짜·캔버스·파일·리스트)를 얹어 넘긴다. 캔버스 스크롤 영역
  안에 `position: sticky; bottom`인 "+" 아이콘 버튼을 눌러도 같은 메뉴가 뜬다 — 버튼의
  화면 위치를 `menuRect`로 넘기는 방식이라(우클릭 메뉴와 완전히 같은 경로), 위치 계산·
  키보드 탐색을 다시 짤 필요가 없었다.
- **표**: "표" 항목 → `applyHtml`로 3×3 `<table>`을 직접 만들어 끼운다(커서는 첫 셀로).
  표 안을 클릭하면(이미지 손잡이와 같은 클릭-고르기 패턴) 표 바깥에 "행 추가"/"열 추가"
  단추가 뜬다 — `pickedTable` 상태 + `measureTable()`이 이미지의 `picked`/`measure()`와
  똑같은 구조다. 행·열 삭제·셀 병합은 계획대로 범위 밖.
  → `richText.js`의 `ALLOWED_TAGS`에 표 태그, `htmlToText`에 `</tr>`→줄바꿈·
  `</td>`·`</th>`→공백 처리 추가. `richTextStyles.js`에 표 테두리·간격(태그 선택자로 —
  inline style은 sanitizeHtml이 color만 남기고 지운다).
- **날짜 칩(리마인더)**: 새 `apps/shared/lib/dateChips.js` — `chipDateInfo(dateStr)`가
  "D-2"/"오늘"/"3일 지남" 라벨과 색을 계산하고, `hydrateDateChips(root)`가 컨테이너 안의
  `[data-date]` 칩을 전부 다시 그린다. **편집기(CanvasEditor의 `emit()`)와 읽기 화면
  (PostDetail.jsx, `request.bodyHtml`이 바뀔 때) 양쪽에서 부른다** — 그래야 며칠 뒤에
  다시 열어도 그날 기준으로 맞다. 저장하는 것은 `data-date="YYYY-MM-DD"`뿐, 문구는
  절대 저장하지 않는다.
  `<input type="date">`는 실제 포커스가 필요해 색 팔레트처럼 `onMouseDown` 방어로 선택을
  지킬 수 없었다 — 열 때 `window.getSelection()`의 Range를 복제해 두고, 확정할 때
  되살려 넣는 방식으로 풀었다(`savedRangeRef`).
  **범위 명시대로 시각적 칩까지만** — 실제 알림 발송은 안 만들었다.
- **캔버스 삽입**: React 컴포넌트를 그대로 재사용하지는 못했다 — `dangerouslySetInnerHTML`은
  원시 HTML만 받아서, ChannelMessages.jsx의 `CanvasCard`를 직접 끼워 넣을 방법이 없었다.
  대신 새 `apps/shared/lib/canvasRefCard.js`가 마크업 생성 함수(`canvasRefCardHtml`)와
  클릭 대상 판정 함수(`canvasRefTarget`)를 내보내, 편집기·읽기 화면이 **같은 함수**로
  같은 모양을 만들고 같은 방식으로 클릭을 처리한다 — "컴포넌트 하나 공유"의 취지는
  살리되 저장 형식(HTML 문자열)에 맞게 방법을 바꿨다. 편집기 안에서는
  `contenteditable="false"`라 통째로 한 덩어리로만 다뤄지고(클릭해도 이동 안 함),
  PostDetail.jsx는 본문 컨테이너에 클릭 위임(`handleBodyClick`)을 달아 카드를 누르면
  그 글로 이동한다. 후보 목록은 `channel.posts`(부모가 이미 `useChannels()`로 들고
  있던 것)를 그대로 내려받는다 — 추가 구독 없음. **다른 채널까지는 이번엔 안 넣었다**
  (이 채널 것만) — 여러 채널을 오가며 고르는 UI는 범위를 더 키워서, 필요해지면 따로 본다.
- **파일**: `+파일` → 기존 `uploadAttachment` 그대로, 결과는 `attachments` 배열에 추가
  (데이터 모델 그대로). `PostComposer.jsx`에서 `AttachmentPicker`를 뺐다 — 대신 제목·
  대상 영역 바로 아래에 얇은 칩 줄(아이콘+파일명+용량, ×로 제거)만 남았다. "링크
  붙여넣기" 입력칸은 대체 없이 없앴다(하이퍼링크는 선택 서식 도구 '링크'로 충분).
  `AttachmentPicker.jsx` 파일 자체는 쪽지(`NoticeComposeModal.jsx`)가 여전히 써서
  손대지 않았다.

### 1~3단계 사용자 피드백 반영 (2026-08-26, 5단계보다 먼저 처리)

1~3단계를 배포한 뒤 실제로 써보고 받은 피드백 넷. 4단계(표지)보다 먼저, 5단계와
같은 라운드에서 처리했다.

- **"+" 아이콘을 눌러도 반응이 없던 버그** — `menuRect`를 열 때 그 클릭이 `window`까지
  올라가면, 메뉴가 열려 있는 동안 바깥 클릭을 감시하던 `useEffect`(`window.
  addEventListener('click', close)`)가 **같은 클릭**을 "바깥 클릭"으로 오인해 열자마자
  닫아버렸다. 우클릭(`contextmenu`)으로 열 때는 이벤트 종류가 달라 안 걸리던 문제가,
  "+" 버튼을 진짜 `click`으로 여는 순간 드러났다. `e.stopPropagation()`으로 고쳤다 —
  이 클릭이 애초에 `window`까지 안 올라가게 막는다.
- **"+" 버튼을 캡처 화면(사용자가 로컬 스크린샷으로 제공)과 비슷하게** — Slack 캔버스의
  알약 모양 도구줄(초록 원형 '+' + 아이콘 몇 개가 한 줄)을 참고해 다시 그렸다. 초록
  '+'는 전체 삽입 메뉴를 그대로 열고, 옆에 이미지·파일·표·리스트를 자주 쓰는 것만
  개별 아이콘으로 바로 실행하게 뒀다. 캡처에 있던 "Aa"(글자 스타일)·이모지는 대응하는
  기능이 아직 없어 넣지 않았다("비슷하게"로 해석 — 캡처를 그대로 베끼기보다 있는
  기능만 같은 언어로 표현).
- **제목도 캔버스 영역으로** — `PostComposer.jsx`의 제목 입력을 고정 헤더(요청/안내·
  마감일이 있던 자리)에서 스크롤되는 캔버스 흐름 맨 위로 옮겼다. 밑줄을 없애고
  글자를 키워(1.6rem/800) 입력 상자가 아니라 캔버스 위에 놓인 큰 제목처럼 보이게
  했다 — 노션 페이지를 열면 곧바로 "제목을 쓰는 상태"가 되는 것과 같은 인상. 대상·
  요청/안내·마감일은 설정값이라 그대로 고정 칸에 남았다(제목만 "글의 일부"로 옮김).
- **홈이 빈 3단으로 떨어지는 문제** — 이건 캔버스 자체가 아니라 `Channels.jsx`(P3-3
  홈 재구성) 쪽 버그라 `PLAN_channels.md`에 따로 적었다. 요지: `/`(홈)에 채널 id 없이
  들어오면 직전에 보던 채널(localStorage) 또는 전체 공지로 즉시 돌린다 — "3단이
  비어 보이는 순간"을 없앴다.

### 1~3단계 사용자 피드백 반영 2차 (2026-08-26)

한 라운드 더 실사용 피드백을 받아 고쳤다.

- **제목에서 Enter → 본문으로 이어지지 않던 문제**: 제목이 한 줄짜리 `TextField`라
  Enter가 아무 일도 안 했다. `CanvasEditor`를 `forwardRef`로 바꿔 `focus()`를 내주고
  (`useImperativeHandle`), 제목의 `onKeyDown`에서 Enter를 가로채 본문에 포커스를 준다.
- **캔버스 삽입 카드를 눌러도 반응 없던 문제**: 읽기 화면(PostDetail)에서는 원래도
  됐지만, **편집기 안에서 막 넣은 카드를 누르면 의도적으로 아무 일도 안 하게
  해뒀었다**(설계 당시엔 "편집 중엔 이동 안 함"이 맞다고 판단) — 실사용해보니 방금
  넣은 카드가 진짜 그 글을 가리키는지 그 자리에서 확인하고 싶어진다는 게 더 컸다.
  `onOpenCanvasRef` prop을 새로 뚫어(`Channels.jsx` → `PostComposer.jsx` →
  `CanvasEditor.jsx`, `ChannelMessages.jsx`의 `onOpenCanvas`와 같은 자리) 편집 중에도
  카드를 누르면 그 글로 이동하게 했다.
- **"+" 알약 도구줄을 캔버스 가로 중앙으로**: `position: sticky` 칸을 폭 전체로 두고
  `justifyContent: center`, 알약 자체는 그 안에서 내용만큼만 차지하게 바꿨다.
- **"+"를 눌렀을 때 뜨는 메뉴를 "위쪽 서랍" 느낌으로** — 아직 안 했다. 지금도
  아래쪽 공간이 모자라면 위로 뜨긴 하지만(SlashMenu의 기존 위치 계산), 폭·모양을
  드로어처럼 다듬는 건 사용자가 마지막에 짚은 "2·3단 전반 디자인 재검토"(사이드바
  폭·글씨 크기·상단 검색/알림/사용자 표시줄)와 한 라운드로 묶어서 보기로 했다 —
  둘 다 "톤을 다시 잡는" 성격이 같아서 따로따로 손보면 두 번 다시 만지게 된다.
- **다른 채널의 캔버스까지 검색해서 붙이는 것(Slack처럼)**: 사용자가 "고민"이라고
  명시 — 지금 범위에 안 넣었다. 검색·미리보기(가리키는 캔버스의 첫 부분을 살짝
  보여주는 것)까지 가면 검색 인프라가 필요해 별도 과제로 크다.
- **알림 메시지 스레드의 생김새**: 지금은 기본 카드 모양(제목만) 하나뿐이다. 어떻게
  꾸밀지는 사용자가 "추후 고민"이라고 명시 — 결정 남.
- **"작성 중이던 캔버스로 돌아왔을 때 제출현황이 아니라 계속 작성 화면이 나와야
  한다"** — 아직 안 했다. 겉보기엔 간단해 보이지만, 지금 제출현황
  (완료 N/M명·미완료 명단·다시 알림·마감하기)은 **글쓴이가 자기 요청을 관리하는
  유일한 자리**다(PostComposer엔 이 기능이 전혀 없다). "글쓴이가 캔버스를 열면 무조건
  편집기로 보낸다"로 단순하게 풀면, 이미 다 써서 발송하고 며칠 지난 요청을 관리하려고
  열 때도 편집기로 튕겨 관리 기능에 손을 못 대는 회귀가 생긴다. 무엇으로
  "아직 쓰는 중"과 "다 쓰고 이제 관리만 하는 중"을 가를지부터 정해야 해서 사용자에게
  다시 물었다(다음 대화 참고).

### 4단계 — 표지(Cover) — 아직 안 함

- 캔버스 맨 위(목차보다도 위, 제목 필드보다는 아래—본문 캔버스 영역의 시작)에 배너
  자리. 비어 있으면 "+ 표지 추가" 텍스트 버튼만, 있으면 이미지 + 마우스 오버 시
  "바꾸기"/"삭제".
- 업로드는 `uploadAttachment` 재사용(동일 Storage 경로 패턴). 새 필드
  `coverImageUrl`/`coverImagePath`를 `workRequests.js`의 `newRequestPayload` 기본값에
  추가(둘 다 `null` 기본).
- `PostDetail.jsx`(읽기 화면) 맨 위에 표지가 있으면 그린다 — 작은 추가만.

### 5단계 — 자동저장 + 알림 보내기 ✅ 완료(2026-08-26, 사용자 요청으로 4단계보다 먼저)

- `PostComposer.jsx`에서 "보내기"/"취소" 버튼과 `canSave`/`blockReason` 게이팅,
  `discardAndLeave`/`keptFiles`(고아 파일 정리) 로직을 없앴다 — 자동저장이라 "취소해서
  지운다"가 더는 성립하지 않는다.
- **생성 트리거**: 제목·본문·대상·요청/안내·마감일·첨부 중 무엇이든 처음 바뀌는 순간
  (첫 dirty) `setDoc`으로 즉시 문서를 만든다 — 디바운스 없이 1회(`created ? 700 : 0`
  타이머). 완전히 빈 상태(제목 공백 + 본문 비어 있음 + 첨부 없음)에서는 아직 안
  만든다(`isEmptyHtml` 재사용) — 제목 없는 빈 문서가 채널 탭에 쌓이지 않게.
- **문서가 막 생긴 순간의 함정**: 만들자마자 `onSaved(requestId)`로 주소를 `/new`에서
  `/channels/:channelId/:requestId/`**`edit`**로 바꾼다(처음 계획은 `/edit` 없는 보기
  주소였는데, 그러면 `Channels.jsx`가 `PostComposer` 대신 `PostDetail`을 그려 한창
  쓰는 중인 화면이 읽기 화면으로 튕겨버렸다 — 고쳐서 `/edit`로). 이 주소 전환이
  `editingId`를 `undefined→실값`으로 바꾸면서, "고칠 글 읽어오기" 이펙트가 방금 만든
  문서를 곧바로 다시 읽어와 그사이 친 글자를 덮어쓸 뻔했다 — `justCreatedRef` 플래그로
  그 재조회를 딱 한 번 건너뛰게 막았다.
- **갱신**: 문서가 있으면 이후 모든 변경을 700ms 디바운스로 `updatePostContent`.
- **화면을 떠날 때(unmount) 안전망**: 디바운스가 아직 안 끝났어도 마지막 상태를 한 번
  더 조용히(`silent`) 저장한다 — 타이핑 직후 곧바로 다른 채널을 눌러도 700ms 안의
  마지막 몇 글자까지 지켜진다. `silent` 모드는 `onSaved`(→navigate)도, 화면 상태
  갱신도 하지 않는다 — 이미 다른 곳으로 이동한 사용자를 방금 쓴 글로 도로 튕기면
  안 되기 때문이다.
- **대상 0명**은 더 이상 저장을 막지 않는다 — 대신 대상 줄이 "⚠ 대상이 없습니다 —
  아직 아무에게도 가지 않습니다"로 바뀌어 상시 경고만 한다(막지 않고 알리기만).
- 저장 상태 표시: 하단 바 왼쪽에 "저장 중…"/"저장됨"/"저장하지 못했습니다".
- **알림 보내기** 버튼(하단 바 오른쪽) → 기존 `apps/dashboard/src/lib/channelActions.js`의
  `shareCanvasToChannel({ schoolId, targetChannelId: channel.id, post, author })`를
  그대로 호출(같은 채널로 "전달"하는 것과 동일한 함수 — 새 백엔드 로직 불필요). 채널
  메시지 탭에 `refRequestId`가 걸린 메시지를 만들고 `lastMessageAt`을 갱신해 참여자
  사이드바에 안읽음 점이 뜬다. 여러 번 눌러도 매번 새 메시지가 쌓인다(토글 아님).

## 건드리는 파일 요약

| 파일 | 변경 |
|---|---|
| `apps/dashboard/src/components/CanvasEditor.jsx` | **신설**. 1단계: 툴바 제거·선택 서식 도구. 2단계: 목차. 3단계: 표·날짜 칩·캔버스 삽입·파일·"+" 통합. 피드백: "+" 클릭 버그 수정, 알약 도구줄 재디자인. 4단계에서 표지 연동 예정 |
| `apps/dashboard/src/components/RichTextEditor.jsx` | 변경 없음 (쪽지 전용으로 계속 씀) |
| `apps/dashboard/src/components/SlashMenu.jsx` | 1단계: 제목 3단. 3단계: `extraItems` prop 추가(기본 빈 배열, 하위호환) |
| `apps/shared/lib/richText.js` | 1단계: `h4` 허용. 3단계: 표 태그, `data-date` 등 `ALLOWED_ATTR`, `htmlToText` 표 처리 |
| `apps/dashboard/src/components/richTextStyles.js` | 1단계: `& h4`. 3단계: 표·날짜 칩·캔버스 삽입 카드 스타일 |
| `apps/shared/lib/dateChips.js` | **신설(3단계)**. 날짜 칩 라벨·색 계산 + DOM 재렌더 |
| `apps/shared/lib/canvasRefCard.js` | **신설(3단계)**. 캔버스 삽입 카드 마크업 생성 + 클릭 대상 판정 |
| `apps/shared/lib/workRequests.js` | 4단계: `newRequestPayload`에 `coverImageUrl`/`coverImagePath` 기본값 추가 예정 |
| `apps/dashboard/src/components/PostComposer.jsx` | 1단계: `CanvasEditor`로 교체. 3단계: `AttachmentPicker` 제거, 얇은 첨부 칩 줄, `canvasOptions`/`onFileUploaded` 연결. 피드백: 제목을 캔버스로 이동. 5단계: 자동저장 엔진(`flushRef`), 알림 보내기, 저장 상태 표시. 4단계에서 표지 UI 예정 |
| `apps/dashboard/src/components/PostDetail.jsx` | 3단계: 날짜 칩 재계산(`hydrateDateChips`), 캔버스 삽입 카드 클릭 이동. 4단계: 표지 렌더 예정 |
| `apps/dashboard/src/components/AttachmentPicker.jsx` | 변경 없음 — 쪽지(`NoticeComposeModal.jsx`)가 여전히 써서 그대로 둠 |
| `apps/dashboard/src/pages/Channels.jsx` | 5단계: `onSaved`가 `/edit` 주소로 이동하도록 수정(보기 주소로 보내면 PostComposer가 PostDetail로 튕겨나가던 문제). 홈 기본 채널 리다이렉트는 `PLAN_channels.md` 쪽 변경 |

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
