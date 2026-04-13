import { useState, useEffect } from 'react'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '../lib/firebase'

export function useStudentHistory(student, schoolId, role, userId) {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!student || !schoolId) return

    const fetch = async () => {
      setLoading(true)
      setError(null)
      try {
        const eventsRef = collection(db, 'schools', schoolId, 'events')
        const eventsQuery = (role === 'school_admin')
          ? query(eventsRef)
          : query(eventsRef, where('createdBy', '==', userId))
        const eventsSnap = await getDocs(eventsQuery)
        const events = eventsSnap.docs.map(d => ({ id: d.id, ...d.data() }))

        const results = await Promise.all(
          events.map(async (event) => {
            const logsRef = collection(db, 'schools', schoolId, 'events', event.id, 'attendanceLogs')
            const logsSnap = await getDocs(query(logsRef, where('studentId', '==', student.studentId)))
            return logsSnap.docs
              .map(d => ({
                logId: d.id,
                eventId: event.id,
                eventName: event.name,
                eventType: event.type || '기타',
                isRecurring: event.isRecurring || false,
                schedules: event.schedules || [],
                ...d.data(),
              }))
              .filter(l => l.method === 'absent') // 결석 로그만
          })
        )

        const absentLogs = results.flat().sort((a, b) => {
          const aTime = a.checkedAt?.toDate?.() ?? new Date(0)
          const bTime = b.checkedAt?.toDate?.() ?? new Date(0)
          return bTime - aTime
        })

        setLogs(absentLogs)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    fetch()
  }, [student?.studentId, schoolId, role, userId])

  return { logs, loading, error }
}
