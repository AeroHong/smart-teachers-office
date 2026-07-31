import { useEffect, useMemo, useState } from 'react'
import { collection, limit, onSnapshot, query } from 'firebase/firestore'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { COL, schoolPath } from '@shared/lib/schema'
import { EmptyState, ListRow, RowStack, ToneChip } from '../components/widgetUi'
import { portalLink } from '../lib/portalUrl'

// 일정 종류별 색은 의미로만 정한다 (실제 색은 ToneChip이 테마에서 읽는다)
const TYPE_TONE = {
  시험: 'danger',
  휴업일: 'success',
  행사: 'info',
}

const UPCOMING_COUNT = 8
const FETCH_LIMIT = 200

function toDate(value) {
  if (!value) return null
  return value.toDate ? value.toDate() : new Date(value)
}

function startOfDay(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function formatRange(start, end) {
  const fmt = d => `${d.getMonth() + 1}월 ${d.getDate()}일`
  if (!end || start.toDateString() === end.toDateString()) return fmt(start)
  return `${fmt(start)} ~ ${fmt(end)}`
}

/** 시작 전이면 D-n, 오늘이면 D-Day, 이미 시작한 다일 일정이면 '진행 중'. */
function dDayLabel(start, end, today) {
  const diffDays = Math.round((startOfDay(start).getTime() - today.getTime()) / 86400000)
  if (diffDays > 0) return { label: `D-${diffDays}`, tone: diffDays <= 7 ? 'warning' : 'neutral' }
  if (diffDays === 0) return { label: 'D-Day', tone: 'danger' }
  if (end && startOfDay(end).getTime() >= today.getTime()) return { label: '진행 중', tone: 'success' }
  return null
}

export default function CalendarWidget() {
  const { schoolId, isAdmin } = useAuth()
  const [events, setEvents] = useState([])

  useEffect(() => {
    if (!schoolId) return
    return onSnapshot(
      query(collection(db, ...schoolPath(schoolId, COL.ACADEMIC_CALENDAR)), limit(FETCH_LIMIT)),
      snap => setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    )
  }, [schoolId])

  const upcoming = useMemo(() => {
    const today = startOfDay(new Date())
    return events
      .map(e => ({ ...e, _start: toDate(e.date), _end: toDate(e.endDate) }))
      .filter(e => e._start && startOfDay(e._end || e._start).getTime() >= today.getTime())
      .sort((a, b) => a._start - b._start)
      .slice(0, UPCOMING_COUNT)
  }, [events])

  if (upcoming.length === 0) {
    return (
      <EmptyState
        emoji="📅"
        message="예정된 학사일정이 없습니다."
        hint={
          isAdmin
            ? undefined
            : events.length > 0
              ? '지난 일정만 있습니다.'
              : '학사일정은 관리자가 등록합니다.'
        }
        actionLabel={isAdmin ? '학사일정 등록하기' : undefined}
        href={isAdmin ? portalLink('/admin/academic-calendar') : undefined}
      />
    )
  }

  const today = startOfDay(new Date())

  return (
    <RowStack>
      {upcoming.map(item => {
        const dDay = dDayLabel(item._start, item._end, today)
        return (
          <ListRow key={item.id}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                <Typography fontWeight={600} fontSize="0.95rem" noWrap>{item.title}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {formatRange(item._start, item._end)}
                </Typography>
              </Box>
              {dDay && <ToneChip label={dDay.label} tone={dDay.tone} />}
              {item.type && <ToneChip label={item.type} tone={TYPE_TONE[item.type] || 'neutral'} />}
            </Box>
          </ListRow>
        )
      })}
    </RowStack>
  )
}
