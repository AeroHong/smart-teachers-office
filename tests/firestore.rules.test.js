/**
 * firestore.rules 검증 — 비공개 채널이 정말 새지 않는지.
 *
 *   npm run test:rules
 *
 * ── 왜 여기서만 잡히나 ──────────────────────────────────────
 *
 * 규칙 변경은 화면으로 검증할 수 없다. 막혀야 할 것이 막혔는지는 **안 보이는 것을 확인하는
 * 일**이라 눈으로는 판단이 안 되고, 무엇보다 비멤버 계정이 하나 더 있어야 한다. 지금
 * 실사용 계정은 하나뿐이라 손으로는 아예 확인이 불가능하다.
 *
 * ── 쿼리 안전성이 이 파일의 핵심이다 ─────────────────────────
 *
 * Firestore 규칙은 필터가 아니다. 읽을 수 없는 문서를 돌려줄 **가능성**이 있으면 결과를
 * 걸러 주는 게 아니라 쿼리 전체를 거부한다. 그래서 "규칙이 맞는가"만이 아니라 "클라이언트가
 * 실제로 쓰는 쿼리가 통과하는가"를 함께 봐야 한다. 규칙만 보고 짐작하기 가장 어려운
 * 지점이고, 틀리면 목록이 통째로 안 뜬다.
 *
 * 그래서 아래 테스트는 useChannels.js가 실제로 날리는 쿼리를 그대로 흉내 낸다.
 */
import { readFileSync } from 'node:fs'
import test, { after, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  assertFails, assertSucceeds, initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where,
} from 'firebase/firestore'

const SCHOOL = 'test-school'
const OTHER_SCHOOL = 'other-school'

let env

// ── 등장인물 ──────────────────────────────────────────────────
// A: 비공개 채널 참여자 / B: 같은 학교지만 참여자 아님
// ADMIN: 학교 관리자(교감·교장) / SUPER: 학교 밖 시스템 운영자
const A = 'teacher-a'
const B = 'teacher-b'
const ADMIN = 'admin-u'
const SUPER = 'super-u'
// C: DM을 새로 만드는 상대. 이미 있는 dm_A_B로는 create 규칙을 시험할 수 없다
const C = 'teacher-c'

const path = (...segs) => ['schools', SCHOOL, ...segs]

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'seonyoo-rules-test',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  })
})

after(async () => { await env?.cleanup() })

beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()

    // 규칙의 isTeacher()/isSchoolAdmin()은 users 문서를 읽는다
    await setDoc(doc(db, 'users', A), { role: 'teacher', schoolId: SCHOOL })
    await setDoc(doc(db, 'users', B), { role: 'teacher', schoolId: SCHOOL })
    await setDoc(doc(db, 'users', ADMIN), { role: 'school_admin', schoolId: SCHOOL })
    await setDoc(doc(db, 'users', C), { role: 'teacher', schoolId: SCHOOL })
    await setDoc(doc(db, 'users', SUPER), { role: 'teacher', schoolId: OTHER_SCHOOL })

    const channel = (over) => ({
      name: 'n', description: '', type: 'channel', visibility: 'public', postPolicy: 'members',
      memberRule: {}, memberRuleText: '', memberUids: [A], leftUids: [],
      createdBy: A, createdByName: 'A', archived: false, ...over,
    })
    await setDoc(doc(db, ...path('channels', 'pub')), channel())
    await setDoc(doc(db, ...path('channels', 'priv')), channel({ visibility: 'private' }))
    // B는 만든 사람이 아닌 평범한 참여자로 넣는다 — "만든 사람은 원래 뭐든 고칠 수
    // 있다"는 별개의 조항과 섞이지 않게, openInvite 전용 조항만 걸러 시험하기 위해서다.
    await setDoc(doc(db, ...path('channels', 'open')), channel({
      openInvite: true, memberUids: [A, B], leftUids: [C],
    }))
    await setDoc(doc(db, ...path('channels', 'pubOpenOff')), channel({
      openInvite: false, memberUids: [A, B],
    }))
    await setDoc(doc(db, ...path('channels', 'openPriv')), channel({
      visibility: 'private', openInvite: true, memberUids: [A, B],
    }))
    await setDoc(doc(db, ...path('channels', 'notice')), channel({ postPolicy: 'owner', memberUids: [A, B] }))
    await setDoc(doc(db, ...path('channels', `dm_${A}_${B}`)), channel({
      type: 'dm', visibility: 'private', name: '', memberUids: [A, B],
    }))

    const post = (over) => ({
      kind: 'notice', title: 't', description: '', bodyHtml: '', pinned: false,
      targetRule: {}, targetRuleText: '', targetUids: [], targetNames: [], completedUids: [],
      attachments: [], links: [], dueDate: null, status: 'open',
      createdBy: A, createdByName: 'A',
      visibility: 'school', visibleUids: [], ...over,
    })
    await setDoc(doc(db, ...path('requests', 'pubPost')), post({ channelId: 'pub' }))
    await setDoc(doc(db, ...path('requests', 'privPost')), post({
      channelId: 'priv', visibility: 'members', visibleUids: [A],
    }))
  })
})

