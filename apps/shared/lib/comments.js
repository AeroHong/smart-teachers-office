/**
 * 업무 글 댓글 — 글 전체에 대한 것과 캔버스 블록 하나에 대한 것을 같은 컬렉션에 담는다.
 *
 * 업무 글은 "누가 했나"를 집계하지만, 실제로 오가는 말은 대부분 완료 여부가 아니라
 * 되묻는 것이다 — "양식이 어디 있나요", "저는 대상이 아닌 것 같은데요". 이 질문이
 * 쿨메신저로 돌아가면 담당자가 같은 답을 열 번 하고, 나머지 사람은 그 답을 못 본다.
 * 글 아래에 붙여두면 한 번 답한 것이 모두에게 남는다.
 *
 * ─────────────────────────────────────────────────────────────
 *  본문은 서식 있는 HTML이다 (PLAN_canvasBlocks.md Phase 4부터)
 * ─────────────────────────────────────────────────────────────
 * 처음엔 평문이었다(정화기를 새로 늘리지 않으려고). 그런데 입력창을 MessageComposer.jsx로
 * 바꾸면서(사용자 명시 요청 — 채널 메시지와 같은 입력 경험) channelMessages.js와 같은
 * 이유로 bodyHtml을 들였다: 그 정화기(richText.js의 sanitizeHtml)는 캔버스·쪽지·채널
 * 메시지가 이미 쓰고 있어 "한 벌 더 느는" 게 아니다.
 *
 * bodyHtml이 있으면 그게 진짜 내용이고, body는 htmlToText로 뽑아낸 평문 사본이다(길이
 * 검사·목록 미리보기용). bodyHtml이 없는 문서는 옛 평문 댓글이다 — 줄바꿈만 살려 그린다.
 *
 * ─────────────────────────────────────────────────────────────
 *  blockId — 글 전체 댓글과 블록 댓글을 같은 컬렉션에 두는 이유
 * ─────────────────────────────────────────────────────────────
 * "이 글에 달린 모든 이야기"라는 성격은 같아서 컬렉션을 나누지 않았다. blockId가
 * null이면 글 전체 댓글(PostDetail 맨 아래), 블록 ID(CanvasEditor.jsx의 data-block-id)면
 * 그 블록에 단 댓글(3단 오른쪽 패널, BlockCommentsPanel.jsx)이다 — commentsForBlock()으로
 * 걸러 보여준다.
 *
 * 저장 구조
 *   schools/{schoolId}/requests/{requestId}/comments/{commentId}   ← auto-ID
 *     body         평문(htmlToText로 뽑은 사본, 옛 문서는 이것만 있음)
 *     bodyHtml     서식 있는 본문 — 없으면 옛 평문 댓글
 *     blockId      null이면 글 전체, 아니면 그 블록의 댓글
 *     authorUid    작성자 uid — 삭제 권한 판정의 근거
 *     authorName   작성 시점 이름 스냅샷 (계정이 지워져도 누구였는지 남는다)
 *     createdAt    호출부가 serverTimestamp()로 채운다
 *
 * Firestore에 의존하지 않는 순수 함수로 둔다. (comments.test.js) htmlToText는 richText.js의
 * DOM 없는 순수 함수라 여기서 불러도 node --test가 깨지지 않는다(channelMessages.js와 같음).
 * sanitizeHtml(DOMPurify가 window를 요구)은 호출부(PostComments.jsx) 책임이다.
 */
import { htmlToText } from './richText.js'

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
 *
 * @param {string} [bodyHtml] 서식 있는 본문(MessageComposer.jsx). 있으면 body는 이걸로
 *   덮어쓴다(htmlToText) — 호출부가 평문과 HTML을 따로 맞춰 넘길 필요가 없다
 *   (channelMessages.js의 newMessagePayload와 같은 방식).
 * @param {string|null} [blockId] 캔버스 블록 하나에 단 댓글이면 그 블록 ID, 글 전체
 *   댓글이면 null(기본값).
 */
export function newCommentPayload({ body, bodyHtml = null, authorUid, authorName, blockId = null }) {
  const text = bodyHtml ? htmlToText(bodyHtml) : body
  const result = validateComment(text)
  if (!result.ok) throw new Error(result.error)
  return {
    body: result.body,
    bodyHtml: bodyHtml || null,
    authorUid,
    authorName: authorName || '',
    blockId: blockId || null,
  }
}

/** blockId로 거른다 — null이면 글 전체 댓글만, 블록 ID면 그 블록 댓글만(둘을 같은
 *  화면에 섞지 않는다 — 어느 블록 얘기인지 문맥 없이 떠 있으면 오히려 헷갈린다). */
export function commentsForBlock(comments = [], blockId = null) {
  const target = blockId || null
  return comments.filter(c => (c?.blockId || null) === target)
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
