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
    // DM 캔버스(2026-09-10) — postVisibilityFor()가 DM도 비공개 채널과 똑같이 다뤄
    // visibility/visibleUids를 참여자(A, B)로 채운다. 관리자(ADMIN)는 이 둘 다에
    // 안 들어 있으니, isSchoolAdmin 우회가 꺼졌는지가 실제 시험 대상이다.
    await setDoc(doc(db, ...path('requests', 'dmPost')), post({
      channelId: `dm_${A}_${B}`, visibility: 'members', visibleUids: [A, B],
    }))

    // emailJobs 규칙의 create 조건이 schools/{schoolId}.workspaceSync.enabled를 get()으로
    // 확인하므로, 그 문서를 직접 심어둔다. OTHER_SCHOOL은 의도적으로 이 문서를 만들지
    // 않는다 — Workspace 연동을 아예 설정한 적 없는 학교(문서 자체가 없음)에서도 발송이
    // 막히는지를 확인하기 위해서다.
    await setDoc(doc(db, 'schools', SCHOOL), { name: '테스트고', workspaceSync: { enabled: true } })

    // 학사일정 — 전체 공개분과 '대상자만' 항목(업무 마감 자동 반영, requestCalendarSync.js)
    await setDoc(doc(db, ...path('academicCalendar', 'open')), {
      title: '개학식', type: '학사', date: new Date('2026-09-01'), source: 'manual', audience: 'all',
    })
    await setDoc(doc(db, ...path('academicCalendar', 'req_secret')), {
      title: '비공개 채널 업무 마감', type: '업무', date: new Date('2026-09-02'),
      source: 'request', channelId: 'priv', audience: 'limited', audienceUids: [A],
    })
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
  // privPost(비공개 채널)와 dmPost(DM 캔버스, 2026-09-10 추가) 둘 다 A가
  // visibleUids에 들어 있다 — DM도 비공개 채널과 같은 방식으로 계산되기 때문이다.
  const snap = await assertSucceeds(getDocs(query(
    collection(as(A), ...path('requests')),
    where('visibleUids', 'array-contains', A),
  )))
  assert.deepEqual(snap.docs.map(d => d.id).sort(), ['dmPost', 'privPost'])
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

// ── 5c. DM 캔버스 프라이버시(2026-09-10) ────────────────────────
//
// DM 메시지는 관리자도 못 읽는다는 것이 이미 못 박힌 약속이다. DM 안에 캔버스를
// 열면서 그 약속이 캔버스에서만 새면 안 된다 — 아래는 정확히 그 새는 자리
// (requests 문서 자체와 comments/blockReactions/completions 하위 컬렉션)를 막았는지 시험한다.

test('[DM 캔버스] 참여자는 읽는다', async () => {
  await assertSucceeds(getDoc(doc(as(A), ...path('requests', 'dmPost'))))
  await assertSucceeds(getDoc(doc(as(B), ...path('requests', 'dmPost'))))
})

test('[DM 캔버스] 학교 관리자는 못 읽는다 ★ — DM 메시지와 같은 약속', async () => {
  await assertFails(getDoc(doc(as(ADMIN), ...path('requests', 'dmPost'))))
})

test('[DM 캔버스] 참여자가 아닌 교사도 못 읽는다', async () => {
  await assertFails(getDoc(doc(as(C), ...path('requests', 'dmPost'))))
})

test('[DM 캔버스] 참여자만 만들 수 있다 — channelAllowsPost의 postPolicy 지름길을 안 쓴다', async () => {
  const payload = {
    kind: 'notice', title: 't', channelId: `dm_${A}_${B}`, completedUids: [],
    createdBy: C, createdByName: 'C', visibility: 'members', visibleUids: [A, B, C],
  }
  await assertFails(setDoc(doc(as(C), ...path('requests', 'byC')), payload))
})

test('[DM 캔버스] 참여자는 만들 수 있다', async () => {
  await assertSucceeds(setDoc(doc(as(A), ...path('requests', 'byA')), {
    kind: 'notice', title: 't', channelId: `dm_${A}_${B}`, completedUids: [],
    createdBy: A, createdByName: 'A', visibility: 'members', visibleUids: [A, B],
  }))
})

test('[DM 캔버스] 학교 관리자는 못 고치고 못 지운다 — 글쓴이가 아닌 한', async () => {
  await assertFails(updateDoc(doc(as(ADMIN), ...path('requests', 'dmPost')), { title: '관리자가 고침' }))
  await assertFails(deleteDoc(doc(as(ADMIN), ...path('requests', 'dmPost'))))
})

test('[DM 캔버스] 글쓴이는 그대로 고치고 지울 수 있다', async () => {
  await assertSucceeds(updateDoc(doc(as(A), ...path('requests', 'dmPost')), { title: '글쓴이가 고침' }))
})

