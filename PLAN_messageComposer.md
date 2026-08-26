# 채널 메시지 입력창 — Slack 스타일 고정 툴바 + #채널 · @사람 · + 첨부

## Context

`ChannelMessages.jsx`의 메시지 입력칸은 평문 전용 `TextField`였다. 채널 헤더의
캔버스(업무 글)는 이미 서식 있는 편집기(`CanvasEditor.jsx`, 선택 시 뜨는 버블
툴바)를 쓰지만 메시지는 완전히 다른 화면이었다. 사용자가 Slack의 실제 메시지
입력창 스크린샷을 보여주며 요청: **메시지 입력칸도 서식 도구를 갖추되, 캔버스와
달리 입력칸 위에 항상 떠 있는 고정 툴바**로. 추가로 `#`(채널 언급) · `@`(사람
멘션) · `+`(파일·캔버스 첨부) 트리거도 요청.

사용자가 명확히 구분: "캔버스에서의 편집(드래그하면 뜨는 버블 툴바)과 메시지에서의
기능은 다르다" — `CanvasEditor.jsx`는 그대로 두고 메시지 전용 컴포넌트를 새로
만드는 것이 맞다고 확정.

## 결정한 것 (2026-08-26, EnterPlanMode → 승인)

- **메시지 본문을 평문 → 서식 있는 HTML(`bodyHtml`)로.** 처음엔 XSS 우려로
  평문이었는데(`channelMessages.js` 옛 주석), 그 정화기(`richText.js`의
  `sanitizeHtml`, DOMPurify)는 캔버스(`requests.bodyHtml`)·쪽지가 이미 쓰던
  것이라 세 번째로 재사용 — 새 정화기를 늘리는 게 아니었다.
- **`newMessagePayload`는 순수 함수로 유지, 정화는 호출부 책임** —
  `PostComposer.jsx`가 캔버스에서 하는 것과 같은 자리. DOMPurify가 `window`를
  요구해 Node 테스트 환경에서 못 돌기 때문(구현 중 실제로 걸림 — `newMessagePayload`
  안에서 `sanitizeHtml`을 불렀다가 `channelMessages.test.js`가
  `DOMPurify.sanitize is not a function`으로 깨짐 → 호출부로 옮겨 해결).
  `htmlToText`(순수 문자열 처리)만 안에서 쓴다.
- **옛 메시지 호환**: `bodyHtml` 없는 문서(전부 옛 글 + `channelActions.js`의
  전달·알림 한마디)는 평문 `body` 그대로 렌더링.
- **새 컴포넌트 `MessageComposer.jsx`** — `RichTextEditor.jsx`(쪽지용)를
  뼈대로 하되 채팅 입력칸용으로 새로 만듦(최소높이 40px, Enter=보내기,
  `#`/`@` 트리거, 글자색 팔레트는 뺌). `MentionMenu.jsx`(신규)가 `SlashMenu.jsx`와
  같은 뼈대로 `#`/`@` 자동완성 팝업을 담당.
- **`#` 채널 멘션**: 이 채널 목록(`channels`, DM 제외)에서 고름 → 클릭 가능한
  `#채널이름` 인라인 조각(`channelMentionChip.js`, `canvasRefCard.js`와 같은
  `data-*` 패턴).
- **`@` 사람 멘션**: 학교 전체가 아니라 **이 채널 참여자**로 좁힌 목록에서 고름.
  **알림 연결은 다음 라운드로 미룸** — 삽입까지만.
- **`+` 첨부 메뉴**: "파일 첨부"(신규, `uploadAttachment` 재사용) + "캔버스
  첨부"(기존 `attached` 로직을 메뉴 안으로 이동). 파일은 `useChannelMessages.js`의
  새 `newMessageId()`로 메시지 ID를 미리 받아 그 아래 올린다(`PostComposer.jsx`가
  `requestId`를 미리 만드는 것과 같은 이유) — `storage.rules`에
  `schools/{schoolId}/messages/{messageId}/` 신설(notices와 같은 신뢰 모델:
  교직원 전체 읽기, 발신 대상 정밀 제한은 Storage 규칙에서 Firestore를 가로질러
  확인할 수 없어 불가능 — 이 프로젝트에 이미 있던 한계, notices 규칙 주석 참고).
- **이모지 버튼**: 자리는 남기고 누르면 "준비 중" 토스트만(사용자 확정) —
  실제 이모지 피커는 범위 밖.
- **부수 버그 수정**: `useChannelMessages.js`의 `send()`가 `refTitle`·
  `refChannelId`를 받지 않고 버려서, 메시지에 캔버스를 붙여도 제목이 항상
  빈 채로 저장되던 문제. `+` 메뉴로 캔버스 첨부를 다시 짜면서 발견해 같이 고침.

## 이번 범위가 아닌 것

- 멘션 알림(데스크톱/뱃지) — 별도 파이프라인 필요, 다음 라운드.
- 옛 평문 메시지의 소급 HTML 변환.
- 실제 이모지 선택 UI, 영상통화·음성메모(Slack에는 있지만 우리 앱에 없는 기능).

## 건드린 파일

`MessageComposer.jsx`·`MentionMenu.jsx`(신규), `channelMentionChip.js`(신규),
`ChannelMessages.jsx`(입력칸 교체, 렌더링 HTML 분기, 첨부 카드),
`useChannelMessages.js`(`send()` 필드 확장, `newMessageId()`),
`channelMessages.js`(`newMessagePayload`에 `bodyHtml`·`attachment`),
`richText.js`(멘션 속성 허용), `richTextStyles.js`(멘션 조각 스타일),
`Channels.jsx`(`channels`·`channelMembers` 전달), `storage.rules`(messages 폴더).

## 검증

- `npm test` — 243개 통과(`channelMessages.test.js`에 `bodyHtml`/`attachment`
  케이스 추가).
- `npm run build:dashboard` 통과.
- 배포 완료(`hosting:dashboard`, `storage:rules`). 브라우저 직접 클릭 검증은
  못 함(로그인 불가) — 사용자가 직접 타이핑·`#`·`@`·`+`를 눌러보고 다음
  라운드에서 미세조정.
