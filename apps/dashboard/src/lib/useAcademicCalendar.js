/**
 * 학사일정 — 다가오는 순으로 최대 12건.
 *
 * useHomeFeed.js에서 분리했다(2026-08-25, 홈 재구성 — useMyRequests.js 주석 참고).
 * 홈 사이드바 한 조각이 아니라 자기 레일 자리(`/calendar`)를 가지므로 독립시켰다.
 */
import { useEffect, useMemo, useState } from 'react'
import { collection, limit, onSnapshot, query } from 'firebase/firestore'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { COL, schoolPath } from '@shared/lib/schema'

const FETCH_LIMIT = 200
const UPCOMING_LIMIT = 12

function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function toDate(value) {
  if (!value) return null
  return value.toDate ? value.toDate() : new Date(value)
}

export default function useAcademicCalendar() {
  const { schoolId } = useAuth()
  const [events, setEvents] = useState([])

  useEffect(() => {
    if (!schoolId) return undefined
    return onSnapshot(
      query(collection(db, ...schoolPath(schoolId, COL.ACADEMIC_CALENDAR)), limit(FETCH_LIMIT)),
      snap => setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      () => {},
    )
  }, [schoolId])

  return useMemo(() => {
    const today = startOfToday()
    return events
      .map(e => ({ ...e, _start: toDate(e.date), _end: toDate(e.endDate) }))
      .filter(e => e._start && (e._end || e._start) >= today)
      .sort((a, b) => a._start - b._start)
      .slice(0, UPCOMING_LIMIT)
  }, [events])
}
