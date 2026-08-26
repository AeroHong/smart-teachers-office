# 캔버스 에디터 — 노션 스타일 블록 편집

## Context

캔버스 편집기(`CanvasEditor.jsx`)는 지금까지 "문단을 통째로 입력하는 일반
편집기"에 가까웠다 — 텍스트를 드래그로 고르면 서식 버블이 뜨고 `/`나 하단
알약 `+`로 블록을 끼워 넣을 수 있었지만, 문단 하나하나를 독립된 단위로
다루는 기능(호버 손잡이, 손잡이로 순서 바꾸기, 삭제·복제·변환)은 없었다.
사용자가 노션·Slack 캔버스를 보여주며 "완전 업데이트"를 요청(2026-08-26,
본인 표현 "프로그램의 디테일을 결정하는 결정적인 업데이트").

여러 차례 질문으로 범위를 4단계로 확정(자세한 조사 근거는 Claude Code
plan 파일 히스토리 참고, 요약만 아래):

- 블록 메뉴: 삭제·복제·변환 (색상/배경은 없음)
- 기존 "텍스트 드래그 선택 → 서식 버블"은 그대로 유지, 완전히 별개 기능
- 체크리스트(할 일) 블록도 같이
- 손잡이 영역 오른쪽에 반응(이모지 리액션)
- 블록 댓글 — 3단 오른쪽 사이드바, 입력은 MessageComposer.jsx 재사용

## 재사용한 기존 패턴

- `picked`/`measure()`/`clipRect()`(이미지 리사이즈 손잡이) — "떠 있는 요소를
  특정 DOM 노드 rect에 고정, scroll/resize에 재측정"하는 패턴을 블록 손잡이에도
  그대로 씀.
- `startResize`의 포인터 기반 드래그(`pointermove`/`pointerup`, HTML5
  Drag-and-Drop API 안 씀 — contentEditable 안에서 텍스트 선택 드래그와
  충돌 위험).
- `applyBlock`/`applyList`의 태그 집합 — 다만 커서 위치(`readLine()`) 대신
  손잡이로 고른 블록을 직접 받는 새 버전(`convertBlock`)을 씀.
- `PostComments.jsx`/`apps/shared/lib/comments.js`(`requests/{id}/comments`) —
  블록 댓글은 이 시스템을 `blockId` 필드로 확장(Phase 4).
- `richText.js`의 `data-*` 허용 속성 패턴(dateChips.js·canvasRefCard.js·
  channelMentionChip.js와 같은 자리) — 체크리스트·블록 ID도 여기 추가.

## Phase 1 — 블록 호버 손잡이 + 메뉴(삭제·복제·변환) + 드래그 재배치 ✅ 완료(2026-08-26)

- **대상**: 에디터 직계 자식만(목록 항목 개별 드래그는 범위 밖).
- **호버 감지**: `findTopBlock()` — 태그 선택자가 아니라 "부모가 정확히
  에디터 루트인 조상까지 거슬러 올라가는" 방식. 콜아웃(aside) 안에 문단이
  한 겹 더 있어서(SlashMenu.jsx의 callout html) 태그 선택자로는 안쪽 문단이
  잡혀버린다.
- **손잡이**: `⋮⋮`(DragIndicatorIcon) — `hoveredBlock.rect` 왼쪽에 고정.
- **클릭 vs 드래그 구분**: `handleHandlePointerDown`에서 4px 이상 움직이면
  드래그, 아니면 클릭(메뉴).
- **메뉴**: 복제(`cloneNode` + `after`) · 삭제(`remove`) · 변환(문단·제목
  3단계·목록 2종·인용만, `CONVERTIBLE_TAGS`로 표·이미지·콜아웃·구분선은
  변환 항목 자체를 숨김).
- **드래그**: 형제 rect 중간값과 커서 y좌표를 비교해 삽입 위치 계산, 얇은
  파란 선으로 표시, `pointerup`에서 실제 `insertBefore`/`appendChild`.
- 배포 완료(`hosting:dashboard`). 브라우저 로그인이 안 돼 직접 클릭 검증은
  못 함 — 코드 리뷰로 안전성 확인 후 배포, 사용자가 실사용 확인 예정.

### Phase 1 피드백 라운드 1~2 — 2026-08-26

