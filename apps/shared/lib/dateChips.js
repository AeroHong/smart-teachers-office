/**
 * 캔버스 본문 안 날짜 칩 — "+날짜"로 찍는 리마인더 표시.
 *
 * 저장하는 것은 날짜 문자열(`data-date`)뿐이다. 화면에 보이는 "D-2" 같은 문구는 **매번
 * 다시 계산**한다 — 글을 며칠 뒤에 다시 열어도 그날 기준으로 맞아야 한다. 그래서 값을
 * HTML에 박아 저장하지 않고, 편집기·읽기 화면 양쪽에서 이 함수로 화면에 그릴 때마다
 * 새로 채운다(CanvasEditor.jsx의 emit(), PostDetail.jsx의 렌더 뒤 훅).
 *
 * 실제로 정해진 날짜에 알림을 쏘는 것(푸시·데스크톱 알림)은 이번 범위가 아니다 — 그건
 * 예약 실행 백엔드가 필요한 별도 작업이다(PLAN_canvasEditor.md 3단계 "범위 명시").
 */

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

/** 급함 정도에 따른 색 — DUE_TONE(workRequests.js 쓰는 화면들)과 같은 신호 색을 쓴다.
 *  raw DOM에 직접 칠하는 색이라 테마 토큰이 아니라 실제 값이어야 한다. */
const TONE_COLOR = { danger: '#d32f2f', warning: '#e65100', neutral: '#6b7280' }

/**
 * @param {string} dateStr YYYY-MM-DD
 * @returns {{label: string, tone: 'danger'|'warning'|'neutral', color: string} | null}
 */
export function chipDateInfo(dateStr) {
  if (!dateStr) return null
  const d = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(d.getTime())) return null

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const days = Math.round((d - today) / 86400000)

  const md = `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]})`
  const rel = days === 0 ? '오늘' : days < 0 ? `${-days}일 지남` : days <= 7 ? `D-${days}` : null
  const label = rel ? `${md} · ${rel}` : md
  const tone = days <= 0 ? 'danger' : days <= 3 ? 'warning' : 'neutral'
  return { label, tone, color: TONE_COLOR[tone] }
}

/** 삽입 직후의 껍데기 마크업. 실제 문구·색은 hydrateDateChips가 바로 채운다. */
export function dateChipHtml(dateStr) {
  return `<span data-date="${dateStr}" contenteditable="false">📅</span>&nbsp;`
}

/** 컨테이너 안의 모든 날짜 칩을 지금 날짜 기준으로 다시 그린다. DOM이 있는 곳에서만 부른다. */
export function hydrateDateChips(root) {
  if (!root?.querySelectorAll) return
  root.querySelectorAll('[data-date]').forEach((el) => {
    const info = chipDateInfo(el.getAttribute('data-date'))
    if (!info) return
    el.textContent = `📅 ${info.label}`
    el.style.color = info.color
  })
}
