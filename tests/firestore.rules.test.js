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
    await setDoc(doc(db, 'users', SUPER), { role: 'teacher', schoolId: OTHER_SCHOOL })

    const channel = (over) => ({
      name: 'n', description: '', type: 'channel', visibility: 'public', postPolicy: 'members',
      memberRule: {}, memberRuleText: '', memberUids: [A], leftUids: [],
      createdBy: A, createdByName: 'A', archived: false, ...over,
    })
    await setDoc(doc(db, ...path('channels', 'pub')), channel())
    await setDoc(doc(db, ...path('channels', 'priv')), channel({ visibility: 'private' }))
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

test('[메시지] 보낸 뒤에도 고칠 수 없다 — 편집 화면이 없는데 규칙이 넓으면 몰래 말을 바꾼다', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), ...path('channels', 'pub', 'messages', 'm1')), msg())
  })
  await assertFails(updateDoc(doc(as(A), ...path('channels', 'pub', 'messages', 'm1')), { body: '바꿈' }))
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
