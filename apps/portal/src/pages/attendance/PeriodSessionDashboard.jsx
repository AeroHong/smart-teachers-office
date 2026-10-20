// 교시별 버튼 출석(checkinMode: 'button') 교사 화면.
// 체험학습 잔류학생 지도처럼 한 교실에 많은 학생이 모여 여러 교시를 연달아 하는 경우를 위한 모드
// (사용자 요청, 2026-10-21). 학생은 입장 QR을 처음 한 번만 찍고 대기 화면을 켜 두며,
// 교사가 교시마다 [출석 시작]을 누르면 학생 화면 버튼이 켜진다. 원격·대리 출석을 막으려고
// 시작할 때마다 2자리 숫자코드를 새로 뽑아 교실 화면에만 띄운다 — 코드는 이벤트 문서(누구나
// get 가능)가 아니라 교사만 읽는 periodSessionSecrets에 두고, 학생 기록 쓰기 규칙이 대조한다.
// 기록은 하루 단위 attendanceLogs와 섞지 않고 periodLogs(`날짜-p교시-학번`)에 따로 쌓는다.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  doc, getDoc, collection, onSnapshot, setDoc, deleteDoc, updateDoc, serverTimestamp,
} from 'firebase/firestore'
import * as XLSX from 'xlsx'
import { db } from '@shared/lib/firebase'
import Layout from '../../components/Layout'
import QRDisplay from '../../components/QRDisplay'
import { DAYS, PERIOD_OPTIONS, periodLabel, toDateStr, periodLogId, activePeriodSession } from './eventHelpers'

const REASON_PRESETS = ['질병결석', '조퇴', '지각', '미인정결석', '체험학습', '기타']
const ATTENDED_METHODS = ['button', 'manual']

