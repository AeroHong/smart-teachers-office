import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth'
import { auth, db } from '../../lib/firebase'
import { useAuth } from '../../contexts/AuthContext'

const STATE = {
  LOADING: 'loading',
  LOGIN_REQUIRED: 'login_required',
  INVALID: 'invalid',
  QR_INACTIVE: 'qr_inactive',   // 라이브 세션 비활성 (시작 전 or 마감됨)
  NOT_STARTED: 'not_started',
  ENDED: 'ended',
  CHECKING: 'checking',
  SUCCESS: 'success',
  ALREADY: 'already',
  NOT_IN_LIST: 'not_in_list',
  TEACHER: 'teacher',
  ERROR: 'error',
}

function isEventActive(event) {
  const now = new Date()

  if (event.isRecurring) {
    const todayDay = now.getDay()

    const recurringEnd = event.recurringEndDate?.toDate?.() || new Date(event.recurringEndDate)
    if (now > recurringEnd) return { active: false, reason: 'ended' }

    // 신규: schedules 배열로 오늘 요일 조회 (같은 요일 여러 교시 허용)
    if (event.schedules?.length > 0) {
      const todaySchedules = event.schedules.filter(s => s.dayOfWeek === todayDay)
      if (todaySchedules.length === 0) return { active: false, reason: 'not_today' }

      // 시간이 설정된 교시: 현재 시간이 어느 하나의 시간대에 포함되면 활성
      const withTime = todaySchedules.filter(s => s.startTime && s.endTime)
      const noTime = todaySchedules.filter(s => !s.startTime || !s.endTime)

      // 시간 미설정 교시가 하나라도 있으면 당일 종일 허용
      if (noTime.length > 0) return { active: true }

      // 시간 설정된 교시 중 하나라도 현재 포함되면 활성
      const inWindow = withTime.some(s => {
        const start = new Date(now); start.setHours(...s.startTime.split(':').map(Number), 0, 0)
        const end = new Date(now); end.setHours(...s.endTime.split(':').map(Number), 0, 0)
        return now >= start && now <= end
      })
      if (inWindow) return { active: true }

      // 아직 시작 전인 교시가 있으면 not_started, 모두 종료면 ended_today
      const anyNotStarted = withTime.some(s => {
        const start = new Date(now); start.setHours(...s.startTime.split(':').map(Number), 0, 0)
        return now < start
      })
      return { active: false, reason: anyNotStarted ? 'not_started' : 'ended_today' }
    }

    // 구형 fallback: recurringDays + recurringTimeStart/End
    if (!event.recurringDays?.includes(todayDay)) return { active: false, reason: 'not_today' }

    const [startH, startM] = event.recurringTimeStart.split(':').map(Number)
    const [endH, endM] = event.recurringTimeEnd.split(':').map(Number)
    const todayStart = new Date(now); todayStart.setHours(startH, startM, 0, 0)
    const todayEnd = new Date(now); todayEnd.setHours(endH, endM, 0, 0)

    if (now < todayStart) return { active: false, reason: 'not_started' }
    if (now > todayEnd) return { active: false, reason: 'ended_today' }
    return { active: true }
  } else {
    const start = event.startTime?.toDate?.() || new Date(event.startTime)
    const end = event.endTime?.toDate?.() || new Date(event.endTime)
    if (now < start) return { active: false, reason: 'not_started' }
    if (now > end) return { active: false, reason: 'ended' }
    return { active: true }
  }
}

