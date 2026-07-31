import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Typography from '@mui/material/Typography'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { COL, schoolPath } from '@shared/lib/schema'

const TYPE_STYLE = {
  시험: { bg: '#fdecea', fg: '#d32f2f' },
  휴업일: { bg: '#e8f5e9', fg: '#2e7d32' },
  행사: { bg: '#eef2ff', fg: '#4f46e5' },
}
const DEFAULT_STYLE = { bg: '#f1f3f4', fg: '#5f6368' }

function toDate(value) {
  if (!value) return null
  return value.toDate ? value.toDate() : new Date(value)
}

function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function formatRange(start, end) {
  const fmt = d => `${d.getMonth() + 1}월 ${d.getDate()}일`
  if (!end || start.toDateString() === end.toDateString()) return fmt(start)
  return `${fmt(start)} ~ ${fmt(end)}`
}

function dDayLabel(start, today) {
  const diffDays = Math.round((start.setHours(0, 0, 0, 0) - today.getTime()) / 86400000)
  if (diffDays === 0) return 'D-Day'
  if (diffDays > 0) return `D-${diffDays}`
  return null // 이미 시작한 다일 일정은 D-day 표시 생략
}

export default function CalendarWidget() {
  const { schoolId } = useAuth()
  const [events, setEvents] = useState([])

  useEffect(() => {
    if (!schoolId) return
    return onSnapshot(
      collection(db, ...schoolPath(schoolId, COL.ACADEMIC_CALENDAR)),
      snap => setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    )
  }, [schoolId])

  const upcoming = useMemo(() => {
    const today = startOfToday()
    return events
      .map(e => ({ ...e, _start: toDate(e.date), _end: toDate(e.endDate) }))
      .filter(e => e._start && (e._end || e._start) >= today)
      .sort((a, b) => a._start - b._start)
      .slice(0, 8)
  }, [events])

  if (upcoming.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 5 }}>
        <Typography fontSize="2rem" mb={0.5}>📅</Typography>
        <Typography color="text.secondary" fontSize="0.9rem">예정된 학사일정이 없습니다.</Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {upcoming.map(item => {
        const style = TYPE_STYLE[item.type] || DEFAULT_STYLE
        const dDay = dDayLabel(new Date(item._start), startOfToday())
        return (
          <Box
            key={item.id}
            sx={{
              p: 1.2, borderRadius: 2, border: '1px solid #ececf1',
              display: 'flex', alignItems: 'center', gap: 1,
            }}
          >
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
              <Typography fontWeight={600} fontSize="0.95rem" noWrap>{item.title}</Typography>
              <Typography variant="caption" color="text.secondary">
                {formatRange(item._start, item._end)}
              </Typography>
            </Box>
            {dDay && <Chip size="small" label={dDay} sx={{ bgcolor: '#fff7ed', color: '#c2410c', fontWeight: 700 }} />}
            {item.type && <Chip size="small" label={item.type} sx={{ bgcolor: style.bg, color: style.fg, fontWeight: 600 }} />}
          </Box>
        )
      })}
    </Box>
  )
}
