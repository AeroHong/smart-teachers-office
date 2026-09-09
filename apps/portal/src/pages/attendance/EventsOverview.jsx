/**
 * 스마트 출결 — 전체 이벤트 현황 (관리자 전용).
 *
 * TeacherDashboard.jsx는 이제 역할과 무관하게 "내가 만든 이벤트"만 보여준다(사용자
 * 요청, 2026-09-09 — 학교 관리자도 본인 수업이 있는데 전체가 다 보이면 불편하다).
 * 학교 전체에서 이벤트가 어떻게 편성되고(과목·대상 그룹·생성자·반복 일정) 어떻게
 * 쓰이고 있는지(출결 기록 수·마지막 사용일)는 이 화면에서 별도로 확인한다 — 조회
 * 전용이라 여기서 개별 이벤트를 수정·삭제하지는 않는다(각자 자기 이벤트에서 관리).
 */
import { useEffect, useMemo, useState } from 'react'
import {
  collection, query, where, orderBy, limit, getDocs, getCountFromServer,
} from 'firebase/firestore'
import { useNavigate } from 'react-router-dom'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import Layout from '../../components/Layout'
import { isEventActive, formatSchedules, formatEventTime } from './eventHelpers'

export default function EventsOverview() {
  const { schoolId } = useAuth()
  const navigate = useNavigate()

  const [events, setEvents] = useState([])
  const [courses, setCourses] = useState([])
  const [groups, setGroups] = useState([])
  const [creatorNames, setCreatorNames] = useState({})
  const [usageByEvent, setUsageByEvent] = useState({})   // { [eventId]: { count, lastUsedAt } }
  const [loading, setLoading] = useState(true)
  const [usageLoading, setUsageLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)

  const load = async () => {
    if (!schoolId) return
    setLoading(true)
    const [eventsSnap, coursesSnap, groupsSnap, usersSnap] = await Promise.all([
      getDocs(query(collection(db, 'schools', schoolId, 'events'), orderBy('createdAt', 'desc'))),
      getDocs(query(collection(db, 'schools', schoolId, 'courses'), orderBy('name'))),
      getDocs(collection(db, 'schools', schoolId, 'studentGroups')),
      getDocs(query(collection(db, 'users'), where('schoolId', '==', schoolId))),
    ])
    const evs = eventsSnap.docs.map(d => ({ id: d.id, ...d.data() }))
    setEvents(evs)
    setCourses(coursesSnap.docs.map(d => ({ id: d.id, ...d.data() })))
    setGroups(groupsSnap.docs.map(d => ({ id: d.id, ...d.data() })))
    const names = {}
    usersSnap.docs.forEach(d => { names[d.id] = d.data().name || d.data().email || '(알 수 없음)' })
    setCreatorNames(names)
    setLoading(false)

    // 이벤트별 사용 현황(기록 수·마지막 사용일)은 개수가 많을 수 있어 목록이 뜬
    // 뒤에 따로 채운다 — 먼저 뜬 목록이 "로딩 중" 표시로 막혀 있지 않게.
    setUsageLoading(true)
    const usage = {}
    await Promise.all(evs.map(async (ev) => {
      const logsCol = collection(db, 'schools', schoolId, 'events', ev.id, 'attendanceLogs')
      const [countSnap, lastSnap] = await Promise.all([
        getCountFromServer(logsCol).catch(() => null),
        getDocs(query(logsCol, orderBy('checkedAt', 'desc'), limit(1))).catch(() => null),
      ])
      usage[ev.id] = {
        count: countSnap?.data().count ?? null,
        lastUsedAt: lastSnap?.docs[0]?.data()?.checkedAt ?? null,
      }
    }))
    setUsageByEvent(usage)
    setUsageLoading(false)
  }

  useEffect(() => { load() }, [schoolId])

  const groupName = (id) => groups.find(g => g.id === id)?.name || null

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return events
      .filter(e => showArchived ? true : !e.archived)
      .filter(e => {
        if (!q) return true
        const creator = (creatorNames[e.createdBy] || '').toLowerCase()
        return (e.name || '').toLowerCase().includes(q) || creator.includes(q)
      })
  }, [events, showArchived, search, creatorNames])

  // 과목별 그룹핑 — TeacherDashboard.jsx와 같은 방식(미분류는 맨 뒤).
  const groupedEvents = useMemo(() => {
    const byCourse = {}
    filtered.forEach(e => {
      const key = e.courseId || '__none__'
      if (!byCourse[key]) byCourse[key] = []
      byCourse[key].push(e)
    })
    const result = courses
      .filter(c => byCourse[c.id])
      .map(c => ({ course: c, events: byCourse[c.id] }))
    if (byCourse['__none__']) result.push({ course: null, events: byCourse['__none__'] })
    return result
  }, [filtered, courses])

  const archivedCount = events.filter(e => e.archived === true).length
  const activeCount = events.filter(e => !e.archived && isEventActive(e)).length
  const unusedCount = events.filter(e => !e.archived && usageByEvent[e.id]?.count === 0).length

  return (
    <Layout>
      <div style={styles.header}>
        <h2 style={styles.heading}>전체 이벤트 현황</h2>
        <button onClick={load} style={styles.refreshBtn} disabled={loading}>
          {loading ? '불러오는 중...' : '↺ 새로고침'}
        </button>
      </div>
      <p style={styles.subNote}>학교 전체 이벤트를 조회 전용으로 보여줍니다 — 수정·보관·삭제는 각 이벤트를 만든 사람이 본인 대시보드에서 합니다.</p>

      <div style={styles.summaryRow}>
        <SummaryCard label="전체 이벤트" value={events.length} color="#555" />
        <SummaryCard label="진행 중" value={activeCount} color="#1a73e8" />
        <SummaryCard label="보관됨" value={archivedCount} color="#999" />
        <SummaryCard
          label="기록 없음"
          value={usageLoading && unusedCount === 0 ? '…' : unusedCount}
          color="#c62828"
          highlight={unusedCount > 0}
        />
      </div>

      <div style={styles.toolRow}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="이벤트명·생성자 검색"
          style={styles.searchInput}
        />
        <button
          onClick={() => setShowArchived(p => !p)}
          style={showArchived ? styles.archiveToggleActive : styles.archiveToggle}
        >
          {showArchived ? '보관된 이벤트 숨기기' : `보관된 이벤트도 보기 (${archivedCount})`}
        </button>
      </div>

      {loading ? (
        <p>불러오는 중...</p>
      ) : filtered.length === 0 ? (
        <div style={styles.empty}>
          <p>{search.trim() ? '검색 결과가 없습니다.' : '생성된 이벤트가 없습니다.'}</p>
        </div>
      ) : (
        <div>
          {groupedEvents.map(({ course, events: gEvents }) => (
            <div key={course?.id ?? '__none__'} style={styles.courseSection}>
              <div style={styles.courseSectionHeader}>
                <span style={styles.courseSectionTitle}>{course ? `📚 ${course.name}` : '미분류'}</span>
                <span style={styles.courseEventCount}>{gEvents.length}개</span>
              </div>
              <div style={styles.grid}>
                {gEvents.map(event => {
                  const active = !event.archived && isEventActive(event)
                  const isArchived = event.archived === true
                  const usage = usageByEvent[event.id]
                  const gName = groupName(event.studentGroupId)

                  return (
                    <div key={event.id} style={{
                      ...styles.card,
                      borderLeft: `4px solid ${isArchived ? '#bbb' : active ? '#1a73e8' : '#ddd'}`,
                      opacity: isArchived ? 0.75 : 1,
                    }}>
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
                        <span style={styles.meta}>👤 {creatorNames[event.createdBy] || '(알 수 없음)'}</span>
                        {gName && <span style={styles.meta}>🧑‍🤝‍🧑 {gName}</span>}
                        {event.location && <span style={styles.meta}>📍 {event.location}</span>}
                      </div>

                      <p style={styles.timeText}>
                        {event.isRecurring
                          ? `🔁 ${formatSchedules(event)}`
                          : `🕐 ${formatEventTime(event.startTime)} ~ ${formatEventTime(event.endTime)}`
                        }
                      </p>

                      <div style={styles.usageRow}>
                        {usage == null ? (
                          <span style={styles.usageMuted}>사용 현황 불러오는 중…</span>
                        ) : usage.count === 0 ? (
                          <span style={styles.usageWarn}>⚠ 출결 기록 없음</span>
                        ) : (
                          <span style={styles.usageText}>
                            출결 기록 {usage.count}건 · 마지막 사용 {formatEventTime(usage.lastUsedAt)}
                          </span>
                        )}
                      </div>

                      <div style={styles.actions}>
                        <button onClick={() => navigate(`/attendance/events/${event.id}`)} style={styles.detailBtn}>출결 현황 보기</button>
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

function SummaryCard({ label, value, color, highlight }) {
  return (
    <div style={{ ...styles.summaryCard, ...(highlight ? styles.summaryCardHL : {}) }}>
      <span style={{ ...styles.summaryValue, color }}>{value}</span>
      <span style={styles.summaryLabel}>{label}</span>
    </div>
  )
}

const styles = {
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' },
  heading: { fontSize: '1.3rem', fontWeight: 700, margin: 0 },
  refreshBtn: { padding: '0.35rem 0.85rem', backgroundColor: '#fff', border: '1px solid #ccc', borderRadius: '7px', cursor: 'pointer', fontSize: '0.85rem', color: '#555' },
  subNote: { fontSize: '0.82rem', color: '#888', margin: '0 0 1.25rem' },
  summaryRow: { display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' },
  summaryCard: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0.75rem 1.25rem', borderRadius: '10px', backgroundColor: '#f5f5f5', minWidth: '80px' },
  summaryCardHL: { backgroundColor: '#ffebee' },
  summaryValue: { fontSize: '1.5rem', fontWeight: 700, lineHeight: 1.2 },
  summaryLabel: { fontSize: '0.75rem', color: '#777', marginTop: '0.2rem' },
  toolRow: { display: 'flex', gap: '0.6rem', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap' },
  searchInput: { padding: '0.45rem 0.75rem', border: '1px solid #ddd', borderRadius: '8px', fontSize: '0.88rem', minWidth: '220px' },
  archiveToggle: { padding: '0.45rem 0.9rem', backgroundColor: '#fff', color: '#666', border: '1px solid #ddd', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem' },
  archiveToggleActive: { padding: '0.45rem 0.9rem', backgroundColor: '#f5f5f5', color: '#333', border: '1px solid #bbb', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 },
  empty: { textAlign: 'center', padding: '3rem', color: '#888' },
  courseSection: { marginBottom: '2rem' },
  courseSectionHeader: { display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', paddingBottom: '0.5rem', borderBottom: '2px solid #e8f0fe' },
  courseSectionTitle: { fontSize: '1rem', fontWeight: 700, color: '#1a73e8' },
  courseEventCount: { fontSize: '0.78rem', backgroundColor: '#e8f0fe', color: '#1a73e8', padding: '0.15rem 0.5rem', borderRadius: '10px', fontWeight: 600 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' },
  card: { backgroundColor: '#fff', borderRadius: '10px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', padding: '1.25rem' },
  cardTop: { display: 'flex', gap: '0.4rem', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap' },
  badge: { padding: '0.2rem 0.6rem', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600 },
  typeBadge: { fontSize: '0.75rem', color: '#888', padding: '0.2rem 0.4rem' },
  recurringBadge: { fontSize: '0.72rem', color: '#7b1fa2', backgroundColor: '#f3e5f5', padding: '0.2rem 0.5rem', borderRadius: '10px' },
  eventName: { margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: 700 },
  metaRow: { display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.35rem' },
  meta: { fontSize: '0.8rem', color: '#555' },
  timeText: { margin: '0 0 0.6rem', fontSize: '0.8rem', color: '#666' },
  usageRow: { padding: '0.5rem 0.6rem', backgroundColor: '#fafafa', borderRadius: '6px', marginBottom: '0.75rem' },
  usageText: { fontSize: '0.78rem', color: '#555' },
  usageMuted: { fontSize: '0.78rem', color: '#aaa' },
  usageWarn: { fontSize: '0.78rem', color: '#c62828', fontWeight: 600 },
  actions: { display: 'flex' },
  detailBtn: { padding: '0.4rem 0.85rem', border: '1px solid #ddd', color: '#333', backgroundColor: '#fff', borderRadius: '6px', cursor: 'pointer', fontSize: '0.82rem' },
}