- 손잡이가 텍스트 위에서 편집기 밖(손잡이)으로 이동하면 그 사이 빈 틈에서
  mouseleave가 먼저 터져 클릭이 안 됐다 → mousemove/mouseleave를 편집기가
  아니라 편집기+손잡이를 함께 감싸는 바깥 칸으로 옮기고, 180ms 지연 취소
  방식(hoverClearTimer)으로 정리.
- 블록 감지를 `e.target` 히트테스트에서 "커서 y좌표가 어느 직계 자식의
  세로 범위 안에 있는가"(`findTopBlockAtY`)로 바꿔 좌우 여백에서도 손잡이가
  뜨게 함.
- 표: 행/열 삭제(마지막 것만, 최소 1개 유지) + 전체 폭 조절(오른쪽 아래
  손잡이) → 이어서 칸(열)별 너비 조정(첫 행 경계 드래그, `tableLayout:
  'fixed'` 필요) + 행/열 선택 후 드래그 이동(표 왼쪽/위쪽 손잡이, 열 이동은
  모든 행의 같은 인덱스 칸을 함께 옮김) 추가.
- 목차가 캔버스 안 제목 텍스트 뒤로 가려짐 → sticky 칸에 명시적
  `zIndex:20` 부여로 해결. 이전 라운드에서 168px 고정폭 글자 목록 → 제목
  단계별 길이만 다른 막대 + 호버 시 absolute 오버레이로 축약(레이아웃
  안 밀림).

### Phase 1 피드백 라운드 3 — 우클릭 재설계 + 표지 + 2026-08-26

- 표지(커버) 예약 자리 추가 — 목차와 같은 flex 형제 칸 맨 위, 목차·표지가
  같은 높이에서 시작(사용자 요청 여러 차례로 위치 확정). 평소엔 안 보이고
  호버 시 "+표지 추가"만 옅게, 클릭하면 "준비 중" — 실제 업로드는 Phase 4
  이후.
- 제목을 PostComposer.jsx(캔버스 바깥)에서 CanvasEditor.jsx 안으로 옮김 —
  목차가 있으면 본문만 목차 칸만큼 밀려 제목과 왼쪽 여백이 달랐던 문제.
  이제 표지·제목·본문이 모두 같은 flex 칸을 공유.
- 우클릭을 삽입 메뉴('/'·'+'와 같은 SlashMenu)에서 블록 컨텍스트 메뉴
  (blockMenu — 손잡이 클릭과 동일: 복제·삭제·변환)로 교체. 콜아웃일 때만
  배경색 팔레트(7가지, data-callout-color) 추가. 반응·코멘트는 Phase 3·4
  몫이라 이번엔 제외(사용자 확인).
- 표 행 손잡이를 바깥 레인(-40px)에서 다시 표 옆(-22px)으로, 행 드래그 중
  커서를 따라다니는 실제 행 내용 미리보기 추가.
- 블록 손잡이는 원래 아이콘(⋮⋮) 유지, 표 안 행·열 손잡이만 회색 막대
  디자인으로 분리.

## Phase 2 — 체크리스트(할 일) 블록 ✅ 완료(2026-08-26)

`CANVAS_EXTRA_ITEMS`의 "리스트"(`action:'comingSoon'` 스텁)를 실제 구현 —
`/`·`+` 알약·하단 리스트 아이콘 세 경로 모두 `insertChecklist()`로 연결.
`<li data-todo data-checked="false"><span data-todo-check
contenteditable="false"></span>...</li>` + `richTextStyles.js` CSS로 체크
표시(`::after`), 클릭 시 `data-checked` 토글(`handleEditorClick` 우선 분기).
`<input type="checkbox">` 대신 `data-*`를 쓴 이유는 `ALLOWED_TAGS`에 `input`을
새로 안 늘리고 기존 토글 패턴(dateChips.js)과 통일하려는 것. Enter 키를
가로채 새 항목을 직접 구성(브라우저 기본 li 복제는 체크박스 누락·완료 상태
복사 문제) — 빈 항목에서 Enter는 목록을 빠져나감. 읽기 화면(PostDetail)에서
클릭해 체크하는 것은 이번 범위 밖(편집 중에만).

## Phase 3 — 블록 ID + 반응(이모지 리액션) ✅ 완료(2026-08-26)

