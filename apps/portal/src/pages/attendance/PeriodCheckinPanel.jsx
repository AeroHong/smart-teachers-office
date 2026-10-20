// 교시별 버튼 출석(checkinMode: 'button') 학생 대기 화면.
// 입장 QR로 한 번 로그인한 뒤 이 화면을 켜 두면, 교사가 교시 출석을 시작하는 순간
// 이벤트 문서 구독으로 버튼이 켜진다. 학생은 교실 화면에 뜬 2자리 코드를 입력해 출석한다 —
// 코드가 맞는지는 firestore.rules(periodLogs 쓰기)가 판정하므로, 거부되면 코드 오류로 안내한다.
import { useEffect, useRef, useState } from 'react'
import { doc, getDoc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@shared/lib/firebase'
import { periodLabel, periodLogId, activePeriodSession } from './eventHelpers'

function fmtClock(ts) {
  const d = ts?.toDate?.() ?? (ts ? new Date(ts) : null)
  if (!d || isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
}

export default function PeriodCheckinPanel({ schoolId, eventId, student }) {
  const [session, setSession] = useState(null)
  const [myLog, setMyLog] = useState(undefined) // undefined=확인 중, null=기록 없음
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  // 이벤트 문서 구독 — 교사가 시작/마감하면 즉시 반영
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'schools', schoolId, 'events', eventId),
      snap => setSession(snap.exists() ? activePeriodSession(snap.data()) : null),
      () => setError('연결이 끊겼습니다. 화면을 새로고침해 주세요.'),
    )
    return unsub
  }, [schoolId, eventId])

  // 새 교시가 열리면 내 기록이 이미 있는지 확인 (교사가 수동 처리했을 수도 있다)
  useEffect(() => {
    setCode('')
    setError('')
    if (!session) { setMyLog(null); return }
    setMyLog(undefined)
    getDoc(doc(db, 'schools', schoolId, 'events', eventId, 'periodLogs',
      periodLogId(session.date, session.period, student.studentId)))
      .then(snap => setMyLog(snap.exists() ? snap.data() : null))
      .catch(() => setMyLog(null))
  }, [schoolId, eventId, session?.sessionId, student.studentId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (session && myLog === null) inputRef.current?.focus()
  }, [session, myLog])

  const submit = async () => {
    if (!session || code.length !== 2 || submitting) return
    setSubmitting(true)
    setError('')
    const data = {
      studentId: student.studentId,
      studentName: student.name,
      grade: student.grade,
      class: student.class,
      number: student.number,
      date: session.date,
      period: session.period,
      sessionId: session.sessionId,
      code,
      method: 'button',
      checkedAt: serverTimestamp(),
    }
    try {
      await setDoc(doc(db, 'schools', schoolId, 'events', eventId, 'periodLogs',
        periodLogId(session.date, session.period, student.studentId)), data)
      setMyLog({ ...data, checkedAt: new Date() })
    } catch (err) {
      // 이미 기록이 있는데 다시 누른 경우(다른 기기 등)도 규칙상 거부된다 — 먼저 확인
      const snap = await getDoc(doc(db, 'schools', schoolId, 'events', eventId, 'periodLogs',
        periodLogId(session.date, session.period, student.studentId))).catch(() => null)
      if (snap?.exists()) { setMyLog(snap.data()); return }
      if (err?.code === 'permission-denied') {
        setError('코드가 맞지 않거나 출석이 마감되었습니다.\n교실 화면의 숫자를 확인하세요.')
      } else {
        setError('출석을 기록하지 못했습니다. 네트워크를 확인하고 다시 눌러 주세요.')
      }
      setCode('')
    } finally {
      setSubmitting(false)
    }
  }

  const who = `${student.name} (${student.grade}학년 ${student.class}반 ${student.number}번)`

  if (!session) {
    return (
      <div style={styles.box}>
        <div style={styles.icon}>⏸</div>
        <h3 style={styles.title}>출석 대기 중</h3>
        <p style={styles.msg}>{who}</p>
        <p style={styles.msg}>선생님이 출석을 시작하면{'\n'}이 화면에 출석 버튼이 켜집니다.</p>
        <p style={styles.tip}>이 화면을 닫지 말고 켜 두세요.{'\n'}닫았다면 QR을 다시 찍으면 됩니다.</p>
        {error && <p style={styles.error}>{error}</p>}
      </div>
    )
  }

  if (myLog === undefined) {
    return <div style={styles.box}><p style={styles.msg}>확인 중...</p></div>
  }

  if (myLog) {
    const absent = myLog.method === 'absent'
    return (
      <div style={styles.box}>
        <div style={styles.icon}>{absent ? '📝' : '✅'}</div>
        <h3 style={{ ...styles.title, color: absent ? '#e65100' : '#2e7d32' }}>
          {periodLabel(session.period)} {absent ? `${myLog.reason || '결석'} 처리됨` : '출석 완료'}
        </h3>
        <p style={styles.msg}>{who}</p>
        {!absent && <p style={styles.time}>{fmtClock(myLog.checkedAt)}</p>}
        <p style={styles.tip}>다음 출석이 시작되면 버튼이 다시 켜집니다.</p>
      </div>
    )
  }

  return (
    <div style={styles.box}>
      <div style={styles.liveBadge}>● {periodLabel(session.period)} 출석 진행 중</div>
      <p style={styles.msg}>{who}</p>
      <p style={styles.label}>교실 화면의 출석 코드 2자리</p>
      <input
        ref={inputRef}
        value={code}
        onChange={e => { setCode(e.target.value.replace(/\D/g, '').slice(0, 2)); setError('') }}
        onKeyDown={e => e.key === 'Enter' && submit()}
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        placeholder="00"
        style={styles.codeInput}
      />
      <button onClick={submit} disabled={code.length !== 2 || submitting}
        style={{ ...styles.btn, opacity: (code.length !== 2 || submitting) ? 0.5 : 1 }}>
        {submitting ? '처리 중...' : `${periodLabel(session.period)} 출석`}
      </button>
      {error && <p style={styles.error}>{error}</p>}
    </div>
  )
}