function toLocalDateStr(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function buildLogId(event, studentId) {
  if (event.isRecurring) return `${toLocalDateStr()}-${studentId}`
  return studentId
}

export default function StudentCheckin() {
  const { schoolId, eventId } = useParams()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')

  const { user, role, studentId, loading: authLoading, domainError } = useAuth()

  const [state, setState] = useState(STATE.LOADING)
  const [event, setEvent] = useState(null)
  const [studentInfo, setStudentInfo] = useState(null)
  const [isLate, setIsLate] = useState(false)

  useEffect(() => {
    if (authLoading) return
    const loadEvent = async () => {
      if (!token) { setState(STATE.INVALID); return }
      try {
        const eventDoc = await getDoc(doc(db, 'schools', schoolId, 'events', eventId))
        if (!eventDoc.exists()) { setState(STATE.INVALID); return }
        const data = eventDoc.data()

        if (data.type === '조회') {
          // 조회: 고정 QR 토큰 검증
          if (data.qrToken !== token) { setState(STATE.INVALID); return }
        } else {
          // 수업/방과후/행사/기타: 라이브 세션 토큰 검증
          if (data.liveToken == null) { setState(STATE.QR_INACTIVE); return }
          if (data.liveToken !== token) { setState(STATE.INVALID); return }
        }

        setEvent({ id: eventId, ...data })
      } catch {
        if (!user) { setState(STATE.LOGIN_REQUIRED); return }
        setState(STATE.ERROR)
      }
    }
    loadEvent()
  }, [schoolId, eventId, token, authLoading])

  useEffect(() => {
    if (authLoading || !event) return

    if (!user) { setState(STATE.LOGIN_REQUIRED); return }
    if (role === 'teacher' || role === 'admin') { setState(STATE.TEACHER); return }
    if (role === 'student' && studentId) { recordAttendance() }
  }, [authLoading, user, role, studentId, event])

  const recordAttendance = async () => {
    setState(STATE.CHECKING)

    // 조회는 시간 윈도우 체크, 라이브 세션 타입은 교사가 직접 제어하므로 스킵
    if (event.type === '조회') {
      const { active, reason } = isEventActive(event)
      if (!active) {
        setState(reason === 'not_started' || reason === 'not_today'
          ? STATE.NOT_STARTED : STATE.ENDED)
        return
      }
    }

    try {
      const studentDoc = await getDoc(doc(db, 'schools', schoolId, 'students', studentId))
      if (!studentDoc.exists()) { setState(STATE.NOT_IN_LIST); return }

      const student = studentDoc.data()
      const logId = buildLogId(event, studentId)
      const logRef = doc(db, 'schools', schoolId, 'events', eventId, 'attendanceLogs', logId)

      const existing = await getDoc(logRef)
      if (existing.exists()) {
        setStudentInfo(student)
        setState(STATE.ALREADY)
        return
      }

      let late = false
      if (event.type === '조회' && event.lateCheckTime) {
        const now = new Date()
        const [lh, lm] = event.lateCheckTime.split(':').map(Number)
        const lateTime = new Date(now)
        lateTime.setHours(lh, lm, 0, 0)
        late = now > lateTime
      }

      await setDoc(logRef, {
        studentId,
        studentName: student.name,
        grade: student.grade,
        class: student.class,
        number: student.number,
        checkedAt: serverTimestamp(),
        method: 'QR',
        qrToken: token,
        late,
      })

      setStudentInfo(student)
      setIsLate(late)
      setState(STATE.SUCCESS)
    } catch {
      setState(STATE.ERROR)
    }
  }

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider()
    provider.setCustomParameters({ prompt: 'select_account' })
    try { await signInWithPopup(auth, provider) } catch { /* 팝업 닫기 등 무시 */ }
  }

  const eventTitle = event?.name || '출석 확인'

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <p style={styles.schoolLabel}>선유고등학교</p>
        <h2 style={styles.eventTitle}>{eventTitle}</h2>
        {event?.location && <p style={styles.eventMeta}>📍 {event.location}</p>}
        {event?.targetGroup && <p style={styles.eventMeta}>👥 {event.targetGroup}</p>}

        <div style={styles.body}>
          {(state === STATE.LOADING || state === STATE.CHECKING) && (
            <StatusScreen icon="⏳" message="처리 중..." />
          )}
          {state === STATE.LOGIN_REQUIRED && (
            <>
              {domainError && (
                <div style={styles.domainErrorBox}>
                  ⚠️ 개인 Google 계정으로 로그인되어 있습니다.<br />
                  <strong>@seonyoo.hs.kr</strong> 학교 계정으로 로그인해주세요.
                </div>
              )}
              <StatusScreen icon="🔐" message={'학교 Google 계정으로\n로그인하면 자동으로 출석됩니다.'} />
              <button onClick={handleLogin} style={styles.googleBtn}>
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width={20} height={20} alt="" />
                {domainError ? '다른 계정으로 로그인' : 'Google 계정으로 출석하기'}
              </button>
            </>
          )}
          {state === STATE.INVALID && <StatusScreen icon="❌" title="유효하지 않은 QR" message="올바른 출석 QR 코드를 사용해 주세요." />}
          {state === STATE.QR_INACTIVE && <StatusScreen icon="⏸" title="출석 대기 중" message="선생님이 출석을 시작하면\nQR 코드가 활성화됩니다." />}
          {state === STATE.TEACHER && <StatusScreen icon="👨‍🏫" title="교사 계정" message="교사 계정으로는 출석할 수 없습니다." />}
          {state === STATE.NOT_STARTED && <StatusScreen icon="🕐" title="출석 시작 전" message="아직 출석 시간이 아닙니다." />}
          {state === STATE.ENDED && <StatusScreen icon="🔒" title="출석 마감" message="출석 시간이 종료되었습니다." />}
          {state === STATE.NOT_IN_LIST && <StatusScreen icon="🔍" title="명단에 없는 학생" message="시간표를 확인하세요.\n출결 명단에 없습니다." />}
          {state === STATE.ALREADY && (
            <StatusScreen icon="✅" title="이미 출석 완료"
              message={`${studentInfo?.name}\n(${studentInfo?.grade}학년 ${studentInfo?.class}반 ${studentInfo?.number}번)\n이미 출석이 확인되었습니다.`} />
          )}
          {state === STATE.SUCCESS && (
            isLate
              ? <StatusScreen icon="⚠️" title="지각으로 기록되었습니다" late
                  message={`${studentInfo?.name}\n(${studentInfo?.grade}학년 ${studentInfo?.class}반 ${studentInfo?.number}번)\n기준 시간 이후 입실로 지각 처리됩니다.`} />
              : <StatusScreen icon="🎉" title="출석 완료!" success
                  message={`${studentInfo?.name}\n(${studentInfo?.grade}학년 ${studentInfo?.class}반 ${studentInfo?.number}번)\n출석이 기록되었습니다.`} />
          )}
          {state === STATE.ERROR && <StatusScreen icon="⚠️" title="오류 발생" message="잠시 후 다시 시도해 주세요." />}
        </div>
      </div>
    </div>
  )
}