`requests/{id}/blockReactions/{blockId}` 서브컬렉션, `{[emoji]: [uid,...]}`,
`arrayUnion`/`arrayRemove`로 토글. **자동저장(PostComposer 700ms 디바운스)과
같은 문서에 안 넣는 이유**: 다른 사람의 반응 클릭과 글쓴이의 자동저장이
같은 문서에서 겹치면 서로 덮어쓴다 — 댓글과 같은 이유로 서브컬렉션 분리.

**계획 대비 바뀐 점 — ID 부여 시점.** 원래 "반응을 처음 누를 때만 생성"으로
적었지만, 구현하다 보니 그 방식은 "여러 명이 반응"과 충돌한다는 게 드러났다
— 반응은 캔버스를 쓴 사람(글쓴이)만이 아니라 채널의 누구나 남길 수 있어야
하는데, 다른 사람은 읽기 화면(PostDetail)만 보고 bodyHtml을 저장할 권한이
없어 자기가 처음 반응을 누른 블록에 ID를 새로 박아 저장할 방법이 없다.
그래서 `CanvasEditor.jsx`의 `emit()`마다(`ensureBlockIds`) 직계 자식 블록
전부에 미리 `data-block-id`를 매겨 저장하도록 바꿨다 — 글쓴이가 뭐라도
고칠 때마다 모든 블록에 ID가 이미 있는 상태가 되고, 그 뒤로는 누가 반응을
눌러도(읽기 화면 포함) 기존 ID에 반응 문서만 붙이면 된다. `duplicateBlock`은
복제본의 ID를 지워 다음 emit()이 새로 매기게 하고, `convertBlock`은 태그를
바꿔도 기존 ID를 새 엘리먼트로 옮겨 반응이 고아가 되지 않게 한다.
`richText.js`의 `ALLOWED_ATTR`에 `data-block-id` 추가.

**UI 배치.** 손잡이(⋮⋮, 왼쪽)와 마주 보는 블록 오른쪽에 반응 묶음을 둔다.
이미 반응이 하나라도 달린 블록은 호버와 무관하게 늘 알약 줄("👍 3")을
보여준다(`useBlockReactionRects` — picked/pickedTable과 같은 "rect에 고정"
패턴, scroll/resize/본문 변경마다 다시 잰다). 아직 반응이 없는 블록은
CanvasEditor에서 호버 중일 때만 "+반응" 단추가 뜬다(처음 반응은 글쓴이가
편집 중에 남기는 경로로 좁혔다 — 읽기 화면에 모든 블록마다 옅은 "+"를 늘
띄우면 산만해진다는 판단, 사용자 확인 없이 구현 중 내린 보수적 선택이라
나중에 바꿀 수 있음). `BlockReactionRow`/`useBlockReactions` 컴포넌트를
CanvasEditor·PostDetail 양쪽에서 재사용 — 읽기 화면은 이미 반응이 달린
블록만 보여준다(같은 이유).

**Firestore 규칙.** `comments`처럼 삭제 규칙은 없다(orphan 허용, 같은 이유).
쓰기는 `completedUids`와 같은 `selfOnlyUidChange` 패턴을 이모지 6개 각각에
반복 적용 — 한 번에 정해진 이모지 필드 하나에서만 내 uid를 넣고 뺄 수 있다.
이 PC에 Java가 없어 `npm run test:rules`를 못 돌렸다(기존 라운드들과 같은
제약) — 코드 리뷰로 안전성을 확인하고 배포 전 사용자 확인을 거쳤다.

### Phase 3 피드백 라운드 — 2026-08-26

- 반응 단추가 마우스를 피해 도망감 — ⋮⋮ 손잡이에는 있던 `data-block-handle`
  표식이 반응 단추엔 없어, 단추 위에서도 `handleEditorMouseMove`가 계속
  `findTopBlockAtY`로 블록을 다시 찾다가 다음 블록으로 넘어가 버렸다(사용자
  확인, "마우스커서를 살짝 내리면 아래 줄로 넘어가 버리네"). 손잡이와 같은
  표식을 달아 마우스가 위에 있는 동안 재배정을 멈추게 했다.
