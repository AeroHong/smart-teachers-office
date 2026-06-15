import { useEffect, useState } from 'react'
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore'
import { db, auth } from '../../lib/firebase'
import { useAuth } from '../../contexts/AuthContext'
import { signOut } from 'firebase/auth'

export default function StudentPortal() {
  const { schoolId, studentId, user } = useAuth()

  const [notices, setNotices] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!schoolId || !studentId) return
    loadNotices()
  }, [schoolId, studentId])

  const loadNotices = async () => {
    setLoading(true)
    try {
      // 내 그룹/이벤트 ID 수집 (실패해도 확인된 공지는 표시)
      let validEventIds = new Set()
      try {
        const groupsSnap = await getDocs(collection(db, 'schools', schoolId, 'studentGroups'))
        const myGroupIds = new Set(
          groupsSnap.docs
            .filter(d => (d.data().studentIds || []).includes(studentId))
            .map(d => d.id)
        )
        const eventsSnap = await getDocs(collection(db, 'schools', schoolId, 'events'))
        eventsSnap.docs
          .filter(d => myGroupIds.has(d.data().studentGroupId))
          .forEach(d => validEventIds.add(d.id))
      } catch {
        // 그룹/이벤트 조회 실패 시 확인된 공지만 표시
      }

      // 전체 공지 로드 후 확인 여부 먼저 조회
      const snap = await getDocs(collection(db, 'schools', schoolId, 'notices'))
      const allNotices = snap.docs.map(d => ({ id: d.id, ...d.data() }))

      const withStatus = await Promise.all(
        allNotices.map(async (notice) => {
          try {
            const cfm = await getDoc(
              doc(db, 'schools', schoolId, 'notices', notice.id, 'confirmations', studentId)
            )
            return { ...notice, confirmed: cfm.exists(), confirmedAt: cfm.data()?.confirmedAt }
          } catch {
            return { ...notice, confirmed: false }
          }
        })
      )

      // 필터: 확인한 공지는 무조건 표시 / 미확인은 내 그룹 공지 또는 개별 지정만
      const filtered = withStatus
        .filter(n => {
          if (n.confirmed) return true
          if (n.targetType === 'individual') return n.targetStudentIds?.includes(studentId)
          if (n.targetType === 'all') return !n.eventId || validEventIds.has(n.eventId)
          return false
        })
        .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))

      setNotices(filtered)
    } catch (err) {
      console.error('공지 로드 오류:', err)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (ts) => {
    if (!ts) return ''
    const d = ts.toDate?.() ?? new Date(ts)
    return d.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  const unconfirmed = notices.filter(n => !n.confirmed)
  const confirmed   = notices.filter(n => n.confirmed)

  return (
    <div style={sp.page}>
      <div style={sp.container}>
        <div style={sp.header}>
          <p style={sp.schoolLabel}>선유고등학교</p>
          <h1 style={sp.heading}>공지 확인</h1>
          <p style={sp.userLabel}>{user?.displayName}</p>
        </div>

        {loading ? (
          <p style={sp.muted}>불러오는 중...</p>
        ) : notices.length === 0 ? (
          <div style={sp.emptyBox}>
            <p style={sp.emptyIcon}>📭</p>
            <p style={sp.emptyText}>등록된 공지가 없습니다.</p>
          </div>
        ) : (
          <>
            {unconfirmed.length > 0 && (
              <section style={sp.section}>
                <h2 style={sp.sectionTitle}>
                  <span style={sp.dot('#e53935')} />
                  미확인 공지 ({unconfirmed.length})
                </h2>
                {unconfirmed.map(n => (
                  <NoticeCard key={n.id} notice={n} formatDate={formatDate} />
                ))}
              </section>
            )}

            {confirmed.length > 0 && (
              <section style={sp.section}>
                <h2 style={sp.sectionTitle}>
                  <span style={sp.dot('#43a047')} />
                  확인한 공지 ({confirmed.length})
                </h2>
                {confirmed.map(n => (
                  <NoticeCard key={n.id} notice={n} formatDate={formatDate} confirmed />
                ))}
              </section>
            )}
          </>
        )}

        <button
          onClick={() => signOut(auth)}
          style={sp.logoutBtn}
        >
          로그아웃
        </button>
      </div>
    </div>
  )
}

function NoticeCard({ notice, formatDate, confirmed }) {
  const [open, setOpen] = useState(!confirmed)
  return (
    <div style={{ ...sp.card, ...(confirmed ? sp.cardConfirmed : sp.cardPending) }}>
      <div style={sp.cardHeader} onClick={() => setOpen(p => !p)}>
        <div style={sp.cardLeft}>
          {notice.eventName && <span style={sp.eventTag}>{notice.eventName}</span>}
          <span style={sp.cardTitle}>{notice.title}</span>
        </div>
        <div style={sp.cardRight}>
          {confirmed
            ? <span style={sp.confirmedBadge}>✓ 확인</span>
            : <span style={sp.pendingBadge}>미확인</span>}
          <span style={sp.chevron}>{open ? '▲' : '▽'}</span>
        </div>
      </div>
      {open && (
        <div style={sp.cardBody}>
          <p style={sp.cardContent}>{notice.content}</p>
          <p style={sp.cardDate}>
            등록: {formatDate(notice.createdAt)}
            {confirmed && notice.confirmedAt && ` · 확인: ${formatDate(notice.confirmedAt)}`}
          </p>
        </div>
      )}
    </div>
  )
}

const sp = {
  page: { minHeight: '100vh', backgroundColor: '#f0f4ff', padding: '1.5rem 1rem' },
  container: { maxWidth: '480px', margin: '0 auto' },
  header: { textAlign: 'center', marginBottom: '1.75rem' },
  schoolLabel: { fontSize: '0.8rem', color: '#888', margin: '0 0 0.2rem' },
  heading: { fontSize: '1.5rem', fontWeight: 700, color: '#1a73e8', margin: '0 0 0.3rem' },
  userLabel: { fontSize: '0.85rem', color: '#666', margin: 0 },

  muted: { textAlign: 'center', color: '#999', fontSize: '0.9rem', marginTop: '2rem' },
  emptyBox: { textAlign: 'center', marginTop: '3rem' },
  emptyIcon: { fontSize: '2.5rem', margin: '0 0 0.5rem' },
  emptyText: { color: '#aaa', fontSize: '0.9rem' },

  section: { marginBottom: '1.5rem' },
  sectionTitle: {
    fontSize: '0.85rem', fontWeight: 700, color: '#444',
    marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.4rem',
  },
  dot: (color) => ({
    display: 'inline-block', width: '8px', height: '8px',
    borderRadius: '50%', backgroundColor: color, flexShrink: 0,
  }),

  card: {
    borderRadius: '12px', overflow: 'hidden', marginBottom: '0.6rem',
    border: '1px solid', boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  cardPending: { borderColor: '#ef9a9a', backgroundColor: '#fff9f9' },
  cardConfirmed: { borderColor: '#e0e0e0', backgroundColor: '#fff' },

  cardHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '0.85rem 1rem', cursor: 'pointer', gap: '0.5rem',
  },
  cardLeft: { display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0 },
  cardRight: { display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 },
  eventTag: { fontSize: '0.72rem', backgroundColor: '#e8f0fe', color: '#1a73e8', padding: '0.1rem 0.4rem', borderRadius: '999px', fontWeight: 600, alignSelf: 'flex-start' },
  cardTitle: { fontSize: '0.92rem', fontWeight: 700, color: '#222' },
  confirmedBadge: { fontSize: '0.72rem', backgroundColor: '#e8f5e9', color: '#2e7d32', padding: '0.15rem 0.5rem', borderRadius: '999px', fontWeight: 600 },
  pendingBadge: { fontSize: '0.72rem', backgroundColor: '#ffebee', color: '#c62828', padding: '0.15rem 0.5rem', borderRadius: '999px', fontWeight: 600 },
  chevron: { fontSize: '0.7rem', color: '#aaa' },

  cardBody: { padding: '0 1rem 0.85rem', borderTop: '1px solid #f0f0f0' },
  cardContent: { fontSize: '0.87rem', color: '#333', lineHeight: 1.7, whiteSpace: 'pre-line', margin: '0.75rem 0 0.5rem' },
  cardDate: { fontSize: '0.75rem', color: '#aaa', margin: 0 },

  logoutBtn: {
    display: 'block', margin: '2rem auto 0', padding: '0.5rem 1.5rem',
    backgroundColor: '#fff', color: '#666', border: '1px solid #ddd',
    borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem',
  },
}
