/**
 * 채널 개인화 로직 검증.
 *   node --test apps/shared/lib/channelPrefs.test.js
 *
 * 여기서 잡으려는 것은 눈으로 안 보이는 두 가지다.
 *  1) 같은 채널이 두 그룹에 동시에 나오는 것 — 화면에서는 "왜 두 번 있지?" 정도로만 보이고,
 *     안읽음 표시가 두 번 뜨는 원인이 즐겨찾기인지 섹션인지 알 수 없다.
 *  2) 없어진 채널이나 깨진 저장값 때문에 사이드바가 통째로 안 그려지는 것.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_ID, FAVORITES_ID, SECTION_MAX, SECTION_NAME_MAX,
  createSection, groupChannels, isCollapsed, isFavorite, moveToSection, normalizePrefs,
  removeSection, renameSection, sectionOf, toggleCollapsed, toggleFavorite, validateSectionName,
} from './channelPrefs.js'

const ch = (id, name = id) => ({ id, name })
const CHANNELS = [ch('a'), ch('b'), ch('c'), ch('d')]

// ── normalizePrefs ────────────────────────────────────────────

test('설정이 없는 사용자도 빈 모양으로 받는다 — 화면 코드가 옵셔널 체이닝을 늘어놓지 않게', () => {
  for (const bad of [undefined, null, 'x', 42, []]) {
    const p = normalizePrefs(bad)
    assert.deepEqual(p.favorites, [])
    assert.deepEqual(p.sections, [])
    assert.deepEqual(p.collapsed, [])
  }
})

test('깨진 저장값을 흡수한다 — id 없는 섹션, 중복 id, 문자열 아닌 값', () => {
  const p = normalizePrefs({
    favorites: ['a', 'a', 3, null, 'b'],
    sections: [
      { id: 's1', name: '고사', channelIds: ['c', 'c'] },
      { name: 'id 없음' },
      { id: 's1', name: '중복 id' },
    ],
  })
  assert.deepEqual(p.favorites, ['a', 'b'])
  assert.equal(p.sections.length, 1)
  assert.deepEqual(p.sections[0].channelIds, ['c'])
})

test('저장값에서 즐겨찾기와 섹션에 같이 있으면 즐겨찾기가 이긴다', () => {
  const p = normalizePrefs({
    favorites: ['a'],
    sections: [{ id: 's1', name: '고사', channelIds: ['a', 'b'] }],
  })
  assert.deepEqual(p.sections[0].channelIds, ['b'])
})

test('섹션 개수와 이름 길이를 상한에서 자른다', () => {
  const many = Array.from({ length: SECTION_MAX + 5 }, (_, i) => ({ id: `s${i}`, name: `n${i}` }))
  assert.equal(normalizePrefs({ sections: many }).sections.length, SECTION_MAX)

  const long = normalizePrefs({ sections: [{ id: 's', name: 'x'.repeat(50) }] })
  assert.equal(long.sections[0].name.length, SECTION_NAME_MAX)
})

// ── groupChannels ─────────────────────────────────────────────

test('아무 설정이 없으면 채널 하나의 기본 그룹만 나온다', () => {
  const groups = groupChannels(CHANNELS, {})
  assert.equal(groups.length, 1)
  assert.equal(groups[0].id, DEFAULT_ID)
  assert.deepEqual(groups[0].channels.map(c => c.id), ['a', 'b', 'c', 'd'])
})

test('한 채널은 한 그룹에만 나온다 — 즐겨찾기 > 섹션 > 기본', () => {
  const prefs = {
    favorites: ['a'],
    sections: [{ id: 's1', name: '고사', channelIds: ['a', 'b'] }],
  }
  const groups = groupChannels(CHANNELS, prefs)
  const appearances = groups.flatMap(g => g.channels.map(c => c.id))
  assert.equal(new Set(appearances).size, appearances.length, '같은 채널이 두 번 나왔다')

  assert.deepEqual(groups.find(g => g.id === FAVORITES_ID).channels.map(c => c.id), ['a'])
  assert.deepEqual(groups.find(g => g.id === 's1').channels.map(c => c.id), ['b'])
  assert.deepEqual(groups.find(g => g.id === DEFAULT_ID).channels.map(c => c.id), ['c', 'd'])
})

test('즐겨찾기가 비면 그 그룹은 아예 그리지 않는다', () => {
  assert.equal(groupChannels(CHANNELS, {}).some(g => g.id === FAVORITES_ID), false)
})

test('사용자가 만든 섹션은 비어 있어도 남는다 — 옮겨 넣을 자리가 있어야 한다', () => {
  const groups = groupChannels(CHANNELS, { sections: [{ id: 's1', name: '빈 섹션', channelIds: [] }] })
  const s1 = groups.find(g => g.id === 's1')
  assert.ok(s1, '빈 섹션이 사라졌다')
  assert.equal(s1.channels.length, 0)
})

test('모든 채널이 섹션에 들어가면 기본 그룹은 사라진다', () => {
  const prefs = { sections: [{ id: 's1', name: '전부', channelIds: ['a', 'b', 'c', 'd'] }] }
  assert.equal(groupChannels(CHANNELS, prefs).some(g => g.id === DEFAULT_ID), false)
})

test('없어진 채널 ID는 화면에서만 걸러지고 저장값은 그대로 둔다', () => {
  const prefs = { favorites: ['a', '없어진채널'] }
  assert.deepEqual(groupChannels(CHANNELS, prefs)[0].channels.map(c => c.id), ['a'])
  // 저장값을 정리하지 않는다 — 채널을 잠깐 못 읽는 순간에 지우면 되돌릴 수 없다
  assert.deepEqual(normalizePrefs(prefs).favorites, ['a', '없어진채널'])
})

test('채널 목록이 비면 빈 배열을 돌려준다 — 로딩 중에 터지지 않아야 한다', () => {
  assert.deepEqual(groupChannels([], { favorites: ['a'] }), [])
})

test('섹션 안 채널은 급한 순(넘겨받은 순서)을 따른다', () => {
  // 저장 순서는 d, a 지만 화면 순서는 넘겨받은 a, d 를 따라야 한다
  const prefs = { sections: [{ id: 's1', name: '고사', channelIds: ['d', 'a'] }] }
  const s1 = groupChannels(CHANNELS, prefs).find(g => g.id === 's1')
  assert.deepEqual(s1.channels.map(c => c.id), ['a', 'd'])
})

test('즐겨찾기는 반대로 사용자가 넣은 순서를 지킨다 — 직접 고른 몇 개라 자리가 흔들리면 안 된다', () => {
  const groups = groupChannels(CHANNELS, { favorites: ['d', 'a'] })
  assert.deepEqual(groups[0].channels.map(c => c.id), ['d', 'a'])
})

// ── 조작 ──────────────────────────────────────────────────────

test('즐겨찾기 토글은 넣고 빼기가 모두 된다', () => {
  let p = toggleFavorite({}, 'a')
  assert.equal(isFavorite(p, 'a'), true)
  p = toggleFavorite(p, 'a')
  assert.equal(isFavorite(p, 'a'), false)
})

test('즐겨찾기에 넣으면 섹션에서 빠진다', () => {
  const before = { sections: [{ id: 's1', name: '고사', channelIds: ['a', 'b'] }] }
  const after = toggleFavorite(before, 'a')
  assert.deepEqual(after.sections[0].channelIds, ['b'])
  assert.equal(sectionOf(after, 'a'), null)
})

test('섹션으로 옮기면 즐겨찾기와 이전 섹션에서 빠진다', () => {
  const before = {
    favorites: ['a'],
    sections: [{ id: 's1', name: '하나', channelIds: ['b'] }, { id: 's2', name: '둘', channelIds: [] }],
  }
  const after = moveToSection(before, 'b', 's2')
  assert.deepEqual(after.sections[0].channelIds, [])
  assert.deepEqual(after.sections[1].channelIds, ['b'])

  const moved = moveToSection(after, 'a', 's1')
  assert.equal(isFavorite(moved, 'a'), false)
  assert.equal(sectionOf(moved, 'a'), 's1')
})

test('섹션을 null로 옮기면 기본 그룹으로 돌아간다', () => {
  const before = { sections: [{ id: 's1', name: '고사', channelIds: ['a'] }] }
  const after = moveToSection(before, 'a', null)
  assert.equal(sectionOf(after, 'a'), null)
  assert.deepEqual(groupChannels(CHANNELS, after).find(g => g.id === DEFAULT_ID).channels[0].id, 'a')
})

test('섹션을 지워도 안에 있던 채널은 기본 그룹으로 돌아갈 뿐 사라지지 않는다', () => {
  const before = { sections: [{ id: 's1', name: '고사', channelIds: ['a', 'b'] }] }
  const after = removeSection(before, 's1')
  assert.equal(after.sections.length, 0)
  const groups = groupChannels(CHANNELS, after)
  assert.deepEqual(groups.find(g => g.id === DEFAULT_ID).channels.map(c => c.id), ['a', 'b', 'c', 'd'])
})

test('섹션을 지우면 그 접힘 상태도 함께 지운다 — 같은 id로 새 섹션을 만들 일은 없지만 찌꺼기를 남기지 않는다', () => {
  const before = toggleCollapsed({ sections: [{ id: 's1', name: '고사', channelIds: [] }] }, 's1')
  assert.equal(isCollapsed(before, 's1'), true)
  assert.equal(isCollapsed(removeSection(before, 's1'), 's1'), false)
})

test('섹션 만들기는 상한을 넘지 않는다', () => {
  let p = {}
  for (let i = 0; i < SECTION_MAX + 3; i += 1) p = createSection(p, `섹션${i}`, `s${i}`)
  assert.equal(p.sections.length, SECTION_MAX)
})

test('섹션 이름은 앞뒤 공백을 떼고 길이를 자른다', () => {
  const p = createSection({}, '  고사 관련  ', 's1')
  assert.equal(p.sections[0].name, '고사 관련')
  assert.equal(createSection({}, 'x'.repeat(50), 's2').sections[0].name.length, SECTION_NAME_MAX)
  assert.equal(renameSection(p, 's1', '  새 이름 ').sections[0].name, '새 이름')
})

test('접힘 상태 토글', () => {
  const p = toggleCollapsed({}, FAVORITES_ID)
  assert.equal(isCollapsed(p, FAVORITES_ID), true)
  assert.equal(isCollapsed(toggleCollapsed(p, FAVORITES_ID), FAVORITES_ID), false)
})

// ── 이름 검증 ─────────────────────────────────────────────────

test('섹션 이름 검증 — 빈 이름·길이 초과·중복', () => {
  assert.ok(validateSectionName(''))
  assert.ok(validateSectionName('   '))
  assert.ok(validateSectionName('x'.repeat(SECTION_NAME_MAX + 1)))
  assert.ok(validateSectionName('고사', ['고사']))
  assert.ok(validateSectionName('고사', ['  고사  ']), '공백만 다른 이름도 중복으로 본다')
  assert.equal(validateSectionName('고사', ['학년 업무']), null)
})