const as = (uid, claims) => env.authenticatedContext(uid, claims).firestore()
const asSuper = () => as(SUPER, { superAdmin: true })

// ── 1. 비공개 채널은 존재 자체가 감춰진다 ──────────────────────

test('참여자는 비공개 채널을 읽는다', async () => {
  await assertSucceeds(getDoc(doc(as(A), ...path('channels', 'priv'))))
})

test('비참여 교사는 비공개 채널을 직접 URL로도 못 읽는다', async () => {
  await assertFails(getDoc(doc(as(B), ...path('channels', 'priv'))))
})

test('비참여 교사도 공개 채널은 읽는다 — "넣어달라"고 말할 수 있어야 한다', async () => {
  await assertSucceeds(getDoc(doc(as(B), ...path('channels', 'pub'))))
})

test('비공개 채널의 글은 비참여 교사에게 막힌다 — 채널만 숨기면 내용은 그대로 읽힌다', async () => {
  await assertSucceeds(getDoc(doc(as(A), ...path('requests', 'privPost'))))
  await assertFails(getDoc(doc(as(B), ...path('requests', 'privPost'))))
})

// ── 2. 클라이언트가 실제로 쓰는 쿼리가 통과하는가 ──────────────
//
// 규칙이 맞아도 쿼리가 거부되면 목록이 통째로 안 뜬다. useChannels.js와 같은 모양으로 건다.

test('[쿼리] 내 채널 목록 — where(memberUids array-contains me)', async () => {
  const snap = await assertSucceeds(getDocs(query(
    collection(as(A), ...path('channels')),
    where('memberUids', 'array-contains', A),
  )))
  // 비공개 채널도 참여자에게는 결과에 들어와야 한다
  assert.ok(snap.docs.some(d => d.id === 'priv'), '참여 중인 비공개 채널이 목록에서 빠졌다')
})

test('[쿼리] 학교 공개 글 — where(visibility == school)', async () => {
  const snap = await assertSucceeds(getDocs(query(
    collection(as(B), ...path('requests')),
    where('visibility', '==', 'school'),
  )))
  assert.equal(snap.docs.length, 1)
  assert.equal(snap.docs[0].id, 'pubPost')
})

test('[쿼리] 내가 볼 수 있는 비공개 글 — where(visibleUids array-contains me)', async () => {
  const snap = await assertSucceeds(getDocs(query(
    collection(as(A), ...path('requests')),
    where('visibleUids', 'array-contains', A),
  )))
  assert.equal(snap.docs.length, 1)
  assert.equal(snap.docs[0].id, 'privPost')
})

test('[쿼리] 조건 없는 글 조회는 교사에게 거부된다 — 예전 useChannels가 쓰던 방식', async () => {
  await assertFails(getDocs(collection(as(B), ...path('requests'))))
})

// 아래 둘은 **회귀 테스트**다. 비공개 채널을 넣으면서 규칙을 visibility/visibleUids
// 두 갈래로만 두었더니, 홈 화면과 데스크톱 알림이 쓰는 targetUids 쿼리가 통째로 거부되어
// 화면이 조용히 죽었다. 배포한 뒤에야 이 테스트로 잡았다.
// 규칙을 건드릴 때마다 "클라이언트의 모든 쿼리가 아직 통과하는가"를 여기서 확인한다.

test('[쿼리·회귀] 나에게 온 글 — where(targetUids array-contains me)', async () => {
  await assertSucceeds(getDocs(query(
    collection(as(B), ...path('requests')),
    where('targetUids', 'array-contains', B),
  )))
})

