/**
 * 채널 로직 검증.
 *   node --test apps/shared/lib/channels.test.js
 *
 * 채널 목록의 뱃지가 틀리면 "챙길 게 없다"고 믿고 지나치게 된다. 마감 판정과 집계는
 * 화면을 눈으로 봐서는 안 잡히므로 여기서 잡는다.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CANVAS_TAB_MAX, CHANNEL_NAME_MAX, CHANNEL_TYPE, POST_POLICY, VISIBILITY,
  canManageChannel, canPostTo, channelPostPolicy, channelStats, channelType, channelVisibility,
  dmTitle, hasLeft, isDm, isLivePost, isMember, isPrivateChannel, memberDiff, newChannelPayload,
  newDmPayload, postVisibilityFor, sortCanvasTabs, sortChannels, sortDms, validateChannelName,
} from './channels.js'

const NOW = new Date('2026-08-02T10:00:00')

const post = (over = {}) => ({
  kind: 'request', targetUids: ['a', 'b'], completedUids: [], dueDate: null, ...over,
})

test('새 채널은 참여자 uid를 펼쳐 담는다 — array-contains로 내 채널을 뽑아야 한다', () => {
  const p = newChannelPayload({
    name: '성적-마감',
    members: [{ uid: 'u1' }, { uid: 'u2' }],
    createdBy: 'u1',
  })
  assert.deepEqual(p.memberUids, ['u1', 'u2'])
  assert.equal(p.archived, false)
})

test('이름과 설명은 길이를 자른다', () => {
  const p = newChannelPayload({ name: '가'.repeat(50), description: '나'.repeat(300), createdBy: 'u1' })
  assert.equal(p.name.length, CHANNEL_NAME_MAX)
  assert.equal(p.description.length, 120)
})

test('앞뒤 공백은 이름에 남지 않는다', () => {
  assert.equal(newChannelPayload({ name: '  성적-마감  ', createdBy: 'u1' }).name, '성적-마감')
})


// ── 집계 ────────────────────────────────────────────────
test('대상 전원이 완료한 글은 진행 중으로 세지 않는다', () => {
  const s = channelStats([
    post({ completedUids: ['a', 'b'] }),   // 끝남
    post({ completedUids: ['a'] }),        // 진행 중
  ], NOW)
  assert.equal(s.total, 2)
  assert.equal(s.openCount, 1)
})

test('안내는 진행 중으로 세지 않는다 — 완료 개념이 없다', () => {
  const s = channelStats([post({ kind: 'notice' }), post()], NOW)
  assert.equal(s.total, 2)
  assert.equal(s.openCount, 1)
})

test('마감이 지났고 아직 안 끝난 글을 센다', () => {
  const s = channelStats([
    post({ dueDate: new Date('2026-07-30') }),                        // 지남
    post({ dueDate: new Date('2026-08-10') }),                        // 남음
    post({ dueDate: new Date('2026-07-01'), completedUids: ['a', 'b'] }), // 지났지만 끝남
  ], NOW)
  assert.equal(s.overdueCount, 1)
  assert.equal(s.openCount, 2)
})

test('마감일 당일은 아직 지나지 않은 것', () => {
  const s = channelStats([post({ dueDate: new Date('2026-08-02T23:00:00') })], NOW)
  assert.equal(s.overdueCount, 0)
})

test('Firestore Timestamp 형태의 마감일도 받는다', () => {
  const ts = { toDate: () => new Date('2026-07-20') }
  assert.equal(channelStats([post({ dueDate: ts })], NOW).overdueCount, 1)
})

test('대상이 0명인 글을 끝난 것으로 치지 않는다 — every는 빈 배열에 참이다', () => {
  assert.equal(channelStats([post({ targetUids: [] })], NOW).openCount, 1)
})

test('글이 없는 채널', () => {
  assert.deepEqual(channelStats([], NOW), { total: 0, openCount: 0, overdueCount: 0 })
})


// ── 정렬 ────────────────────────────────────────────────
test('마감 지난 것이 있는 채널이 맨 위로', () => {
  const list = [
    { name: '나채널', stats: { overdueCount: 0, openCount: 5 } },
    { name: '가채널', stats: { overdueCount: 1, openCount: 1 } },
    { name: '다채널', stats: { overdueCount: 0, openCount: 0 } },
  ]
  assert.deepEqual(sortChannels(list).map(c => c.name), ['가채널', '나채널', '다채널'])
})

test('같은 급이면 가나다순 — 자리가 흔들리면 못 찾는다', () => {
  const list = [
    { name: '연구부', stats: { overdueCount: 0, openCount: 2 } },
    { name: '교무기획부', stats: { overdueCount: 0, openCount: 2 } },
  ]
  assert.deepEqual(sortChannels(list).map(c => c.name), ['교무기획부', '연구부'])
})

test('정렬이 원본을 건드리지 않는다', () => {
  const list = [{ name: '나', stats: {} }, { name: '가', stats: {} }]
  sortChannels(list)
  assert.equal(list[0].name, '나')
})

test('stats가 없어도 깨지지 않는다', () => {
  assert.doesNotThrow(() => sortChannels([{ name: '가' }, { name: '나' }]))
})


// ── 이름 검증 ────────────────────────────────────────────
test('빈 이름은 막는다', () => {
  assert.ok(validateChannelName(''))
  assert.ok(validateChannelName('   '))
})

test('같은 이름은 막는다 — 대소문자·공백 차이는 같은 것으로 본다', () => {
  assert.ok(validateChannelName('성적-마감', ['성적-마감']))
  assert.ok(validateChannelName(' 성적-마감 ', ['성적-마감']))
  assert.ok(validateChannelName('NEIS', ['neis']))
})

test('다른 이름은 통과', () => {
  assert.equal(validateChannelName('성적-마감', ['연수-신청']), null)
})


// ── 참여 판정 ────────────────────────────────────────────
test('만든 사람은 조건에서 빠져도 계속 본다', () => {
  // 조건을 좁히다가 자기가 빠지면 자기 채널에 못 들어간다
  const ch = { createdBy: 'u1', memberUids: ['u2', 'u3'] }
  assert.equal(isMember(ch, 'u1'), true)
  assert.equal(isMember(ch, 'u2'), true)
  assert.equal(isMember(ch, 'u9'), false)
})

test('빈 값을 넣어도 깨지지 않는다', () => {
  assert.equal(isMember(null, 'u1'), false)
  assert.equal(isMember({ memberUids: ['u1'] }, null), false)
  assert.equal(isMember({}, 'u1'), false)
})


// ── 나가기 ──────────────────────────────────────────────
test('새 채널에는 나간 사람이 없다 — 필드가 없으면 규칙에서 기본값을 따로 챙겨야 한다', () => {
  assert.deepEqual(newChannelPayload({ name: '성적-마감', createdBy: 'u1' }).leftUids, [])
})

test('나간 사람은 조건에 남아 있어도 참여자로 보지 않는다 — 갱신해도 되살아나면 안 된다', () => {
  const ch = { createdBy: 'u9', memberUids: ['u1', 'u2'], leftUids: ['u1'] }
  assert.equal(hasLeft(ch, 'u1'), true)
  assert.equal(isMember(ch, 'u1'), false)
  assert.equal(isMember(ch, 'u2'), true)
})

test('만든 사람도 나가면 목록에서 빠진다 — 안 그러면 나가기가 아무 일도 안 한다', () => {
  const ch = { createdBy: 'u1', memberUids: [], leftUids: ['u1'] }
  assert.equal(isMember(ch, 'u1'), false)
})

test('leftUids가 없는 옛 문서도 그대로 동작한다', () => {
  assert.equal(hasLeft({ memberUids: ['u1'] }, 'u1'), false)
  assert.equal(hasLeft(null, 'u1'), false)
  assert.equal(hasLeft({ leftUids: ['u1'] }, null), false)
  assert.equal(isMember({ createdBy: 'u1' }, 'u1'), true)
})


// ── 관리 권한 ────────────────────────────────────────────
test('보관·갱신은 만든 사람과 관리자만 — 규칙과 같은 판정을 화면에서도 한다', () => {
  const ch = { createdBy: 'u1', memberUids: ['u1', 'u2'] }
  assert.equal(canManageChannel(ch, 'u1', false), true)
  assert.equal(canManageChannel(ch, 'u2', false), false)
  assert.equal(canManageChannel(ch, 'u2', true), true)
})

test('빈 값이면 권한 없음으로 본다 — 로그인 전에 버튼이 열려 보이면 안 된다', () => {
  assert.equal(canManageChannel(null, 'u1', true), false)
  assert.equal(canManageChannel({ createdBy: 'u1' }, null, true), false)
})


// ── 참여자 갱신 감지 ──────────────────────────────────────
test('조건을 다시 푼 결과와 저장된 명단의 차이를 낸다', () => {
  const d = memberDiff(['u1', 'u2', 'u3'], ['u2', 'u3', 'u4'])
  assert.deepEqual(d.added, ['u4'])
  assert.deepEqual(d.removed, ['u1'])
  assert.equal(d.changed, true)
})

test('순서만 다른 것은 변화가 아니다 — 이름순 정렬 탓에 uid 순서는 수시로 바뀐다', () => {
  const d = memberDiff(['u1', 'u2', 'u3'], ['u3', 'u1', 'u2'])
  assert.deepEqual(d, { added: [], removed: [], changed: false })
})

test('중복 uid는 변화로 세지 않는다', () => {
  assert.equal(memberDiff(['u1', 'u1', 'u2'], ['u2', 'u1']).changed, false)
})

test('아무도 안 남는 조건이면 전원이 빠질 사람으로 나온다 — 이게 안 보이면 조용히 빈 채널이 된다', () => {
  const d = memberDiff(['u1', 'u2'], [])
  assert.deepEqual(d.removed, ['u1', 'u2'])
  assert.deepEqual(d.added, [])
  assert.equal(d.changed, true)
})

test('처음부터 비어 있던 채널에 사람이 생기면 전원이 추가로 나온다', () => {
  const d = memberDiff([], ['u1', 'u2'])
  assert.deepEqual(d.added, ['u1', 'u2'])
  assert.equal(d.changed, true)
})

test('둘 다 비어 있으면 갱신할 것이 없다', () => {
  assert.deepEqual(memberDiff([], []), { added: [], removed: [], changed: false })
})

test('인자를 안 넘기거나 null이어도 깨지지 않는다 — 옛 문서엔 memberUids가 없을 수 있다', () => {
  assert.deepEqual(memberDiff(), { added: [], removed: [], changed: false })
  assert.deepEqual(memberDiff(null, null), { added: [], removed: [], changed: false })
  assert.deepEqual(memberDiff(undefined, ['u1']).added, ['u1'])
})

test('빈 문자열 uid는 걸러낸다 — 명단 수가 조용히 어긋난다', () => {
  assert.equal(memberDiff(['u1', ''], ['u1']).changed, false)
})

test('결과는 정렬해서 돌려준다 — 갱신 안내 문구가 매번 다른 순서로 보이면 안 된다', () => {
  const d = memberDiff(['u3'], ['u2', 'u9', 'u1'])
  assert.deepEqual(d.added, ['u1', 'u2', 'u9'])
})

test('원본 배열을 건드리지 않는다', () => {
  const saved = ['u2', 'u1']
  memberDiff(saved, ['u3'])
  assert.deepEqual(saved, ['u2', 'u1'])
})

// ── 공개 범위 · 쓰기 권한 (2026-08-24, 채널 재편 P1) ───────────

test('옛 문서에는 새 필드가 없다 — 읽을 때는 공개 채널로 흡수한다', () => {
  const old = { name: '성적-마감', memberUids: ['u1'], createdBy: 'u1' }
  assert.equal(channelType(old), CHANNEL_TYPE.CHANNEL)
  assert.equal(channelVisibility(old), VISIBILITY.PUBLIC)
  assert.equal(channelPostPolicy(old), POST_POLICY.MEMBERS)
  assert.equal(isPrivateChannel(old), false)
  // null·undefined도 같은 자리에서 흡수한다
  assert.equal(channelVisibility(null), VISIBILITY.PUBLIC)
  assert.equal(isPrivateChannel(undefined), false)
})

test('새 채널은 세 필드를 반드시 채워 넣는다 — 쿼리로 걸러야 하는 값이라 비면 목록에서 사라진다', () => {
  const p = newChannelPayload({ name: 'x', members: [{ uid: 'u1' }], createdBy: 'u1' })
  assert.equal(p.type, CHANNEL_TYPE.CHANNEL)
  assert.equal(p.visibility, VISIBILITY.PUBLIC)
  assert.equal(p.postPolicy, POST_POLICY.MEMBERS)
})

test('모르는 값이 들어오면 안전한 쪽으로 떨어진다', () => {
  const p = newChannelPayload({
    name: 'x', members: [], createdBy: 'u1',
    visibility: '아무거나', postPolicy: '아무거나', type: '아무거나',
  })
  assert.equal(p.visibility, VISIBILITY.PUBLIC)
  assert.equal(p.postPolicy, POST_POLICY.MEMBERS)
  assert.equal(p.type, CHANNEL_TYPE.CHANNEL)
})

test('비공개 채널로 만들면 그대로 저장된다', () => {
  const p = newChannelPayload({
    name: '특수교육', members: [{ uid: 'u1' }], createdBy: 'u1',
    visibility: VISIBILITY.PRIVATE, postPolicy: POST_POLICY.OWNER,
  })
  assert.equal(p.visibility, VISIBILITY.PRIVATE)
  assert.equal(p.postPolicy, POST_POLICY.OWNER)
})

test('공개 채널 글에는 visibleUids를 넣지 않는다 — 인사이동 때마다 전교 글을 갱신하게 된다', () => {
  const pub = { visibility: VISIBILITY.PUBLIC, memberUids: ['u1', 'u2'] }
  assert.deepEqual(postVisibilityFor(pub), { visibility: 'school', visibleUids: [] })
  // 채널 없는 글도 학교 공개다
  assert.deepEqual(postVisibilityFor(null), { visibility: 'school', visibleUids: [] })
})

test('비공개 채널 글은 참여자 명단을 복사해 간다 — 채널만 숨기면 내용은 그대로 읽힌다', () => {
  const priv = { visibility: VISIBILITY.PRIVATE, memberUids: ['u1', 'u2', 'u1'] }
  const v = postVisibilityFor(priv)
  assert.equal(v.visibility, 'members')
  assert.deepEqual(v.visibleUids, ['u1', 'u2'], '중복은 걸러야 한다')
})

test('공지 전용 채널은 주인과 관리자만 쓴다', () => {
  const ch = {
    createdBy: 'owner', memberUids: ['owner', 'member'],
    postPolicy: POST_POLICY.OWNER,
  }
  assert.equal(canPostTo(ch, 'owner'), true)
  assert.equal(canPostTo(ch, 'member'), false)
  assert.equal(canPostTo(ch, 'member', true), true, '학교 관리자는 쓸 수 있다')
})

test('일반 채널은 참여자 전원이 쓴다 — 되묻고 답하는 것이 채널의 값어치다', () => {
  const ch = { createdBy: 'owner', memberUids: ['owner', 'member'] }
  assert.equal(canPostTo(ch, 'member'), true)
})

test('참여자가 아니면 어느 채널에도 못 쓴다', () => {
  const ch = { createdBy: 'owner', memberUids: ['owner'] }
  assert.equal(canPostTo(ch, 'outsider'), false)
  assert.equal(canPostTo(ch, 'outsider', true), false, '관리자라도 참여자가 아니면 못 쓴다')
})

test('나간 사람은 못 쓴다 — 나가기가 아무 일도 안 하는 버튼이 되면 안 된다', () => {
  const ch = { createdBy: 'owner', memberUids: ['owner', 'member'], leftUids: ['member'] }
  assert.equal(canPostTo(ch, 'member'), false)
})

// ── DM (P2b) ──────────────────────────────────────────────────

test('DM 문서는 항상 비공개·2인·이름 없음이다', () => {
  const dm = newDmPayload({ me: { uid: 'u2', name: '나' }, other: { uid: 'u1', name: '상대' } })
  assert.equal(dm.type, CHANNEL_TYPE.DM)
  assert.equal(dm.visibility, VISIBILITY.PRIVATE)
  assert.equal(dm.postPolicy, POST_POLICY.MEMBERS, '둘 다 쓸 수 있어야 대화가 된다')
  assert.equal(dm.name, '')
  assert.equal(dm.memberUids.length, 2)
})

test('memberUids는 정렬해서 넣는다 — 문서 ID와 보안 규칙이 그 순서를 전제한다', () => {
  const dm = newDmPayload({ me: { uid: 'u2' }, other: { uid: 'u1' } })
  assert.deepEqual(dm.memberUids, ['u1', 'u2'])
  // 누가 먼저 말을 걸든 같은 명단이 나와야 문서 ID가 하나로 정해진다
  const other = newDmPayload({ me: { uid: 'u1' }, other: { uid: 'u2' } })
  assert.deepEqual(other.memberUids, dm.memberUids)
})

test('만든 사람은 말을 건 쪽으로 남는다 — 명단 순서와 무관하다', () => {
  const dm = newDmPayload({ me: { uid: 'u2', name: '나' }, other: { uid: 'u1', name: '상대' } })
  assert.equal(dm.createdBy, 'u2')
  assert.equal(dm.createdByName, '나')
})

test('이름을 문서에 박아둔다 — 사이드바는 교직원 명단을 읽지 않는다', () => {
  const dm = newDmPayload({ me: { uid: 'u1', name: '김교사' }, other: { uid: 'u2', name: '이교사' } })
  assert.deepEqual(dm.memberNames, { u1: '김교사', u2: '이교사' })
  assert.equal(dmTitle(dm, 'u1'), '이교사', '내가 보면 상대 이름')
  assert.equal(dmTitle(dm, 'u2'), '김교사', '상대가 보면 내 이름')
})

test('이름이 비어 있어도 빈 줄을 만들지 않는다', () => {
  const dm = newDmPayload({ me: { uid: 'u1' }, other: { uid: 'u2' } })
  assert.equal(dmTitle(dm, 'u1'), '(이름 없음)')
})

test('나 자신과의 대화는 상대가 없다고 밝힌다', () => {
  assert.equal(dmTitle({ memberUids: ['u1'], memberNames: { u1: '나' } }, 'u1'), '나와의 대화')
})

test('isDm은 type으로만 판정한다 — 2인 채널이라고 DM인 것은 아니다', () => {
  assert.equal(isDm({ type: 'dm' }), true)
  assert.equal(isDm({ type: 'channel', memberUids: ['a', 'b'] }), false)
  assert.equal(isDm({ memberUids: ['a', 'b'] }), false, '옛 문서에는 type이 없다')
})

test('DM 목록은 최근에 말이 오간 순이다 — 대화에는 마감이 없다', () => {
  const dm = (id, at, name) => ({
    id, lastMessageAt: at, memberUids: ['me', id], memberNames: { me: '나', [id]: name },
  })
  const sorted = sortDms([
    dm('a', new Date('2026-08-01'), '가'),
    dm('b', new Date('2026-08-03'), '나'),
    dm('c', new Date('2026-08-02'), '다'),
  ], 'me')
  assert.deepEqual(sorted.map(c => c.id), ['b', 'c', 'a'])
})

test('한 마디도 오가지 않은 DM은 맨 아래로 — 이름순으로 자리가 흔들리지 않게', () => {
  const dm = (id, name) => ({ id, memberUids: ['me', id], memberNames: { me: '나', [id]: name } })
  const sorted = sortDms([dm('b', '이교사'), dm('a', '김교사')], 'me')
  assert.deepEqual(sorted.map(c => c.id), ['a', 'b'])
})

// ── 캔버스 탭 (P3-1) ──────────────────────────────────────────

const NOW_TAB = new Date('2026-08-24T10:00:00')

test('전원이 완료한 요청은 탭에서 빠진다 — 자동 판정', () => {
  assert.equal(isLivePost({ kind: 'request', targetUids: ['a', 'b'], completedUids: ['a'] }), true)
  assert.equal(isLivePost({ kind: 'request', targetUids: ['a', 'b'], completedUids: ['a', 'b'] }), false)
})

test('마감이 지난 요청은 탭에 남는다 — 끝난 게 아니라 가장 급한 것이다 ★', () => {
  const post = {
    kind: 'request', targetUids: ['a'], completedUids: [], dueDate: new Date('2026-08-01'),
  }
  assert.equal(isLivePost(post, NOW_TAB), true)
})

test('안내는 완료 개념이 없어 마감일로 판정한다', () => {
  const notice = (due) => ({ kind: 'notice', targetUids: [], completedUids: [], dueDate: due })
  assert.equal(isLivePost(notice(new Date('2026-08-01')), NOW_TAB), false, '지난 안내는 빠진다')
  assert.equal(isLivePost(notice(new Date('2026-08-30')), NOW_TAB), true)
  assert.equal(isLivePost(notice(null), NOW_TAB), true, '마감일이 없으면 끝난 신호가 없다')
})

test('대상이 0명인 요청은 끝난 걸로 치지 않는다 — 아직 대상을 못 정한 글이다', () => {
  assert.equal(isLivePost({ kind: 'request', targetUids: [], completedUids: [] }), true)
})

test('사람이 치운 글은 아직 안 끝났어도 빠진다', () => {
  assert.equal(isLivePost({
    kind: 'request', targetUids: ['a'], completedUids: [], archived: true,
  }), false)
})

test('사람이 다시 꺼낸 글은 끝났어도 남는다 ★', () => {
  // 되돌리기가 필드를 지우는 방식이었다면 자동 판정이 곧바로 다시 치워버린다
  assert.equal(isLivePost({
    kind: 'request', targetUids: ['a'], completedUids: ['a'], archived: false,
  }), true)
})

test('탭 순서는 최근에 만든 것이 앞 — 넘치는 것을 오래된 것부터 접기 위해서다', () => {
  const p = (id, at) => ({ id, createdAt: new Date(at) })
  const sorted = sortCanvasTabs([p('old', '2026-08-01'), p('new', '2026-08-20'), p('mid', '2026-08-10')])
  assert.deepEqual(sorted.map(x => x.id), ['new', 'mid', 'old'])
})

test('만든 시각이 없는 글도 순서에서 빠지지 않는다', () => {
  const sorted = sortCanvasTabs([{ id: 'a' }, { id: 'b', createdAt: new Date('2026-08-01') }])
  assert.equal(sorted.length, 2)
  assert.equal(sorted[0].id, 'b', '시각이 있는 쪽이 앞')
})

test('탭 상한은 정해져 있다 — 넘치면 접는 쪽이지 목록으로 되돌리지 않는다', () => {
  assert.ok(CANVAS_TAB_MAX >= 1 && CANVAS_TAB_MAX <= 8)
})