test('[DM 캔버스] 일반 채널 글은 관리자 열람이 그대로다 — 이번 변경의 부작용이 없어야 한다', async () => {
  await assertSucceeds(getDoc(doc(as(ADMIN), ...path('requests', 'pubPost'))))
  await assertSucceeds(getDoc(doc(as(ADMIN), ...path('requests', 'privPost'))))
})

test('[DM 캔버스] 댓글도 참여자만 읽는다 — 관리자도 제외', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), ...path('requests', 'dmPost', 'comments', 'c1')), {
      authorUid: A, body: '안녕', createdAt: new Date(),
    })
  })
  await assertSucceeds(getDoc(doc(as(B), ...path('requests', 'dmPost', 'comments', 'c1'))))
  await assertFails(getDoc(doc(as(ADMIN), ...path('requests', 'dmPost', 'comments', 'c1'))))
  await assertFails(getDoc(doc(as(C), ...path('requests', 'dmPost', 'comments', 'c1'))))
})

test('[DM 캔버스 아님] 일반 글의 댓글은 예전 그대로 학교 소속 교사 누구나 읽는다', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), ...path('requests', 'pubPost', 'comments', 'c1')), {
      authorUid: A, body: '안녕', createdAt: new Date(),
    })
  })
  await assertSucceeds(getDoc(doc(as(B), ...path('requests', 'pubPost', 'comments', 'c1'))))
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

// ── 9. 이메일 발송(emailJobs) — 발신자 위조 방지, Workspace 미연동 학교 차단,
//      "본인 + 관리자만 열람"은 personalNotices와 달리 학교 관리자가 전체를 본다 ──

const A_EMAIL = 'a@test.example'
const B_EMAIL = 'b@test.example'

const emailJob = (over) => ({
  senderUid: A, senderEmail: A_EMAIL, senderName: 'A',
  schoolId: SCHOOL, schoolName: '테스트고',
  subject: '제목', bodyHtml: '<p>내용</p>', bodyText: '내용',
  recipients: [{
    workspaceUserId: 'w1', studentId: '10101', email: 'stu1@test.example', name: '학생1',
    grade: 1, class: 1, number: 1,
    status: 'pending', sentAt: null, gmailMessageId: null, error: null,
  }],
  counts: { total: 1, sent: 0, failed: 0 },
  status: 'queued', failReason: null, targetFilter: { mode: 'manual' },
  createdAt: new Date(), startedAt: null, completedAt: null,
  ...over,
})

test('[이메일] 본인 계정·정상 데이터로 발송 요청을 만들 수 있다', async () => {
  await assertSucceeds(setDoc(doc(as(A, { email: A_EMAIL }), ...path('emailJobs', 'job1')), emailJob()))
})

test('[이메일] senderUid를 남으로 위조할 수 없다', async () => {
  await assertFails(setDoc(doc(as(A, { email: A_EMAIL }), ...path('emailJobs', 'job2')), emailJob({ senderUid: B })))
})

test('[이메일] senderEmail을 실제 로그인 이메일과 다르게 위조할 수 없다 ★', async () => {
  // 발송 트리거가 senderEmail을 그대로 Gmail impersonate 대상으로 쓰므로, 이 값이
  // 실제 로그인 계정과 다르면 남의 이름으로 발송하는 셈이 된다.
  await assertFails(setDoc(doc(as(A, { email: A_EMAIL }), ...path('emailJobs', 'job3')), emailJob({ senderEmail: B_EMAIL })))
})

test('[이메일] 이미 발송된 것처럼 status·counts를 조작해 만들 수 없다', async () => {
  await assertFails(setDoc(doc(as(A, { email: A_EMAIL }), ...path('emailJobs', 'job4')),
    emailJob({ status: 'done', counts: { total: 1, sent: 1, failed: 0 } })))
})

test('[이메일] 수신자가 없는 발송은 만들 수 없다', async () => {
  await assertFails(setDoc(doc(as(A, { email: A_EMAIL }), ...path('emailJobs', 'job5')),
    emailJob({ recipients: [], counts: { total: 0, sent: 0, failed: 0 } })))
})

test('[이메일] Workspace 연동 자체가 없는 학교는 발송 요청이 막힌다 ★', async () => {
  const otherPath = (...segs) => ['schools', OTHER_SCHOOL, ...segs]
  await assertFails(setDoc(
    doc(as(SUPER, { email: 'super@test.example' }), ...otherPath('emailJobs', 'job1')),
    emailJob({ schoolId: OTHER_SCHOOL, senderUid: SUPER, senderEmail: 'super@test.example' }),
  ))
})