test('[쿼리·회귀] 내가 보낸 글 — where(createdBy == me)', async () => {
  await assertSucceeds(getDocs(query(
    collection(as(A), ...path('requests')),
    where('createdBy', '==', A),
  )))
})

test('[쿼리·회귀] 홈 화면이 쓰는 복합 조건 — targetUids + kind + status', async () => {
  await assertSucceeds(getDocs(query(
    collection(as(B), ...path('requests')),
    where('targetUids', 'array-contains', B),
    where('kind', '==', 'request'),
    where('status', '==', 'open'),
  )))
})

test('대상으로 지정되면 비공개 채널 글도 읽는다 — 나에게 온 일을 못 읽으면 기능이 아니다', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), ...path('requests', 'privPost')), {
      visibility: 'members', visibleUids: [A], targetUids: [B],
      channelId: 'priv', createdBy: A, completedUids: [], kind: 'notice', title: 't',
    })
  })
  await assertSucceeds(getDoc(doc(as(B), ...path('requests', 'privPost'))))
})

// ── 3. 관리자 ────────────────────────────────────────────────

test('학교 관리자는 참여하지 않은 비공개 업무 채널을 볼 수 있다', async () => {
  await assertSucceeds(getDoc(doc(as(ADMIN), ...path('channels', 'priv'))))
})

test('학교 관리자도 남의 DM은 못 본다 — 통합 설계의 예외', async () => {
  await assertFails(getDoc(doc(as(ADMIN), ...path('channels', `dm_${A}_${B}`))))
})

test('학교 관리자는 조건 없이 글을 조회할 수 있다 — RequestList 전체 목록', async () => {
  await assertSucceeds(getDocs(collection(as(ADMIN), ...path('requests'))))
})

test('슈퍼 관리자는 비공개 채널과 글을 못 읽는다 — 학교 밖 사람이다', async () => {
  await assertFails(getDoc(doc(asSuper(), ...path('channels', 'priv'))))
  await assertFails(getDoc(doc(asSuper(), ...path('requests', 'privPost'))))
})

// ── 4. 공지 전용 채널 ────────────────────────────────────────

test('공지 전용 채널에는 참여자가 글을 못 쓴다', async () => {
  const payload = {
    kind: 'notice', title: 't', channelId: 'notice', completedUids: [],
    createdBy: B, visibility: 'school', visibleUids: [],
  }
  await assertFails(setDoc(doc(as(B), ...path('requests', 'newByB')), payload))
})

test('공지 전용 채널이라도 만든 사람은 쓴다', async () => {
  await assertSucceeds(setDoc(doc(as(A), ...path('requests', 'newByA')), {
    kind: 'notice', title: 't', channelId: 'notice', completedUids: [],
    createdBy: A, visibility: 'school', visibleUids: [],
  }))
})

test('일반 채널에는 참여자 누구나 쓴다 — 되묻고 답하는 것이 채널의 값어치다', async () => {
  await assertSucceeds(setDoc(doc(as(B), ...path('requests', 'newInPub')), {
    kind: 'notice', title: 't', channelId: 'pub', completedUids: [],
    createdBy: B, visibility: 'school', visibleUids: [],
  }))
})

// ── 5. 기존 보호가 그대로인지 ─────────────────────────────────

test('남의 글은 여전히 못 고친다', async () => {
  await assertFails(updateDoc(doc(as(B), ...path('requests', 'pubPost')), { title: '바꿈' }))
})

// ── 5b. 담당자(ownerUids) 편집권(2026-09-10) ──────────────────
//
// 부장이 대신 만들어주고 실제로 챙기는 사람은 따로인 경우가 있어, 글쓴이(createdBy)
// 말고 ownerUids로 지정된 사람도 편집할 수 있게 열었다.

test('담당자(ownerUids)로 지정되면 글쓴이가 아니어도 고칠 수 있다', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await updateDoc(doc(ctx.firestore(), ...path('requests', 'pubPost')), { ownerUids: [B] })
  })
  await assertSucceeds(updateDoc(doc(as(B), ...path('requests', 'pubPost')), { title: '담당자가 고침' }))
})

