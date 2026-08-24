/**
 * 디렉터리 로직 검증.
 *   node --test apps/shared/lib/directory.test.js
 *
 * 여기서 잡아야 하는 것은 "명단에서 사람이 조용히 사라지는" 종류의 버그다. 필터를 걸었을
 * 때 배정이 아직 안 들어온 사람이 빠지거나, 그룹을 만들 때 빈 값이 한 덩어리로 묶이는 것은
 * 화면을 눈으로 봐서는 알 수 없다 — 그 자리에 원래 몇 명이 있어야 하는지를 모르기 때문이다.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  autoGroups, filterMembers, groupToMemberRule, homeroomLabel, memberSubtitle, sortMembers,
} from './directory.js'
import { resolveTargets } from './targeting.js'

const member = (over = {}) => ({
  uid: 'u', name: '홍길동', office: '', department: '', subject: '',
  positionLabel: '', rank: '일반', isHomeroom: false, homeroomGrade: null,
  homeroomClassNo: null, teachingGrades: [], ...over,
})

const MEMBERS = [
  member({ uid: 'a', name: '김국어', department: '교무부', subject: '국어', office: '2층 교무실', rank: '부장', positionLabel: '교무부장' }),
  member({ uid: 'b', name: '이수학', department: '연구부', subject: '수학', office: '2층 교무실', isHomeroom: true, homeroomGrade: 2, homeroomClassNo: 3 }),
  member({ uid: 'c', name: '박국어', department: '교무부', subject: '국어', office: '3층 교무실', isHomeroom: true, homeroomGrade: 2, homeroomClassNo: 1 }),
  member({ uid: 'd', name: '최신규' }),   // 배정이 아직 안 들어온 사람
]

// ── 카드에 적는 것 ────────────────────────────────────────────

test('부제는 있는 것만 이어 붙인다 — 빈 값이 가운뎃점만 남기지 않게', () => {
  assert.equal(memberSubtitle(MEMBERS[0]), '교무부장 · 교무부 · 국어')
  assert.equal(memberSubtitle(member({ subject: '국어' })), '국어')
  assert.equal(memberSubtitle(member()), '')
})

test('담임 표시는 반까지 있으면 반까지 적는다', () => {
  assert.equal(homeroomLabel(MEMBERS[1]), '2-3 담임')
  assert.equal(homeroomLabel(member({ isHomeroom: true, homeroomGrade: 1 })), '1학년 담임')
  assert.equal(homeroomLabel(member({ isHomeroom: true })), '담임')
  assert.equal(homeroomLabel(member()), '')
})

// ── 찾기 ──────────────────────────────────────────────────────

test('검색어는 이름만이 아니라 부서·교과·사무실·직함까지 훑는다', () => {
  assert.deepEqual(filterMembers(MEMBERS, { keyword: '국어' }).map(m => m.uid), ['a', 'c'])
  assert.deepEqual(filterMembers(MEMBERS, { keyword: '3층' }).map(m => m.uid), ['c'])
  assert.deepEqual(filterMembers(MEMBERS, { keyword: '교무부장' }).map(m => m.uid), ['a'])
})

test('필터는 겹쳐 적용된다 (부서 ∧ 교과)', () => {
  const got = filterMembers(MEMBERS, { department: '교무부', subject: '국어' })
  assert.deepEqual(got.map(m => m.uid), ['a', 'c'])
  assert.deepEqual(filterMembers(MEMBERS, { department: '교무부', subject: '수학' }), [])
})

test('빈 필터 값은 조건으로 치지 않는다 — 배정 없는 사람이 사라지면 안 된다 ★', () => {
  // undefined를 "일치해야 함"으로 다루면 최신규가 어느 화면에도 안 나온다
  assert.equal(filterMembers(MEMBERS, { department: undefined }).length, 4)
  assert.equal(filterMembers(MEMBERS, {}).length, 4)
})

test('담임 학년 필터는 담임인 사람만 남긴다', () => {
  assert.deepEqual(filterMembers(MEMBERS, { homeroomGrade: 2 }).map(m => m.uid), ['b', 'c'])
  assert.deepEqual(filterMembers(MEMBERS, { homeroomGrade: 1 }), [])
})

test('정렬은 가나다순으로 고정한다 — 필터를 바꿔도 사람 자리가 튀지 않게', () => {
  assert.deepEqual(sortMembers(MEMBERS).map(m => m.name), ['김국어', '박국어', '이수학', '최신규'])
})

// ── 자동 그룹 ─────────────────────────────────────────────────

test('배정 데이터에서 부서·교과·사무실·담임 그룹이 나온다', () => {
  const keys = autoGroups(MEMBERS).map(s => s.key)
  assert.deepEqual(keys, ['department', 'subject', 'office', 'homeroom'])
})

test("값이 빈 사람은 '(없음)' 그룹을 만들지 않는다 ★", () => {
  // 배정이 안 들어온 사람들이 한 덩어리로 묶이면 그룹처럼 보이지만 아무 뜻도 없다
  const dept = autoGroups(MEMBERS).find(s => s.key === 'department')
  assert.deepEqual(dept.groups.map(g => g.name), ['교무부', '연구부'])
  assert.ok(dept.groups.every(g => g.members.every(m => m.department)))
})

test('한 사람이 여러 그룹에 등장한다 — 그 각각이 그 사람을 찾는 경로다', () => {
  const groups = autoGroups(MEMBERS)
  const has = (key, name) => groups.find(s => s.key === key)
    .groups.find(g => g.name === name).members.some(m => m.uid === 'c')
  assert.ok(has('department', '교무부'))
  assert.ok(has('subject', '국어'))
  assert.ok(has('office', '3층 교무실'))
  assert.ok(has('homeroom', '2학년 담임'))
})

test('만들 수 있는 그룹이 없으면 빈 목록이다', () => {
  assert.deepEqual(autoGroups([member()]), [])
  assert.deepEqual(autoGroups([]), [])
})

// ── 그룹 → 채널 조건 ──────────────────────────────────────────

test('그룹을 조건으로 옮기면 그 그룹의 사람들이 그대로 풀린다 ★', () => {
  // uid를 복사하지 않고 조건으로 넘기는 것이 핵심이다. 조건이라야 인사이동 뒤에
  // memberDiff가 "갱신 필요"를 띄운다
  const rule = groupToMemberRule('department', '교무부')
  assert.deepEqual(resolveTargets(rule, MEMBERS).uids.sort(), ['a', 'c'])
})

test('담임 그룹은 학년을 숫자로 뽑아 조건에 넣는다', () => {
  const rule = groupToMemberRule('homeroom', '2학년 담임')
  assert.deepEqual(resolveTargets(rule, MEMBERS).uids.sort(), ['b', 'c'])
})

test('사무실은 조건으로 옮기지 않는다 — 조건 선택기가 그릴 수 없는 종류다', () => {
  assert.equal(groupToMemberRule('office', '2층 교무실'), null)
  assert.equal(groupToMemberRule('알수없음', '무엇'), null)
})
