const test = require('node:test')
const assert = require('node:assert/strict')
const { mergeSyncedStudent } = require('./studentSyncMerge')

const base = {
  workspaceUserId: 'w1', studentId: '10203', fullStudentId: '202610203', email: '202610203@s.kr',
  name: '홍길동', year: 2026, grade: 1, class: 2, number: 3, admissionYear: 2026,
  emailHistory: [{ email: '202610203@s.kr', year: 2026 }], source: 'workspaceSync',
}
const incoming = (email, extra = {}) => {
  const local = email.split('@')[0]
  const sid = local.slice(4)
  return {
    workspaceUserId: 'w1', studentId: sid, fullStudentId: local, email, name: '홍길동',
    year: Number(local.slice(0, 4)), grade: Number(sid[0]), classNo: Number(sid.slice(1, 3)), number: Number(sid.slice(3)),
    ...extra,
  }
}

test('변경이 없으면 쓰지 않는다', () => {
  const { changed } = mergeSyncedStudent(base, incoming('202610203@s.kr'))
  assert.equal(changed, false)
})

test('같은 학년도 — StudentHub에서 바꾼 반·번호를 이메일 학번으로 되돌리지 않는다', () => {
  const moved = { ...base, class: 5, number: 31, studentId: '10531', fullStudentId: '202610531' }
  const { data, changed } = mergeSyncedStudent(moved, incoming('202610203@s.kr'))
  assert.equal(changed, false)
  assert.equal(data.class, undefined)
  assert.equal(data.number, undefined)
})

test('같은 학년도에 이메일만 바뀌면 이메일·이력만 갱신한다', () => {
  const moved = { ...base, class: 5, number: 31 }
  const { data, changed } = mergeSyncedStudent(moved, incoming('202610531@s.kr'))
  assert.equal(changed, true)
  assert.equal(data.email, '202610531@s.kr')
  assert.equal(data.emailHistory.length, 2)
  assert.equal('grade' in data, false)
})

test('학년도 전환 — 새 이메일 학번으로 학년·반·번호를 갱신한다', () => {
  const { data, changed } = mergeSyncedStudent(base, incoming('202720415@s.kr'))
  assert.equal(changed, true)
  assert.deepEqual([data.year, data.grade, data.class, data.number, data.studentId], [2027, 2, 4, 15, '20415'])
  assert.equal(data.admissionYear, 2026)
  assert.deepEqual(data.emailHistory.at(-1), { email: '202720415@s.kr', year: 2027 })
})

test('수동으로 고친 이름은 유지한다', () => {
  const { data, changed } = mergeSyncedStudent({ ...base, name: '홍길순', nameEditedManually: true }, incoming('202610203@s.kr'))
  assert.equal(changed, false)
  assert.equal(data.name, '홍길순')
})

test('기존 이력 배열을 직접 바꾸지 않는다', () => {
  const hist = [{ email: '202610203@s.kr', year: 2026 }]
  mergeSyncedStudent({ ...base, emailHistory: hist }, incoming('202720415@s.kr'))
  assert.equal(hist.length, 1)
})