test('ownerUids에 없으면 여전히 못 고친다', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await updateDoc(doc(ctx.firestore(), ...path('requests', 'pubPost')), { ownerUids: [] })
  })
  await assertFails(updateDoc(doc(as(B), ...path('requests', 'pubPost')), { title: '바꿈' }))
})

test('다른 학교 사람은 아무것도 못 읽는다', async () => {
  await assertFails(getDoc(doc(as(SUPER), ...path('channels', 'pub'))))
})

// ── 6. 채널 메시지 (P2) ───────────────────────────────────────

const msg = (over = {}) => ({ authorUid: A, authorName: 'A', body: '안녕', refRequestId: null, ...over })

test('[메시지] 참여자는 읽고 쓴다', async () => {
  await assertSucceeds(setDoc(doc(as(A), ...path('channels', 'priv', 'messages', 'm1')), msg()))
  await assertSucceeds(getDocs(collection(as(A), ...path('channels', 'priv', 'messages'))))
})

test('[메시지] 비참여 교사는 비공개 채널 메시지를 못 읽는다', async () => {
  await assertFails(getDocs(collection(as(B), ...path('channels', 'priv', 'messages'))))
  await assertFails(getDoc(doc(as(B), ...path('channels', 'priv', 'messages', 'm1'))))
})

test('[메시지] 비참여 교사는 남의 채널에 못 쓴다', async () => {
  await assertFails(setDoc(doc(as(B), ...path('channels', 'priv', 'messages', 'x')), msg({ authorUid: B })))
})

test('[메시지] 남의 이름으로 못 쓴다', async () => {
  await assertFails(setDoc(doc(as(B), ...path('channels', 'pub', 'messages', 'x')), msg({ authorUid: A })))
})

test('[메시지] 공지 전용 채널에는 참여자가 못 쓴다 — 안내가 대화에 묻히면 안 된다', async () => {
  await assertFails(setDoc(doc(as(B), ...path('channels', 'notice', 'messages', 'x')), msg({ authorUid: B })))
  await assertSucceeds(setDoc(doc(as(A), ...path('channels', 'notice', 'messages', 'y')), msg()))
})

// 2026-08-27부터 본인 글의 내용 필드는 고칠 수 있다(편집 화면이 생기면서 허용) —
// 아래는 그 허용 범위가 "본인의 내용 필드"에서 더 안 넓어졌는지 보는 회귀 테스트다.
test('[메시지] 본인 글의 내용은 고칠 수 있다', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), ...path('channels', 'pub', 'messages', 'm1')), msg())
  })
  await assertSucceeds(updateDoc(doc(as(A), ...path('channels', 'pub', 'messages', 'm1')), { body: '바꿈' }))
})

test('[메시지] 남의 메시지는 여전히 못 고친다', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), ...path('channels', 'pub', 'messages', 'm2')), msg())
  })
  await assertFails(updateDoc(doc(as(B), ...path('channels', 'pub', 'messages', 'm2')), { body: '바꿈' }))
})

test('[메시지] 내용 필드 밖은 본인 글이라도 못 바꾼다 ★', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), ...path('channels', 'pub', 'messages', 'm3')), msg())
  })
  await assertFails(updateDoc(doc(as(A), ...path('channels', 'pub', 'messages', 'm3')), { authorUid: B }))
})

test('[메시지] 자기 메시지는 지울 수 있고 남의 것은 못 지운다', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), ...path('channels', 'pub', 'messages', 'byA')), msg())
  })
  await assertFails(deleteDoc(doc(as(B), ...path('channels', 'pub', 'messages', 'byA'))))
  await assertSucceeds(deleteDoc(doc(as(A), ...path('channels', 'pub', 'messages', 'byA'))))
})

test('[메시지] 학교 관리자는 업무 채널 메시지를 볼 수 있다', async () => {
  await assertSucceeds(getDocs(collection(as(ADMIN), ...path('channels', 'priv', 'messages'))))
})

test('[메시지] 학교 관리자도 DM 메시지는 못 본다 ★', async () => {
  await assertFails(getDocs(collection(as(ADMIN), ...path('channels', `dm_${A}_${B}`, 'messages'))))
})

test('[메시지] 슈퍼 관리자는 어느 메시지도 못 본다', async () => {
  await assertFails(getDocs(collection(asSuper(), ...path('channels', 'pub', 'messages'))))
})

