/**
 * 블록 반응 요약 로직.
 *   node --test apps/shared/lib/blockReactions.test.js
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { REACTION_EMOJIS, makeBlockId, summarizeReactions } from './blockReactions.js'

test('문서가 없으면 알약도 없다', () => {
  assert.deepEqual(summarizeReactions(null), [])
  assert.deepEqual(summarizeReactions(undefined), [])
})

test('반응이 없는(빈 배열) 이모지는 알약에서 빠진다', () => {
  assert.deepEqual(summarizeReactions({ '👍': [] }), [])
})

test('반응이 있는 이모지만, 정해진 순서대로 알약이 된다', () => {
  const data = { '🎉': ['a'], '👍': ['a', 'b'] }
  assert.deepEqual(summarizeReactions(data), [
    { emoji: '👍', count: 2, mine: false },
    { emoji: '🎉', count: 1, mine: false },
  ])
})

test('내 uid가 배열에 있으면 mine이 true', () => {
  const data = { '👍': ['a', 'b'] }
  assert.equal(summarizeReactions(data, 'b')[0].mine, true)
  assert.equal(summarizeReactions(data, 'c')[0].mine, false)
})

test('알려지지 않은 필드(잘못된 이모지)는 무시한다', () => {
  const data = { '🔥': ['a'] }
  assert.deepEqual(summarizeReactions(data), [])
})

test('makeBlockId는 매번 다른 값을 만든다', () => {
  const a = makeBlockId()
  const b = makeBlockId()
  assert.notEqual(a, b)
  assert.match(a, /^b_[a-z0-9]+$/)
})

test('REACTION_EMOJIS는 전부 코드포인트 하나짜리다 (firestore.rules와의 인코딩 어긋남 방지)', () => {
  for (const emoji of REACTION_EMOJIS) {
    assert.equal([...emoji].length, 1, `${emoji}는 코드포인트가 둘 이상이다`)
  }
})