function fmtClock(ts) {
  const d = ts?.toDate?.() ?? (ts ? new Date(ts) : null)
  if (!d || isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}

// 선택한 날짜 요일에 잡힌 교시. 시간표에 그 요일이 없으면 조회~종례 전부를 보여 준다.
function periodsForDate(event, dateStr) {
  const day = new Date(`${dateStr}T00:00:00`).getDay()
  const scheduled = (event.schedules || []).filter(s => s.dayOfWeek === day).map(s => s.period)
  const list = scheduled.length > 0 ? scheduled : PERIOD_OPTIONS
  return [...new Set(list)].sort((a, b) => a - b)
}

export default function PeriodSessionDashboard({ event, students, schoolId }) {
  const navigate = useNavigate()
  const eventId = event.id
  const session = activePeriodSession(event)
  const today = toDateStr()

  const [selectedDate, setSelectedDate] = useState(today)
  const periods = useMemo(() => periodsForDate(event, selectedDate), [event, selectedDate])
  const [selectedPeriod, setSelectedPeriod] = useState(() => session?.period ?? periods[0])
  const [logs, setLogs] = useState([])
  const [code, setCode] = useState(null)
  const [busy, setBusy] = useState(false)
  const [processingId, setProcessingId] = useState(null)
  const [reasonDraft, setReasonDraft] = useState({})
  const [showQr, setShowQr] = useState(!session)
  const [view, setView] = useState('period') // 'period' | 'all'
  const [error, setError] = useState('')

  // 날짜를 바꿨는데 그날 시간표에 지금 교시가 없으면 첫 교시로
  useEffect(() => {
    if (!periods.includes(selectedPeriod)) setSelectedPeriod(periods[0])
  }, [periods]) // eslint-disable-line react-hooks/exhaustive-deps

  // 다른 기기에서 세션을 시작해도 이 화면이 그 교시를 따라가게 한다
  useEffect(() => {
    if (session) { setSelectedDate(session.date); setSelectedPeriod(session.period) }
  }, [session?.sessionId]) // eslint-disable-line react-hooks/exhaustive-deps

  // 진행 중 세션의 숫자코드 — 교사만 읽을 수 있는 문서
  useEffect(() => {
    if (!session?.sessionId) { setCode(null); return }
    getDoc(doc(db, 'schools', schoolId, 'events', eventId, 'periodSessionSecrets', session.sessionId))
      .then(snap => setCode(snap.exists() ? snap.data().code : null))
      .catch(() => setCode(null))
  }, [schoolId, eventId, session?.sessionId])

  // 기록 실시간 구독 — 몇 일 × 몇 교시 × 학생 수라 전체를 받아 화면에서 거른다
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'schools', schoolId, 'events', eventId, 'periodLogs'),
      snap => setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      () => setError('출석 기록을 불러오지 못했습니다. 새로고침해 주세요.'),
    )
    return unsub
  }, [schoolId, eventId])

  // ── 선택한 날짜·교시 분류 ─────────────────────────────────────
  const periodLogMap = Object.fromEntries(
    logs.filter(l => l.date === selectedDate && l.period === selectedPeriod).map(l => [l.studentId, l])
  )
  const attended = students
    .filter(s => ATTENDED_METHODS.includes(periodLogMap[s.studentId]?.method))
    .sort((a, b) =>
      (periodLogMap[a.studentId].checkedAt?.toMillis?.() ?? Infinity) -
      (periodLogMap[b.studentId].checkedAt?.toMillis?.() ?? Infinity))
  const notAttended = students.filter(s => !ATTENDED_METHODS.includes(periodLogMap[s.studentId]?.method))
  const isLiveHere = session && session.date === selectedDate && session.period === selectedPeriod

  // ── 세션 시작/마감 ────────────────────────────────────────────
  const startSession = async () => {
    if (session && !window.confirm(`${periodLabel(session.period)} 출석이 진행 중입니다. 마감하고 ${periodLabel(selectedPeriod)} 출석을 시작할까요?`)) return
    setBusy(true)
    setError('')
    try {
      const sessionId = crypto.randomUUID()
      const newCode = String(10 + Math.floor(Math.random() * 90))
      // 코드 문서를 먼저 써야 학생 버튼이 켜졌을 때 규칙이 대조할 수 있다
      await setDoc(doc(db, 'schools', schoolId, 'events', eventId, 'periodSessionSecrets', sessionId), {
        code: newCode, period: selectedPeriod, date: today, createdAt: serverTimestamp(),
      })
      await updateDoc(doc(db, 'schools', schoolId, 'events', eventId), {
        periodSession: { date: today, period: selectedPeriod, sessionId, openedAt: serverTimestamp() },
      })
      setCode(newCode)
      setShowQr(false)
    } catch (err) {
      console.error('교시 출석 시작 실패:', err)
      setError('출석을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  const closeSession = async () => {
    setBusy(true)
    try {
      await updateDoc(doc(db, 'schools', schoolId, 'events', eventId), { periodSession: null })
    } catch (err) {
      console.error('교시 출석 마감 실패:', err)
      setError('출석을 마감하지 못했습니다. 다시 시도해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  // ── 교사 수동 처리 ────────────────────────────────────────────
  const logRef = (studentId) =>
    doc(db, 'schools', schoolId, 'events', eventId, 'periodLogs', periodLogId(selectedDate, selectedPeriod, studentId))

  const writeLog = async (student, fields) => {
    setProcessingId(student.studentId)
    try {
      await setDoc(logRef(student.studentId), {
        studentId: student.studentId,
        studentName: student.name,
        grade: student.grade,
        class: student.class,
        number: student.number,
        date: selectedDate,
        period: selectedPeriod,
        checkedAt: serverTimestamp(),
        ...fields,
      })
    } catch (err) {
      console.error('출결 기록 실패:', err)
      alert('저장하지 못했습니다. 다시 시도해 주세요.')
    } finally {
      setProcessingId(null)
    }
  }

  const removeLog = async (student) => {
    setProcessingId(student.studentId)
    try {
      await deleteDoc(logRef(student.studentId))
    } catch {
      alert('취소하지 못했습니다. 다시 시도해 주세요.')
    } finally {
      setProcessingId(null)
    }
  }

  const saveReason = (student) => {
    const reason = reasonDraft[student.studentId]?.trim()
    if (!reason) return
    writeLog(student, { method: 'absent', reason })
    setReasonDraft(p => ({ ...p, [student.studentId]: '' }))
  }

  // ── 전체 기록(학생 × 날짜·교시) ───────────────────────────────
  const slots = useMemo(() => {
    const keys = new Set(logs.map(l => `${l.date}|${l.period}`))
    if (session) keys.add(`${session.date}|${session.period}`)
    return [...keys]
      .map(k => { const [date, period] = k.split('|'); return { date, period: Number(period) } })
      .sort((a, b) => a.date.localeCompare(b.date) || a.period - b.period)
  }, [logs, session])

  const cellText = (studentId, slot) => {
    const l = logs.find(x => x.studentId === studentId && x.date === slot.date && x.period === slot.period)
    if (!l) return ''
    if (l.method === 'absent') return l.reason || '결석'
    const t = fmtClock(l.checkedAt).slice(0, 5)
    return l.method === 'manual' ? `${t} (교사)` : t
  }

  const slotLabel = (slot) => {
    const d = new Date(`${slot.date}T00:00:00`)
    return `${d.getMonth() + 1}/${d.getDate()}(${DAYS[d.getDay()]}) ${periodLabel(slot.period)}`
  }

  const downloadExcel = () => {
    const header = ['학년', '반', '번호', '이름', ...slots.map(slotLabel)]
    const rows = students.map(s => [s.grade, s.class, s.number, s.name, ...slots.map(slot => cellText(s.studentId, slot))])
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '출석')
    XLSX.writeFile(wb, `${event.name}_교시별출석_${today}.xlsx`)
  }

  const studentLabel = (s) => `${s.grade}-${s.class}-${s.number} ${s.name}`

  return (
    <Layout wide>
      <div style={styles.header}>
        <div>
          <button onClick={() => navigate('/attendance')} style={styles.backBtn}>← 대시보드</button>
          <h2 style={styles.heading}>{event.name}</h2>
          <div style={styles.metaRow}>
            <span style={styles.modeBadge}>교시별 버튼 출석</span>
            {event.location && <span style={styles.metaText}>📍 {event.location}</span>}
            <span style={styles.metaText}>👥 {students.length}명</span>
          </div>
        </div>
        <div style={styles.viewToggle}>
          <button onClick={() => setView('period')} style={{ ...styles.toggleBtn, ...(view === 'period' ? styles.toggleBtnOn : {}) }}>교시별</button>
          <button onClick={() => setView('all')} style={{ ...styles.toggleBtn, ...(view === 'all' ? styles.toggleBtnOn : {}) }}>전체 기록</button>
        </div>
      </div>

      {error && <div style={styles.errorBox}>{error}</div>}
      {students.length === 0 && (
        <div style={styles.errorBox}>연결된 학생 그룹이 비어 있습니다. 이벤트 수정에서 학생 그룹을 선택하세요.</div>
      )}

      {view === 'all' ? (
        <section style={styles.card}>
          <div style={styles.cardHead}>
            <strong>전체 기록</strong>
            <button onClick={downloadExcel} style={styles.secondaryBtn} disabled={slots.length === 0}>⬇ 엑셀 다운로드</button>
          </div>
          {slots.length === 0 ? <p style={styles.empty}>아직 기록이 없습니다.</p> : (
            <div style={{ overflowX: 'auto' }}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>학생</th>
                    {slots.map(slot => <th key={`${slot.date}-${slot.period}`} style={styles.th}>{slotLabel(slot)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {students.map(s => (
                    <tr key={s.studentId}>
                      <td style={{ ...styles.td, whiteSpace: 'nowrap' }}>{studentLabel(s)}</td>
                      {slots.map(slot => {
                        const text = cellText(s.studentId, slot)
                        const isAbsent = text && !/^\d/.test(text)
                        return (
                          <td key={`${slot.date}-${slot.period}`}
                            style={{ ...styles.td, color: isAbsent ? '#e65100' : '#333', background: text ? undefined : '#fafafa' }}>
                            {text || '–'}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        <>
          <div style={styles.toolbar}>
            <input type="date" value={selectedDate} onChange={e => e.target.value && setSelectedDate(e.target.value)} style={styles.dateInput} />
            <div style={styles.periodTabs}>
              {periods.map(p => {
                const live = session && session.date === selectedDate && session.period === p
                return (
                  <button key={p} onClick={() => setSelectedPeriod(p)}
                    style={{ ...styles.periodTab, ...(selectedPeriod === p ? styles.periodTabOn : {}) }}>
                    {periodLabel(p)}{live && ' ●'}
                  </button>
                )
              })}
            </div>
          </div>

          <div style={styles.grid}>
            {/* 세션 제어 */}
            <section style={{ ...styles.card, flex: '1 1 300px' }}>
              {isLiveHere ? (
                <div style={{ textAlign: 'center' }}>
                  <div style={styles.liveBadge}>● {periodLabel(selectedPeriod)} 출석 진행 중</div>
                  <p style={styles.codeLabel}>출석 코드</p>
                  <div style={styles.codeBig}>{code ?? '··'}</div>
                  <p style={styles.hint}>학생 화면에 이 숫자를 입력하고 [출석]을 누릅니다.</p>
                  <div style={styles.countLine}>{attended.length} / {students.length}명 출석</div>
                  <button onClick={closeSession} disabled={busy} style={styles.closeBtn}>⏹ 출석 마감</button>
                </div>
              ) : (
                <div style={{ textAlign: 'center' }}>
                  {session && (
                    <p style={styles.hint}>지금은 {periodLabel(session.period)} 출석이 진행 중입니다.</p>
                  )}
                  <button onClick={startSession} disabled={busy || selectedDate !== today || students.length === 0}
                    style={{ ...styles.startBtn, opacity: (busy || selectedDate !== today) ? 0.5 : 1 }}>
                    ▶ {periodLabel(selectedPeriod)} 출석 시작
                  </button>
                  {selectedDate !== today && <p style={styles.hint}>지난 날짜는 기록 확인·수동 처리만 할 수 있습니다.</p>}
                </div>
              )}

              <button onClick={() => setShowQr(v => !v)} style={{ ...styles.secondaryBtn, width: '100%', marginTop: '1rem' }}>
                {showQr ? '입장 QR 닫기' : '입장 QR 보기'}
              </button>
              {showQr && (
                <div style={{ marginTop: '0.75rem' }}>
                  <p style={styles.hint}>학생은 이 QR을 처음 한 번만 찍고 대기 화면을 켜 둡니다.</p>
                  <QRDisplay
                    eventName={event.name}
                    checkinUrl={`${window.location.origin}/attendance/checkin/${schoolId}/${eventId}?token=${event.qrToken}`}
                  />
                </div>
              )}
            </section>

            {/* 출석 */}
            <section style={{ ...styles.card, flex: '1 1 280px' }}>
              <div style={styles.cardHead}><strong>출석 {attended.length}</strong><span style={styles.metaText}>누른 순서</span></div>
              {attended.length === 0 ? <p style={styles.empty}>아직 출석한 학생이 없습니다.</p> : attended.map(s => {
                const l = periodLogMap[s.studentId]
                return (
                  <div key={s.studentId} style={styles.row}>
                    <span>{studentLabel(s)}</span>
                    <span style={styles.rowRight}>
                      <span style={styles.time}>{fmtClock(l.checkedAt)}{l.method === 'manual' && ' (교사)'}</span>
                      <button onClick={() => removeLog(s)} disabled={processingId === s.studentId} style={styles.linkBtn}>취소</button>
                    </span>
                  </div>
                )
              })}
            </section>

            {/* 미출석 */}
            <section style={{ ...styles.card, flex: '1 1 320px' }}>
              <div style={styles.cardHead}><strong>미출석 {notAttended.length}</strong></div>
              {notAttended.length === 0 ? <p style={styles.empty}>모두 출석했습니다! 🎉</p> : notAttended.map(s => {
                const absentLog = periodLogMap[s.studentId]
                return (
                  <div key={s.studentId} style={{ ...styles.row, flexDirection: 'column', alignItems: 'stretch', gap: '0.35rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>{studentLabel(s)}</span>
                      <button onClick={() => writeLog(s, { method: 'manual' })} disabled={processingId === s.studentId} style={styles.manualBtn}>출석 처리</button>
                    </div>
                    {absentLog ? (
                      <div style={styles.reasonSaved}>
                        사유: <strong>{absentLog.reason}</strong>
                        <button onClick={() => removeLog(s)} style={styles.linkBtn}>지우기</button>
                      </div>
                    ) : (
                      <>
                        <div style={styles.presetRow}>
                          {REASON_PRESETS.map(r => (
                            <button key={r} onClick={() => setReasonDraft(p => ({ ...p, [s.studentId]: r }))}
                              style={{ ...styles.presetBtn, ...(reasonDraft[s.studentId] === r ? styles.presetBtnOn : {}) }}>{r}</button>
                          ))}
                        </div>
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                          <input value={reasonDraft[s.studentId] ?? ''} placeholder="사유 직접 입력"
                            onChange={e => setReasonDraft(p => ({ ...p, [s.studentId]: e.target.value }))}
                            onKeyDown={e => e.key === 'Enter' && saveReason(s)}
                            style={styles.reasonInput} />
                          <button onClick={() => saveReason(s)} disabled={!reasonDraft[s.studentId]?.trim()} style={styles.reasonSaveBtn}>저장</button>
                        </div>
                      </>
                    )}
                  </div>
                )
              })}
            </section>
          </div>
        </>
      )}
    </Layout>
  )
}

const styles = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' },
  backBtn: { background: 'none', border: 'none', color: '#1a73e8', cursor: 'pointer', fontSize: '0.85rem', padding: '0 0 0.4rem', display: 'block' },
  heading: { fontSize: '1.3rem', fontWeight: 700, margin: '0 0 0.4rem' },
  metaRow: { display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' },
  modeBadge: { fontSize: '0.78rem', backgroundColor: '#e3f2fd', color: '#1565c0', padding: '0.2rem 0.6rem', borderRadius: '10px', fontWeight: 600 },
  metaText: { fontSize: '0.82rem', color: '#666' },
  viewToggle: { display: 'flex', border: '1px solid #ddd', borderRadius: '8px', overflow: 'hidden' },
  toggleBtn: { padding: '0.45rem 0.9rem', background: '#fff', border: 'none', cursor: 'pointer', fontSize: '0.85rem', color: '#555' },
  toggleBtnOn: { background: '#1a73e8', color: '#fff', fontWeight: 600 },
  errorBox: { background: '#ffebee', color: '#c62828', border: '1px solid #ef9a9a', borderRadius: '8px', padding: '0.6rem 0.9rem', marginBottom: '0.75rem', fontSize: '0.88rem' },
  toolbar: { display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '0.9rem' },
  dateInput: { padding: '0.45rem 0.6rem', border: '1px solid #ddd', borderRadius: '8px', fontSize: '0.9rem' },
  periodTabs: { display: 'flex', gap: '0.4rem', flexWrap: 'wrap' },
  periodTab: { padding: '0.45rem 0.9rem', border: '1px solid #ddd', borderRadius: '20px', background: '#fff', cursor: 'pointer', fontSize: '0.88rem' },
  periodTabOn: { background: '#1a73e8', borderColor: '#1a73e8', color: '#fff', fontWeight: 700 },
  grid: { display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start' },
  card: { background: '#fff', border: '1px solid #e0e0e0', borderRadius: '12px', padding: '1rem', minWidth: 0 },
  cardHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' },
  liveBadge: { display: 'inline-block', fontSize: '0.85rem', fontWeight: 700, color: '#2e7d32', backgroundColor: '#e8f5e9', border: '1px solid #a5d6a7', borderRadius: '20px', padding: '0.3rem 1rem' },
  codeLabel: { margin: '1rem 0 0', color: '#666', fontSize: '0.9rem' },
  codeBig: { fontSize: 'clamp(5rem, 14vw, 9rem)', fontWeight: 800, letterSpacing: '0.12em', lineHeight: 1.1, color: '#1a73e8', fontVariantNumeric: 'tabular-nums' },
  countLine: { fontSize: '1.1rem', fontWeight: 700, margin: '0.5rem 0' },
  hint: { color: '#888', fontSize: '0.82rem', lineHeight: 1.6, margin: '0.4rem 0' },
  startBtn: { padding: '0.9rem 2rem', backgroundColor: '#1a73e8', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '1.1rem', fontWeight: 700, cursor: 'pointer', margin: '1rem 0 0.25rem' },
  closeBtn: { width: '100%', marginTop: '0.75rem', padding: '0.65rem', backgroundColor: '#fff', color: '#d32f2f', border: '1px solid #ef9a9a', borderRadius: '8px', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer' },
  secondaryBtn: { padding: '0.45rem 0.9rem', background: '#fff', border: '1px solid #ccc', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem' },
  empty: { color: '#999', fontSize: '0.88rem', textAlign: 'center', padding: '1rem 0' },
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.45rem 0', borderBottom: '1px solid #f0f0f0', fontSize: '0.9rem', gap: '0.5rem' },
  rowRight: { display: 'flex', alignItems: 'center', gap: '0.5rem' },
  time: { fontVariantNumeric: 'tabular-nums', color: '#2e7d32', fontWeight: 600, fontSize: '0.85rem' },
  linkBtn: { background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: '0.78rem', textDecoration: 'underline' },
  manualBtn: { padding: '0.3rem 0.6rem', background: '#e8f5e9', color: '#2e7d32', border: '1px solid #a5d6a7', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 },
  presetRow: { display: 'flex', gap: '0.3rem', flexWrap: 'wrap' },
  presetBtn: { fontSize: '0.72rem', padding: '0.2rem 0.5rem', border: '1px solid #ddd', background: '#fff', borderRadius: '12px', cursor: 'pointer', color: '#666' },
  presetBtnOn: { borderColor: '#f57c00', color: '#f57c00', background: '#fff3e0' },
  reasonInput: { flex: 1, minWidth: 0, padding: '0.35rem 0.6rem', border: '1px solid #ddd', borderRadius: '6px', fontSize: '0.82rem' },
  reasonSaveBtn: { padding: '0.35rem 0.6rem', backgroundColor: '#f57c00', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 },
  reasonSaved: { fontSize: '0.82rem', color: '#e65100', display: 'flex', gap: '0.5rem', alignItems: 'center' },
  table: { borderCollapse: 'collapse', fontSize: '0.82rem', minWidth: '100%' },
  th: { background: '#f5f5f5', padding: '0.45rem 0.6rem', border: '1px solid #e0e0e0', whiteSpace: 'nowrap', fontWeight: 600 },
  td: { padding: '0.4rem 0.6rem', border: '1px solid #eee', textAlign: 'center', fontVariantNumeric: 'tabular-nums' },
}