test('[메시지] 참여자는 lastMessageAt만 갱신할 수 있다 — 안읽음 점이 이 값으로 계산된다', async () => {
  await assertSucceeds(updateDoc(doc(as(A), ...path('channels', 'pub')), { lastMessageAt: new Date() }))
})

test('[메시지] lastMessageAt을 핑계로 명단을 못 바꾼다', async () => {
  await assertFails(updateDoc(doc(as(B), ...path('channels', 'notice')), {
    lastMessageAt: new Date(), memberUids: [A, B, 'intruder'],
  }))
})

test('[메시지] 비참여자는 lastMessageAt도 못 건드린다', async () => {
  await assertFails(updateDoc(doc(as(B), ...path('channels', 'priv')), { lastMessageAt: new Date() }))
})

// ── 6b. 시스템 알림 메시지 (참여자 변화·캔버스 신설/수정, 2026-09-07) ──────
//
// 일반 메시지와 같은 컬렉션에 type:'system'으로 섞여 들어간다. "공지 전용" 채널도
// 사실 기록은 늘 남아야 해서 channelAllowsPost를 건너뛰지만, 남을 사칭하거나
// 나중에 내용을 바꾸는 길은 그대로 막혀 있어야 한다.

test('[시스템 알림] 공지 전용 채널에서도 참여자가 시스템 알림은 남길 수 있다', async () => {
  await assertSucceeds(setDoc(
    doc(as(B), ...path('channels', 'notice', 'messages', 'sys1')),
    msg({ authorUid: B, type: 'system' }),
  ))
})

test('[시스템 알림] 글쓴이(당사자)도 나중에 고칠 수 없다 ★', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), ...path('channels', 'pub', 'messages', 'sys2')), msg({ type: 'system' }))
  })
  await assertFails(updateDoc(doc(as(A), ...path('channels', 'pub', 'messages', 'sys2')), { body: '바꿈' }))
})

test('[시스템 알림] 당사자도 못 지우고 관리자만 지운다 ★', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), ...path('channels', 'pub', 'messages', 'sys3')), msg({ type: 'system' }))
  })
  await assertFails(deleteDoc(doc(as(A), ...path('channels', 'pub', 'messages', 'sys3'))))
  await assertSucceeds(deleteDoc(doc(as(ADMIN), ...path('channels', 'pub', 'messages', 'sys3'))))
})

// ── 7. DM (P2b) ───────────────────────────────────────────────
//
// DM은 채널과 같은 컬렉션에 살면서 문서 ID로 두 사람을 못 박는다. 그 못 박음이 실제로
// 서버에서 강제되는지가 여기서 갈린다 — 클라이언트만 지키는 약속이면 콘솔이나 SDK로
// 얼마든지 우회할 수 있고, 우회하는 순간 같은 상대와 대화가 둘로 갈라진다.

const dmDoc = (over = {}) => ({
  name: '', description: '', type: 'dm', visibility: 'private', postPolicy: 'members',
  memberRule: {}, memberRuleText: '', memberUids: [A, C].sort(),
  memberNames: { [A]: 'A', [C]: 'C' }, leftUids: [],
  createdBy: A, createdByName: 'A', archived: false, ...over,
})

test('[DM] 정해진 ID로는 만들 수 있다', async () => {
  await assertSucceeds(setDoc(doc(as(A), ...path('channels', `dm_${A}_${C}`)), dmDoc()))
})

test('[DM] ID가 참여자와 맞지 않으면 못 만든다 ★', async () => {
  // 이게 뚫리면 같은 상대와 DM이 여러 개 생기고, 대화가 갈라진 뒤에는 어느 쪽에
  // 답했는지 알 수 없다
  await assertFails(setDoc(doc(as(A), ...path('channels', 'dm_아무거나')), dmDoc()))
  await assertFails(setDoc(doc(as(A), ...path('channels', `dm_${A}_${B}_${C}`)), dmDoc()))
})

test('[DM] 명단이 정렬돼 있지 않으면 못 만든다 — 정렬이 ID를 하나로 정한다', async () => {
  await assertFails(setDoc(doc(as(A), ...path('channels', `dm_${C}_${A}`)), dmDoc({
    memberUids: [C, A],
  })))
})