test('[이메일] 본인은 자기가 보낸 발송 내역을 읽는다', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), ...path('emailJobs', 'jobR1')), emailJob())
  })
  await assertSucceeds(getDoc(doc(as(A, { email: A_EMAIL }), ...path('emailJobs', 'jobR1'))))
})

test('[이메일] 같은 학교 다른 교사는 남이 보낸 발송 내역을 못 읽는다', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), ...path('emailJobs', 'jobR2')), emailJob())
  })
  await assertFails(getDoc(doc(as(B, { email: B_EMAIL }), ...path('emailJobs', 'jobR2'))))
})

test('[이메일] 학교 관리자는 전체 발송 내역을 읽는다 — personalNotices와 의도적으로 다른 부분', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), ...path('emailJobs', 'jobR3')), emailJob())
  })
  await assertSucceeds(getDoc(doc(as(ADMIN), ...path('emailJobs', 'jobR3'))))
})

test('[이메일] 진행률·상태는 클라이언트가 못 고친다 — 서버(트리거)만 쓴다', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), ...path('emailJobs', 'jobU1')), emailJob())
  })
  await assertFails(updateDoc(doc(as(A, { email: A_EMAIL }), ...path('emailJobs', 'jobU1')), {
    status: 'done', counts: { total: 1, sent: 1, failed: 0 },
  }))
})

// ── 예약 발송 ──────────────────────────────────────────────────────────

const future = () => new Date(Date.now() + 60 * 60 * 1000) // 1시간 뒤
const past = () => new Date(Date.now() - 60 * 60 * 1000)   // 1시간 전

test('[이메일 예약] 미래 시각으로 예약 발송을 만들 수 있다', async () => {
  await assertSucceeds(setDoc(doc(as(A, { email: A_EMAIL }), ...path('emailJobs', 'sched1')),
    emailJob({ status: 'scheduled', scheduledAt: future() })))
})

test('[이메일 예약] 과거·현재 시각으로는 예약을 만들 수 없다 ★', async () => {
  await assertFails(setDoc(doc(as(A, { email: A_EMAIL }), ...path('emailJobs', 'sched2')),
    emailJob({ status: 'scheduled', scheduledAt: past() })))
})

test('[이메일 예약] 발신자 본인은 아직 발송 전인 예약을 취소할 수 있다', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), ...path('emailJobs', 'sched3')),
      emailJob({ status: 'scheduled', scheduledAt: future() }))
  })
  await assertSucceeds(updateDoc(doc(as(A, { email: A_EMAIL }), ...path('emailJobs', 'sched3')), {
    status: 'cancelled', cancelledAt: new Date(),
  }))
})

test('[이메일 예약] 학교 관리자도 남의 예약을 취소할 수 있다', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), ...path('emailJobs', 'sched4')),
      emailJob({ status: 'scheduled', scheduledAt: future() }))
  })
  await assertSucceeds(updateDoc(doc(as(ADMIN), ...path('emailJobs', 'sched4')), {
    status: 'cancelled', cancelledAt: new Date(),
  }))
})

test('[이메일 예약] 다른 교사는 남의 예약을 취소할 수 없다 ★', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), ...path('emailJobs', 'sched5')),
      emailJob({ status: 'scheduled', scheduledAt: future() }))
  })
  await assertFails(updateDoc(doc(as(B, { email: B_EMAIL }), ...path('emailJobs', 'sched5')), {
    status: 'cancelled', cancelledAt: new Date(),
  }))
})

test('[이메일 예약] 이미 발송 중이거나 끝난 건은 "취소"로 되돌릴 수 없다 ★', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), ...path('emailJobs', 'sched6')), emailJob({ status: 'sending' }))
  })
  await assertFails(updateDoc(doc(as(A, { email: A_EMAIL }), ...path('emailJobs', 'sched6')), {
    status: 'cancelled', cancelledAt: new Date(),
  }))
})

test('[이메일 예약] 취소를 핑계로 다른 필드는 못 바꾼다 ★', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), ...path('emailJobs', 'sched7')),
      emailJob({ status: 'scheduled', scheduledAt: future() }))
  })
  await assertFails(updateDoc(doc(as(A, { email: A_EMAIL }), ...path('emailJobs', 'sched7')), {
    status: 'cancelled', cancelledAt: new Date(), subject: '가로챈 제목',
  }))
})

// ── 학사일정 — 대상자만 보는 항목이 목록 조회로 새지 않는가 ──────
//
// 예전 규칙은 "visibleToUids가 없으면 누구나"였다. 단건 조회는 막았지만 목록 조회에서는
// 그 조건이 늘 참이라 전 교직원에게 제목이 내려갔다(2026-09-21 실측). 규칙이 질의를
// 걸러주지 않는다는 것을 잊고 "필드가 없으면 허용"을 다시 쓰지 않도록 여기에 박아 둔다.

