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

// ── 교시별 버튼 출석(checkinMode: 'button') ─────────────────────
// 교사 화면(PeriodSessionDashboard)과 학생 화면(PeriodCheckinPanel)이 같은 날짜 문자열·
// 문서 ID 규칙을 써야 학생이 쓴 기록을 교사가 그대로 찾는다. firestore.rules의
// periodLogs 문서 ID 검사도 이 형식(`날짜-p교시-학번`)을 따른다.
export function toDateStr(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function periodLogId(date, period, studentId) {
  return `${date}-p${period}-${studentId}`
}

// 진행 중인 교시 세션 — 오늘 연 것만 유효하다(전날 닫지 않은 세션은 없는 것으로 본다)
export function activePeriodSession(event) {
  const s = event?.periodSession
  return s && s.date === toDateStr() ? s : null
}
