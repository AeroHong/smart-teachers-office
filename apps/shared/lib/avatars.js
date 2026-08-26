/**
 * 이름만으로 만드는 아바타 — 사진(photoURL)이 없는 사람도 서로 구분돼 보여야 한다.
 *
 * 색 있는 상자 안에 성을 뺀 이름(예: 홍창기 → 창기)을 흰 글자로 쓴다(사용자 요청,
 * 2026-08-27) — 첫 글자(성)만 쓰면 "김"·"이"·"박"처럼 같은 글자로 겹치는 사람이
 * 많아 구분이 잘 안 됐다. 이름에서 성을 뺀 나머지가 실제로 서로 다른 부분이다.
 * 색은 이름에서 고정으로 뽑는다 — 매번 같은 이름이면 항상 같은 색이 나와야 "저 사람
 * 아바타"로 기억에 남는다(무작위 색은 새로고침마다 바뀌어 오히려 헷갈린다).
 *
 * Firestore·DOM에 의존하지 않는 순수 함수로 둔다. (avatars.test.js)
 */

/** 이름에서 뽑을 색 — 채도·명도를 서로 비슷하게 맞춘 8가지. 아바타 배경이라 텍스트(흰색)
 *  대비가 충분히 나오는 톤만 골랐다. */
const PALETTE = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899',
]

/**
 * 아바타에 보여줄 글자 — 이름에서 첫 글자(성)를 뺀 나머지("홍창기" → "창기"). 이름이
 * 한 글자뿐이면(외자·닉네임 등) 그 글자를 그대로 쓴다. 비어 있으면 물음표로 — 빈
 * 상자보다 "정보 없음"이 드러난다. 서로게이트 쌍(이모지 등)도 안 깨지게 배열로 센다.
 */
export function givenNameFor(name) {
  const chars = [...String(name || '').trim()]
  if (chars.length === 0) return '?'
  return chars.length > 1 ? chars.slice(1).join('') : chars[0]
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
