/**
 * 업무 요청 — 사람마다 완료 여부가 생기는 일.
 *
 * 공지(읽으면 끝)와 갈라지는 지점이 여기다. 원안 제출·성적 마감·교육계획서처럼
 * 대상 한 명 한 명에게 "했다/안 했다"가 생기는 일은 메시지로 뿌리면 양쪽이 같이 고생한다.
 *   - 교사: 수백 개 메시지에 묻혀 뭘 해야 하는지 모른다
 *   - 담당자: 누가 안 했는지 손으로 대조해야 한다
 * 둘은 같은 데이터를 양쪽에서 본 것이라, 사람별 완료 상태를 한 번 기록하면 동시에 풀린다.
 *
 * 저장 구조
 *   schools/{schoolId}/requests/{requestId}
 *     targetUids[]     발송 시점에 고정된 대상 명단 (조건 재계산은 담당자가 명시적으로)
 *     completedUids[]  빠른 조회를 위한 완료자 목록
 *     /completions/{uid}  완료 시각·비고 등 상세 (문서 ID가 곧 uid)
 *
 * completedUids를 요청 문서에 같이 두는 이유는 "내 할 일" 위젯 때문이다. 이게 없으면
 * 교사 화면에서 요청마다 완료 문서를 한 번씩 더 읽어야 한다. 대신 규칙에서 본인 uid만
 * 넣고 뺄 수 있게 막는다.
 */

export const REQUEST_STATUS = {
  open: '진행 중',
  closed: '마감',
}

/**
 * 완료는 본인도 담당자도 언제든 표시할 수 있다.
 *
 * 예전에는 요청을 만들 때 '본인 체크'와 '담당자 확인' 중 하나를 고르게 했는데, 실제로는
 * 둘 다 필요하다 — 보통은 본인이 누르고, 안 누르는 사람은 담당자가 나이스에서 확인해
 * 채워 넣는다. 만들 때 미리 정하게 하면 물어볼 이유가 없는 것을 묻는 셈이라 없앴다.
 * 누가 표시했는지는 completions/{uid}.doneBy에 남는다.
 */

/** 새 요청 문서의 초기값. createdAt/updatedAt은 호출부가 serverTimestamp로 채운다. */
export function newRequestPayload({
  title, description = '', dueDate = null,
  attachments = [], links = [],
  targetRule, targetRuleText, targets,
  createdBy, createdByName,
}) {
  return {
    title: (title || '').trim(),
    description: (description || '').trim(),
    dueDate,
    status: 'open',
    attachments,
    links,
    // 조건은 재계산·감사용으로 남기고, 실제 대상은 발송 시점 명단으로 고정한다.
    // 자동 재계산으로 두면 마감이 지난 요청에 사람이 조용히 추가돼, 받은 적도 없는데
    // 미완료로 찍히는 일이 생긴다.
    targetRule: targetRule || { conditions: [], includeUids: [], excludeUids: [] },
    targetRuleText: targetRuleText || '',
    targetUids: targets.map(t => t.uid),
    // 이름 스냅샷 — 나중에 계정이 지워져도 현황 화면에서 누구였는지 남는다
    targetNames: targets.map(t => t.name),
    completedUids: [],
    createdBy,
    createdByName,
  }
}

/** 완료 표시 한 줄. 문서 ID는 uid를 쓴다. */
export function newCompletionPayload({ uid, name, doneBy, markedByUid, markedByName, note = '' }) {
  return {
    uid,
    name: name || '',
    doneBy: doneBy === 'manager' ? 'manager' : 'self',
    markedByUid: markedByUid || uid,
    markedByName: markedByName || name || '',
    note: (note || '').trim(),
  }
}

/**
 * 완료 집계.
 *
 * completedUids를 그대로 세지 않고 대상 명단과 교집합을 낸다. 담당자가 대상을 다시 계산해
 * 빠진 사람이 생겼을 때, 그 사람의 완료 기록이 남아 있어도 완료 수가 부풀지 않게 하기 위함.
 */
export function completionStats(request) {
  const target = request?.targetUids || []
  const targetSet = new Set(target)
  const done = (request?.completedUids || []).filter(uid => targetSet.has(uid))
  const doneSet = new Set(done)

  return {
    total: target.length,
    doneCount: doneSet.size,
    pendingUids: target.filter(uid => !doneSet.has(uid)),
    percent: target.length === 0 ? 0 : Math.round((doneSet.size / target.length) * 100),
  }
}

export function isDoneBy(request, uid) {
  return (request?.completedUids || []).includes(uid)
}

export function isTargetOf(request, uid) {
  return (request?.targetUids || []).includes(uid)
}

/** 미완료자 이름 목록 — 독촉 대상을 보여줄 때 쓴다. */
export function pendingMembers(request) {
  const names = request?.targetNames || []
  const byUid = new Map((request?.targetUids || []).map((uid, i) => [uid, names[i] || '']))
  return completionStats(request).pendingUids.map(uid => ({ uid, name: byUid.get(uid) || '' }))
}

function toDate(value) {
  if (!value) return null
  if (value.toDate) return value.toDate()
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

const DAY_MS = 86400000

/**
 * 마감까지 남은 상태. 목록 정렬과 색을 여기서 한 번에 정한다.
 * @returns {{ state: 'closed'|'overdue'|'today'|'soon'|'normal'|'none', days: number|null, label: string }}
 */
export function dueState(request, now = new Date()) {
  if (request?.status === 'closed') return { state: 'closed', days: null, label: '마감됨' }

  const due = toDate(request?.dueDate)
  if (!due) return { state: 'none', days: null, label: '' }

  const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
  const days = Math.round((startOfDay(due) - startOfDay(now)) / DAY_MS)

  if (days < 0) return { state: 'overdue', days, label: `${-days}일 지남` }
  if (days === 0) return { state: 'today', days, label: '오늘까지' }
  if (days <= 3) return { state: 'soon', days, label: `D-${days}` }
  return { state: 'normal', days, label: `D-${days}` }
}

/** 급한 것이 위로. 마감 없는 요청은 맨 뒤. */
export function sortByUrgency(requests, now = new Date()) {
  const rank = { overdue: 0, today: 1, soon: 2, normal: 3, none: 4, closed: 5 }
  return [...requests].sort((a, b) => {
    const da = dueState(a, now)
    const db = dueState(b, now)
    if (rank[da.state] !== rank[db.state]) return rank[da.state] - rank[db.state]
    if (da.days != null && db.days != null && da.days !== db.days) return da.days - db.days
    return (a.title || '').localeCompare(b.title || '', 'ko')
  })
}
