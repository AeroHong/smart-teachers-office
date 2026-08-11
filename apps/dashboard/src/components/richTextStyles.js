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
}