const styles = {
  box: { textAlign: 'center', padding: '0.5rem 0' },
  icon: { fontSize: '2.8rem', marginBottom: '0.4rem' },
  title: { fontSize: '1.25rem', fontWeight: 700, margin: '0 0 0.6rem', color: '#333' },
  msg: { color: '#555', whiteSpace: 'pre-line', lineHeight: 1.6, margin: '0.3rem 0' },
  tip: { color: '#999', fontSize: '0.8rem', whiteSpace: 'pre-line', lineHeight: 1.6, marginTop: '1rem' },
  time: { fontSize: '1.6rem', fontWeight: 700, color: '#2e7d32', margin: '0.4rem 0', fontVariantNumeric: 'tabular-nums' },
  liveBadge: { display: 'inline-block', fontSize: '0.85rem', fontWeight: 700, color: '#2e7d32', backgroundColor: '#e8f5e9', border: '1px solid #a5d6a7', borderRadius: '20px', padding: '0.3rem 1rem', marginBottom: '0.6rem' },
  label: { color: '#666', fontSize: '0.88rem', margin: '1rem 0 0.4rem' },
  codeInput: { width: '7rem', fontSize: '2.6rem', fontWeight: 800, textAlign: 'center', letterSpacing: '0.2em', padding: '0.4rem', border: '2px solid #1a73e8', borderRadius: '12px', fontVariantNumeric: 'tabular-nums' },
  btn: { display: 'block', width: '100%', marginTop: '1rem', padding: '1.1rem', fontSize: '1.25rem', fontWeight: 700, color: '#fff', backgroundColor: '#1a73e8', border: 'none', borderRadius: '12px', cursor: 'pointer' },
  error: { color: '#c62828', background: '#ffebee', borderRadius: '8px', padding: '0.6rem', fontSize: '0.88rem', whiteSpace: 'pre-line', marginTop: '0.75rem' },
}
