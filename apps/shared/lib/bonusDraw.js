/**
 * 스마트 출결 — 추가 뽑기(보너스 추첨) 순수 로직.
 *
 * 출석 등수 1·2·3등(메달)과 오늘의 행운번호 당첨자, 이렇게 4명은 이미 상을 받았으므로
 * 그들을 뺀 나머지 출석 학생 중에서 1명을 더 뽑는다(사용자 요청, 2026-10-30).
 * 뽑는 순간 5초쯤 명단을 훑다가 당첨자에서 멈추는 애니메이션을 보여주는데, 당첨자는
 * 애니메이션 전에 미리 정해 두고 하이라이트가 정확히 그 자리에서 멈추도록 일정을 짠다.
 */

/**
 * 추가 뽑기 후보 — 출석 학생 중 1~3등과 행운번호 당첨자를 뺀다.
 * @param {string[]} attendedIds 출석 학생 id(등수 순서 무관)
 * @param {Record<string, number>} rankMap 학생 id → 체크인 등수
 * @param {string|null|undefined} luckyStudentId 행운번호 당첨자(아직 없으면 null)
 * @returns {string[]}
 */
export function bonusCandidates(attendedIds, rankMap, luckyStudentId) {
  return attendedIds.filter(id => {
    const rank = rankMap[id]
    if (rank && rank <= 3) return false
    if (luckyStudentId && id === luckyStudentId) return false
    return true
  })
}

/**
 * 후보 중 하나를 고른다. rng는 테스트용으로 바꿔 끼울 수 있다.
 * @returns {number} 후보 배열의 인덱스(후보가 없으면 -1)
 */
export function pickIndex(length, rng = Math.random) {
  if (!length) return -1
  return Math.min(length - 1, Math.floor(rng() * length))
}

/**
 * 하이라이트가 명단을 훑는 일정 — 처음엔 빠르게, 끝으로 갈수록 느려지다가
 * winnerIndex에서 멈춘다.
 * @param {number} length 명단 길이
 * @param {number} winnerIndex 멈출 자리
 * @param {object} [opts]
 * @param {number} [opts.totalMs=5000] 전체 길이(대략)
 * @param {number} [opts.startIndex=0] 하이라이트가 처음 놓일 자리
 * @returns {{ index: number, delay: number }[]} 각 단계에서 놓일 자리와, 그 자리에 오기 전 기다린 시간
 */
export function buildSpinSchedule(length, winnerIndex, { totalMs = 5000, startIndex = 0 } = {}) {
  if (length <= 0 || winnerIndex < 0 || winnerIndex >= length) return []
  if (length === 1) return [{ index: 0, delay: totalMs }]

  // 단계별 대기 시간: 40ms → 520ms로 3제곱 곡선을 따라 늘어난다(평균 약 160ms)
  const MIN = 40
  const MAX = 520
  const delayAt = (t) => MIN + (MAX - MIN) * t * t * t
  const avg = MIN + (MAX - MIN) / 4
  let steps = Math.max(length, Math.round(totalMs / avg))
  // 마지막 단계가 winnerIndex에 오도록 단계 수를 맞춘다(필요하면 조금 더 돈다)
  const offset = ((winnerIndex - startIndex) % length + length) % length
  steps += ((offset - steps) % length + length) % length

  const raw = Array.from({ length: steps }, (_, i) => delayAt((i + 1) / steps))
  const scale = totalMs / raw.reduce((a, b) => a + b, 0)
  return raw.map((d, i) => ({
    index: (startIndex + i + 1) % length,
    delay: Math.round(d * scale),
  }))
}
