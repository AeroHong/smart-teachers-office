/**
 * 홈 사이드바에 뿌릴 세 갈래 — 요청받은 일, 전체 공지, 학사일정.
 * (호출은 상단바 종으로 옮겼다 — 훑어보는 목록이 아니라 지금 기다린다는 신호라서)
 *
 * 예전에는 위젯마다 각자 구독했다. 목록/상세로 바꾸면서 사이드바 한 곳이 전부 알아야 해서
 * 한 훅으로 모았다. 구독 자체는 여전히 갈래별로 따로다 — 쿼리 조건이 달라 합칠 수 없다.
 */
import { useEffect, useMemo, useState } from 'react'
import { collection, limit, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { COL, schoolPath } from '@shared/lib/schema'
import { sortByUrgency } from '@shared/lib/workRequests'

const CALENDAR_FETCH = 200

function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function toDate(value) {
  if (!value) return null
  return value.toDate ? value.toDate() : new Date(value)
}

export default function useHomeFeed() {
  const { user, schoolId } = useAuth()
  const [requests, setRequests] = useState([])
  const [notices, setNotices] = useState([])
  const [events, setEvents] = useState([])

  // 나에게 온 요청 (진행 중인 것만)
  useEffect(() => {
    if (!schoolId || !user) return
    return onSnapshot(
      query(
        collection(db, ...schoolPath(schoolId, COL.REQUESTS)),
        where('targetUids', 'array-contains', user.uid),
        where('kind', '==', 'request'),
        where('status', '==', 'open'),
      ),
      snap => setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      () => {},
    )
  }, [schoolId, user])

  // 나에게 온 안내
  useEffect(() => {
    if (!schoolId || !user) return
    return onSnapshot(
      query(
        collection(db, ...schoolPath(schoolId, COL.REQUESTS)),
        where('targetUids', 'array-contains', user.uid),
        where('kind', '==', 'notice'),
      ),
      snap => setNotices(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      () => {},
    )
  }, [schoolId, user])

  useEffect(() => {
    if (!schoolId) return
    return onSnapshot(
      query(collection(db, ...schoolPath(schoolId, COL.ACADEMIC_CALENDAR)), limit(CALENDAR_FETCH)),
      snap => setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      () => {},
    )
  }, [schoolId])

  const sortedRequests = useMemo(() => sortByUrgency(requests), [requests])

  // 고정 공지가 위로, 그다음 최신순
  const sortedNotices = useMemo(() => [...notices].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1
    return (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0)
  }), [notices])

  const upcoming = useMemo(() => {
    const today = startOfToday()
    return events
      .map(e => ({ ...e, _start: toDate(e.date), _end: toDate(e.endDate) }))
      .filter(e => e._start && (e._end || e._start) >= today)
      .sort((a, b) => a._start - b._start)
      .slice(0, 12)
  }, [events])

  return { requests: sortedRequests, notices: sortedNotices, events: upcoming }
}
