/**
 * 학사일정 — 전체를 시간순으로 가공해 반환한다.
 *
 * useHomeFeed.js에서 분리했다(2026-08-25, 홈 재구성 — useMyRequests.js 주석 참고).
 * 홈 사이드바 한 조각이 아니라 자기 레일 자리(`/calendar`)를 가지므로 독립시켰다.
 *
 * "다가오는 N건"으로 거르던 것을 이 훅에서 뺐다(2026-08-27, 구글 캘린더 동기화 +
 * 월 캘린더 그리드 도입) — 그리드는 지난 달도 넘겨볼 수 있어야 해서 미래 일정만
 * 남기면 안 된다. 필요한 화면(AcademicCalendar.jsx의 "다가오는 일정" 목록)이 알아서
 * 다시 거른다.
 *
 * FETCH_LIMIT을 200→500으로 올렸다 — 구글 캘린더 동기화가 반복 일정을 낱개로 펼쳐서
 * (singleEvents) 들여오면 200건을 금방 넘길 수 있다.
 */
import { useEffect, useMemo, useState } from 'react'
import { collection, limit, onSnapshot, query } from 'firebase/firestore'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { COL, schoolPath } from '@shared/lib/schema'

const FETCH_LIMIT = 500

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

  return useMemo(() => (
    events
      .map(e => ({ ...e, _start: toDate(e.date), _end: toDate(e.endDate) }))
      .filter(e => e._start)
      .sort((a, b) => a._start - b._start)
  ), [events])
}

/** "다가오는 일정" 목록용 — 오늘(또는 진행 중인 종료일) 이후만, 최대 N건.
 *  AcademicCalendar.jsx의 사이드바 목록이 쓴다(예전에 이 훅 안에 있던 로직). */
export function upcomingEvents(events, limitCount = 12) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return events
    .filter(e => (e._end || e._start) >= today)
    .slice(0, limitCount)
}
