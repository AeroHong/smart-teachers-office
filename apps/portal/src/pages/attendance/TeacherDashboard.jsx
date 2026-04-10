import { useEffect, useState } from 'react'
import { collection, query, orderBy, where, onSnapshot, updateDoc, deleteDoc, getDocs, doc } from 'firebase/firestore'
import { useNavigate, useLocation } from 'react-router-dom'
import { db } from '../../lib/firebase'
import { useAuth } from '../../contexts/AuthContext'
import Layout from '../../components/Layout'

const DAYS = ['일', '월', '화', '수', '목', '금', '토']

export default function TeacherDashboard() {
  const { schoolId, user, role } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  // 네비게이션 바 "대시보드" 클릭 시 보관함 뷰 리셋
  useEffect(() => { setShowArchived(false) }, [location.state?.reset])
  const [events, setEvents] = useState([])
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState(null)
  const [showArchived, setShowArchived] = useState(false)

  useEffect(() => {
    if (!schoolId) return
    getDocs(query(collection(db, 'schools', schoolId, 'courses'), orderBy('name')))
      .then(snap => setCourses(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [schoolId])

  useEffect(() => {
    if (!schoolId || !user) return
    const q = role === 'school_admin'
      ? query(collection(db, 'schools', schoolId, 'events'), orderBy('createdAt', 'desc'))
      : query(collection(db, 'schools', schoolId, 'events'), where('createdBy', '==', user.uid), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(q, (snap) => {
      setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    })
    return unsub
  }, [schoolId, user, role])

  const isActive = (event) => {
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

  const formatSchedules = (event) => {
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

  const formatTime = (ts) => {
    if (!ts) return '-'
    const d = ts?.toDate?.() ?? new Date(ts)
    return d.toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const toggleExpand = (id) => setExpandedId(prev => prev === id ? null : id)

  const handleArchive = async (event) => {
    if (!window.confirm(`"${event.name}" 이벤트를 보관하시겠습니까?\n출결 기록은 그대로 유지되며 보관된 이벤트에서 다시 확인할 수 있습니다.`)) return
    try {
      await updateDoc(doc(db, 'schools', schoolId, 'events', event.id), { archived: true })
    } catch {
      alert('보관 처리 중 오류가 발생했습니다.')
    }
  }

  const handleRestore = async (event) => {
    try {
      await updateDoc(doc(db, 'schools', schoolId, 'events', event.id), { archived: false })
    } catch {
      alert('복원 중 오류가 발생했습니다.')
    }
  }

  const handleDelete = async (event) => {
    if (!window.confirm(`"${event.name}" 이벤트를 완전히 삭제하시겠습니까?\n출결 기록도 모두 삭제되며 복구할 수 없습니다.`)) return
    try {
      // attendanceLogs 서브컬렉션 먼저 삭제
      const logsSnap = await getDocs(collection(db, 'schools', schoolId, 'events', event.id, 'attendanceLogs'))
      await Promise.all(logsSnap.docs.map(d => deleteDoc(d.ref)))
      // 이벤트 문서 삭제
      await deleteDoc(doc(db, 'schools', schoolId, 'events', event.id))
    } catch {
      alert('삭제 중 오류가 발생했습니다.')
    }
  }

  const visibleEvents = events.filter(e => showArchived ? e.archived === true : !e.archived)
  const archivedCount = events.filter(e => e.archived === true).length

  // 과목별 그룹핑: [{ course: {id,name}|null, events: [...] }, ...]
  const groupedEvents = (() => {
    const groups = {}
    visibleEvents.forEach(e => {
      const key = e.courseId || '__none__'
      if (!groups[key]) groups[key] = []
      groups[key].push(e)
    })
    const result = courses
      .filter(c => groups[c.id])
      .map(c => ({ course: c, events: groups[c.id] }))
    if (groups['__none__']) result.push({ course: null, events: groups['__none__'] })
    return result
  })()

  return (
    <Layout>
      <div style={styles.header}>
        <div>
          <h2 style={styles.heading}>대시보드</h2>
          {role === 'school_admin' && (
            <p style={styles.adminNote}>학교 관리자 — 전체 교사 이벤트 표시 중</p>
          )}
        </div>
        <div style={styles.headerActions}>
          {(archivedCount > 0 || showArchived) && (
            <button onClick={() => setShowArchived(p => !p)} style={showArchived ? styles.archiveToggleActive : styles.archiveToggle}>
              {showArchived ? '← 현재 이벤트' : `보관함 (${archivedCount})`}
            </button>
          )}
          {!showArchived && (
            <button onClick={() => navigate('/attendance/events/new')} style={styles.newBtn}>+ 새 이벤트</button>
          )}
        </div>
      </div>

      {showArchived && (
        <p style={styles.archivedNote}>보관된 이벤트 — 출결 기록은 그대로 유지됩니다.</p>
      )}

      {loading ? (
        <p>불러오는 중...</p>
      ) : visibleEvents.length === 0 ? (
        <div style={styles.empty}>
          {showArchived
            ? <p>보관된 이벤트가 없습니다.</p>
            : <>
                <p>생성된 이벤트가 없습니다.</p>
                <button onClick={() => navigate('/attendance/events/new')} style={styles.createBtn}>첫 이벤트 만들기</button>
              </>
          }
        </div>
      ) : (
        <div>
          {groupedEvents.map(({ course, events: gEvents }) => (
            <div key={course?.id ?? '__none__'} style={styles.courseSection}>
              <div style={styles.courseSectionHeader}>
                <span style={styles.courseSectionTitle}>
                  {course ? `📚 ${course.name}` : '미분류'}
                </span>
                <span style={styles.courseEventCount}>{gEvents.length}개</span>
              </div>
              <div style={styles.grid}>
                {gEvents.map(event => {
                  const active = !event.archived && isActive(event)
                  const expanded = expandedId === event.id
                  const isArchived = event.archived === true

                  return (
                    <div key={event.id} style={{
                      ...styles.card,
                      borderLeft: `4px solid ${isArchived ? '#bbb' : active ? '#1a73e8' : '#ddd'}`,
                      opacity: isArchived ? 0.75 : 1,
                    }}>

                      {/* ── 카드 헤더 ── */}
                      <div style={styles.cardHeader} onClick={() => toggleExpand(event.id)}>
                        <div style={styles.cardTop}>
                          {isArchived
                            ? <span style={{ ...styles.badge, backgroundColor: '#f0f0f0', color: '#999' }}>보관됨</span>
                            : <span style={{ ...styles.badge, backgroundColor: active ? '#e8f0fe' : '#f0f0f0', color: active ? '#1a73e8' : '#888' }}>
                                {active ? '진행 중' : '종료'}
                              </span>
                          }
                          <span style={styles.typeBadge}>{event.type}</span>
                          {event.isRecurring && <span style={styles.recurringBadge}>🔁 반복</span>}
                        </div>
                        <h3 style={styles.eventName}>{event.name}</h3>
                        <div style={styles.metaRow}>
                          {event.location && <span style={styles.meta}>📍 {event.location}</span>}
                        </div>
                        <p style={styles.timeText}>
                          {event.isRecurring
                            ? `🔁 ${formatSchedules(event)}`
                            : `🕐 ${formatTime(event.startTime)} ~ ${formatTime(event.endTime)}`
                          }
                        </p>
                        <span style={styles.expandHint}>{expanded ? '▲ 접기' : '▼ 세부 내용'}</span>
                      </div>

                      {/* ── 세부 내용 ── */}
                      {expanded && (
                        <div style={styles.detail}>
                          <DetailRow label="이벤트 유형" value={event.type} />
                          {event.isRecurring && (
                            <>
                              <DetailRow label="요일별 시간" value={formatSchedules(event)} />
                              <DetailRow label="반복 종료일" value={
                                event.recurringEndDate
                                  ? (event.recurringEndDate.toDate?.() ?? new Date(event.recurringEndDate)).toLocaleDateString('ko-KR')
                                  : '-'
                              } />
                            </>
                          )}
                          {!event.isRecurring && (
                            <>
                              <DetailRow label="시작" value={formatTime(event.startTime)} />
                              <DetailRow label="종료" value={formatTime(event.endTime)} />
                            </>
                          )}
                          {event.location && <DetailRow label="장소" value={event.location} />}
                          {event.description && <DetailRow label="설명" value={event.description} />}
                        </div>
                      )}

                      {/* ── 버튼 영역 ── */}
                      <div style={styles.actions}>
                        {isArchived ? (
                          <>
                            <button onClick={() => navigate(`/attendance/events/${event.id}`)} style={styles.detailBtn}>출결 현황</button>
                            <button onClick={() => handleRestore(event)} style={styles.restoreBtn}>복원</button>
                            <button onClick={() => handleDelete(event)} style={styles.deleteBtn}>삭제</button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => navigate(`/attendance/events/${event.id}`)} style={styles.detailBtn}>출결 현황</button>
                            <button onClick={() => navigate(`/attendance/events/${event.id}/edit`)} style={styles.editBtn}>수정</button>
                            <button onClick={() => navigate('/attendance/events/new', { state: { clone: event } })} style={styles.cloneBtn}>복제</button>
                            <button onClick={() => handleArchive(event)} style={styles.archiveBtn}>보관</button>
                          </>
                        )}
                      </div>

                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </Layout>
  )
}

function DetailRow({ label, value }) {
  return (
    <div style={detailStyles.row}>
      <span style={detailStyles.label}>{label}</span>
      <span style={detailStyles.value}>{value}</span>
    </div>
  )
}

const detailStyles = {
  row: { display: 'flex', gap: '0.75rem', padding: '0.3rem 0', borderBottom: '1px solid #f0f0f0' },
  label: { fontSize: '0.8rem', color: '#888', minWidth: '80px', paddingTop: '0.1rem' },
  value: { fontSize: '0.88rem', color: '#333', flex: 1 },
}

const styles = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' },
  adminNote: { fontSize: '0.8rem', color: '#7b1fa2', margin: '0.2rem 0 0', fontWeight: 500 },
  heading: { fontSize: '1.3rem', fontWeight: 700, margin: 0 },
  headerActions: { display: 'flex', gap: '0.5rem', alignItems: 'center' },
  newBtn: { padding: '0.5rem 1.1rem', backgroundColor: '#1a73e8', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 },
  archiveToggle: { padding: '0.5rem 1rem', backgroundColor: '#fff', color: '#666', border: '1px solid #ddd', borderRadius: '8px', cursor: 'pointer', fontSize: '0.88rem' },
  archiveToggleActive: { padding: '0.5rem 1rem', backgroundColor: '#f5f5f5', color: '#333', border: '1px solid #bbb', borderRadius: '8px', cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600 },
  archivedNote: { fontSize: '0.85rem', color: '#888', marginBottom: '1rem', padding: '0.6rem 1rem', backgroundColor: '#f9f9f9', borderRadius: '8px', borderLeft: '3px solid #bbb' },
  empty: { textAlign: 'center', padding: '3rem', color: '#888' },
  createBtn: { marginTop: '1rem', padding: '0.6rem 1.2rem', backgroundColor: '#1a73e8', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' },
  courseSection: { marginBottom: '2rem' },
  courseSectionHeader: { display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', paddingBottom: '0.5rem', borderBottom: '2px solid #e8f0fe' },
  courseSectionTitle: { fontSize: '1rem', fontWeight: 700, color: '#1a73e8' },
  courseEventCount: { fontSize: '0.78rem', backgroundColor: '#e8f0fe', color: '#1a73e8', padding: '0.15rem 0.5rem', borderRadius: '10px', fontWeight: 600 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' },
  card: { backgroundColor: '#fff', borderRadius: '10px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', overflow: 'hidden' },
  cardHeader: { padding: '1.25rem', cursor: 'pointer', userSelect: 'none' },
  cardTop: { display: 'flex', gap: '0.4rem', alignItems: 'center', marginBottom: '0.5rem' },
  badge: { padding: '0.2rem 0.6rem', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600 },
  typeBadge: { fontSize: '0.75rem', color: '#888', padding: '0.2rem 0.4rem' },
  recurringBadge: { fontSize: '0.72rem', color: '#7b1fa2', backgroundColor: '#f3e5f5', padding: '0.2rem 0.5rem', borderRadius: '10px' },
  eventName: { margin: '0 0 0.35rem', fontSize: '1rem', fontWeight: 700 },
  metaRow: { display: 'flex', gap: '0.75rem', flexWrap: 'wrap' },
  meta: { fontSize: '0.8rem', color: '#555' },
  timeText: { margin: '0.4rem 0 0.25rem', fontSize: '0.8rem', color: '#666' },
  expandHint: { fontSize: '0.75rem', color: '#1a73e8' },
  detail: { padding: '0.75rem 1.25rem 1rem', borderTop: '1px solid #f0f0f0', backgroundColor: '#fafafa' },
  actions: { display: 'flex', gap: '0.5rem', padding: '0.75rem 1.25rem', borderTop: '1px solid #f0f0f0', flexWrap: 'wrap' },
  editBtn: { padding: '0.35rem 0.75rem', border: '1px solid #f57c00', color: '#f57c00', backgroundColor: '#fff', borderRadius: '6px', cursor: 'pointer', fontSize: '0.82rem' },
  detailBtn: { padding: '0.35rem 0.75rem', border: '1px solid #ddd', color: '#333', backgroundColor: '#fff', borderRadius: '6px', cursor: 'pointer', fontSize: '0.82rem' },
  cloneBtn: { padding: '0.35rem 0.75rem', border: '1px solid #43a047', color: '#43a047', backgroundColor: '#fff', borderRadius: '6px', cursor: 'pointer', fontSize: '0.82rem' },
  archiveBtn: { padding: '0.35rem 0.75rem', border: '1px solid #bbb', color: '#666', backgroundColor: '#fff', borderRadius: '6px', cursor: 'pointer', fontSize: '0.82rem' },
  restoreBtn: { padding: '0.35rem 0.75rem', border: '1px solid #1a73e8', color: '#1a73e8', backgroundColor: '#fff', borderRadius: '6px', cursor: 'pointer', fontSize: '0.82rem' },
  deleteBtn:  { padding: '0.35rem 0.75rem', border: '1px solid #d32f2f', color: '#d32f2f', backgroundColor: '#fff', borderRadius: '6px', cursor: 'pointer', fontSize: '0.82rem' },
}
