/**
 * 캔버스 블록 반응(이모지 리액션).
 *
 * requests/{id}/blockReactions/{blockId} 문서 하나가 그 블록에 달린 모든 반응을 담는다 —
 * { '👍': [uid, uid], '🎉': [uid] } 형태. 자동저장(bodyHtml, PostComposer 700ms 디바운스)과
 * 같은 문서에 안 두는 이유는 댓글(comments.js)과 같다 — 다른 사람의 반응 클릭과 글쓴이의
 * 자동저장이 같은 문서에서 겹치면 서로 덮어쓴다.
 *
 * 이모지는 전부 코드포인트 하나짜리만 골랐다(❤️처럼 변형 선택자가 붙는 이모지는 뺐다) —
 * 이 목록이 firestore.rules(반응 필드 이름 검사)에도 문자 그대로 다시 나오는데, 파일이
 * 다르면 같은 글자처럼 보여도 인코딩이 미묘하게 달라질 위험이 있어 그 위험 자체를 없앴다.
 * **이 목록을 바꾸면 firestore.rules의 blockReactions 규칙도 함께 고쳐야 한다.**
 *
 * Firestore에 의존하지 않는 순수 함수로 둔다. (blockReactions.test.js)
 */

export const REACTION_EMOJIS = ['👍', '😍', '🎉', '👏', '🙌', '👀']

/** 블록 ID. 기존 코드베이스의 다른 로컬 ID(sec_xxx 등)와 같은 모양. */
export function makeBlockId() {
  return `b_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

/**
 * 화면에 그릴 알약 목록 — 정해둔 순서(REACTION_EMOJIS)대로, 아무도 안 누른 이모지는 뺀다.
 * @param {object|null|undefined} data blockReactions/{blockId} 문서, { [emoji]: uid[] }
 * @param {string} [uid] 지금 보는 사람 — mine 판정에 쓴다
 */
export function summarizeReactions(data, uid) {
  if (!data) return []
  return REACTION_EMOJIS
    .map(emoji => {
      const uids = Array.isArray(data[emoji]) ? data[emoji] : []
      return { emoji, count: uids.length, mine: !!uid && uids.includes(uid) }
    })
    .filter(r => r.count > 0)
}