const calendar = (db) => collection(db, ...path('academicCalendar'))

test('학사일정: 대상이 아닌 교사는 그 항목을 단건으로도, 목록으로도 못 가져온다', async () => {
  await assertFails(getDoc(doc(as(B), ...path('academicCalendar', 'req_secret'))))
  // 컬렉션 통째로 요청하는 질의는 거부돼야 한다 — 예전에는 이게 통과하며 전부 내려갔다
  await assertFails(getDocs(query(calendar(as(B)))))
})

test('학사일정: audience로 좁혀 질의하면 볼 수 있는 것만 내려온다', async () => {
  const shared = await assertSucceeds(getDocs(query(calendar(as(B)), where('audience', '==', 'all'))))
  assert.deepEqual(shared.docs.map(d => d.id), ['open'])

  const mineB = await assertSucceeds(getDocs(query(calendar(as(B)), where('audienceUids', 'array-contains', B))))
  assert.equal(mineB.size, 0, 'B는 대상이 아니다')

  const mineA = await assertSucceeds(getDocs(query(calendar(as(A)), where('audienceUids', 'array-contains', A))))
  assert.deepEqual(mineA.docs.map(d => d.id), ['req_secret'], '대상인 A는 자기 것을 본다')
})

test('학사일정: 학교 관리자도 대상이 아니면 못 본다 (쓰기 권한은 그대로)', async () => {
  await assertFails(getDoc(doc(as(ADMIN), ...path('academicCalendar', 'req_secret'))))
  await assertFails(getDocs(query(calendar(as(ADMIN)))))
  await assertSucceeds(setDoc(doc(as(ADMIN), ...path('academicCalendar', 'new')), {
    title: '체육대회', type: '학사', date: new Date('2026-10-01'), source: 'manual', audience: 'all',
  }))
})

test('학사일정: 슈퍼 관리자는 전체를 본다 (운영 점검용)', async () => {
  const all = await assertSucceeds(getDocs(query(calendar(asSuper()))))
  assert.equal(all.size, 2)
})

// ── 검·인정도서 선정: 전원 제출 전 마감 금지 (2026-10-01) ──────────────
// A = 과목 대표교사, B·C = 위원. submittedUids는 서버 트리거만 쓴다.
async function seedAdoption(submittedUids) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), ...path('textbookAdoptions', 'tb')), {
      subjectName: '과목', status: 'collecting', subjectHeadUid: A,
      committeeUids: [A, B, C], externalMemberIds: [], submittedUids,
    })
  })
}
const tb = (db) => doc(db, ...path('textbookAdoptions', 'tb'))

test('교과서 선정: 미제출 위원이 있으면 대표교사도 관리자도 마감할 수 없다', async () => {
  await seedAdoption([A, B])
  await assertFails(updateDoc(tb(as(A)), { status: 'closed' }))
  await assertFails(updateDoc(tb(as(ADMIN)), { status: 'closed' }))
})

test('교과서 선정: 위원 전원이 제출하면 대표교사가 마감할 수 있다', async () => {
  await seedAdoption([A, B, C])
  await assertSucceeds(updateDoc(tb(as(A)), { status: 'closed', aggregate: {} }))
})

test('교과서 선정: 클라이언트는 submittedUids를 고쳐 마감 조건을 우회할 수 없다', async () => {
  await seedAdoption([A])
  await assertFails(updateDoc(tb(as(A)), { submittedUids: [A, B, C] }))
  await assertFails(updateDoc(tb(as(A)), { submittedUids: [A, B, C], status: 'closed' }))
})

test('교과서 선정: 마감 아닌 일반 수정(추천의견 등)은 미제출 위원이 있어도 된다', async () => {
  await seedAdoption([A])
  await assertSucceeds(updateDoc(tb(as(A)), { rubric: [] }))
})

test('교과서 선정: 후보 1개(1책 1도서)는 채점 없이 대표교사가 확정할 수 있다', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), ...path('textbookAdoptions', 'one')), {
      subjectName: '과목', status: 'collecting', subjectHeadUid: A,
      candidates: [{ id: 'c1' }], committeeUids: [A, B], externalMemberIds: [], submittedUids: [],
    })
  })
  const one = (db) => doc(db, ...path('textbookAdoptions', 'one'))
  await assertSucceeds(updateDoc(one(as(A)), { status: 'closed', singleBook: true }))
})

