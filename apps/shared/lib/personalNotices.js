/**
 * 쪽지 — 교사 사이의 1:1 전달.
 *
 * 쿨메신저를 대체하지 않는다. 잡담과 연락은 그쪽에 두고, 여기서는 "업무 글로 만들 정도는
 * 아니지만 남아 있어야 하는 말"을 다룬다.
 *
 * ── 여러 명에게 보낼 때 문서를 나누는 이유 ──────────────────────────
 *
 * 한 문서에 받는 사람을 배열로 담고 읽음도 배열로 두는 편이 단순해 보이지만, 그러면
 * 누가 읽었는지를 바꿀 때마다 남의 읽음까지 들어 있는 문서를 통째로 쓰게 된다. 규칙으로
 * "자기 읽음만 건드렸는지"를 검사할 수는 있어도, 받는 사람 전원이 남의 쪽지 내용과
 * 읽음 상태를 볼 수 있게 된다 — 쪽지는 1:1이라는 전제가 깨진다.
 *
 * 그래서 받는 사람 한 명당 문서 하나를 만들고, 같이 보낸 것들은 batchId로 묶는다.
 * 받은함은 그대로 1:1이고, 보낸함에서만 묶어서 "5명에게 · 3명 읽음"으로 보여준다.
 */

export const NOTICE_TITLE_MAX = 100

/**
 * 받는 사람 한 명에게 갈 쪽지 문서.
 *
 * bodyHtml과 content를 함께 둔다. 목록과 미리보기는 평문이 필요하고(HTML을 잘라 쓰면
 * 태그가 반쯤 잘린다), 본문은 서식이 살아 있어야 한다. 업무 글과 같은 방식이다.
 *
 * @param {object} p
 * @param {string} p.batchId 같이 보낸 쪽지를 묶는 ID (한 명에게 보내도 채운다)
 * @returns {object} Firestore에 넣을 필드 (createdAt은 호출부에서 serverTimestamp)
 */
export function newNoticePayload({
  batchId,
  senderUid,
  senderName = '',
  recipient,
  recipientCount = 1,
  title,
  bodyHtml = '',
  content = '',
  attachments = [],
}) {
  return {
    batchId,
    senderUid,
    senderName,
    recipientUid: recipient.uid,
    // 보낸함에서 받는 사람을 보여주려면 이름이 필요하다 (발신 시점 스냅샷)
    recipientName: recipient.name,
    // 받는 사람이 "나 말고 누구에게 더 갔는지"를 알 수 있게 인원수만 남긴다.
    // 명단을 통째로 넣으면 쪽지 하나가 수신자 명부가 된다.
    recipientCount,
    title: (title || '').trim().slice(0, NOTICE_TITLE_MAX),
    bodyHtml,
    content,
    readAt: null,
  }
}

/** 답장 제목은 한 번만 'Re: '를 붙인다 (Re: Re: 가 쌓이지 않게). */
export function replyTitle(title = '') {
  return title.startsWith('Re: ') ? title : `Re: ${title}`
}

/**
 * 보낸 쪽지를 묶음 단위로 접는다.
 *
 * 5명에게 보내면 문서가 5개 생기는데, 보낸함에 같은 제목이 다섯 줄 뜨면 목록을 못 쓴다.
 * batchId로 묶어 한 줄로 만들고 읽은 사람 수를 함께 센다 — 업무 요청의 완료 집계와
 * 같은 값이다. "보냈는데 아무도 안 읽었다"가 보여야 다시 챙긴다.
 *
 * batchId가 없는 옛 문서는 자기 ID를 묶음으로 삼아 한 줄로 남는다.
 *
 * @param {Array} notices 보낸 쪽지 문서들 (최신순으로 정렬돼 있다고 본다)
 * @returns {Array} [{ id, batchId, title, notices, recipients, readCount, total, createdAt }]
 */
export function groupSentNotices(notices = []) {
  const groups = new Map()

  notices.forEach(n => {
    const key = n.batchId || n.id
    if (!groups.has(key)) {
      groups.set(key, {
        id: key,
        batchId: key,
        title: n.title,
        bodyHtml: n.bodyHtml,
        content: n.content,
        attachments: n.attachments || [],
        createdAt: n.createdAt,
        notices: [],
      })
    }
    groups.get(key).notices.push(n)
  })

  return [...groups.values()].map(g => ({
    ...g,
    recipients: g.notices.map(n => ({
      uid: n.recipientUid,
      name: n.recipientName || '',
      readAt: n.readAt || null,
    })).sort((a, b) => a.name.localeCompare(b.name, 'ko')),
    readCount: g.notices.filter(n => n.readAt).length,
    total: g.notices.length,
  }))
}

/**
 * 보낸 묶음 한 줄에 붙일 요약.
 * 한 명에게 보낸 것은 이름을, 여럿이면 인원과 읽은 수를 보여준다.
 */
export function describeSentGroup(group) {
  if (!group || group.total === 0) return ''
  if (group.total === 1) {
    const only = group.recipients[0]
    return `${only?.name || '—'} · ${only?.readAt ? '읽음' : '안읽음'}`
  }
  return `${group.total}명 · ${group.readCount}명 읽음`
}

/**
 * 보낼 수 있는 상태인지.
 * 받는 사람이 없거나 제목이 비면 보낸 뒤에 알아채도 되돌릴 수 없다.
 */
export function validateNotice({ recipients = [], title = '', bodyText = '' }) {
  if (recipients.length === 0) return '받는 사람을 골라 주세요.'
  if (!title.trim()) return '제목을 입력해 주세요.'
  if (!bodyText.trim()) return '내용을 입력해 주세요.'
  return null
}
