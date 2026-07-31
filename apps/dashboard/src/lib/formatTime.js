/**
 * 위젯 공용 시각 표기.
 * 호출 알림과 쪽지가 각자 formatWhen을 들고 있어 같은 시각이 위젯마다 다르게 보였다.
 */

function toDate(value) {
  if (!value) return null
  if (value.toDate) return value.toDate()
  if (value instanceof Date) return value
  return new Date(value)
}

/** "7월 31일 14:20" — 절대 시각. */
export function formatDateTime(value) {
  const date = toDate(value)
  if (!date || Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/**
 * 하루 안쪽이면 "방금 전 / 12분 전", 그보다 오래되면 절대 시각.
 * @param {number} now 렌더 시점 기준 시각(ms). 타이머로 갱신하는 위젯이 넘긴다.
 */
export function formatRelative(value, now = Date.now()) {
  const date = toDate(value)
  if (!date || Number.isNaN(date.getTime())) return ''
  const sec = Math.floor((now - date.getTime()) / 1000)
  if (sec < 0) return formatDateTime(date)
  if (sec < 60) return '방금 전'
  if (sec < 3600) return `${Math.floor(sec / 60)}분 전`
  if (sec < 86400) return `${Math.floor(sec / 3600)}시간 전`
  return formatDateTime(date)
}