function StatusScreen({ icon, title, message, success, late, children }) {
  const titleColor = success ? '#2e7d32' : late ? '#e65100' : '#333'
  return (
    <div style={styles.statusBox}>
      <div style={styles.icon}>{icon}</div>
      {title && <h3 style={{ ...styles.statusTitle, color: titleColor }}>{title}</h3>}
      <p style={styles.statusMsg}>{message}</p>
      {children}
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#f0f4ff', padding: '1rem',
  },
  card: {
    backgroundColor: '#fff', borderRadius: '16px', padding: '2rem',
    width: '100%', maxWidth: '360px', boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
    textAlign: 'center',
  },
  schoolLabel: { fontSize: '0.8rem', color: '#888', margin: '0 0 0.25rem' },
  eventTitle: { fontSize: '1.3rem', fontWeight: 700, color: '#1a73e8', margin: '0 0 0.4rem' },
  eventMeta: { fontSize: '0.82rem', color: '#666', margin: '0.1rem 0' },
  body: { marginTop: '1.5rem' },
  statusBox: { padding: '0.5rem 0' },
  icon: { fontSize: '3rem', marginBottom: '0.75rem' },
  statusTitle: { fontSize: '1.1rem', fontWeight: 700, margin: '0 0 0.5rem' },
  statusMsg: { color: '#555', lineHeight: 1.8, whiteSpace: 'pre-line', margin: '0 0 1rem' },
  domainErrorBox: {
    backgroundColor: '#fff3e0', border: '1px solid #ffb74d', borderRadius: '8px',
    padding: '0.75rem', fontSize: '0.85rem', color: '#e65100',
    marginBottom: '1rem', lineHeight: 1.6, textAlign: 'center',
  },
  googleBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem',
    width: '100%', padding: '0.8rem', backgroundColor: '#fff',
    border: '1px solid #ddd', borderRadius: '10px', fontSize: '0.95rem',
    fontWeight: 600, cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
    marginTop: '0.5rem',
  },
}