test('[DM] 나와의 대화(자기 자신과의 DM)는 만들 수 있다 ★', async () => {
  // memberUids가 [A, A]라 정렬 검사(<=)가 엄격한 부등호(<)였다면 여기서 막혔다 —
  // '나와의 대화' 기능이 이 한 줄에 걸려 있다.
  await assertSucceeds(setDoc(doc(as(A), ...path('channels', `dm_${A}_${A}`)), dmDoc({
    memberUids: [A, A], memberNames: { [A]: 'A' },
  })))
})

test('[DM] 내가 끼지 않은 DM은 못 만든다', async () => {
  await assertFails(setDoc(doc(as(A), ...path('channels', `dm_${B}_${C}`)), dmDoc({
    memberUids: [B, C].sort(), createdBy: A,
  })))
})

test('[DM] 3인 DM은 못 만든다 — 그러면 문서 ID가 뜻을 잃는다', async () => {
  await assertFails(setDoc(doc(as(A), ...path('channels', `dm_${A}_${C}`)), dmDoc({
    memberUids: [A, B, C].sort(),
  })))
})

test('[DM] 공개로는 못 만든다', async () => {
  await assertFails(setDoc(doc(as(A), ...path('channels', `dm_${A}_${C}`)), dmDoc({
    visibility: 'public',
  })))
})

test('[DM] dm_ 자리를 일반 채널로 차지할 수 없다 ★', async () => {
  // 막지 않으면 dm_A_B 자리에 공개 채널 하나를 만들어 두는 것만으로 두 사람이 영영
  // DM을 못 열게 막을 수 있다
  await assertFails(setDoc(doc(as(B), ...path('channels', `dm_${A}_${C}`)), dmDoc({
    type: 'channel', visibility: 'public', name: '가로채기', createdBy: B,
  })))
})

test('[DM] 참여자는 lastMessageAt만 올릴 수 있다', async () => {
  await assertSucceeds(updateDoc(doc(as(A), ...path('channels', `dm_${A}_${B}`)), {
    lastMessageAt: new Date(),
  }))
})

test('[DM] 만든 사람도 참여자를 못 바꾼다 ★', async () => {
  // 한 명을 더 넣으면 2인 대화가 아닌데 문서 ID는 여전히 두 사람을 가리킨다
  await assertFails(updateDoc(doc(as(A), ...path('channels', `dm_${A}_${B}`)), {
    memberUids: [A, B, C],
  }))
  await assertFails(updateDoc(doc(as(A), ...path('channels', `dm_${A}_${B}`)), { name: '이름' }))
})

test('[DM] 나가기/다시 참여 — 참여자는 자기 uid만 leftUids에 넣고 뺄 수 있다(2026-09-10)', async () => {
  await assertSucceeds(updateDoc(doc(as(B), ...path('channels', `dm_${A}_${B}`)), {
    leftUids: [B], updatedAt: new Date(),
  }))
  await assertSucceeds(updateDoc(doc(as(B), ...path('channels', `dm_${A}_${B}`)), {
    leftUids: [], updatedAt: new Date(),
  }))
})

test('[DM] 나가기는 남을 대신 내보낼 수 없고, 다른 필드와 함께 바꿀 수도 없다', async () => {
  await assertFails(updateDoc(doc(as(B), ...path('channels', `dm_${A}_${B}`)), {
    leftUids: [A], updatedAt: new Date(),
  }))
  await assertFails(updateDoc(doc(as(B), ...path('channels', `dm_${A}_${B}`)), {
    leftUids: [B], name: '몰래 이름', updatedAt: new Date(),
  }))
})

test('[DM] 학교 관리자는 남의 DM을 못 고친다 — 읽지도 못하는 대화다', async () => {
  await assertFails(updateDoc(doc(as(ADMIN), ...path('channels', `dm_${A}_${B}`)), {
    name: '관리자가 붙인 이름',
  }))
})

test('[DM] 참여자는 지울 수 있다 — 지우면 상대 화면에서도 함께 사라진다(2026-09-10, 사용자 확정)', async () => {
  // 만든 사람(A)이 아니라 참여자일 뿐인 B가 지운다 — DM은 "만든 사람"이 특별하지 않다.
  await assertSucceeds(deleteDoc(doc(as(B), ...path('channels', `dm_${A}_${B}`))))
})