test('교과서 선정: 후보가 2개 이상이면 1책 1도서 표시로도 전원 제출을 건너뛸 수 없다', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), ...path('textbookAdoptions', 'two')), {
      subjectName: '과목', status: 'collecting', subjectHeadUid: A,
      candidates: [{ id: 'c1' }, { id: 'c2' }], committeeUids: [A, B], externalMemberIds: [], submittedUids: [],
    })
  })
  const two = (db) => doc(db, ...path('textbookAdoptions', 'two'))
  await assertFails(updateDoc(two(as(A)), { status: 'closed', singleBook: true }))
})

// ── 학적·고사 관리 (StudentHub) ───────────────────────────────
// A: 학적·결시 담당자로 지정 / B: 2026학년도 2학년 3반 담임 / C: 아무 역할 없는 교사
async function seedHub() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, ...path('studentHubManagers', A)), { roles: ['enrollment', 'absence'] })
    await setDoc(doc(db, ...path('teacherAssignments', `2026_${B}`)), {
      uid: B, year: 2026, isHomeroom: true, homeroomGrade: 2, homeroomClassNo: 3,
    })
    await setDoc(doc(db, ...path('exams', 'e1')), { year: 2026, name: '2학기 중간' })
    await setDoc(doc(db, ...path('exams', 'e1', 'absences', 'w1_2-11')), {
      workspaceUserId: 'w1', subjectCode: '2-11', year: 2026, grade: 2, classNo: 3,
      status: 'reported', type: null, reportedBy: { uid: C, name: 'C' },
    })
  })
}
const change = (uid) => ({
  type: 'transferOut', workspaceUserId: 'w9', year: 2026,
  before: { grade: 2, class: 3, number: 7 }, recordedBy: { uid, name: 'x' },
})
const absence = (db) => doc(db, ...path('exams', 'e1', 'absences', 'w1_2-11'))
const classify = (uid, over = {}) => ({
  type: 'illness', reason: '병원', evidenceSubmitted: true,
  classifiedBy: { uid, name: 'x' }, status: 'classified', ...over,
})

test('학적: 지정된 담당자와 관리자만 학적 변동을 기록한다', async () => {
  await seedHub()
  await assertSucceeds(setDoc(doc(as(A), ...path('enrollmentChanges', 'c1')), change(A)))
  await assertSucceeds(setDoc(doc(as(ADMIN), ...path('enrollmentChanges', 'c2')), change(ADMIN)))
  await assertFails(setDoc(doc(as(C), ...path('enrollmentChanges', 'c3')), change(C)))
  // 기록자를 남으로 적을 수 없다
  await assertFails(setDoc(doc(as(A), ...path('enrollmentChanges', 'c4')), change(B)))
})

test('학적: 다른 학교 교사는 이력을 읽을 수 없다', async () => {
  await seedHub()
  await assertFails(getDoc(doc(as(SUPER), ...path('enrollmentChanges', 'c1'))))
})

test('학적: 담당자 지정은 관리자만 한다', async () => {
  await seedHub()
  await assertFails(setDoc(doc(as(A), ...path('studentHubManagers', C)), { roles: ['exam'] }))
  await assertSucceeds(setDoc(doc(as(ADMIN), ...path('studentHubManagers', C)), { roles: ['exam'] }))
})

test('고사: 시험 편집은 고사 담당자만 — 학적 담당만 가진 교사는 안 된다', async () => {
  await seedHub()
  await assertFails(updateDoc(doc(as(A), ...path('exams', 'e1')), { name: 'x' }))
  await assertSucceeds(updateDoc(doc(as(ADMIN), ...path('exams', 'e1')), { name: 'x' }))
})

test('결시: 교사 누구나 본인 이름으로 보고 상태로 등록한다', async () => {
  await seedHub()
  const d = doc(as(C), ...path('exams', 'e1', 'absences', 'w2_2-11'))
  await assertSucceeds(setDoc(d, { status: 'reported', reportedBy: { uid: C, name: 'C' }, year: 2026, grade: 2, classNo: 1 }))
  const d2 = doc(as(C), ...path('exams', 'e1', 'absences', 'w3_2-11'))
  await assertFails(setDoc(d2, { status: 'confirmed', reportedBy: { uid: C, name: 'C' } }))
})

test('결시: 담임은 자기 반 학생의 유형만 분류한다', async () => {
  await seedHub()
  await assertSucceeds(updateDoc(absence(as(B)), classify(B)))
})

test('결시: 담임이 아닌 교사는 분류할 수 없다', async () => {
  await seedHub()
  await assertFails(updateDoc(absence(as(C)), classify(C)))
})

test('결시: 다른 반 담임은 분류할 수 없다', async () => {
  await seedHub()
  await env.withSecurityRulesDisabled(async (ctx) => {
    await updateDoc(absence(ctx.firestore()), { classNo: 4 })
  })
  await assertFails(updateDoc(absence(as(B)), classify(B)))
})

