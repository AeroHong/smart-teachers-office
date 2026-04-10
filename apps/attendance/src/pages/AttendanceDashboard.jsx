import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  doc, getDoc, getDocs, collection,
  onSnapshot, setDoc, deleteDoc, serverTimestamp,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../contexts/AuthContext'
import Layout from '../components/Layout'

const DAYS = ['일', '월', '화', '수', '목', '금', '토']

// 결석 사유 프리셋
const REASON_PRESETS = ['질병결석', '조퇴', '지각', '미인정결석', '체험학습', '기타']

function todayStr() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export default function AttendanceDashboard() {
  const { schoolId } = useAuth()
  const { eventId } = useParams()
  const navigate = useNavigate()

  const [event, setEvent] = useState(null)
  const [students, setStudents] = useState([])
  const [logs, setLogs] = useState([])
  const [selectedDate, setSelectedDate] = useState(todayStr())
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState(null)

  // 사유 입력 임시 상태 { studentId: reason }
  const [reasonDraft, setReasonDraft] = useState({})

  // ── 이벤트 + 학생 그룹 로드 ─────────────────────────────────
  useEffect(() => {
    if (!schoolId) return
    const load = async () => {
      const eventDoc = await getDoc(doc(db, 'schools', schoolId, 'events', eventId))
      if (!eventDoc.exists()) { navigate('/'); return }
      const ev = { id: eventId, ...eventDoc.data() }
      setEvent(ev)

      if (ev.studentGroupId) {
        const groupDoc = await getDoc(doc(db, 'schools', schoolId, 'studentGroups', ev.studentGroupId))
        if (groupDoc.exists()) {
          const { studentIds } = groupDoc.data()
          const snap = await getDocs(collection(db, 'schools', schoolId, 'students'))
          const filtered = snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(s => studentIds.includes(s.studentId))
            .sort((a, b) => a.grade - b.grade || a.class - b.class || a.number - b.number)
          setStudents(filtered)
        }
      }
      setLoading(false)
    }
    load()
  }, [schoolId, eventId])

  // ── 출결 로그 실시간 구독 ─────────────────────────────────────
  useEffect(() => {
    if (!schoolId) return
    const unsub = onSnapshot(
      collection(db, 'schools', schoolId, 'events', eventId, 'attendanceLogs'),
      (snap) => setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    )
    return unsub
  }, [schoolId, eventId])

  // ── 날짜 필터 + 출석/미출석 분류 ─────────────────────────────
  const filteredLogs = event?.isRecurring
    ? logs.filter(l => {
        const d = l.checkedAt?.toDate?.()
        return d && d.toISOString().slice(0, 10) === selectedDate
      })
    : logs

  // 출석: QR 또는 수동
  const attendedMap = Object.fromEntries(
    filteredLogs.filter(l => l.method === 'QR' || l.method === 'manual')
      .map(l => [l.studentId, l])
  )
  // 결석 사유 등록된 학생
  const absentLogMap = Object.fromEntries(
    filteredLogs.filter(l => l.method === 'absent')
      .map(l => [l.studentId, l])
  )

  const attended = students.filter(s => attendedMap[s.studentId])
  const absent = students.filter(s => !attendedMap[s.studentId])
  const rate = students.length > 0 ? Math.round((attended.length / students.length) * 100) : null

  // 지각 집계 (조회 이벤트 + lateCheckTime 설정된 경우만)
  const hasLateCheck = event?.type === '조회' && event?.lateCheckTime
  const lateCount = hasLateCheck ? attended.filter(s => attendedMap[s.studentId]?.late).length : 0

  // ── 로그 ID 생성 ──────────────────────────────────────────────
  const logId = (studentId, suffix = '') => {
    const base = event?.isRecurring ? `${selectedDate}-${studentId}` : studentId
    return suffix ? `${base}-${suffix}` : base
  }

  // ── 수동 출석 처리 ────────────────────────────────────────────
  const manualCheckin = async (student) => {
    setProcessingId(student.studentId)
    try {
      // 기존 absent 로그 삭제 후 manual 로그 생성
      await deleteDoc(doc(db, 'schools', schoolId, 'events', eventId, 'attendanceLogs', logId(student.studentId, 'absent')))
      await setDoc(
        doc(db, 'schools', schoolId, 'events', eventId, 'attendanceLogs', logId(student.studentId)),
        {
          studentId: student.studentId, studentName: student.name,
          grade: student.grade, class: student.class, number: student.number,
          checkedAt: serverTimestamp(), method: 'manual', qrToken: event.qrToken,
        }
      )
    } finally {
      setProcessingId(null)
    }
  }

  const cancelCheckin = async (student) => {
    setProcessingId(student.studentId)
    try {
      await deleteDoc(doc(db, 'schools', schoolId, 'events', eventId, 'attendanceLogs', logId(student.studentId)))
    } finally {
      setProcessingId(null)
    }
  }

  // ── 결석 사유 저장 ────────────────────────────────────────────
  const saveAbsentReason = async (student) => {
    const reason = reasonDraft[student.studentId]?.trim()
    if (!reason) return
    setProcessingId(student.studentId)
    try {
      await setDoc(
        doc(db, 'schools', schoolId, 'events', eventId, 'attendanceLogs', logId(student.studentId, 'absent')),
        {
          studentId: student.studentId, studentName: student.name,
          grade: student.grade, class: student.class, number: student.number,
          method: 'absent', reason,
          recordedAt: serverTimestamp(), qrToken: event.qrToken,
        }
      )
      setReasonDraft(prev => ({ ...prev, [student.studentId]: '' }))
    } finally {
      setProcessingId(null)
    }
  }

  const deleteAbsentReason = async (student) => {
    setProcessingId(student.studentId)
    try {
      await deleteDoc(doc(db, 'schools', schoolId, 'events', eventId, 'attendanceLogs', logId(student.studentId, 'absent')))
    } finally {
      setProcessingId(null)
    }
  }

  const formatTime = (ts) => {
    if (!ts) return ''
    const d = ts?.toDate?.() ?? new Date(ts)
    return d.toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  if (loading) return <Layout><p>불러오는 중...</p></Layout>
  if (!event) return null

  const hasGroup = students.length > 0

  return (
    <Layout>
      {/* ── 헤더 ── */}
      <div style={styles.header}>
        <div>
          <button onClick={() => navigate('/')} style={styles.backBtn}>← 대시보드</button>
          <h2 style={styles.heading}>{event.name}</h2>
          <div style={styles.eventMeta}>
            <span style={styles.typeBadge}>{event.type}</span>
            {event.isRecurring && (
              <span style={styles.recurringBadge}>
                🔁 {event.recurringDays?.map(d => DAYS[d]).join('·')} {event.recurringTimeStart}~{event.recurringTimeEnd}
              </span>
            )}
            {event.location && <span style={styles.metaText}>📍 {event.location}</span>}
            {hasLateCheck && <span style={styles.lateTimeBadge}>⏰ 지각 기준 {event.lateCheckTime}</span>}
          </div>
        </div>
        {event.isRecurring && (
          <div style={styles.dateSelector}>
            <label style={styles.dateLabel}>날짜 선택</label>
            <input type="date" value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)} style={styles.dateInput} />
          </div>
        )}
      </div>

      {/* ── 통계 바 ── */}
      {hasGroup && (
        <div style={styles.statsBar}>
          <StatBox label="전체" value={students.length} color="#555" />
          <StatBox label="출석" value={attended.length} color="#2e7d32" />
          {hasLateCheck && <StatBox label="지각" value={lateCount} color="#e65100" />}
          <StatBox label="미출석" value={absent.length} color="#c62828" />
          <StatBox label="사유등록" value={Object.keys(absentLogMap).length} color="#e65100" />
          {rate !== null && <StatBox label="출석률" value={`${rate}%`} color="#1a73e8" large />}
          <div style={styles.progressWrap}>
            <div style={{ ...styles.progressBar, width: `${rate ?? 0}%` }} />
          </div>
        </div>
      )}

      {!hasGroup && <p style={styles.noGroupNote}>연결된 학생 그룹이 없습니다. 출석 로그만 표시됩니다.</p>}

      {/* ── 출결 현황 ── */}
      {hasGroup ? (
        <div style={styles.panels}>

          {/* 출석 패널 */}
          <div style={styles.panel}>
            <h3 style={{ ...styles.panelTitle, color: '#2e7d32' }}>✅ 출석 {attended.length}명</h3>
            {attended.length === 0
              ? <p style={styles.empty}>아직 출석한 학생이 없습니다.</p>
              : attended.map(s => {
                  const log = attendedMap[s.studentId]
                  return (
                    <div key={s.studentId} style={styles.studentRow}>
                      <StudentInfo student={s} />
                      <div style={styles.logInfo}>
                        <span style={{
                          ...styles.methodBadge,
                          backgroundColor: log?.method === 'manual' ? '#fff3e0' : '#e8f5e9',
                          color: log?.method === 'manual' ? '#e65100' : '#2e7d32',
                        }}>
                          {log?.method === 'manual' ? '수동' : 'QR'}
                        </span>
                        {hasLateCheck && log?.late && (
                          <span style={styles.lateBadge}>지각</span>
                        )}
                        <span style={styles.timeText}>{formatTime(log?.checkedAt)}</span>
                        <button onClick={() => cancelCheckin(s)}
                          disabled={processingId === s.studentId} style={styles.cancelBtn}>취소</button>
                      </div>
                    </div>
                  )
                })
            }
          </div>

          {/* 미출석 패널 */}
          <div style={styles.panel}>
            <h3 style={{ ...styles.panelTitle, color: '#c62828' }}>❌ 미출석 {absent.length}명</h3>
            {absent.length === 0
              ? <p style={styles.empty}>모든 학생이 출석했습니다! 🎉</p>
              : absent.map(s => {
                  const absentLog = absentLogMap[s.studentId]
                  const draft = reasonDraft[s.studentId] ?? ''
                  const isProcessing = processingId === s.studentId

                  return (
                    <div key={s.studentId} style={styles.absentBlock}>
                      {/* 학생 정보 + 수동출석 */}
                      <div style={styles.absentTop}>
                        <StudentInfo student={s} />
                        <button onClick={() => manualCheckin(s)}
                          disabled={isProcessing} style={styles.manualBtn}>
                          {isProcessing ? '...' : '수동 출석'}
                        </button>
                      </div>

                      {/* 결석 사유 영역 */}
                      {absentLog ? (
                        /* 저장된 사유 표시 */
                        <div style={styles.reasonSaved}>
                          <span style={{
                            ...styles.reasonBadge,
                            ...(absentLog.reason === '미출석 자동처리'
                              ? { backgroundColor: '#f3e5f5', color: '#7b1fa2' }
                              : {}),
                          }}>
                            {absentLog.reason === '미출석 자동처리' ? '자동' : '사유'}
                          </span>
                          <span style={styles.reasonText}>{absentLog.reason}</span>
                          <button onClick={() => deleteAbsentReason(s)}
                            disabled={isProcessing} style={styles.reasonDeleteBtn}>삭제</button>
                        </div>
                      ) : (
                        /* 사유 입력 */
                        <div style={styles.reasonInput}>
                          <div style={styles.presets}>
                            {REASON_PRESETS.map(p => (
                              <button key={p}
                                onClick={() => setReasonDraft(prev => ({ ...prev, [s.studentId]: p }))}
                                style={{
                                  ...styles.presetBtn,
                                  backgroundColor: draft === p ? '#e8f0fe' : '#f5f5f5',
                                  color: draft === p ? '#1a73e8' : '#555',
                                  borderColor: draft === p ? '#1a73e8' : '#e0e0e0',
                                }}>
                                {p}
                              </button>
                            ))}
                          </div>
                          <div style={styles.reasonRow}>
                            <input
                              value={draft}
                              onChange={e => setReasonDraft(prev => ({ ...prev, [s.studentId]: e.target.value }))}
                              placeholder="사유 직접 입력"
                              style={styles.reasonTextInput}
                            />
                            <button onClick={() => saveAbsentReason(s)}
                              disabled={!draft.trim() || isProcessing} style={styles.reasonSaveBtn}>
                              저장
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })
            }
          </div>
        </div>
      ) : (
        <div style={styles.panel}>
          <h3 style={styles.panelTitle}>출석 로그 ({filteredLogs.filter(l => l.method !== 'absent').length}건)</h3>
          {filteredLogs.filter(l => l.method !== 'absent').length === 0
            ? <p style={styles.empty}>출석 기록이 없습니다.</p>
            : filteredLogs.filter(l => l.method !== 'absent').map(l => (
                <div key={l.id} style={styles.studentRow}>
                  <div style={styles.studentInfo}>
                    <span style={styles.studentName}>{l.studentName}</span>
                    <span style={styles.studentIdText}>{l.grade}학년 {l.class}반 {l.number}번</span>
                  </div>
                  <span style={styles.timeText}>{formatTime(l.checkedAt)}</span>
                </div>
              ))
          }
        </div>
      )}
    </Layout>
  )
}

function StudentInfo({ student: s }) {
  return (
    <div style={styles.studentInfo}>
      <span style={styles.studentName}>{s.name}</span>
      <span style={styles.studentIdText}>{s.grade}학년 {s.class}반 {s.number}번</span>
    </div>
  )
}

function StatBox({ label, value, color, large }) {
  return (
    <div style={statStyles.box}>
      <span style={{ ...statStyles.value, color, fontSize: large ? '1.6rem' : '1.4rem' }}>{value}</span>
      <span style={statStyles.label}>{label}</span>
    </div>
  )
}

const statStyles = {
  box: { display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '60px' },
  value: { fontWeight: 700, lineHeight: 1 },
  label: { fontSize: '0.72rem', color: '#888', marginTop: '0.25rem' },
}

const styles = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' },
  backBtn: { background: 'none', border: 'none', color: '#1a73e8', cursor: 'pointer', fontSize: '0.85rem', padding: '0 0 0.4rem', display: 'block' },
  heading: { fontSize: '1.3rem', fontWeight: 700, margin: '0 0 0.4rem' },
  eventMeta: { display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' },
  typeBadge: { fontSize: '0.78rem', backgroundColor: '#f0f0f0', color: '#555', padding: '0.2rem 0.5rem', borderRadius: '10px' },
  recurringBadge: { fontSize: '0.78rem', backgroundColor: '#f3e5f5', color: '#7b1fa2', padding: '0.2rem 0.6rem', borderRadius: '10px' },
  metaText: { fontSize: '0.82rem', color: '#666' },
  lateTimeBadge: { fontSize: '0.78rem', backgroundColor: '#fff3e0', color: '#e65100', padding: '0.2rem 0.6rem', borderRadius: '10px', fontWeight: 600 },
  dateSelector: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem' },
  dateLabel: { fontSize: '0.8rem', color: '#888' },
  dateInput: { padding: '0.4rem 0.6rem', border: '1px solid #ddd', borderRadius: '7px', fontSize: '0.9rem' },
  statsBar: { display: 'flex', alignItems: 'center', gap: '1.25rem', backgroundColor: '#fff', borderRadius: '10px', padding: '1rem 1.5rem', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', marginBottom: '1.25rem', flexWrap: 'wrap' },
  progressWrap: { flex: 1, height: '8px', backgroundColor: '#eee', borderRadius: '4px', minWidth: '80px' },
  progressBar: { height: '100%', backgroundColor: '#1a73e8', borderRadius: '4px', transition: 'width 0.4s' },
  noGroupNote: { color: '#888', fontSize: '0.85rem', marginBottom: '1rem' },
  panels: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' },
  panel: { backgroundColor: '#fff', borderRadius: '10px', padding: '1rem 1.25rem', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' },
  panelTitle: { fontSize: '0.95rem', fontWeight: 700, margin: '0 0 0.75rem' },
  empty: { color: '#aaa', fontSize: '0.85rem', textAlign: 'center', padding: '1rem 0' },
  studentRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid #f5f5f5' },
  studentInfo: { display: 'flex', flexDirection: 'column', gap: '0.1rem' },
  studentName: { fontSize: '0.9rem', fontWeight: 600 },
  studentIdText: { fontSize: '0.75rem', color: '#888' },
  logInfo: { display: 'flex', alignItems: 'center', gap: '0.4rem' },
  methodBadge: { fontSize: '0.72rem', padding: '0.15rem 0.4rem', borderRadius: '8px', fontWeight: 600 },
  lateBadge: { fontSize: '0.72rem', padding: '0.15rem 0.4rem', borderRadius: '8px', fontWeight: 600, backgroundColor: '#fff3e0', color: '#e65100' },
  timeText: { fontSize: '0.78rem', color: '#888' },
  cancelBtn: { padding: '0.25rem 0.5rem', backgroundColor: '#fff', color: '#888', border: '1px solid #ddd', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem' },
  manualBtn: { padding: '0.3rem 0.6rem', backgroundColor: '#1a73e8', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.78rem', whiteSpace: 'nowrap' },

  // 미출석 블록
  absentBlock: { borderBottom: '1px solid #f5f5f5', paddingBottom: '0.75rem', marginBottom: '0.25rem' },
  absentTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0 0.35rem' },

  // 사유 저장됨
  reasonSaved: { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.3rem 0.5rem', backgroundColor: '#fff8e1', borderRadius: '6px', marginTop: '0.25rem' },
  reasonBadge: { fontSize: '0.72rem', fontWeight: 700, color: '#e65100', backgroundColor: '#ffe0b2', padding: '0.15rem 0.4rem', borderRadius: '8px' },
  reasonText: { fontSize: '0.82rem', color: '#5d4037', flex: 1 },
  reasonDeleteBtn: { fontSize: '0.72rem', color: '#aaa', background: 'none', border: 'none', cursor: 'pointer' },

  // 사유 입력
  reasonInput: { marginTop: '0.35rem' },
  presets: { display: 'flex', gap: '0.3rem', flexWrap: 'wrap', marginBottom: '0.35rem' },
  presetBtn: { fontSize: '0.72rem', padding: '0.2rem 0.5rem', border: '1px solid', borderRadius: '12px', cursor: 'pointer', backgroundColor: '#f5f5f5' },
  reasonRow: { display: 'flex', gap: '0.4rem' },
  reasonTextInput: { flex: 1, padding: '0.35rem 0.6rem', border: '1px solid #ddd', borderRadius: '6px', fontSize: '0.82rem' },
  reasonSaveBtn: { padding: '0.35rem 0.6rem', backgroundColor: '#f57c00', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 },
}