test('[DM] 참여자가 아니면 못 지운다 — 학교 관리자도 마찬가지다', async () => {
  await assertFails(deleteDoc(doc(as(C), ...path('channels', `dm_${A}_${B}`))))
  await assertFails(deleteDoc(doc(as(ADMIN), ...path('channels', `dm_${A}_${B}`))))
})

// ── 7b. 그룹 DM(3인 이상, 2026-09-10) ───────────────────────────
//
// 2인 DM과 달리 결정적 문서 ID가 없어 일반 채널처럼 자동 ID를 쓴다. type만으로
// "일반 채널이 아니다"를 규칙에서 구분해야 한다.

const groupDmDoc = (over = {}) => ({
  name: '', description: '', type: 'dm', visibility: 'private', postPolicy: 'members',
  memberRule: {}, memberRuleText: '', memberUids: [A, B, C], leftUids: [],
  memberNames: { [A]: 'A', [B]: 'B', [C]: 'C' },
  createdBy: A, createdByName: 'A', archived: false, ...over,
})

test('[그룹 DM] 3인 이상이면 자동 ID로 만들 수 있다', async () => {
  await assertSucceeds(setDoc(doc(as(A), ...path('channels', 'group1')), groupDmDoc()))
})

test('[그룹 DM] 2인이면 자동 ID로는 못 만든다 — 그건 dm_ 결정적 ID로만 만든다', async () => {
  await assertFails(setDoc(doc(as(A), ...path('channels', 'group2')), groupDmDoc({
    memberUids: [A, B], memberNames: { [A]: 'A', [B]: 'B' },
  })))
})

test('[그룹 DM] 내가 끼지 않으면 못 만든다', async () => {
  await assertFails(setDoc(doc(as(C), ...path('channels', 'group3')), groupDmDoc({
    createdBy: C, memberUids: [A, B, ADMIN],
  })))
})

test('[그룹 DM] 공개로는 못 만든다', async () => {
  await assertFails(setDoc(doc(as(A), ...path('channels', 'group4')), groupDmDoc({
    visibility: 'public',
  })))
})

test('[DM] 일반 채널의 보관·나가기·삭제는 그대로 된다', async () => {
  await assertSucceeds(updateDoc(doc(as(A), ...path('channels', 'pub')), { archived: true }))
  await assertSucceeds(updateDoc(doc(as(B), ...path('channels', 'notice')), {
    leftUids: [B], updatedAt: new Date(),
  }))
  await assertSucceeds(deleteDoc(doc(as(A), ...path('channels', 'pub'))))
})

test('[DM] 제3자는 남의 DM에 메시지를 못 쓴다', async () => {
  await assertFails(setDoc(doc(as(ADMIN), ...path('channels', `dm_${A}_${B}`, 'messages', 'x')), {
    authorUid: ADMIN, authorName: 'ADMIN', body: '끼어들기', refRequestId: null,
  }))
})

// ── 8. 공개 채널 자가 참여 (디렉터리) ──────────────────────────
//
// 디렉터리에서 둘러보다 "참여"를 누르는 경로다. 명단(memberUids)은 비공개 채널에서 곧
// 글 열람 권한(visibleUids)이라, 여기가 뚫리면 남의 비공개 글을 읽는 길이 열린다.

test('[참여] 공개 채널에는 스스로 들어간다', async () => {
  await assertSucceeds(updateDoc(doc(as(B), ...path('channels', 'pub')), {
    memberUids: [A, B], leftUids: [], updatedAt: new Date(),
  }))
})

test('[참여] 비공개 채널에는 스스로 못 들어간다 ★', async () => {
  await assertFails(updateDoc(doc(as(B), ...path('channels', 'priv')), {
    memberUids: [A, B], leftUids: [], updatedAt: new Date(),
  }))
})

test('[참여] 남을 끌어들일 수는 없다', async () => {
  await assertFails(updateDoc(doc(as(B), ...path('channels', 'pub')), {
    memberUids: [A, B, C], leftUids: [], updatedAt: new Date(),
  }))
})

test('[참여] 참여하면서 남을 내보낼 수는 없다 ★', async () => {
  // 자기를 넣는 김에 명단을 갈아치우는 것을 막는다
  await assertFails(updateDoc(doc(as(B), ...path('channels', 'pub')), {
    memberUids: [B], leftUids: [], updatedAt: new Date(),
  }))
})

