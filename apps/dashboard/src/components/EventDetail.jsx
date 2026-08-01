/**
 * 학사일정 상세.
 *
 * 일정은 제목과 날짜가 거의 전부라 상세에 채울 것이 많지 않다. 그래도 같은 목록/상세
 * 구조를 따르는 이유는, 항목마다 조작 방식이 다르면 매번 다시 익혀야 하기 때문이다.
 */
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { ToneChip } from './widgetUi'

const TYPE_TONE = { 시험: 'danger', 휴업일: 'success', 행사: 'info' }

const DAY_MS = 86400000

function fmt(d) {
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`
}

function startOfDay(d) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export default function EventDetail({ event }) {
  const start = event._start
  const end = event._end
  const today = startOfDay(new Date())
  const days = Math.round((startOfDay(start) - today) / DAY_MS)

  const dday = days > 0 ? `D-${days}`
    : days === 0 ? 'D-Day'
      : end && startOfDay(end) >= today ? '진행 중' : null

  return (
    <Box sx={{ p: 2.5, maxWidth: 640 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, flexWrap: 'wrap' }}>
        <Typography sx={{ fontSize: '1.1rem' }}>🗓</Typography>
        <Typography variant="h6" fontWeight={800}>{event.title}</Typography>
        {dday && <ToneChip label={dday} tone={days <= 0 ? 'danger' : days <= 7 ? 'warning' : 'neutral'} />}
        {event.type && <ToneChip label={event.type} tone={TYPE_TONE[event.type] || 'neutral'} />}
      </Box>

      <Typography color="text.secondary" fontSize="0.9rem">
        {end && startOfDay(end).getTime() !== startOfDay(start).getTime()
          ? `${fmt(start)} ~ ${fmt(end)}`
          : fmt(start)}
      </Typography>
    </Box>
  )
}
