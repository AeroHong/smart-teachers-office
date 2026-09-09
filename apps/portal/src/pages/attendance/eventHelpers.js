// TeacherDashboard.jsx와 EventsOverview.jsx가 똑같이 쓰는 이벤트 표시 로직
// (진행 중 판정, 요일별 시간 문자열, 시각 포맷) — 한 곳에서만 정의한다.
export const DAYS = ['일', '월', '화', '수', '목', '금', '토']

export function isEventActive(event) {
  const now = new Date()
  if (event.isRecurring) {
    const todayDay = now.getDay()
    const recurringEnd = event.recurringEndDate?.toDate?.() ?? new Date(event.recurringEndDate)
    if (now > recurringEnd) return false

    if (event.schedules?.length > 0) {
      const todaySchs = event.schedules.filter(s => s.dayOfWeek === todayDay)
      if (todaySchs.length === 0) return false
      // 시간 미설정 교시 있으면 당일 종일 활성
      if (todaySchs.some(s => !s.startTime || !s.endTime)) return true
      return todaySchs.some(s => {
        const start = new Date(now); start.setHours(...s.startTime.split(':').map(Number), 0, 0)
        const end = new Date(now); end.setHours(...s.endTime.split(':').map(Number), 0, 0)
        return now >= start && now <= end
      })
    }
    // 구형 fallback
    if (!event.recurringDays?.includes(todayDay)) return false
    const [sh, sm] = event.recurringTimeStart.split(':').map(Number)
    const [eh, em] = event.recurringTimeEnd.split(':').map(Number)
    const start = new Date(now); start.setHours(sh, sm, 0, 0)
    const end = new Date(now); end.setHours(eh, em, 0, 0)
    return now >= start && now <= end
  }
  const start = event.startTime?.toDate?.() ?? new Date(event.startTime)
  const end = event.endTime?.toDate?.() ?? new Date(event.endTime)
  return now >= start && now <= end
}

export function formatSchedules(event) {
  if (event.schedules?.length > 0) {
    return event.schedules
      .slice()
      .sort((a, b) => a.dayOfWeek !== b.dayOfWeek ? a.dayOfWeek - b.dayOfWeek : a.period - b.period)
      .map(s => {
        const base = `${DAYS[s.dayOfWeek]} ${s.period}교시`
        return s.startTime && s.endTime ? `${base} ${s.startTime}~${s.endTime}` : base
      })
      .join(' · ')
  }
  // 구형 fallback
  return `${event.recurringDays?.map(d => DAYS[d]).join('·')}  ${event.recurringTimeStart}~${event.recurringTimeEnd}`
}

export function formatEventTime(ts) {
  if (!ts) return '-'
  const d = ts?.toDate?.() ?? new Date(ts)
  return d.toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
