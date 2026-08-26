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

## Phase 2 — 체크리스트(할 일) 블록 (예정)

`CANVAS_EXTRA_ITEMS`의 "리스트"(지금 `action:'comingSoon'`)를 실제 구현.
`<li data-todo data-checked="false">` + `richTextStyles.js` CSS로 체크
표시, 클릭 시 `data-checked` 토글. `<input type="checkbox">` 대신 `data-*`를
쓰는 이유는 `ALLOWED_TAGS`에 `input`을 새로 안 늘리려는 것.

## Phase 3 — 블록 ID + 반응(이모지 리액션) (예정)

`data-block-id` 부여(반응을 처음 누를 때만, 없으면 그때 생성해 즉시 저장).
`requests/{id}/blockReactions/{blockId}` 서브컬렉션, `{[emoji]: [uid,...]}`,
`arrayUnion`/`arrayRemove`로 토글. **자동저장(PostComposer 700ms 디바운스)과
같은 문서에 안 넣는 이유**: 다른 사람의 반응 클릭과 글쓴이의 자동저장이
같은 문서에서 겹치면 서로 덮어쓴다 — 댓글과 같은 이유로 서브컬렉션 분리.

## Phase 4 — 블록 댓글(3단 오른쪽 사이드바) (예정)

`comments.js`의 `newCommentPayload`에 `blockId=null` 추가(전체 댓글은
`null` 유지, 컬렉션은 하나). 입력창은 `MessageComposer.jsx` 재사용(사용자
명시 요청) — `bodyHtml` 확장은 채널 메시지 때와 같은 패턴
(`channelMessages.js` 참고). 패널은 `Channels.jsx`가 `WorkspaceLayout`의
`children` 영역 안에서 캔버스 옆에 조건부로 그리는 4번째 칸(320px 안팎).

## 이번 계획에서 안 하는 것

- 목록 항목(li) 개별 드래그, 블록 배경색.
- 읽기 화면(PostDetail)에서 체크리스트 토글(편집 중에만).
- 반응·댓글 알림(데스크톱 알림 연동) — 다음 라운드.