- 이모지 팝오버가 열자마자 마우스만 움직여도 닫힘 — 팝오버를 반응 단추
  컴포넌트 자체의 상태로 관리했는데, 그 단추가 `hoveredBlock` 조건부 렌더
  칸 안에 있어서 마우스가 살짝만 움직여 `hoveredBlock`이 바뀌면 칸째로
  사라지며 팝오버도 같이 닫혔다(사용자 확인, "그때부터는 마우스가 움직여도
  계속 해당 이모지 창이 떠있어야 함"). `blockMenu`(Menu, anchorPosition)와
  같은 방식으로 팝오버 상태(`reactionPicker`)를 `hoveredBlock`과 무관한
  최상위 상태로 옮기고, 새 `ReactionPicker` 컴포넌트로 독립적으로 렌더한다.
- 반응 묶음이 본문 오른쪽 끝에 바짝 붙어 보임 — 본문이 칸 끝까지 꽉 차 있어
  자리가 없었다. `CanvasEditor.jsx` 편집 영역의 오른쪽 padding만 늘렸다
  (왼쪽은 그대로 — 표지·제목과 왼쪽 여백을 맞춰야 한다).

## Phase 4 — 블록 댓글(3단 오른쪽 4번째 칸) ✅ 완료(2026-08-26)

`comments.js`에 `bodyHtml`(서식 있는 본문 — `channelMessages.js`의
`newMessagePayload`와 같은 방식으로 `htmlToText`가 평문 사본 `body`를 뽑는다)
과 `blockId`(null이면 글 전체 댓글, 있으면 그 블록 댓글)를 추가했다. 컬렉션은
하나로 유지하고 새 `commentsForBlock()`으로 걸러 보여준다 — "이 글에 달린
모든 이야기"라는 성격은 같다. `firestore.rules`의 `comments` 규칙은 필드
목록을 제한하지 않는 규칙이라(`hasOnly` 없음) **변경 없이 그대로 통과한다.**

`PostComments.jsx`의 입력창을 `TextField`에서 `MessageComposer.jsx`로
바꿨다(사용자 명시 요청) — 굵게·목록·`@`멘션을 댓글에도 쓸 수 있다(`#`채널은
목록을 안 넘겨 사실상 안 씀). `compact` prop으로 글 상세 맨 아래(기존 모양,
문서 흐름을 따라 스크롤)와 오른쪽 패널(목록만 스크롤, 입력창 고정 — `ChannelMessages.jsx`
와 같은 뼈대) 두 모양을 같은 컴포넌트로 그린다 — 갈라 만들면 목록·삭제·정화
로직을 두 벌 유지해야 한다.

새 `BlockCommentsPanel.jsx`가 3단 오른쪽 4번째 칸이다. `WorkspaceLayout.jsx`
자체는 안 건드렸다 — 레일·사이드바처럼 늘 있는 칸이 아니라 블록 하나를 고를
때만 뜨는 칸이라, `Channels.jsx`가 `PostComposer`/`PostDetail`을 감싸는
바깥에서 조건부로 그린다(원래 계획대로).

**댓글 아이콘 배치 — 반응(Phase 3)과 같은 트레이드오프.** `CanvasEditor`
(글쓴이, 편집 중)는 손잡이 영역에서 호버 중인 블록마다 반응 옆에 댓글
아이콘이 뜬다 — 처음 누르는 사람이 그 블록의 ID를 확정한다(반응과 같은
`ensureHoveredBlockId`). `PostDetail`(읽기 화면)은 **이미 댓글이 달린
블록에만** 늘 보이는 아이콘을 띄운다(`useBlockCommentCounts` +
`useBlockReactionRects`를 그대로 재사용 — 이름은 반응 전용처럼 보이지만
`[data-block-id]` rect를 재는 범용 훅이라 그대로 썼다). **아직 댓글이
하나도 없는 블록에 첫 댓글을 남기는 것은 이번에도 편집기 쪽(글쓴이) 몫으로
좁혔다** — PostDetail에는 캔버스처럼 마우스로 블록을 훑는 장치가 없어, 모든
블록마다 옅은 "+"를 늘 띄우면 산만해진다는 같은 판단(사용자 확인 없이
구현 중 내린 보수적 선택, 나중에 바꿀 수 있음). 반응과 마찬가지로 "되묻는
말"이 글쓴이가 아닌 사람에게서 더 많이 나올 수 있다는 점에서 아쉬운 제약
이지만, 일단 이 범위로 배포하고 필요하면 다음 라운드에서 넓힌다.

## 이번 계획에서 안 하는 것

- 목록 항목(li) 개별 드래그, 블록 배경색.
- 읽기 화면(PostDetail)에서 체크리스트 토글(편집 중에만).
- 반응·댓글 알림(데스크톱 알림 연동) — 다음 라운드.
