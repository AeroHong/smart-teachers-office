// 교시별 버튼 출석(checkinMode: 'button') 교사 화면.
// 체험학습 잔류학생 지도처럼 한 교실에 많은 학생이 모여 여러 교시를 연달아 하는 경우를 위한 모드
// (사용자 요청, 2026-10-21). 학생은 입장 QR을 처음 한 번만 찍고 대기 화면을 켜 두며,
// 교사가 교시마다 [출석 시작]을 누르면 학생 화면 버튼이 켜진다. 원격·대리 출석을 막으려고
// 시작할 때마다 2자리 숫자코드를 새로 뽑아 교실 화면에만 띄운다 — 코드는 이벤트 문서(누구나
// get 가능)가 아니라 교사만 읽는 periodSessionSecrets에 두고, 학생 기록 쓰기 규칙이 대조한다.
// 기록은 하루 단위 attendanceLogs와 섞지 않고 periodLogs(`날짜-p교시-학번`)에 따로 쌓는다.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  doc, getDoc, collection, onSnapshot, setDoc, updateDoc, serverTimestamp, writeBatch,
} from 'firebase/firestore'
import * as XLSX from 'xlsx'
import { db } from '@shared/lib/firebase'
import Layout from '../../components/Layout'
import QRDisplay from '../../components/QRDisplay'
import { DAYS, PERIOD_OPTIONS, periodLabel, toDateStr, periodLogId, activePeriodSession } from './eventHelpers'

