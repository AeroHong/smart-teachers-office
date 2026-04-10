import { useState, useEffect } from 'react'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '../lib/firebase'

// 원본 데이터만 fetch — 집계는 컴포넌트에서 날짜 필터 적용 후 처리
export function useStatsData(schoolId, role, userId) {
  const [rawLogs, setRawLogs] = useState([])
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const fetch = async () => {
    if (!schoolId) return
    setLoading(true)
    setError(null)
    try {
      const eventsRef = collection(db, 'schools', schoolId, 'events')
      const eventsSnap = await getDocs(
        role === 'school_admin'
          ? query(eventsRef)
          : query(eventsRef, where('createdBy', '==', userId))
      )
      const allEvents = eventsSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(e => !e.archived)

      const logs = (await Promise.all(
        allEvents.map(async (event) => {
          const snap = await getDocs(collection(db, 'schools', schoolId, 'events', event.id, 'attendanceLogs'))
          return snap.docs.map(d => ({
            ...d.data(),
            logId: d.id,
            eventId: event.id,
            eventName: event.name,
            eventType: event.type || '기타',
          }))
        })
      )).flat()

      setEvents(allEvents)
      setRawLogs(logs)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetch() }, [schoolId, role, userId])

  return { rawLogs, events, loading, error, refetch: fetch }
}

// 날짜 필터 적용 후 통계 집계
export function computeStats(rawLogs, events, startDate, endDate) {
  const logs = rawLogs.filter(l => {
    if (!startDate && !endDate) return true
    const d = l.checkedAt?.toDate?.() ?? new Date(l.checkedAt)
    if (!d || isNaN(d)) return false
    if (startDate && d < startDate) return false
    if (endDate && d > endDate) return false
    return true
  })

  // 이벤트별 결석 현황
  const eventStats = events.map(event => {
    const eventLogs = logs.filter(l => l.eventId === event.id)
    const attended = eventLogs.filter(l => l.method !== '결석' && !l.reason).length
    const absent = eventLogs.filter(l => l.method === '결석' || l.reason).length
    const total = eventLogs.length
    return {
      eventId: event.id,
      eventName: event.name,
      eventType: event.type || '기타',
      total, attended, absent,
      absentRate: total > 0 ? Math.round((absent / total) * 100) : 0,
    }
  }).sort((a, b) => b.absent - a.absent)

  // 학생별 결석 집계
  const studentAbsenceMap = {}
  logs.forEach(log => {
    if (log.method === '결석' || log.reason) {
      if (!studentAbsenceMap[log.studentId]) {
        studentAbsenceMap[log.studentId] = {
          studentId: log.studentId,
          studentName: log.studentName,
          grade: log.grade,
          class: log.class,
          number: log.number,
          absences: [],
        }
      }
      studentAbsenceMap[log.studentId].absences.push({
        eventName: log.eventName,
        eventType: log.eventType,
        reason: log.reason || '',
        checkedAt: log.checkedAt,
      })
    }
  })
  const studentAbsences = Object.values(studentAbsenceMap)
    .sort((a, b) => b.absences.length - a.absences.length)

  // 결석 사유 분포
  const reasonMap = {}
  logs.forEach(log => {
    if (log.method === '결석' || log.reason) {
      const key = log.reason || '사유 없음'
      reasonMap[key] = (reasonMap[key] || 0) + 1
    }
  })
  const reasonStats = Object.entries(reasonMap)
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)

  // 기간별 결석 추이
  const trendMap = {}
  logs.forEach(log => {
    if (log.method === '결석' || log.reason) {
      const d = log.checkedAt?.toDate?.() ?? new Date(log.checkedAt)
      if (!d || isNaN(d)) return
      const key = d.toISOString().slice(0, 10)
      trendMap[key] = (trendMap[key] || 0) + 1
    }
  })
  const trendData = Object.entries(trendMap)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date))

  // 전체 요약
  const totalAbsent = logs.filter(l => l.method === '결석' || l.reason).length
  const totalAttended = logs.filter(l => l.method !== '결석' && !l.reason).length
  const totalLogs = logs.length

  return {
    eventStats,
    studentAbsences,
    reasonStats,
    trendData,
    summary: {
      totalEvents: eventStats.length,
      totalLogs,
      totalAttended,
      totalAbsent,
      absentRate: totalLogs > 0 ? Math.round((totalAbsent / totalLogs) * 100) : 0,
    },
  }
}
