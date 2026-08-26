/**
 * 이름만으로 만드는 아바타 — 사진(photoURL)이 없는 사람도 서로 구분돼 보여야 한다.
 *
 * Gmail·Slack이 쓰는 방식과 같다 — 이름 첫 글자 + 이름에서 고정으로 뽑아낸 색 하나.
 * 매번 같은 이름이면 항상 같은 색이 나와야 "저 사람 아바타"로 기억에 남는다(무작위 색은
 * 새로고침마다 바뀌어 오히려 헷갈린다).
 *
 * Firestore·DOM에 의존하지 않는 순수 함수로 둔다. (avatars.test.js)
 */

/** 이름에서 뽑을 색 — 채도·명도를 서로 비슷하게 맞춘 8가지. 아바타 배경이라 텍스트(흰색)
 *  대비가 충분히 나오는 톤만 골랐다. */
const PALETTE = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899',
]

/** 아바타에 보여줄 첫 글자. 이름이 비어 있으면 물음표로 — 빈 원보다 "정보 없음"이 드러난다. */
export function initialFor(name) {
  const trimmed = String(name || '').trim()
  return trimmed ? trimmed.charAt(0) : '?'
}

/** 이름 → 고정 색 하나. 같은 이름은 항상 같은 색(간단한 해시 후 팔레트 나머지). */
export function colorForName(name) {
  const s = String(name || '')
  let hash = 0
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) >>> 0
  }
  return PALETTE[hash % PALETTE.length]
}