// 지각은 결석 사유가 아니라 「출석 + late」로 따로 처리한다(출석 행 [지각], 미출석 행 [지각 출석])
const REASON_PRESETS = ['질병결석', '조퇴', '미인정결석', '체험학습', '기타']
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

  // ── 전체화면(키오스크) 보기 ───────────────────────────────────
  // 교실 앞 안드로이드 태블릿에 이 화면만 띄워 두는 용도(사용자 요청, 2026-10-21).
  // 상단 메뉴를 숨기는 건 주소(?view=kiosk)로 기억해 새로고침해도 유지하고, 브라우저
  // 전체화면은 사용자 터치가 있어야만 켤 수 있어 버튼으로 켠다. 켜 둔 동안은 화면이
  // 꺼지지 않게 Wake Lock을 잡는다(지원 안 하는 브라우저는 조용히 넘어간다).
  const [searchParams, setSearchParams] = useSearchParams()
  const kiosk = searchParams.get('view') === 'kiosk'
  const wentFullscreenRef = useRef(false)

  const enterKiosk = async () => {
    setSearchParams(prev => { const n = new URLSearchParams(prev); n.set('view', 'kiosk'); return n }, { replace: true })
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen({ navigationUI: 'hide' })
        wentFullscreenRef.current = true
      }
    } catch { /* 전체화면을 막는 브라우저 — 메뉴만 숨긴 화면으로 쓴다 */ }
  }

  const exitKiosk = () => {
    wentFullscreenRef.current = false
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
    setSearchParams(prev => { const n = new URLSearchParams(prev); n.delete('view'); return n }, { replace: true })
  }

  // 태블릿에서 뒤로 가기 제스처 등으로 전체화면이 풀리면 메뉴도 다시 보이게
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement && wentFullscreenRef.current) exitKiosk()
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!kiosk || !navigator.wakeLock) return undefined
    let lock = null
    let alive = true
    const acquire = () => {
      if (document.visibilityState !== 'visible') return
      navigator.wakeLock.request('screen').then(l => { if (alive) lock = l; else l.release() }).catch(() => {})
    }
    acquire()
    // 화면을 잠깐 벗어났다 돌아오면 잠금이 풀려 있으므로 다시 잡는다
    document.addEventListener('visibilitychange', acquire)
    return () => {
      alive = false
      document.removeEventListener('visibilitychange', acquire)
      lock?.release().catch(() => {})
    }
  }, [kiosk])
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
  // 사유가 등록된 학생(결석·조퇴 등)은 "아직 안 온 학생" 목록에서 빼서 따로 모은다 —
  // 종일 결석·조퇴생이 교시마다 미출석에 계속 남아 확인을 방해했다(사용자 지적, 2026-10-21)
  const notAttended = students.filter(s => !periodLogMap[s.studentId])
  const excused = students.filter(s => periodLogMap[s.studentId]?.method === 'absent')
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
    const log = periodLogMap[student.studentId]
    // 「이 교시부터 끝까지」로 한꺼번에 넣은 사유면 같이 넣은 뒤 교시들도 함께 지울지 묻는다
    const linked = log?.method === 'absent' && log.fromPeriod != null
      ? logs.filter(l => l.studentId === student.studentId && l.date === selectedDate &&
          l.method === 'absent' && l.fromPeriod === log.fromPeriod && l.period > selectedPeriod)
      : []
    const alsoLinked = linked.length > 0 &&
      window.confirm(`${periodLabel(log.fromPeriod)}부터 함께 등록한 뒤 교시(${linked.map(l => periodLabel(l.period)).join(', ')})의 「${log.reason}」도 지울까요?\n[취소]를 누르면 ${periodLabel(selectedPeriod)}만 지웁니다.`)
    setProcessingId(student.studentId)
    try {
      const batch = writeBatch(db)
      batch.delete(logRef(student.studentId))
      if (alsoLinked) {
        linked.forEach(l => batch.delete(doc(db, 'schools', schoolId, 'events', eventId, 'periodLogs', l.id)))
      }
      await batch.commit()
    } catch {
      alert('취소하지 못했습니다. 다시 시도해 주세요.')
    } finally {
      setProcessingId(null)
    }
  }

  // untilEnd: 이 교시부터 그날 시간표 마지막 칸까지 같은 사유로 (종일 결석·조퇴).
  // 그 사이 이미 출석한 교시는 덮어쓰지 않는다.
  const saveReason = async (student, untilEnd = false) => {
    const reason = reasonDraft[student.studentId]?.trim()
    if (!reason) return
    if (!untilEnd) {
      await writeLog(student, { method: 'absent', reason })
      setReasonDraft(p => ({ ...p, [student.studentId]: '' }))
      return
    }
    setProcessingId(student.studentId)
    try {
      const batch = writeBatch(db)
      addReasonFrom(batch, student, reason, selectedPeriod)
      await batch.commit()
      setReasonDraft(p => ({ ...p, [student.studentId]: '' }))
    } catch (err) {
      console.error('사유 일괄 등록 실패:', err)
      alert('저장하지 못했습니다. 다시 시도해 주세요.')
    } finally {
      setProcessingId(null)
    }
  }

  // fromP 칸부터 그날 끝까지 같은 사유를 batch에 담는다. 이미 출석한 칸은 건너뛴다.
  const addReasonFrom = (batch, student, reason, fromP) => {
    periods.filter(p => p >= fromP).forEach(p => {
      const l = logs.find(x => x.studentId === student.studentId && x.date === selectedDate && x.period === p)
      if (ATTENDED_METHODS.includes(l?.method)) return
      batch.set(
        doc(db, 'schools', schoolId, 'events', eventId, 'periodLogs', periodLogId(selectedDate, p, student.studentId)),
        {
          studentId: student.studentId,
          studentName: student.name,
          grade: student.grade,
          class: student.class,
          number: student.number,
          date: selectedDate,
          period: p,
          checkedAt: serverTimestamp(),
          method: 'absent',
          reason,
          fromPeriod: fromP,
        },
      )
    })
  }

  // ── 지각·출석 후 조퇴 (출석 기록에 표시만 덧붙인다) ─────────────
  // 지각은 출석의 한 형태라 결석 사유로 넣으면 출석 인원에서 빠지고 누른 시각도 사라졌다
  // (사용자 확인 요청 — 「조회 지각 → 1교시 출석 → 2교시 조퇴」, 2026-10-22).
  const toggleLate = async (student) => {
    const l = periodLogMap[student.studentId]
    setProcessingId(student.studentId)
    try {
      await updateDoc(logRef(student.studentId), { late: !l.late })
    } catch {
      alert('저장하지 못했습니다. 다시 시도해 주세요.')
    } finally {
      setProcessingId(null)
    }
  }

  // 이 교시는 출석으로 두고 earlyLeave 표시, 다음 칸부터 끝까지 「조퇴」. 다시 누르면 되돌린다.
  const toggleEarlyLeave = async (student) => {
    const l = periodLogMap[student.studentId]
    const nextP = periods.find(p => p > selectedPeriod)
    setProcessingId(student.studentId)
    try {
      const batch = writeBatch(db)
      if (l.earlyLeave) {
        batch.update(logRef(student.studentId), { earlyLeave: false })
        logs.filter(x => x.studentId === student.studentId && x.date === selectedDate &&
            x.method === 'absent' && x.reason === '조퇴' && x.fromPeriod === nextP)
          .forEach(x => batch.delete(doc(db, 'schools', schoolId, 'events', eventId, 'periodLogs', x.id)))
      } else {
        batch.update(logRef(student.studentId), { earlyLeave: true })
        if (nextP != null) addReasonFrom(batch, student, '조퇴', nextP)
      }
      await batch.commit()
    } catch (err) {
      console.error('조퇴 처리 실패:', err)
      alert('저장하지 못했습니다. 다시 시도해 주세요.')
    } finally {
      setProcessingId(null)
    }
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
    const notes = [l.late && '지각', l.earlyLeave && '조퇴', l.method === 'manual' && '교사'].filter(Boolean)
    const t = fmtClock(l.checkedAt).slice(0, 5)
    return notes.length ? `${t} (${notes.join('·')})` : t
  }

  // ── 날짜(요일)별 시트 ─────────────────────────────────────────
  // 전체 기록을 날짜마다 한 장씩 본다 — 화면은 시트 탭, 엑셀은 날짜별 시트(사용자 요청, 2026-10-22).
  // 열은 그날 요일 시간표 칸 + 시간표 밖이라도 기록이 있는 칸.
  const recordDates = useMemo(() => [...new Set(slots.map(x => x.date))], [slots])
  const [sheetDate, setSheetDate] = useState(null)
  const activeSheet = recordDates.includes(sheetDate)
    ? sheetDate
    : (recordDates.includes(today) ? today : recordDates[recordDates.length - 1])

  const periodsOfSheet = (date) => {
    const day = new Date(`${date}T00:00:00`).getDay()
    const scheduled = (event.schedules || []).filter(x => x.dayOfWeek === day).map(x => x.period)
    const logged = slots.filter(x => x.date === date).map(x => x.period)
    return [...new Set([...scheduled, ...logged])].sort((a, b) => a - b)
  }

  const sheetLabel = (date) => {
    const d = new Date(`${date}T00:00:00`)
    return `${d.getMonth() + 1}/${d.getDate()}(${DAYS[d.getDay()]})`
  }

  // 교시별 요약: 출석(지각 포함) / 대상(사유 처리 제외)
  const periodSummary = (date, period) => {
    const day = logs.filter(l => l.date === date && l.period === period)
    const present = day.filter(l => ATTENDED_METHODS.includes(l.method)).length
    const excusedCount = day.filter(l => l.method === 'absent').length
    return `${present}/${students.length - excusedCount}`
  }

  const downloadExcel = () => {
    const wb = XLSX.utils.book_new()
    recordDates.forEach(date => {
      const cols = periodsOfSheet(date)
      const header = ['학년', '반', '번호', '이름', ...cols.map(periodLabel)]
      const rows = students.map(st => [st.grade, st.class, st.number, st.name,
        ...cols.map(period => cellText(st.studentId, { date, period }))])
      const summary = ['', '', '', '출석/대상', ...cols.map(period => periodSummary(date, period))]
      const ws = XLSX.utils.aoa_to_sheet([header, ...rows, [], summary])
      ws['!cols'] = [{ wch: 5 }, { wch: 4 }, { wch: 5 }, { wch: 10 }, ...cols.map(() => ({ wch: 14 }))]
      // 시트 이름에는 / 를 쓸 수 없다
      XLSX.utils.book_append_sheet(wb, ws, sheetLabel(date).replace('/', '-'))
    })
    XLSX.writeFile(wb, `${event.name}_교시별출석_${today}.xlsx`)
  }

  const studentLabel = (s) => `${s.grade}-${s.class}-${s.number} ${s.name}`

  const panelBodyStyle = { ...styles.panelBody, ...(kiosk ? styles.panelBodyKiosk : {}) }

  const content = (
    <>
      <div style={styles.header}>
        <div>
          {!kiosk && <button onClick={() => navigate('/attendance')} style={styles.backBtn}>← 대시보드</button>}
          <h2 style={styles.heading}>{event.name}</h2>
          <div style={styles.metaRow}>
            <span style={styles.modeBadge}>교시별 버튼 출석</span>
            {event.location && <span style={styles.metaText}>📍 {event.location}</span>}
            <span style={styles.metaText}>👥 {students.length}명</span>
          </div>
        </div>
        <div style={styles.headerRight}>
        {kiosk
          ? <button onClick={exitKiosk} style={styles.secondaryBtn}>전체화면 끝내기</button>
          : <button onClick={enterKiosk} style={styles.secondaryBtn} title="태블릿에 이 화면만 띄워 두기">⛶ 전체화면</button>}
        <div style={styles.viewToggle}>
          <button onClick={() => setView('period')} style={{ ...styles.toggleBtn, ...(view === 'period' ? styles.toggleBtnOn : {}) }}>교시별</button>
          <button onClick={() => setView('all')} style={{ ...styles.toggleBtn, ...(view === 'all' ? styles.toggleBtnOn : {}) }}>전체 기록</button>
        </div>
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
            <button onClick={downloadExcel} style={styles.secondaryBtn} disabled={recordDates.length === 0}>⬇ 엑셀 다운로드 (날짜별 시트)</button>
          </div>
          {recordDates.length === 0 ? <p style={styles.empty}>아직 기록이 없습니다.</p> : (
            <>
              <div style={styles.sheetTabs}>
                {recordDates.map(date => (
                  <button key={date} onClick={() => setSheetDate(date)}
                    style={{ ...styles.sheetTab, ...(date === activeSheet ? styles.sheetTabOn : {}) }}>
                    {sheetLabel(date)}
                  </button>
                ))}
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>학생</th>
                      {periodsOfSheet(activeSheet).map(period => <th key={period} style={styles.th}>{periodLabel(period)}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {students.map(st => (
                      <tr key={st.studentId}>
                        <td style={{ ...styles.td, whiteSpace: 'nowrap' }}>{studentLabel(st)}</td>
                        {periodsOfSheet(activeSheet).map(period => {
                          const text = cellText(st.studentId, { date: activeSheet, period })
                          const isAbsent = text && (!/^\d/.test(text) || /지각|조퇴/.test(text))
                          return (
                            <td key={period}
                              style={{ ...styles.td, color: isAbsent ? '#e65100' : '#333', background: text ? undefined : '#fafafa' }}>
                              {text || '–'}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                    <tr>
                      <td style={{ ...styles.td, ...styles.summaryCell }}>출석/대상</td>
                      {periodsOfSheet(activeSheet).map(period => (
                        <td key={period} style={{ ...styles.td, ...styles.summaryCell }}>{periodSummary(activeSheet, period)}</td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
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

          {/* 기존 출결 현황(AttendanceDashboard ThreeColumnPanels)과 같은 3분할 — 제목은 고정, 내용만 칸마다 따로 스크롤 */}
          <div style={styles.grid}>
            {/* 세션 제어 */}
            <section style={styles.panel}>
              <div style={styles.cardHead}><strong>{periodLabel(selectedPeriod)} 출석</strong></div>
              <div style={panelBodyStyle}>
              {isLiveHere ? (
                <div style={{ textAlign: 'center' }}>
                  <div style={styles.liveBadge}>● {periodLabel(selectedPeriod)} 출석 진행 중</div>
                  <p style={styles.codeLabel}>출석 코드</p>
                  <div style={styles.codeBig}>{code ?? '··'}</div>
                  <p style={styles.hint}>학생 화면에 이 숫자를 입력하고 [출석]을 누릅니다.</p>
                  <div style={styles.countLine}>{attended.length} / {students.length - excused.length}명 출석</div>
                  {excused.length > 0 && <p style={styles.hint}>사유 처리 {excused.length}명은 대상에서 뺐습니다.</p>}
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
              </div>
            </section>

            {/* 출석 */}
            <section style={styles.panel}>
              <div style={styles.cardHead}><strong style={{ color: '#2e7d32' }}>✅ 출석 {attended.length}명</strong><span style={styles.metaText}>누른 순서</span></div>
              <div style={panelBodyStyle}>
              {attended.length === 0 ? <p style={styles.empty}>아직 출석한 학생이 없습니다.</p> : attended.map(s => {
                const l = periodLogMap[s.studentId]
                return (
                  <div key={s.studentId} style={styles.row}>
                    <span>{studentLabel(s)}</span>
                    <span style={styles.rowRight}>
                      <span style={styles.time}>{fmtClock(l.checkedAt)}{l.method === 'manual' && ' (교사)'}</span>
                      {l.late && <span style={styles.noteBadge}>지각</span>}
                      {l.earlyLeave && <span style={styles.noteBadge}>조퇴</span>}
                      <button onClick={() => toggleLate(s)} disabled={processingId === s.studentId}
                        style={{ ...styles.tagBtn, ...(l.late ? styles.tagBtnOn : {}) }} title="지각 표시/해제">지각</button>
                      <button onClick={() => toggleEarlyLeave(s)} disabled={processingId === s.studentId}
                        style={{ ...styles.tagBtn, ...(l.earlyLeave ? styles.tagBtnOn : {}) }}
                        title="이 교시는 출석, 다음 칸부터 끝까지 조퇴로 처리(다시 누르면 되돌림)">조퇴</button>
                      <button onClick={() => removeLog(s)} disabled={processingId === s.studentId} style={styles.linkBtn}>취소</button>
                    </span>
                  </div>
                )
              })}
              </div>
            </section>

            {/* 미출석 */}
            <section style={styles.panel}>
              <div style={styles.cardHead}><strong style={{ color: '#c62828' }}>❌ 미출석 {notAttended.length}명</strong></div>
              <div style={panelBodyStyle}>
              {notAttended.length === 0
                ? <p style={styles.empty}>{excused.length > 0 ? '사유 처리된 학생 말고는 모두 출석했습니다! 🎉' : '모두 출석했습니다! 🎉'}</p>
                : notAttended.map(s => (
                  <div key={s.studentId} style={{ ...styles.row, flexDirection: 'column', alignItems: 'stretch', gap: '0.35rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>{studentLabel(s)}</span>
                      <span style={styles.rowRight}>
                        <button onClick={() => writeLog(s, { method: 'manual' })} disabled={processingId === s.studentId} style={styles.manualBtn}>출석 처리</button>
                        <button onClick={() => writeLog(s, { method: 'manual', late: true })} disabled={processingId === s.studentId} style={styles.lateBtn}>지각 출석</button>
                      </span>
                    </div>
                    <div style={styles.presetRow}>
                      {REASON_PRESETS.map(r => (
                        <button key={r} onClick={() => setReasonDraft(p => ({ ...p, [s.studentId]: r }))}
                          style={{ ...styles.presetBtn, ...(reasonDraft[s.studentId] === r ? styles.presetBtnOn : {}) }}>{r}</button>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <input value={reasonDraft[s.studentId] ?? ''} placeholder="사유 직접 입력"
                        onChange={e => setReasonDraft(p => ({ ...p, [s.studentId]: e.target.value }))}
                        onKeyDown={e => e.key === 'Enter' && saveReason(s)}
                        style={styles.reasonInput} />
                      <button onClick={() => saveReason(s)} disabled={!reasonDraft[s.studentId]?.trim() || processingId === s.studentId}
                        style={styles.reasonSaveBtn} title={`${periodLabel(selectedPeriod)}만 적용`}>이 교시만</button>
                      <button onClick={() => saveReason(s, true)} disabled={!reasonDraft[s.studentId]?.trim() || processingId === s.studentId}
                        style={styles.reasonAllBtn} title="종일 결석·조퇴 — 이후 교시에도 같은 사유로 처리">
                        {periodLabel(selectedPeriod)}부터 끝까지
                      </button>
                    </div>
                  </div>
                ))}

              {excused.length > 0 && (
                <>
                  <div style={styles.excusedHead}>📝 사유 처리 {excused.length}명</div>
                  {excused.map(s => {
                    const l = periodLogMap[s.studentId]
                    return (
                      <div key={s.studentId} style={styles.row}>
                        <span>{studentLabel(s)}</span>
                        <span style={styles.rowRight}>
                          <span style={styles.reasonSaved}>
                            {l.reason}{l.fromPeriod != null && l.fromPeriod !== selectedPeriod && ` (${periodLabel(l.fromPeriod)}부터)`}
                          </span>
                          <button onClick={() => writeLog(s, { method: 'manual' })} disabled={processingId === s.studentId} style={styles.linkBtn}>출석으로</button>
                          <button onClick={() => removeLog(s)} disabled={processingId === s.studentId} style={styles.linkBtn}>지우기</button>
                        </span>
                      </div>
                    )
                  })}
                </>
              )}
              </div>
            </section>
          </div>
        </>
      )}
    </>
  )

  return kiosk
    ? <div style={styles.kioskRoot}>{content}</div>
    : <Layout wide>{content}</Layout>
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
  grid: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '1rem', alignItems: 'start' },
  panel: { background: '#fff', border: '1px solid #e0e0e0', borderRadius: '12px', padding: '1rem', minWidth: 0, display: 'flex', flexDirection: 'column', boxSizing: 'border-box' },
  panelBody: { overflowY: 'auto', maxHeight: '70vh' },
  panelBodyKiosk: { maxHeight: 'calc(100vh - 230px)' },
  kioskRoot: { minHeight: '100vh', boxSizing: 'border-box', padding: '16px', background: '#f5f6f8' },
  headerRight: { display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' },
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
  noteBadge: { fontSize: '0.72rem', fontWeight: 700, color: '#e65100', background: '#fff3e0', border: '1px solid #ffcc80', borderRadius: '8px', padding: '0.05rem 0.4rem' },
  tagBtn: { fontSize: '0.72rem', padding: '0.15rem 0.45rem', border: '1px solid #ddd', background: '#fff', color: '#888', borderRadius: '10px', cursor: 'pointer' },
  tagBtnOn: { borderColor: '#f57c00', color: '#e65100', background: '#fff3e0', fontWeight: 700 },
  lateBtn: { padding: '0.3rem 0.6rem', background: '#fff3e0', color: '#e65100', border: '1px solid #ffcc80', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 },
  reasonAllBtn: { padding: '0.35rem 0.6rem', backgroundColor: '#fff', color: '#e65100', border: '1px solid #f57c00', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 },
  excusedHead: { marginTop: '1rem', padding: '0.4rem 0', borderTop: '2px solid #f0f0f0', fontSize: '0.85rem', fontWeight: 700, color: '#e65100' },
  reasonSaved: { fontSize: '0.82rem', color: '#e65100', display: 'flex', gap: '0.5rem', alignItems: 'center' },
  sheetTabs: { display: 'flex', gap: '0.25rem', flexWrap: 'wrap', borderBottom: '2px solid #1a73e8', marginBottom: '0.6rem' },
  sheetTab: { padding: '0.4rem 0.9rem', border: '1px solid #ddd', borderBottom: 'none', borderRadius: '8px 8px 0 0', background: '#f5f5f5', cursor: 'pointer', fontSize: '0.85rem', color: '#555' },
  sheetTabOn: { background: '#1a73e8', borderColor: '#1a73e8', color: '#fff', fontWeight: 700 },
  summaryCell: { background: '#f5f5f5', fontWeight: 700 },
  table: { borderCollapse: 'collapse', fontSize: '0.82rem', minWidth: '100%' },
  th: { background: '#f5f5f5', padding: '0.45rem 0.6rem', border: '1px solid #e0e0e0', whiteSpace: 'nowrap', fontWeight: 600 },
  td: { padding: '0.4rem 0.6rem', border: '1px solid #eee', textAlign: 'center', fontVariantNumeric: 'tabular-nums' },
}
