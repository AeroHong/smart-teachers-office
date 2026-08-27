/**
 * 학사일정 — 월 단위 캘린더 그리드.
 *
 * AcademicCalendar.jsx가 "목록+상세뿐"이던 1차 버전(주석: "월 단위 캘린더 그리드는
 * 아직 안 만들었다")을 채우는 조각(2026-08-27, 구글 캘린더 동기화와 함께 도입).
 * 이 화면은 순수하게 "이 달에 뭐가 있나"를 훑는 용도라, 항목을 고르면 상세를 보여주는
 * 일은 부르는 쪽(AcademicCalendar.jsx)에 맡긴다(onSelectEvent) — WorkspaceLayout의
 * 상세 자리가 "고른 것 하나"인데 그리드 자체가 그 자리를 통째로 차지하기 때문이다.
 */
import { useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import { alpha } from '@mui/material/styles'
import { TONE_PALETTE } from './widgetUi'
import { TYPE_TONE } from './EventDetail'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
const MAX_CHIPS_PER_DAY = 3

function startOfDay(d) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}
function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}
function isEventOnDay(event, day) {
  if (!event._start) return false
  const start = startOfDay(event._start)
  const end = startOfDay(event._end || event._start)
  return day >= start && day <= end
}

export default function CalendarGrid({ events = [], onSelectEvent }) {
  const [viewDate, setViewDate] = useState(() => startOfDay(new Date()))
  const today = useMemo(() => startOfDay(new Date()), [])

  // 그 달이 걸친 첫 일요일부터 마지막 토요일까지 — 주 단위로 꽉 채운 그리드라야
  // 앞뒤 달 날짜가 어중간하게 잘리지 않는다.
  const weeks = useMemo(() => {
    const monthStart = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1)
    const monthEnd = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0)
    const gridStart = new Date(monthStart)
    gridStart.setDate(gridStart.getDate() - gridStart.getDay())
    const gridEnd = new Date(monthEnd)
    gridEnd.setDate(gridEnd.getDate() + (6 - gridEnd.getDay()))

    const days = []
    for (let d = new Date(gridStart); d <= gridEnd; d.setDate(d.getDate() + 1)) days.push(new Date(d))
    const out = []
    for (let i = 0; i < days.length; i += 7) out.push(days.slice(i, i + 7))
    return out
  }, [viewDate])

  const goMonth = (delta) => setViewDate(d => startOfDay(new Date(d.getFullYear(), d.getMonth() + delta, 1)))

  return (
    <Box sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1.5, flexShrink: 0 }}>
        <Typography variant="h6" fontWeight={800}>
          {viewDate.getFullYear()}년 {viewDate.getMonth() + 1}월
        </Typography>
        <Box sx={{ flexGrow: 1 }} />
        <Box
          component="button" type="button"
          onClick={() => setViewDate(startOfDay(new Date()))}
          sx={{
            border: '1px solid', borderColor: 'divider', borderRadius: 1,
            px: 1.2, py: 0.4, fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
            bgcolor: 'background.paper', fontFamily: 'inherit', mr: 0.5,
            '&:hover': { bgcolor: 'action.hover' },
          }}
        >
          오늘
        </Box>
        <IconButton size="small" onClick={() => goMonth(-1)} aria-label="이전 달">
          <ChevronLeftIcon fontSize="small" />
        </IconButton>
        <IconButton size="small" onClick={() => goMonth(1)} aria-label="다음 달">
          <ChevronRightIcon fontSize="small" />
        </IconButton>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', mb: 0.5, flexShrink: 0 }}>
        {WEEKDAYS.map((w, i) => (
          <Typography
            key={w} align="center" fontSize="0.72rem" fontWeight={700}
            color={i === 0 ? 'error.main' : i === 6 ? 'primary.main' : 'text.secondary'}
          >
            {w}
          </Typography>
        ))}
      </Box>

      <Box sx={{ display: 'grid', gridTemplateRows: `repeat(${weeks.length}, 1fr)`, gap: 0.6, flexGrow: 1, minHeight: 0 }}>
        {weeks.map((week, wi) => (
          <Box key={wi} sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0.6, minHeight: 0 }}>
            {week.map((day) => {
              const inMonth = day.getMonth() === viewDate.getMonth()
              const isToday = sameDay(day, today)
              const dayEvents = events.filter(e => isEventOnDay(e, day))
              const shown = dayEvents.slice(0, MAX_CHIPS_PER_DAY)
              const overflow = dayEvents.length - shown.length

              return (
                <Box
                  key={day.toISOString()}
                  sx={{
                    minHeight: 84, border: '1px solid', borderColor: isToday ? 'primary.main' : 'divider',
                    borderRadius: 1, p: 0.6, bgcolor: 'background.paper',
                    opacity: inMonth ? 1 : 0.45,
                    display: 'flex', flexDirection: 'column', gap: 0.3, overflow: 'hidden',
                  }}
                >
                  <Typography
                    fontSize="0.76rem" fontWeight={isToday ? 800 : 600}
                    color={day.getDay() === 0 ? 'error.main' : day.getDay() === 6 ? 'primary.main' : 'text.primary'}
                  >
                    {day.getDate()}
                  </Typography>
                  {shown.map(ev => (
                    <Box
                      key={ev.id} component="button" type="button"
                      onClick={() => onSelectEvent?.(ev)}
                      sx={theme => ({
                        display: 'block', width: '100%', textAlign: 'left', border: 0, cursor: 'pointer',
                        fontFamily: 'inherit', fontSize: '0.68rem', fontWeight: 600, lineHeight: 1.4,
                        borderRadius: 0.5, px: 0.5, py: 0.1,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        bgcolor: alpha((TONE_PALETTE[TYPE_TONE[ev.type]] || TONE_PALETTE.neutral)(theme), 0.12),
                        color: (TONE_PALETTE[TYPE_TONE[ev.type]] || TONE_PALETTE.neutral)(theme),
                        '&:hover': { bgcolor: alpha((TONE_PALETTE[TYPE_TONE[ev.type]] || TONE_PALETTE.neutral)(theme), 0.22) },
                      })}
                    >
                      {ev.title}
                    </Box>
                  ))}
                  {overflow > 0 && (
                    <Typography fontSize="0.66rem" color="text.disabled">+{overflow}</Typography>
                  )}
                </Box>
              )
            })}
          </Box>
        ))}
      </Box>
    </Box>
  )
}