test('[참여] 참여를 핑계로 다른 필드를 못 바꾼다', async () => {
  await assertFails(updateDoc(doc(as(B), ...path('channels', 'pub')), {
    memberUids: [A, B], name: '가로챈 이름', updatedAt: new Date(),
  }))
  await assertFails(updateDoc(doc(as(B), ...path('channels', 'pub')), {
    memberUids: [A, B], visibility: 'private', updatedAt: new Date(),
  }))
})

test('[참여] 둘러보기 쿼리는 공개 채널만 돌려준다 ★', async () => {
  // 규칙은 필터가 아니라서, 이 쿼리가 통과한다는 것 자체가 비공개가 안 섞인다는 증명이다
  const snap = await assertSucceeds(getDocs(query(
    collection(as(B), ...path('channels')),
    where('visibility', '==', 'public'),
  )))
  assert.ok(snap.docs.length > 0)
  assert.ok(snap.docs.every(d => d.data().visibility === 'public'))
  assert.ok(!snap.docs.some(d => d.id === 'priv'))
})

test('[참여] 조건 없이 채널을 통째로 훑을 수는 없다', async () => {
  await assertFails(getDocs(collection(as(B), ...path('channels'))))
})

// ── 9. "누구나 초대 가능" — 참여자가 남을 데려온다 ────────────────
//
// 자가 참여(§8)와 짝이지만, 움직이는 uid가 나 자신이 아니어도 된다는 점이 다르다.
// 그래서 늘리는 쪽만 열고 줄이는 쪽(내보내기)은 이 조항으로는 아예 못 하게 막았는지가
// 검증의 핵심이다.

test('[초대] openInvite 켠 공개 채널은 만든 사람이 아닌 참여자도 남을 데려온다', async () => {
  await assertSucceeds(updateDoc(doc(as(B), ...path('channels', 'open')), {
    memberUids: [A, B, C], leftUids: [], updatedAt: new Date(),
  }))
})

test('[초대] 참여자가 아니면 남을 데려올 수 없다', async () => {
  // C 자신을 넣는 게 아니라 제3자('teacher-d')를 끌어들이려는 시도라, 자가 참여
  // 조항(selfOnlyUidChange)으로도 못 빠져나간다 — 참여자가 아니라는 것만 걸린다.
  await assertFails(updateDoc(doc(as(C), ...path('channels', 'open')), {
    memberUids: [A, B, 'teacher-d'], updatedAt: new Date(),
  }))
})

test('[초대] openInvite 꺼진 공개 채널에서는 참여자도 남을 못 데려온다 ★', async () => {
  await assertFails(updateDoc(doc(as(B), ...path('channels', 'pubOpenOff')), {
    memberUids: [A, B, C], leftUids: [], updatedAt: new Date(),
  }))
})

test('[초대] 초대를 핑계로 남을 내보낼 수는 없다 ★', async () => {
  await assertFails(updateDoc(doc(as(B), ...path('channels', 'open')), {
    memberUids: [B, C], leftUids: [], updatedAt: new Date(),
  }))
})

test('[초대] 비공개 채널은 openInvite를 켜놔도 초대가 안 된다 ★', async () => {
  // 참여자 명단이 곧 글 열람 권한이라(visibleUids), 공개 채널에만 여는 것이 원칙이다.
  // B는 만든 사람이 아닌 평범한 참여자라, 이 실패는 오직 이 조항의 판단이다.
  await assertFails(updateDoc(doc(as(B), ...path('channels', 'openPriv')), {
    memberUids: [A, B, C], leftUids: [], updatedAt: new Date(),
  }))
})

test('[초대] 예전에 나갔던 사람을 다시 데려오면 나감 표시도 같이 지워진다', async () => {
  // 'open' 채널 fixture는 leftUids에 C를 미리 넣어 두었다
  await assertSucceeds(updateDoc(doc(as(B), ...path('channels', 'open')), {
    memberUids: [A, B, C], leftUids: [], updatedAt: new Date(),
  }))
})

test('[초대] 초대를 핑계로 다른 필드를 못 바꾼다', async () => {
  await assertFails(updateDoc(doc(as(B), ...path('channels', 'open')), {
    memberUids: [A, B, C], name: '가로챈 이름', updatedAt: new Date(),
  }))
})
