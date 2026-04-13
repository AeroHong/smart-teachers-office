import { useState, useMemo, useEffect } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../contexts/AuthContext'
import { useStudentHistory } from '../hooks/useStudentHistory'

const DAYS = ['일', '월', '화', '수', '목', '금', '토']

const EVENT_TYPE_LABEL = {
  조회: '조회', 수업: '수업', 방과후: '방과후', 행사: '행사', 기타: '기타',
}

// 반복 이벤트: checkedAt 날짜의 요일에 해당하는 교시 정보 반환
function getScheduleLabel(log) {
  if (!log.isRecurring) return null
  const d = log.checkedAt?.toDate?.() ?? new Date(log.checkedAt)
  const dayOfWeek = d.getDay()
  if (!log.schedules?.length) return DAYS[dayOfWeek]
  const matching = log.schedules.filter(s => s.dayOfWeek === dayOfWeek)
  if (!matching.length) return DAYS[dayOfWeek]
  return matching.map(s => `${DAYS[s.dayOfWeek]} ${s.period}교시`).join(', ')
}

export default function StudentHistoryModal({ student, schoolId, onClose }) {
  const { role, user } = useAuth()
  const { logs, loading, error } = useStudentHistory(student, schoolId, role, user?.uid)

  const [period, setPeriod] = useState('all')
  const [studentEmail, setStudentEmail] = useState(student.email || '')

  useEffect(() => {
    if (student.email || !schoolId || !student.studentId) return
    getDoc(doc(db, 'schools', schoolId, 'students', student.studentId))
      .then(snap => { if (snap.exists()) setStudentEmail(snap.data().email || '') })
  }, [student.studentId, schoolId])

  const filteredLogs = useMemo(() => {
    if (period === 'all') return logs
    const now = new Date()
    return logs.filter(l => {
      const d = l.checkedAt?.toDate?.() ?? new Date(l.checkedAt)
      if (period === 'month') {
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
      }
      if (period === 'prev') {
        const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        return d.getFullYear() === prev.getFullYear() && d.getMonth() === prev.getMonth()
      }
      return true
    })
  }, [logs, period])

  const formatDate = (ts) => {
    if (!ts) return '-'
    const d = ts?.toDate?.() ?? new Date(ts)
    return d.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
  }

  const handleSendEmail = () => {
    const subject = encodeURIComponent(`${student.name} 학생 결석 현황 안내`)
    const bodyLines = [
      `안녕하세요,`,
      `${student.grade}학년 ${student.class}반 ${student.number}번 ${student.name} 학생의 결석 현황을 안내드립니다.`,
      '',
      `■ 총 결석: ${filteredLogs.length}회`,
      '',
      '■ 결석 내역',
      ...filteredLogs.map(l => {
        const dateStr = formatDate(l.checkedAt)
        const scheduleLabel = getScheduleLabel(l)
        const scheduleStr = scheduleLabel ? ` (${scheduleLabel})` : ''
        return `  - ${dateStr}${scheduleStr} | ${l.eventName} | 사유: ${l.reason || '미등록'}`
      }),
      '',
      '본 메일은 선유고 스마트 교무실 시스템에서 발송되었습니다.',
    ]
    const mailto = `mailto:${studentEmail}?subject=${subject}&body=${encodeURIComponent(bodyLines.join('\n'))}`
    window.open(mailto)
  }

  return (
    <div style={styles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={styles.modal}>

        {/* 헤더 */}
        <div style={styles.header}>
          <div>
            <h3 style={styles.title}>{student.name} 결석 이력</h3>
            <span style={styles.subtitle}>
              {student.grade}학년 {student.class}반 {student.number}번 · 학번 {student.studentId}
              {studentEmail && <span style={{ color: '#1a73e8', marginLeft: '0.5rem' }}>{studentEmail}</span>}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              onClick={handleSendEmail}
              disabled={!studentEmail || filteredLogs.length === 0}
              style={{ ...styles.emailBtn, ...(!studentEmail || filteredLogs.length === 0 ? styles.emailBtnDisabled : {}) }}
              title={!studentEmail ? '이메일 정보 없음' : '결석 현황 메일 발송'}
            >
              ✉ 메일 발송
            </button>
            <button onClick={onClose} style={styles.closeBtn}>✕</button>
          </div>
        </div>

        {/* 기간 필터 */}
        <div style={styles.filterRow}>
          {[['all', '전체'], ['month', '이번 달'], ['prev', '지난 달']].map(([val, label]) => (
            <button
              key={val}
              onClick={() => setPeriod(val)}
              style={{ ...styles.filterBtn, ...(period === val ? styles.filterBtnActive : {}) }}
            >
              {label}
            </button>
          ))}
          <span style={styles.absentBadge}>결석 {filteredLogs.length}회</span>
        </div>

        {/* 결석 목록 */}
        <div style={styles.body}>
          {loading && <p style={styles.muted}>불러오는 중...</p>}
          {error && <p style={styles.errorMsg}>오류: {error}</p>}
          {!loading && !error && filteredLogs.length === 0 && (
            <p style={styles.muted}>결석 기록이 없습니다.</p>
          )}
          {!loading && filteredLogs.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    {['날짜', '이벤트', '유형', '요일·교시', '사유'].map(h => (
                      <th key={h} style={styles.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map(log => {
                    const scheduleLabel = getScheduleLabel(log)
                    return (
                      <tr key={log.logId} style={styles.absentRow}>
                        <td style={styles.td}>{formatDate(log.checkedAt)}</td>
                        <td style={styles.td}>{log.eventName}</td>
                        <td style={styles.td}>
                          <span style={styles.typeBadge}>{EVENT_TYPE_LABEL[log.eventType] || log.eventType}</span>
                        </td>
                        <td style={styles.td}>
                          {scheduleLabel
                            ? <span style={styles.scheduleBadge}>{scheduleLabel}</span>
                            : <span style={styles.muted}>-</span>
                          }
                        </td>
                        <td style={{ ...styles.td, color: '#b71c1c', fontSize: '0.82rem' }}>
                          {log.reason || <span style={{ color: '#bbb' }}>미등록</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000, padding: '1rem',
  },
  modal: {
    backgroundColor: '#fff', borderRadius: '14px',
    width: '100%', maxWidth: '780px', maxHeight: '85vh',
    display: 'flex', flexDirection: 'column',
    boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    padding: '1.25rem 1.5rem 1rem', borderBottom: '1px solid #eee',
  },
  title: { margin: 0, fontSize: '1.1rem', fontWeight: 700 },
  subtitle: { fontSize: '0.82rem', color: '#777', marginTop: '0.2rem', display: 'block' },
  closeBtn: {
    background: 'none', border: 'none', fontSize: '1.1rem',
    cursor: 'pointer', color: '#888', padding: '0.2rem 0.4rem',
  },
  emailBtn: {
    padding: '0.35rem 0.85rem', backgroundColor: '#1a73e8', color: '#fff',
    border: 'none', borderRadius: '7px', cursor: 'pointer', fontSize: '0.83rem', fontWeight: 600,
  },
  emailBtnDisabled: {
    backgroundColor: '#e0e0e0', color: '#aaa', cursor: 'not-allowed',
  },
  filterRow: {
    display: 'flex', gap: '0.5rem', padding: '0.75rem 1.5rem',
    borderBottom: '1px solid #eee', alignItems: 'center',
  },
  filterBtn: {
    padding: '0.3rem 0.75rem', border: '1px solid #ddd',
    borderRadius: '999px', cursor: 'pointer', fontSize: '0.82rem',
    backgroundColor: '#fff', color: '#555',
  },
  filterBtnActive: { backgroundColor: '#1a73e8', color: '#fff', borderColor: '#1a73e8' },
  absentBadge: {
    marginLeft: 'auto', fontSize: '0.82rem', fontWeight: 700,
    color: '#c62828', backgroundColor: '#ffebee',
    padding: '0.2rem 0.75rem', borderRadius: '999px',
  },
  body: { flex: 1, overflowY: 'auto', padding: '0.75rem 1.5rem 1.25rem' },
  muted: { color: '#bbb', fontSize: '0.85rem' },
  errorMsg: { color: '#d32f2f', fontSize: '0.9rem' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' },
  th: { textAlign: 'left', padding: '0.5rem 0.75rem', backgroundColor: '#f5f5f5', fontWeight: 600, fontSize: '0.82rem', whiteSpace: 'nowrap' },
  td: { padding: '0.5rem 0.75rem', borderBottom: '1px solid #f0f0f0', whiteSpace: 'nowrap' },
  absentRow: { backgroundColor: '#fff8f8' },
  typeBadge: { fontSize: '0.78rem', backgroundColor: '#f0f0f0', color: '#555', padding: '0.1rem 0.45rem', borderRadius: '999px' },
  scheduleBadge: { fontSize: '0.78rem', backgroundColor: '#e8f0fe', color: '#1a73e8', padding: '0.1rem 0.55rem', borderRadius: '999px', fontWeight: 600 },
}