test('결시: 담임은 허용 필드 밖(과목·학생)을 못 고치고 확정도 못 한다', async () => {
  await seedHub()
  await assertFails(updateDoc(absence(as(B)), classify(B, { subjectCode: '2-12' })))
  await assertFails(updateDoc(absence(as(B)), classify(B, { status: 'confirmed' })))
  await assertFails(updateDoc(absence(as(B)), classify(B, { type: '무단' })))
})

test('결시: 확정된 건은 담임이 다시 못 고치고, 결시 담당자는 고친다', async () => {
  await seedHub()
  await env.withSecurityRulesDisabled(async (ctx) => {
    await updateDoc(absence(ctx.firestore()), { status: 'confirmed', type: 'illness' })
  })
  await assertFails(updateDoc(absence(as(B)), classify(B)))
  await assertSucceeds(updateDoc(absence(as(A)), { type: 'approved' }))
})

// ── StudentHub 사용자 로그 · 대시보드 · 메타 ─────────────────────
test('로그: 본인 이름·서버 시각·정해진 필드로만 남기고, 고치거나 지울 수 없다', async () => {
  await seedHub()
  const { serverTimestamp, Timestamp } = await import('firebase/firestore')
  const ok = { action: 'login', summary: 's', details: [], uid: C, email: 'c@x', name: 'C', at: serverTimestamp() }
  const d = (db, id) => doc(db, ...path('studentHubLogs', id))
  await assertSucceeds(setDoc(d(as(C), 'l1'), ok))
  await assertFails(setDoc(d(as(C), 'l2'), { ...ok, uid: A }))
  await assertFails(setDoc(d(as(C), 'l3'), { ...ok, at: Timestamp.fromMillis(0) }))
  await assertFails(setDoc(d(as(C), 'l4'), { ...ok, extra: 1 }))
  await assertFails(updateDoc(d(as(C), 'l1'), { summary: 'x' }))
  await assertFails(deleteDoc(d(as(ADMIN), 'l1')))
})

test('로그: 열람은 담당자·관리자만', async () => {
  await seedHub()
  await assertSucceeds(getDoc(doc(as(A), ...path('studentHubLogs', 'l1'))))
  await assertSucceeds(getDoc(doc(as(ADMIN), ...path('studentHubLogs', 'l1'))))
  await assertFails(getDoc(doc(as(C), ...path('studentHubLogs', 'l1'))))
})

test('대시보드: 공용은 관리자만 꾸미고 교사 전체가 본다, 개인은 본인만', async () => {
  await seedHub()
  const shared = { scope: 'shared', ownerUid: null, name: 'TV', widgets: [] }
  await assertFails(setDoc(doc(as(A), ...path('studentHubDashboards', 's1')), shared))
  await assertSucceeds(setDoc(doc(as(ADMIN), ...path('studentHubDashboards', 's1')), shared))
  await assertSucceeds(getDoc(doc(as(C), ...path('studentHubDashboards', 's1'))))
  await assertFails(updateDoc(doc(as(C), ...path('studentHubDashboards', 's1')), { name: 'x' }))

  const mine = { scope: 'personal', ownerUid: C, name: '내 화면', widgets: [] }
  await assertSucceeds(setDoc(doc(as(C), ...path('studentHubDashboards', 'p1')), mine))
  await assertFails(setDoc(doc(as(A), ...path('studentHubDashboards', 'p2')), mine))
  await assertFails(getDoc(doc(as(A), ...path('studentHubDashboards', 'p1'))))
  // 개인 화면을 공용으로 바꿔치기할 수 없다
  await assertFails(updateDoc(doc(as(C), ...path('studentHubDashboards', 'p1')), { scope: 'shared' }))
  // 쿼리 안전성: 공용 목록 쿼리와 내 화면 쿼리
  await assertSucceeds(getDocs(query(collection(as(C), ...path('studentHubDashboards')), where('scope', '==', 'shared'))))
  await assertSucceeds(getDocs(query(collection(as(C), ...path('studentHubDashboards')), where('ownerUid', '==', C))))
})

test('메타·부담임: 나이스 업로드 기록은 학적 담당자만, 교원 배정(부담임)은 관리자만', async () => {
  await seedHub()
  await assertSucceeds(setDoc(doc(as(A), ...path('studentHubMeta', 'roster')), { neisImportedAt: 1 }))
  await assertFails(setDoc(doc(as(C), ...path('studentHubMeta', 'roster')), { neisImportedAt: 1 }))
  await assertFails(updateDoc(doc(as(A), ...path('teacherAssignments', `2026_${B}`)), { isSubHomeroom: true }))
  await assertSucceeds(updateDoc(doc(as(ADMIN), ...path('teacherAssignments', `2026_${B}`)), { isSubHomeroom: true, subHomeroomGrade: 2, subHomeroomClassNo: 4 }))
})

