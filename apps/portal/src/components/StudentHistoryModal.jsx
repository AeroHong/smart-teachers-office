import { useState, useMemo } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useStudentHistory } from '../hooks/useStudentHistory'

const EVENT_TYPE_LABEL = {
  조회: '조회', 수업: '수업', 방과후: '방과후', 행사: '행사', 기타: '기타',
}

const METHOD_LABEL = { QR: 'QR', manual: '수동', 결석: '결석' }

export default function StudentHistoryModal({ student, schoolId, onClose }) {
  const { role, user } = useAuth()
  const { logs, summary, loading, error } = useStudentHistory(student, schoolId, role, user?.uid)

  const [period, setPeriod] = useState('all')

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
    return d.toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  return (
    <div style={styles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <div>
            <h3 style={styles.title}>{student.name} 출결 이력</h3>
            <span style={styles.subtitle}>
              {student.grade}학년 {student.class}반 {student.number}번 · 학번 {student.studentId}
            </span>
          </div>
          <button onClick={onClose} style={styles.closeBtn}>✕</button>
        </div>

        {summary && (
          <div style={styles.summaryRow}>
            <SummaryCard label="전체" value={summary.total} color="#555" />
            <SummaryCard label="출석" value={summary.attended} color="#2e7d32" />
            <SummaryCard label="결석" value={summary.absent} color="#c62828" />
            <SummaryCard label="출석률" value={`${summary.rate}%`} color="#1a73e8" highlight />
          </div>
        )}

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
          <span style={styles.filterCount}>{filteredLogs.length}건</span>
        </div>

        <div style={styles.body}>
          {loading && <p style={styles.muted}>불러오는 중...</p>}
          {error && <p style={styles.errorMsg}>오류: {error}</p>}
          {!loading && !error && filteredLogs.length === 0 && (
            <p style={styles.muted}>출결 기록이 없습니다.</p>
          )}
          {!loading && filteredLogs.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    {['날짜/시간', '이벤트', '유형', '방법', '결석 사유'].map(h => (
                      <th key={h} style={styles.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map(log => {
                    const isAbsent = log.method === '결석' || log.reason
                    return (
                      <tr key={log.logId} style={isAbsent ? styles.absentRow : {}}>
                        <td style={styles.td}>{formatDate(log.checkedAt)}</td>
                        <td style={styles.td}>{log.eventName}</td>
                        <td style={styles.td}>
                          <span style={styles.typeBadge}>{EVENT_TYPE_LABEL[log.eventType] || log.eventType}</span>
                        </td>
                        <td style={styles.td}>
                          <span style={{ ...styles.methodBadge, ...(isAbsent ? styles.methodAbsent : styles.methodPresent) }}>
                            {METHOD_LABEL[log.method] || log.method}
                          </span>
                        </td>
                        <td style={{ ...styles.td, color: '#b71c1c', fontSize: '0.82rem' }}>
                          {log.reason || '-'}
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

function SummaryCard({ label, value, color, highlight }) {
  return (
    <div style={{ ...styles.summaryCard, ...(highlight ? styles.summaryCardHL : {}) }}>
      <span style={{ ...styles.summaryValue, color }}>{value}</span>
      <span style={styles.summaryLabel}>{label}</span>
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
  summaryRow: {
    display: 'flex', gap: '0.75rem', padding: '1rem 1.5rem',
    borderBottom: '1px solid #eee', flexWrap: 'wrap',
  },
  summaryCard: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    padding: '0.5rem 1rem', borderRadius: '8px', backgroundColor: '#f5f5f5', minWidth: '70px',
  },
  summaryCardHL: { backgroundColor: '#e8f0fe' },
  summaryValue: { fontSize: '1.3rem', fontWeight: 700, lineHeight: 1.2 },
  summaryLabel: { fontSize: '0.75rem', color: '#777', marginTop: '0.15rem' },
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
  filterCount: { fontSize: '0.8rem', color: '#999', marginLeft: '0.25rem' },
  body: { flex: 1, overflowY: 'auto', padding: '0.75rem 1.5rem 1.25rem' },
  muted: { color: '#999', fontSize: '0.9rem', textAlign: 'center', padding: '2rem 0' },
  errorMsg: { color: '#d32f2f', fontSize: '0.9rem' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' },
  th: { textAlign: 'left', padding: '0.5rem 0.75rem', backgroundColor: '#f5f5f5', fontWeight: 600, fontSize: '0.82rem', whiteSpace: 'nowrap' },
  td: { padding: '0.5rem 0.75rem', borderBottom: '1px solid #f0f0f0', whiteSpace: 'nowrap' },
  absentRow: { backgroundColor: '#fff8f8' },
  typeBadge: { fontSize: '0.78rem', backgroundColor: '#f0f0f0', color: '#555', padding: '0.1rem 0.45rem', borderRadius: '999px' },
  methodBadge: { fontSize: '0.78rem', padding: '0.1rem 0.45rem', borderRadius: '999px', fontWeight: 600 },
  methodPresent: { backgroundColor: '#e8f5e9', color: '#2e7d32' },
  methodAbsent: { backgroundColor: '#ffebee', color: '#c62828' },
}
