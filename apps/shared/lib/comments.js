/**
 * 업무 글 댓글.
 *
 * 업무 글은 "누가 했나"를 집계하지만, 실제로 오가는 말은 대부분 완료 여부가 아니라
 * 되묻는 것이다 — "양식이 어디 있나요", "저는 대상이 아닌 것 같은데요". 이 질문이
 * 쿨메신저로 돌아가면 담당자가 같은 답을 열 번 하고, 나머지 사람은 그 답을 못 본다.
 * 글 아래에 붙여두면 한 번 답한 것이 모두에게 남는다.
 *
 * ─────────────────────────────────────────────────────────────
 *  본문을 평문으로 저장하는 이유
 * ─────────────────────────────────────────────────────────────
 * 업무 글 본문(bodyHtml)은 서식 있는 HTML이라 그릴 때마다 richText.js의 sanitizeHtml을
 * 거쳐야 한다. 댓글에 같은 구조를 쓰면 편집기·정화기·저장 형식이 한 벌 더 늘고,
 * 정화를 한 군데라도 빠뜨리면 그대로 XSS가 된다.
 *
 * 댓글은 한두 줄짜리 되묻기라 굵게·목록·이미지를 넣을 이유가 없다. 서식을 포기하면
 * 저장된 값은 항상 그냥 문자열이고, 화면은 dangerouslySetInnerHTML 없이 텍스트로만
 * 그리면 되므로 정화를 잊을 자리 자체가 사라진다. 줄바꿈은 CSS(white-space)로 살린다.
 *
 * 저장 구조
 *   schools/{schoolId}/requests/{requestId}/comments/{commentId}   ← auto-ID
 *     body         평문 (HTML 아님)
 *     authorUid    작성자 uid — 삭제 권한 판정의 근거
 *     authorName   작성 시점 이름 스냅샷 (계정이 지워져도 누구였는지 남는다)
 *     createdAt    호출부가 serverTimestamp()로 채운다
 *
 * Firestore에 의존하지 않는 순수 함수로 둔다. (comments.test.js)
 */

/**
 * 본문 길이 상한.
 *
 * 긴 글은 댓글이 아니라 새 안내로 올려야 할 내용이라 넉넉히 잡을 이유가 없다.
 * 다만 상한이 너무 빡빡하면 쓰던 글이 잘려나가 다시 쓰게 되므로, 실제로 걸릴 일이
 * 거의 없는 선에 둔다 — 한 화면을 채우는 문단 두세 개 정도.
 */
export const MAX_COMMENT_LENGTH = 1000

/** 사용자에게 그대로 보여줄 메시지. 화면마다 문구가 갈리지 않게 여기서만 만든다. */
export const COMMENT_ERRORS = {
  empty: '댓글 내용을 입력해 주세요.',
  tooLong: `댓글은 ${MAX_COMMENT_LENGTH}자까지 쓸 수 있습니다.`,
}

/**
 * 저장 직전 본문 정리.
 *
 * 붙여넣기로 들어오는 CRLF를 LF로 맞춘다 — 같은 내용인데 저장된 길이가 줄 수만큼
 * 달라져서, 화면의 글자 수와 검증 결과가 어긋나 보인다.
 * 앞뒤 공백·빈 줄은 없앤다. 엔터만 눌러 만든 여백은 내용이 아니다.
 */
export function normalizeCommentBody(body) {
  if (typeof body !== 'string') return ''
  return body.replace(/\r\n?/g, '\n').trim()
}

/** 화면에 보여주는 글자 수. 이모지는 서로게이트 쌍이라 .length로 세면 2로 나온다. */
export function commentLength(body) {
  return Array.from(normalizeCommentBody(body)).length
}

/**
 * 보낼 수 있는 댓글인지.
 *
 * 전송 버튼을 잠그는 쪽과 실제로 저장하는 쪽이 같은 판정을 써야, 버튼은 눌리는데
 * 저장은 실패하는(또는 그 반대의) 어긋남이 생기지 않는다.
 *
 * @returns {{ ok: boolean, body: string, error: string }} body는 정리된 본문
 */
export function validateComment(body) {
  const normalized = normalizeCommentBody(body)
  if (normalized === '') return { ok: false, body: '', error: COMMENT_ERRORS.empty }
  if (Array.from(normalized).length > MAX_COMMENT_LENGTH) {
    return { ok: false, body: normalized, error: COMMENT_ERRORS.tooLong }
  }
  return { ok: true, body: normalized, error: '' }
}

/**
 * 댓글 문서 초기값. createdAt은 호출부가 serverTimestamp()로 채운다.
 *
 * 검증에 걸리면 값을 만들지 않고 던진다. 화면에서 이미 막고 있지만, 그 막이 뚫렸을 때
 * 빈 댓글이 조용히 저장되는 것보다 저장이 실패하는 편이 낫다.
 */
export function newCommentPayload({ body, authorUid, authorName }) {
  const result = validateComment(body)
  if (!result.ok) throw new Error(result.error)
  return {
    body: result.body,
    authorUid,
    authorName: authorName || '',
  }
}

/**
 * 삭제 권한.
 *
 * 본인 글은 오타나 잘못 단 곳을 스스로 거둘 수 있어야 하고, 관리자는 부적절한 내용을
 * 치울 수 있어야 한다. 글 작성자에게는 주지 않는다 — 자기 글에 달린 불편한 질문을
 * 지울 수 있으면 "누가 했는지 보인다"는 이 시스템의 신뢰가 무너진다.
 */
export function canDeleteComment(comment, { uid, isAdmin = false } = {}) {
  if (!comment || !uid) return false
  return isAdmin || comment.authorUid === uid
}

function toMillis(value) {
  if (!value) return null
  if (value.toDate) return value.toDate().getTime()
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.getTime()
}

/**
 * 오래된 것부터. 댓글은 위에서 아래로 읽는 대화라 최신이 위로 오면 흐름이 뒤집힌다.
 *
 * createdAt이 없는 문서를 맨 뒤에 두는 이유는 방금 쓴 댓글 때문이다. serverTimestamp()는
 * 서버 왕복 전까지 null이라, 이걸 앞으로 보내면 내가 쓴 댓글이 목록 맨 위로 튀었다가
 * 잠시 뒤 제자리로 내려가는 것처럼 보인다.
 */
export function sortComments(comments = []) {
  return [...comments].sort((a, b) => {
    const ta = toMillis(a?.createdAt)
    const tb = toMillis(b?.createdAt)
    if (ta === tb) return 0
    if (ta === null) return 1
    if (tb === null) return -1
    return ta - tb
  })
}