test('학교 공통 설정: 관리자만 고치고 교사 전체가 읽는다(학적 담당자도 못 고친다)', async () => {
  await seedHub()
  const d = (db) => doc(db, ...path('studentHubMeta', 'settings'))
  await assertSucceeds(setDoc(d(as(ADMIN)), { bell: [] }))
  await assertFails(setDoc(d(as(A)), { bell: [] }))
  await assertSucceeds(getDoc(d(as(C))))
})

// ── 교감(principal) = StudentHub 관리자 동급, 교장(headmaster) = 전 화면 열람 ──
const VP = 'vice-principal'
const HM = 'headmaster-u'
async function seedLeaders() {
  await seedHub()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'users', VP), { role: 'principal', schoolId: SCHOOL })
    await setDoc(doc(db, 'users', HM), { role: 'headmaster', schoolId: SCHOOL })
  })
}

test('교감: 담당자 지정·학적 변동·공통 설정·공용 화면·담임 지정을 관리자처럼 한다', async () => {
  await seedLeaders()
  await assertSucceeds(setDoc(doc(as(VP), ...path('studentHubManagers', C)), { roles: ['exam'] }))
  await assertSucceeds(setDoc(doc(as(VP), ...path('enrollmentChanges', 'v1')), change(VP)))
  await assertSucceeds(setDoc(doc(as(VP), ...path('studentHubMeta', 'settings')), { bell: [] }))
  await assertSucceeds(setDoc(doc(as(VP), ...path('studentHubDashboards', 'vs')), { scope: 'shared', ownerUid: null, widgets: [] }))
  await assertSucceeds(updateDoc(doc(as(VP), ...path('teacherAssignments', `2026_${B}`)), { isSubHomeroom: true }))
  await assertSucceeds(getDoc(doc(as(VP), ...path('studentHubLogs', 'l1'))))
})

test('교장: 모두 읽되(로그 포함) 고치지 못한다', async () => {
  await seedLeaders()
  await assertSucceeds(getDoc(doc(as(HM), ...path('studentHubLogs', 'l1'))))
  await assertSucceeds(getDoc(doc(as(HM), ...path('students', 'any'))))
  await assertSucceeds(getDoc(doc(as(HM), ...path('enrollmentChanges', 'c1'))))
  await assertFails(setDoc(doc(as(HM), ...path('studentHubManagers', C)), { roles: ['exam'] }))
  await assertFails(setDoc(doc(as(HM), ...path('enrollmentChanges', 'h1')), change(HM)))
  await assertFails(setDoc(doc(as(HM), ...path('studentHubMeta', 'settings')), { bell: [] }))
  await assertFails(updateDoc(doc(as(HM), ...path('teacherAssignments', `2026_${B}`)), { isSubHomeroom: true }))
  await assertFails(setDoc(doc(as(HM), ...path('studentHubDashboards', 'hs')), { scope: 'shared', ownerUid: null, widgets: [] }))
})

// ── 학생 명단 쓰기 주체 = StudentHub(2026-10) ──────────────────────────
// SCHOOL은 workspaceSync.enabled 학교, OTHER_SCHOOL은 동기화를 쓰지 않는 학교(문서 없음).
// A: 학적 담당자(seedHub) / C: 선택과목 담당자 / B: 일반 교사
async function seedStudents() {
  await seedLeaders()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, ...path('studentHubManagers', C)), { roles: ['elective'] })
    await setDoc(doc(db, ...path('students', 'w1')), { name: '가', grade: 2, class: 3, number: 1, source: 'workspaceSync' })
    await setDoc(doc(db, 'users', 'other-t'), { role: 'teacher', schoolId: OTHER_SCHOOL })
    await setDoc(doc(db, 'schools', OTHER_SCHOOL, 'students', 's1'), { name: '나', grade: 1, class: 1, number: 1 })
  })
}
const stu = (db, id = 'w1') => doc(db, ...path('students', id))

test('학생 명단(동기화 학교): 일반 교사는 만들기·고치기·지우기를 못 한다', async () => {
  await seedStudents()
  await assertSucceeds(getDoc(stu(as(B))))
  await assertFails(setDoc(stu(as(B), 'new'), { name: '다' }))
  await assertFails(updateDoc(stu(as(B)), { class: 5 }))
  await assertFails(deleteDoc(stu(as(B))))
})

test('학생 명단(동기화 학교): 학적 담당자·관리자·교감은 쓴다, 교장은 못 쓴다', async () => {
  await seedStudents()
  await assertSucceeds(updateDoc(stu(as(A)), { class: 5 }))
  await assertSucceeds(setDoc(stu(as(ADMIN), 'm1'), { name: '다', source: 'studentHub' }))
  await assertSucceeds(updateDoc(stu(as(VP)), { number: 2 }))
  await assertFails(updateDoc(stu(as(HM)), { number: 3 }))
  await assertSucceeds(deleteDoc(stu(as(A), 'm1')))
})

