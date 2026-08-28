/**
 * 조직도 트리 정렬 검증 — 표시 순서(groupOrder) 적용 여부.
 *   node --test apps/dashboard/src/lib/rosterTree.test.js
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildRosterTree } from './rosterTree.js'

const members = [
  { uid: 'u1', name: '김국어', office: '1교무실' },
  { uid: 'u2', name: '이수학', office: '행정실' },
  { uid: 'u3', name: '박영어', office: '교장실' },
  { uid: 'u4', name: '최과학', office: '' }, // 미지정
]

test('groupOrder를 안 주면 지금처럼 가나다순이다', () => {
  const tree = buildRosterTree(members)
  const office = tree.find(r => r.key === 'office')
  assert.deepEqual(office.groups.map(g => g.name), ['1교무실', '교장실', '행정실', '미지정'])
})

test('groupOrder에 있는 이름은 그 순서를 따른다', () => {
  const tree = buildRosterTree(members, { office: ['교장실', '행정실', '1교무실'] })
  const office = tree.find(r => r.key === 'office')
  assert.deepEqual(office.groups.map(g => g.name), ['교장실', '행정실', '1교무실', '미지정'])
})

test('순서 미지정 이름은 순서 지정 이름들 뒤에 가나다순으로 붙는다', () => {
  const tree = buildRosterTree(members, { office: ['행정실'] })
  const office = tree.find(r => r.key === 'office')
  // 행정실이 맨 앞, 나머지(1교무실·교장실)는 그 뒤에 가나다순, 미지정은 항상 마지막
  assert.deepEqual(office.groups.map(g => g.name), ['행정실', '1교무실', '교장실', '미지정'])
})

test('미지정은 groupOrder에 넣어도 항상 맨 마지막이다', () => {
  const tree = buildRosterTree(members, { office: ['미지정', '교장실', '행정실', '1교무실'] })
  const office = tree.find(r => r.key === 'office')
  assert.deepEqual(office.groups.map(g => g.name), ['교장실', '행정실', '1교무실', '미지정'])
})
