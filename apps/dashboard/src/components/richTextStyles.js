/**
 * 본문 서식 표시 규칙 — 편집기와 읽기 화면이 같은 모양이어야 한다.
 *
 * 지금까지 화면마다 스타일을 따로 갖고 있어서, 편집기에서 제목·인용·구분선·토글을 넣어도
 * 읽는 쪽에서는 밋밋한 문단으로 보였다. 쓰는 사람이 본 것과 받는 사람이 보는 것이 다르면
 * 서식을 쓸 이유가 없어진다.
 *
 * 서식은 **태그만으로** 꾸민다. 걸러내기(richText.js)가 class를 지우므로 태그가 곧 서식이다.
 */
export const RICH_TEXT_SX = {
  '& img': { maxWidth: '100%', borderRadius: 1, my: 0.5 },
  '& ul, & ol': { pl: 3, my: 0.5 },
  '& a': { color: 'primary.main' },
  '& p': { m: 0 },
  '& h2': { fontSize: '1.15rem', fontWeight: 800, m: '0.6em 0 0.2em' },
  '& h3': { fontSize: '1rem', fontWeight: 700, m: '0.5em 0 0.2em' },
  '& h4': { fontSize: '0.92rem', fontWeight: 700, m: '0.45em 0 0.15em' },
  '& blockquote': {
    m: '0.4em 0', pl: 1.5, borderLeft: '3px solid', borderColor: 'divider',
    color: 'text.secondary',
  },
  '& hr': { border: 0, borderTop: '1px solid', borderColor: 'divider', my: 1.5 },
  '& details': {
    my: 0.6, p: 1, borderRadius: 1, border: '1px solid', borderColor: 'divider',
  },
  '& summary': { cursor: 'pointer', fontWeight: 700 },
  // 콜아웃 — 꼭 봐야 할 한 문단을 눈에 띄게 한다. 인용과 구분되도록 배경을 깔되,
  // 본문 안에서 튀지 않게 색은 테마의 은은한 것만 쓴다.
  '& aside': {
    my: 0.8, p: 1.2, borderRadius: 1,
    bgcolor: 'action.hover', borderLeft: '3px solid', borderColor: 'primary.main',
  },
  // 상자 안에서는 줄이 갖고 온 여백을 무시하고 간격을 직접 준다. 콜아웃 첫 줄에 제목을
  // 넣으면 제목의 위 여백 때문에 상자가 위아래로 벌어져 보이기 때문이다.
  '& aside > *': { marginTop: 0, marginBottom: 0 },
  '& aside > * + *': { marginTop: '0.45em' },
  // 표 — sanitizeHtml이 style 중 color만 남기므로(richText.js) 테두리·간격은 여기서
  // 태그 선택자로 준다. inline style로 넣으면 저장하는 순간 지워진다.
  // tableLayout:'fixed' — 칸 너비를 첫 행의 width 속성이 정하게 한다(칸 너비
  // 조정, CanvasEditor.jsx의 startColResize). auto였다면 내용 길이에 따라
  // 브라우저가 알아서 넓혀버려 드래그로 정한 폭이 무시된다.
  '& table': { borderCollapse: 'collapse', tableLayout: 'fixed', my: 0.8 },
  // width:100%는 아직 손으로 폭을 안 정한 표(:not([width]))에만 준다 — 모든 표에
  // 걸어두면 CSS 규칙이 항상 이겨서 startTableResize가 table에 준 width 속성이
  // 무시된다(칸 너비는 규칙이 안 겹쳐 잘 됐는데 표 전체 폭만 안 먹던 원인이었다,
  // 사용자 확인 2026-08-26). width 속성이 생긴 뒤로는 그 값이 그대로 쓰인다.
  '& table:not([width])': { width: '100%' },
  '& td, & th': { border: '1px solid', borderColor: 'divider', px: 1, py: 0.5, fontSize: '0.88rem', minWidth: 60 },
  // 날짜 칩 — 삽입 직후엔 글자만 있고, hydrateDateChips가 라벨과 색(style="color:…")을
  // 매번 다시 계산해 채운다(dateChips.js). 여기서는 알약 모양만 담당한다.
  '& [data-date]': {
    display: 'inline-flex', alignItems: 'center', gap: '0.25em',
    px: 0.7, py: 0.1, borderRadius: 5, bgcolor: 'action.hover',
    fontSize: '0.85em', fontWeight: 600, cursor: 'default',
  },
  // 캔버스 삽입 카드 — ChannelMessages.jsx의 CanvasCard와 같은 인상을 주도록 테두리 있는
  // 카드꼴로 맞춘다(canvasRefCard.js가 마크업을 만든다).
  '& [data-canvas-ref]': {
    display: 'flex', alignItems: 'center', gap: '0.6em',
    my: 0.6, p: 1, maxWidth: 420, cursor: 'pointer',
    border: '1px solid', borderColor: 'divider', borderRadius: 1,
    bgcolor: 'action.hover',
    '&:hover': { borderColor: 'primary.light' },
  },
  // #채널 · @사람 인라인 조각(channelMentionChip.js) — 카드가 아니라 문장 속에 섞이는
  // 조각이라 알약보다도 더 가볍게, 굵기와 색만으로 도드라지게 한다.
  '& [data-channel-ref]': {
    fontWeight: 700, color: 'primary.main', cursor: 'pointer',
    '&:hover': { textDecoration: 'underline' },
  },
  '& [data-mention-uid]': {
    fontWeight: 700, color: 'primary.main', bgcolor: 'action.hover',
    px: '0.3em', borderRadius: 4,
  },
}