test('학생 명단(동기화 학교): 선택과목 담당자는 선택과목 필드만 고친다', async () => {
  await seedStudents()
  await assertSucceeds(updateDoc(stu(as(C)), { electiveSubjects: [{ subjectName: '미적분', semester: 1 }], electiveSubjectsUpdatedAt: new Date() }))
  await assertFails(updateDoc(stu(as(C)), { electiveSubjects: [], class: 9 }))
  await assertFails(setDoc(stu(as(C), 'x'), { electiveSubjects: [] }))
  await assertFails(deleteDoc(stu(as(C))))
})

test('학생 명단(동기화를 쓰지 않는 학교): 교사가 예전처럼 출결 그룹 CSV로 등록한다', async () => {
  await seedStudents()
  const db = as('other-t')
  await assertSucceeds(setDoc(doc(db, 'schools', OTHER_SCHOOL, 'students', 's2'), { name: '라' }, { merge: true }))
  await assertSucceeds(updateDoc(doc(db, 'schools', OTHER_SCHOOL, 'students', 's1'), { class: 2 }))
})

test('학교 문서: 학적 담당자는 학생 OU 경로만 고친다', async () => {
  await seedStudents()
  await assertSucceeds(updateDoc(doc(as(A), 'schools', SCHOOL), { 'workspaceSync.studentOuPath': '/학생 2027' }))
  await assertSucceeds(updateDoc(doc(as(VP), 'schools', SCHOOL), { 'workspaceSync.studentOuPath': '/학생 2028' }))
  await assertFails(updateDoc(doc(as(A), 'schools', SCHOOL), { 'workspaceSync.enabled': false }))
  await assertFails(updateDoc(doc(as(A), 'schools', SCHOOL), { 'workspaceSync.studentOuPath': '/x', name: '바뀜' }))
  await assertFails(updateDoc(doc(as(B), 'schools', SCHOOL), { 'workspaceSync.studentOuPath': '/x' }))
  await assertFails(updateDoc(doc(as(C), 'schools', SCHOOL), { 'workspaceSync.studentOuPath': '/x' }))
  await assertSucceeds(updateDoc(doc(as(ADMIN), 'schools', SCHOOL), { 'workspaceSync.adminEmail': 'a@b.kr' }))
})

// ── ExamCore(2026-10): 고사 버전·감독 배정 ──────────────────────────────
// A: 학적·결시 담당(seedHub) — 고사 담당 아님 / C: 고사 담당자로 지정
async function seedExamCore() {
  await seedLeaders()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, ...path('studentHubManagers', C)), { roles: ['exam'] })
    await setDoc(doc(db, ...path('exams', 'e1', 'versions', 'v1')), { versionNo: 1, summary: 's' })
  })
}

test('고사 버전: 고사 담당자·관리자만 남기고, 아무도 고치거나 지우지 못한다', async () => {
  await seedExamCore()
  await assertSucceeds(setDoc(doc(as(C), ...path('exams', 'e1', 'versions', 'v2')), { versionNo: 2 }))
  await assertSucceeds(setDoc(doc(as(C), ...path('exams', 'e1', 'versionData', 'v2')), { plan: [] }))
  await assertSucceeds(setDoc(doc(as(VP), ...path('exams', 'e1', 'versions', 'v3')), { versionNo: 3 }))
  await assertFails(setDoc(doc(as(A), ...path('exams', 'e1', 'versions', 'v4')), { versionNo: 4 }))
  await assertFails(updateDoc(doc(as(C), ...path('exams', 'e1', 'versions', 'v1')), { summary: 'x' }))
  await assertFails(deleteDoc(doc(as(ADMIN), ...path('exams', 'e1', 'versions', 'v1'))))
  await assertSucceeds(getDoc(doc(as(B), ...path('exams', 'e1', 'versions', 'v1'))))
})

test('감독 배정: 교사 전체가 보고, 고사 담당자·관리자만 고친다(교장은 못 고친다)', async () => {
  await seedExamCore()
  const d = (db) => doc(db, ...path('exams', 'e1', 'proctor', 'main'))
  await assertSucceeds(setDoc(d(as(C)), { rev: 1, assignments: [] }))
  await assertSucceeds(setDoc(d(as(ADMIN)), { rev: 2, assignments: [] }))
  await assertFails(setDoc(d(as(B)), { rev: 3 }))
  await assertFails(setDoc(d(as(HM)), { rev: 3 }))
  await assertSucceeds(getDoc(d(as(B))))
})
