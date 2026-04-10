import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import useMediaQuery from '@mui/material/useMediaQuery'
import {
  doc, getDoc, getDocs, collection,
  onSnapshot, setDoc, deleteDoc, updateDoc, serverTimestamp,
} from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useAuth } from '../../contexts/AuthContext'
import Layout from '../../components/Layout'
import QRDisplay from '../../components/QRDisplay'

const DAYS = ['일', '월', '화', '수', '목', '금', '토']
const REASON_PRESETS = ['질병결석', '조퇴', '지각', '미인정결석', '체험학습', '기타']

// schedules 배열에서 오늘 요일 하이라이트 포함 JSX 반환 (교시 표시)
function ScheduleBadges({ event }) {
  const todayDay = new Date().getDay()

  if (event.schedules?.length > 0) {
    const sorted = [...event.schedules].sort((a, b) =>
      a.dayOfWeek !== b.dayOfWeek ? a.dayOfWeek - b.dayOfWeek : a.period - b.period
    )
    return (
      <>
        {sorted.map((s, i) => {
          const isToday = s.dayOfWeek === todayDay
          const label = s.startTime && s.endTime
            ? `${DAYS[s.dayOfWeek]} ${s.period}교시 ${s.startTime}~${s.endTime}`
            : `${DAYS[s.dayOfWeek]} ${s.period}교시`
          return (
            <span key={i} style={{
              fontSize: '0.78rem',
              padding: '0.2rem 0.6rem',
              borderRadius: '10px',
              backgroundColor: isToday ? '#7b1fa2' : '#f3e5f5',
              color: isToday ? '#fff' : '#7b1fa2',
              fontWeight: isToday ? 700 : 400,
            }}>
              {label}
            </span>
          )
        })}
      </>
    )
  }
  // 구형 fallback
  return (
    <span style={{ fontSize: '0.78rem', backgroundColor: '#f3e5f5', color: '#7b1fa2', padding: '0.2rem 0.6rem', borderRadius: '10px' }}>
      🔁 {event.recurringDays?.map(d => DAYS[d]).join('·')} {event.recurringTimeStart}~{event.recurringTimeEnd}
    </span>
  )
}

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
  const isMobile = useMediaQuery('(max-width: 768px)')

  const [event, setEvent] = useState(null)
  const [students, setStudents] = useState([])
  const [logs, setLogs] = useState([])
  const [selectedDate, setSelectedDate] = useState(todayStr())
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState(null)
  const [reasonDraft, setReasonDraft] = useState({})

  // 3열 패널 너비 (퍼센트, 합계 100)
  const [colWidths, setColWidths] = useState([27, 37, 36])
  const [hoveredDiv, setHoveredDiv] = useState(null)
  const containerRef = useRef(null)

  // ── 드래그 리사이즈 ────────────────────────────────────────────
  const startDrag = (e, divIdx) => {
    e.preventDefault()
    const containerWidth = containerRef.current?.getBoundingClientRect().width ?? 1000
    const startX = e.clientX
    const startWidths = [...colWidths]

    const onMove = (e) => {
      const dx = e.clientX - startX
      const dPct = (dx / containerWidth) * 100
      const next = [...startWidths]
      next[divIdx] += dPct
      next[divIdx + 1] -= dPct
      if (next[divIdx] < 15 || next[divIdx + 1] < 15) return
      setColWidths(next)
    }

    const onUp = () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // ── 이벤트 + 학생 그룹 로드 ─────────────────────────────────
  useEffect(() => {
    if (!schoolId) return
    const load = async () => {
      const eventDoc = await getDoc(doc(db, 'schools', schoolId, 'events', eventId))
      if (!eventDoc.exists()) { navigate('/attendance'); return }
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

  // ── 날짜 필터 + 분류 ──────────────────────────────────────────
  const filteredLogs = event?.isRecurring
    ? logs.filter(l => {
        const ts = l.checkedAt ?? l.recordedAt
        const d = ts?.toDate?.()
        if (!d) return false
        const y = d.getFullYear()
        const mo = String(d.getMonth() + 1).padStart(2, '0')
        const da = String(d.getDate()).padStart(2, '0')
        return `${y}-${mo}-${da}` === selectedDate
      })
    : logs

  const attendedMap = Object.fromEntries(
    filteredLogs.filter(l => l.method === 'QR' || l.method === 'manual')
      .map(l => [l.studentId, l])
  )
  const absentLogMap = Object.fromEntries(
    filteredLogs.filter(l => l.method === 'absent')
      .map(l => [l.studentId, l])
  )

  const attended = students.filter(s => attendedMap[s.studentId])
  const absent = students.filter(s => !attendedMap[s.studentId])
  const rate = students.length > 0 ? Math.round((attended.length / students.length) * 100) : null

  const hasLateCheck = event?.type === '조회' && event?.lateCheckTime
  const lateCount = hasLateCheck ? attended.filter(s => attendedMap[s.studentId]?.late).length : 0

  const logId = (studentId, suffix = '') => {
    const base = event?.isRecurring ? `${selectedDate}-${studentId}` : studentId
    return suffix ? `${base}-${suffix}` : base
  }

  // ── 출결 처리 ─────────────────────────────────────────────────
  const manualCheckin = async (student) => {
    setProcessingId(student.studentId)
    try {
      await deleteDoc(doc(db, 'schools', schoolId, 'events', eventId, 'attendanceLogs', logId(student.studentId, 'absent')))
      await setDoc(
        doc(db, 'schools', schoolId, 'events', eventId, 'attendanceLogs', logId(student.studentId)),
        { studentId: student.studentId, studentName: student.name,
          grade: student.grade, class: student.class, number: student.number,
          checkedAt: serverTimestamp(), method: 'manual', qrToken: event.qrToken }
      )
    } finally { setProcessingId(null) }
  }

  const cancelCheckin = async (student) => {
    setProcessingId(student.studentId)
    try {
      await deleteDoc(doc(db, 'schools', schoolId, 'events', eventId, 'attendanceLogs', logId(student.studentId)))
    } finally { setProcessingId(null) }
  }

  const saveAbsentReason = async (student) => {
    const reason = reasonDraft[student.studentId]?.trim()
    if (!reason) return
    setProcessingId(student.studentId)
    try {
      await setDoc(
        doc(db, 'schools', schoolId, 'events', eventId, 'attendanceLogs', logId(student.studentId, 'absent')),
        { studentId: student.studentId, studentName: student.name,
          grade: student.grade, class: student.class, number: student.number,
          method: 'absent', reason, checkedAt: serverTimestamp(), qrToken: event.qrToken }
      )
      setReasonDraft(prev => ({ ...prev, [student.studentId]: '' }))
    } finally { setProcessingId(null) }
  }

  const deleteAbsentReason = async (student) => {
    setProcessingId(student.studentId)
    try {
      await deleteDoc(doc(db, 'schools', schoolId, 'events', eventId, 'attendanceLogs', logId(student.studentId, 'absent')))
    } finally { setProcessingId(null) }
  }

  const formatTime = (ts) => {
    if (!ts) return ''
    const d = ts?.toDate?.() ?? new Date(ts)
    return d.toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  // ── 라이브 세션 (수업/방과후/행사/기타) ────────────────────────
  const startLiveSession = async () => {
    const token = crypto.randomUUID()
    await updateDoc(doc(db, 'schools', schoolId, 'events', eventId), { liveToken: token })
    setEvent(prev => ({ ...prev, liveToken: token }))
  }

  const closeLiveSession = async () => {
    await updateDoc(doc(db, 'schools', schoolId, 'events', eventId), { liveToken: null })
    setEvent(prev => ({ ...prev, liveToken: null }))
  }

  if (loading) return <Layout wide><p>불러오는 중...</p></Layout>
  if (!event) return null

  const hasGroup = students.length > 0
  const checkinUrl = `${window.location.origin}/attendance/checkin/${schoolId}/${eventId}?token=${event.qrToken}`
  const liveCheckinUrl = `${window.location.origin}/attendance/checkin/${schoolId}/${eventId}?token=${event.liveToken}`
  const isLiveType = event.type !== '조회'

  // ── QR 패널 내용 (조회=고정 / 수업등=라이브 세션) ──────────────
  const QRPanelContent = () => {
    if (!isLiveType) {
      return <QRDisplay eventName={event.name} checkinUrl={checkinUrl} />
    }
    if (event.liveToken) {
      return (
        <>
          <div style={styles.liveActiveBadge}>● 출석 진행 중</div>
          <QRDisplay eventName={event.name} checkinUrl={liveCheckinUrl} />
          <button onClick={closeLiveSession} style={styles.closeSessionBtn}>⏹ 출석 마감</button>
        </>
      )
    }
    return (
      <div style={styles.liveStartBox}>
        <p style={styles.liveStartHint}>버튼을 누르면<br />QR 코드가 생성됩니다.</p>
        <button onClick={startLiveSession} style={styles.startSessionBtn}>▶ 출석 시작</button>
      </div>
    )
  }

  // ── 미출석 패널 내용 ─────────────────────────────────────────
  const AbsentPanel = () => (
    <>
      {absent.length === 0
        ? <p style={styles.empty}>모든 학생이 출석했습니다! 🎉</p>
        : absent.map(s => {
            const absentLog = absentLogMap[s.studentId]
            const draft = reasonDraft[s.studentId] ?? ''
            const isProcessing = processingId === s.studentId
            return (
              <div key={s.studentId} style={styles.absentBlock}>
                <div style={styles.absentTop}>
                  <StudentInfo student={s} />
                  <button onClick={() => manualCheckin(s)} disabled={isProcessing} style={styles.manualBtn}>
                    {isProcessing ? '...' : '수동 출석'}
                  </button>
                </div>
                {absentLog ? (
                  <div style={styles.reasonSaved}>
                    <span style={{ ...styles.reasonBadge, ...(absentLog.reason === '미출석 자동처리' ? { backgroundColor: '#f3e5f5', color: '#7b1fa2' } : {}) }}>
                      {absentLog.reason === '미출석 자동처리' ? '자동' : '사유'}
                    </span>
                    <span style={styles.reasonText}>{absentLog.reason}</span>
                    <button onClick={() => deleteAbsentReason(s)} disabled={isProcessing} style={styles.reasonDeleteBtn}>삭제</button>
                  </div>
                ) : (
                  <div style={styles.reasonInput}>
                    <div style={styles.presets}>
                      {REASON_PRESETS.map(p => (
                        <button key={p} onClick={() => setReasonDraft(prev => ({ ...prev, [s.studentId]: p }))}
                          style={{ ...styles.presetBtn, backgroundColor: draft === p ? '#e8f0fe' : '#f5f5f5', color: draft === p ? '#1a73e8' : '#555', borderColor: draft === p ? '#1a73e8' : '#e0e0e0' }}>
                          {p}
                        </button>
                      ))}
                    </div>
                    <div style={styles.reasonRow}>
                      <input value={draft}
                        onChange={e => setReasonDraft(prev => ({ ...prev, [s.studentId]: e.target.value }))}
                        placeholder="사유 직접 입력" style={styles.reasonTextInput} />
                      <button onClick={() => saveAbsentReason(s)} disabled={!draft.trim() || isProcessing} style={styles.reasonSaveBtn}>저장</button>
                    </div>
                  </div>
                )}
              </div>
            )
          })
      }
    </>
  )

  // ── 모바일: 세로 배치 ─────────────────────────────────────────
  if (isMobile) {
    return (
      <Layout wide>
        <div style={styles.header}>
          <div>
            <button onClick={() => navigate('/attendance')} style={styles.backBtn}>← 대시보드</button>
            <h2 style={styles.heading}>{event.name}</h2>
            <div style={styles.eventMeta}>
              <span style={styles.typeBadge}>{event.type}</span>
              {event.isRecurring && <ScheduleBadges event={event} />}
              {event.location && <span style={styles.metaText}>📍 {event.location}</span>}
              {hasLateCheck && <span style={styles.lateTimeBadge}>⏰ 지각 기준 {event.lateCheckTime}</span>}
            </div>
          </div>
          {event.isRecurring && (
            <div style={styles.dateSelector}>
              <label style={styles.dateLabel}>날짜 선택</label>
              <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} style={styles.dateInput} />
            </div>
          )}
        </div>
        {hasGroup && (
          <div style={styles.statsBar}>
            <StatBox label="전체" value={students.length} color="#555" />
            <StatBox label="출석" value={attended.length} color="#2e7d32" />
            {hasLateCheck && <StatBox label="지각" value={lateCount} color="#e65100" />}
            <StatBox label="미출석" value={absent.length} color="#c62828" />
            <StatBox label="사유등록" value={Object.keys(absentLogMap).length} color="#e65100" />
            {rate !== null && <StatBox label="출석률" value={`${rate}%`} color="#1a73e8" large />}
            <div style={styles.progressWrap}><div style={{ ...styles.progressBar, width: `${rate ?? 0}%` }} /></div>
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={styles.panel}><h3 style={styles.qrPanelTitle}>QR 출석</h3><QRPanelContent /></div>
          {hasGroup && (
            <>
              <div style={styles.panel}>
                <h3 style={{ ...styles.panelTitle, color: '#2e7d32' }}>✅ 출석 {attended.length}명</h3>
                {attended.length === 0 ? <p style={styles.empty}>아직 출석한 학생이 없습니다.</p>
                  : attended.map(s => {
                      const log = attendedMap[s.studentId]
                      return (
                        <div key={s.studentId} style={styles.studentRow}>
                          <StudentInfo student={s} />
                          <div style={styles.logInfo}>
                            <span style={{ ...styles.methodBadge, backgroundColor: log?.method === 'manual' ? '#fff3e0' : '#e8f5e9', color: log?.method === 'manual' ? '#e65100' : '#2e7d32' }}>{log?.method === 'manual' ? '수동' : 'QR'}</span>
                            {hasLateCheck && log?.late && <span style={styles.lateBadge}>지각</span>}
                            <span style={styles.timeText}>{formatTime(log?.checkedAt)}</span>
                            <button onClick={() => cancelCheckin(s)} disabled={processingId === s.studentId} style={styles.cancelBtn}>취소</button>
                          </div>
                        </div>
                      )
                    })
                }
              </div>
              <div style={styles.panel}>
                <h3 style={{ ...styles.panelTitle, color: '#c62828' }}>❌ 미출석 {absent.length}명</h3>
                <AbsentPanel />
              </div>
            </>
          )}
        </div>
      </Layout>
    )
  }

  // ── 데스크탑: 3열 드래그 리사이즈 ────────────────────────────
  return (
    <Layout wide>
      {/* 헤더 */}
      <div style={styles.header}>
        <div>
          <button onClick={() => navigate('/attendance')} style={styles.backBtn}>← 대시보드</button>
          <h2 style={styles.heading}>{event.name}</h2>
          <div style={styles.eventMeta}>
            <span style={styles.typeBadge}>{event.type}</span>
            {event.isRecurring && <ScheduleBadges event={event} />}
            {event.location && <span style={styles.metaText}>📍 {event.location}</span>}
            {hasLateCheck && <span style={styles.lateTimeBadge}>⏰ 지각 기준 {event.lateCheckTime}</span>}
          </div>
        </div>
        {event.isRecurring && (
          <div style={styles.dateSelector}>
            <label style={styles.dateLabel}>날짜 선택</label>
            <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} style={styles.dateInput} />
          </div>
        )}
      </div>

      {/* 통계 바 (전체 너비) */}
      {hasGroup && (
        <div style={styles.statsBar}>
          <StatBox label="전체" value={students.length} color="#555" />
          <StatBox label="출석" value={attended.length} color="#2e7d32" />
          {hasLateCheck && <StatBox label="지각" value={lateCount} color="#e65100" />}
          <StatBox label="미출석" value={absent.length} color="#c62828" />
          <StatBox label="사유등록" value={Object.keys(absentLogMap).length} color="#e65100" />
          {rate !== null && <StatBox label="출석률" value={`${rate}%`} color="#1a73e8" large />}
          <div style={styles.progressWrap}><div style={{ ...styles.progressBar, width: `${rate ?? 0}%` }} /></div>
        </div>
      )}
      {!hasGroup && <p style={styles.noGroupNote}>연결된 학생 그룹이 없습니다. 출석 로그만 표시됩니다.</p>}

      {/* 3열 리사이즈 레이아웃 */}
      <div ref={containerRef} style={styles.threeCol}>

        {/* ── QR 패널 ── */}
        <div style={{ ...styles.panelCol, width: colWidths[0] + '%' }}>
          <div style={styles.panel}>
            <h3 style={styles.qrPanelTitle}>QR 출석</h3>
            <QRPanelContent />
          </div>
        </div>

        {/* 구분선 1 */}
        <div
          style={styles.divider}
          onMouseDown={e => startDrag(e, 0)}
          onMouseEnter={() => setHoveredDiv(0)}
          onMouseLeave={() => setHoveredDiv(null)}
        >
          <DragHandle active={hoveredDiv === 0} />
        </div>

        {/* ── 출석 패널 ── */}
        <div style={{ ...styles.panelCol, width: colWidths[1] + '%' }}>
          <div style={styles.panel}>
            <h3 style={{ ...styles.panelTitle, color: '#2e7d32' }}>✅ 출석 {attended.length}명</h3>
            {!hasGroup ? (
              filteredLogs.filter(l => l.method !== 'absent').length === 0
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
            ) : attended.length === 0
              ? <p style={styles.empty}>아직 출석한 학생이 없습니다.</p>
              : attended.map(s => {
                  const log = attendedMap[s.studentId]
                  return (
                    <div key={s.studentId} style={styles.studentRow}>
                      <StudentInfo student={s} />
                      <div style={styles.logInfo}>
                        <span style={{ ...styles.methodBadge, backgroundColor: log?.method === 'manual' ? '#fff3e0' : '#e8f5e9', color: log?.method === 'manual' ? '#e65100' : '#2e7d32' }}>
                          {log?.method === 'manual' ? '수동' : 'QR'}
                        </span>
                        {hasLateCheck && log?.late && <span style={styles.lateBadge}>지각</span>}
                        <span style={styles.timeText}>{formatTime(log?.checkedAt)}</span>
                        <button onClick={() => cancelCheckin(s)} disabled={processingId === s.studentId} style={styles.cancelBtn}>취소</button>
                      </div>
                    </div>
                  )
                })
            }
          </div>
        </div>

        {/* 구분선 2 */}
        <div
          style={styles.divider}
          onMouseDown={e => startDrag(e, 1)}
          onMouseEnter={() => setHoveredDiv(1)}
          onMouseLeave={() => setHoveredDiv(null)}
        >
          <DragHandle active={hoveredDiv === 1} />
        </div>

        {/* ── 미출석 패널 ── */}
        <div style={{ ...styles.panelCol, width: colWidths[2] + '%' }}>
          <div style={styles.panel}>
            <h3 style={{ ...styles.panelTitle, color: '#c62828' }}>❌ 미출석 {absent.length}명</h3>
            {hasGroup ? <AbsentPanel /> : <p style={styles.empty}>학생 그룹이 연결되지 않았습니다.</p>}
          </div>
        </div>

      </div>
    </Layout>
  )
}

// 드래그 핸들: QR 코드 중앙 라인에 sticky 고정
// top 값 = 헤더(~80px) + 통계바(~70px) + QR 패널 타이틀(~56px) + QR 높이의 절반
// QR는 패널 너비를 채우므로 화면 크기에 따라 다름 → 35vh 기준으로 sticky
function DragHandle({ active }) {
  return (
    <div style={{ position: 'sticky', top: 'calc(35vh)', display: 'flex', justifyContent: 'center' }}>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '3px',
        padding: '8px 5px',
        borderRadius: '8px',
        backgroundColor: active ? '#e8f0fe' : 'rgba(255,255,255,0.85)',
        border: active ? '1px solid #c5d8fc' : '1px solid #e8ecf0',
        boxShadow: active ? '0 2px 8px rgba(26,115,232,0.2)' : '0 1px 4px rgba(0,0,0,0.08)',
        transition: 'all 0.15s',
        backdropFilter: 'blur(4px)',
      }}>
        {[0, 1, 2].map(row => (
          <div key={row} style={{ display: 'flex', gap: '3px' }}>
            {[0, 1].map(col => (
              <div key={col} style={{
                width: '4px', height: '4px',
                borderRadius: '50%',
                backgroundColor: active ? '#1a73e8' : '#b0b8c4',
                transition: 'background-color 0.15s',
              }} />
            ))}
          </div>
        ))}
        {active && (
          <div style={{
            fontSize: '0.65rem', color: '#1a73e8', marginTop: '3px',
            fontWeight: 700,
          }}>
            ↔
          </div>
        )}
      </div>
    </div>
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
  // 헤더
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

  // 통계 바
  statsBar: { display: 'flex', alignItems: 'center', gap: '1.25rem', backgroundColor: '#fff', borderRadius: '10px', padding: '1rem 1.5rem', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', marginBottom: '1rem', flexWrap: 'wrap' },
  progressWrap: { flex: 1, height: '8px', backgroundColor: '#eee', borderRadius: '4px', minWidth: '80px' },
  progressBar: { height: '100%', backgroundColor: '#1a73e8', borderRadius: '4px', transition: 'width 0.4s' },
  noGroupNote: { color: '#888', fontSize: '0.85rem', marginBottom: '1rem' },

  // 3열 레이아웃
  threeCol: { display: 'flex', alignItems: 'flex-start', gap: 0, width: '100%' },
  panelCol: { minWidth: 0, overflow: 'hidden' },

  // 드래그 구분선
  divider: {
    flexShrink: 0, width: '20px',
    alignSelf: 'stretch',
    display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
    cursor: 'col-resize',
    zIndex: 10,
  },

  // 패널 공통
  panel: { backgroundColor: '#fff', borderRadius: '10px', padding: '1rem 1.25rem', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', height: '100%', boxSizing: 'border-box' },
  qrPanelTitle: { fontSize: '0.9rem', fontWeight: 700, margin: '0 0 1rem', color: '#333', textAlign: 'center' },
  panelTitle: { fontSize: '0.95rem', fontWeight: 700, margin: '0 0 0.75rem' },
  empty: { color: '#aaa', fontSize: '0.85rem', textAlign: 'center', padding: '1rem 0' },

  // 학생 행
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
  reasonSaved: { display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.3rem 0.5rem', backgroundColor: '#fff8e1', borderRadius: '6px', marginTop: '0.25rem' },
  reasonBadge: { fontSize: '0.72rem', fontWeight: 700, color: '#e65100', backgroundColor: '#ffe0b2', padding: '0.15rem 0.4rem', borderRadius: '8px' },
  reasonText: { fontSize: '0.82rem', color: '#5d4037', flex: 1 },
  reasonDeleteBtn: { fontSize: '0.72rem', color: '#aaa', background: 'none', border: 'none', cursor: 'pointer' },
  reasonInput: { marginTop: '0.35rem' },
  presets: { display: 'flex', gap: '0.3rem', flexWrap: 'wrap', marginBottom: '0.35rem' },
  presetBtn: { fontSize: '0.72rem', padding: '0.2rem 0.5rem', border: '1px solid', borderRadius: '12px', cursor: 'pointer' },
  reasonRow: { display: 'flex', gap: '0.4rem' },
  reasonTextInput: { flex: 1, padding: '0.35rem 0.6rem', border: '1px solid #ddd', borderRadius: '6px', fontSize: '0.82rem' },
  reasonSaveBtn: { padding: '0.35rem 0.6rem', backgroundColor: '#f57c00', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 },

  // 라이브 세션
  liveActiveBadge: { textAlign: 'center', fontSize: '0.8rem', fontWeight: 700, color: '#2e7d32', backgroundColor: '#e8f5e9', border: '1px solid #a5d6a7', borderRadius: '20px', padding: '0.3rem 1rem', marginBottom: '0.75rem' },
  liveStartBox: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', padding: '2rem 1rem' },
  liveStartHint: { textAlign: 'center', color: '#888', lineHeight: 1.7, margin: 0 },
  startSessionBtn: { padding: '0.9rem 2rem', backgroundColor: '#1a73e8', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '1.1rem', fontWeight: 700, cursor: 'pointer', letterSpacing: '0.03em' },
  closeSessionBtn: { width: '100%', marginTop: '0.75rem', padding: '0.65rem', backgroundColor: '#fff', color: '#d32f2f', border: '1px solid #ef9a9a', borderRadius: '8px', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer' },
}
