import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import useMediaQuery from '@mui/material/useMediaQuery'
import {
  doc, getDoc, getDocs, collection,
  onSnapshot, setDoc, deleteDoc, updateDoc, serverTimestamp,
} from 'firebase/firestore'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import Layout from '../../components/Layout'
import QRDisplay from '../../components/QRDisplay'

const DAYS = ['일', '월', '화', '수', '목', '금', '토']
const DAYS_SHORT = ['일', '월', '화', '수', '목', '금', '토']
const REASON_PRESETS = ['질병결석', '조퇴', '지각', '미인정결석', '체험학습', '기타']

// 특정 월의 달력 생성 (해당 월만 표시)
function generateMonthCalendar(year, month) {
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const firstDayOfWeek = firstDay.getDay()
  const lastDayOfWeek = lastDay.getDay()

  const days = []

  // 이전 달 빈 칸
  for (let i = 0; i < firstDayOfWeek; i++) {
    days.push({ date: null, isCurrentMonth: false })
  }

  // 현재 달
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push({ date: new Date(year, month, d), isCurrentMonth: true })
  }

  // 다음 달 빈 칸 (마지막 주를 채우기 위해)
  for (let i = lastDayOfWeek + 1; i < 7; i++) {
    days.push({ date: null, isCurrentMonth: false })
  }

  return days
}

// 달력 컴포넌트 (슬라이드 방식, 반응형 2개월/1개월)
function Calendar({ selectedDate, onSelectDate, allowedDays = null, isMobile, showTwoMonths = false }) {
  const [currentYear, setCurrentYear] = useState(new Date(selectedDate).getFullYear())
  const [currentMonth, setCurrentMonth] = useState(new Date(selectedDate).getMonth())
  const [containerWidth, setContainerWidth] = useState(window.innerWidth)

  useEffect(() => {
    const handleResize = () => setContainerWidth(window.innerWidth)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // 브라우저 너비에 따라 2개월 표시 여부 결정 (1200px 이하면 1개월만)
  const actualShowTwoMonths = showTwoMonths && containerWidth >= 1200

  const currentMonthDays = generateMonthCalendar(currentYear, currentMonth)
  const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1
  const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear
  const prevMonthDays = generateMonthCalendar(prevYear, prevMonth)

  const isAllowed = (date) => {
    if (!allowedDays) return true
    return allowedDays.includes(date.getDay())
  }

  const formatDateStr = (date) => {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  const isSelected = (date) => formatDateStr(date) === selectedDate
  const isToday = (date) => formatDateStr(date) === formatDateStr(new Date())

  const goPrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentYear(currentYear - 1)
      setCurrentMonth(11)
    } else {
      setCurrentMonth(currentMonth - 1)
    }
  }

  const goNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentYear(currentYear + 1)
      setCurrentMonth(0)
    } else {
      setCurrentMonth(currentMonth + 1)
    }
  }

  const renderMonth = (days, year, month) => (
    <div style={calStyles.monthBlock}>
      <div style={calStyles.monthHeader}>
        <span>{year}년 {month + 1}월</span>
      </div>
      <div style={calStyles.weekdayRow}>
        {DAYS_SHORT.map((day, i) => (
          <div key={i} style={{
            ...calStyles.weekdayCell,
            color: i === 0 ? '#d32f2f' : i === 6 ? '#1976d2' : '#666'
          }}>{day}</div>
        ))}
      </div>
      <div style={calStyles.daysGrid}>
        {days.map(({ date, isCurrentMonth }, idx) => {
          if (!date) {
            return <div key={idx} style={calStyles.dayCell} />
          }

          const allowed = isAllowed(date) && isCurrentMonth
          const selected = isSelected(date)
          const today = isToday(date)

          return (
            <div
              key={idx}
              onClick={() => allowed && onSelectDate(formatDateStr(date))}
              style={{
                ...calStyles.dayCell,
                cursor: allowed ? 'pointer' : 'not-allowed',
                backgroundColor: selected ? '#1a73e8' : today ? '#e8f0fe' : 'transparent',
                color: selected ? '#fff' : !isCurrentMonth ? '#ccc' : !allowed ? '#ddd' : date.getDay() === 0 ? '#d32f2f' : date.getDay() === 6 ? '#1976d2' : '#333',
                fontWeight: selected || today ? 700 : 400,
                opacity: allowed ? 1 : 0.3,
                border: today && !selected ? '1px solid #1a73e8' : '1px solid transparent',
              }}
            >
              {date.getDate()}
            </div>
          )
        })}
      </div>
    </div>
  )

  return (
    <div style={calStyles.container}>
      {actualShowTwoMonths ? (
        <>
          <div style={calStyles.navBtnLeft} onClick={goPrevMonth}>◀</div>
          <div style={calStyles.monthsWrapper}>
            {renderMonth(prevMonthDays, prevYear, prevMonth)}
            {renderMonth(currentMonthDays, currentYear, currentMonth)}
          </div>
          <div style={calStyles.navBtnRight} onClick={goNextMonth}>▶</div>
        </>
      ) : (
        <>
          <div style={calStyles.singleMonthWrapper}>
            <div style={calStyles.monthBlock}>
              <div style={calStyles.monthHeader}>
                <button onClick={goPrevMonth} style={calStyles.navBtn}>◀</button>
                <span>{currentYear}년 {currentMonth + 1}월</span>
                <button onClick={goNextMonth} style={calStyles.navBtn}>▶</button>
              </div>
              <div style={calStyles.weekdayRow}>
                {DAYS_SHORT.map((day, i) => (
                  <div key={i} style={{
                    ...calStyles.weekdayCell,
                    color: i === 0 ? '#d32f2f' : i === 6 ? '#1976d2' : '#666'
                  }}>{day}</div>
                ))}
              </div>
              <div style={calStyles.daysGrid}>
                {currentMonthDays.map(({ date, isCurrentMonth }, idx) => {
                  if (!date) {
                    return <div key={idx} style={calStyles.dayCell} />
                  }

                  const allowed = isAllowed(date) && isCurrentMonth
                  const selected = isSelected(date)
                  const today = isToday(date)

                  return (
                    <div
                      key={idx}
                      onClick={() => allowed && onSelectDate(formatDateStr(date))}
                      style={{
                        ...calStyles.dayCell,
                        cursor: allowed ? 'pointer' : 'not-allowed',
                        backgroundColor: selected ? '#1a73e8' : today ? '#e8f0fe' : 'transparent',
                        color: selected ? '#fff' : !isCurrentMonth ? '#ccc' : !allowed ? '#ddd' : date.getDay() === 0 ? '#d32f2f' : date.getDay() === 6 ? '#1976d2' : '#333',
                        fontWeight: selected || today ? 700 : 400,
                        opacity: allowed ? 1 : 0.3,
                        border: today && !selected ? '1px solid #1a73e8' : '1px solid transparent',
                      }}
                    >
                      {date.getDate()}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

const calStyles = {
  container: { display: 'flex', alignItems: 'center', gap: '0.5rem', position: 'relative' },
  singleMonthWrapper: { width: '100%' },
  monthsWrapper: { display: 'flex', gap: '1rem', flex: 1 },
  monthBlock: { display: 'flex', flexDirection: 'column', gap: '0.15rem', flex: 1 },
  monthHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '0.8rem',
    fontWeight: 700,
    color: '#333',
    padding: '0.3rem 0.5rem',
    borderBottom: '1px solid #e0e0e0',
  },
  navBtn: {
    background: 'none',
    border: 'none',
    fontSize: '0.9rem',
    cursor: 'pointer',
    color: '#1a73e8',
    padding: '0.2rem 0.4rem',
    transition: 'opacity 0.2s',
  },
  navBtnLeft: {
    background: 'none',
    border: 'none',
    fontSize: '1.2rem',
    cursor: 'pointer',
    color: '#1a73e8',
    padding: '0.5rem',
    transition: 'opacity 0.2s',
    userSelect: 'none',
  },
  navBtnRight: {
    background: 'none',
    border: 'none',
    fontSize: '1.2rem',
    cursor: 'pointer',
    color: '#1a73e8',
    padding: '0.5rem',
    transition: 'opacity 0.2s',
    userSelect: 'none',
  },
  weekdayRow: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '1px', padding: '0.15rem 0' },
  weekdayCell: { textAlign: 'center', fontSize: '0.65rem', fontWeight: 600, padding: '0.1rem 0' },
  daysGrid: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '1px', padding: '0 0 0.15rem' },
  dayCell: {
    textAlign: 'center',
    fontSize: '0.72rem',
    padding: '0.25rem',
    borderRadius: '4px',
    transition: 'all 0.15s',
    userSelect: 'none',
  },
}

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
  const [showCalendar, setShowCalendar] = useState(false)
  const [showConfetti, setShowConfetti] = useState(false)
  const confettiShownRef = useRef(false)

  // 수업 중 외출 관리
  const [classDuration, setClassDuration] = useState(50)
  const [outingPanel, setOutingPanel] = useState(null)  // 열린 패널의 studentId
  const [outingType, setOutingType] = useState('보건실')
  const [outingReason, setOutingReason] = useState('')
  const [now, setNow] = useState(new Date())

  // ── 이벤트 실시간 구독 + 학생 그룹 최초 1회 로드 ─────────────
  useEffect(() => {
    if (!schoolId) return
    let studentsLoaded = false

    const unsub = onSnapshot(
      doc(db, 'schools', schoolId, 'events', eventId),
      async (snap) => {
        if (!snap.exists()) { navigate('/attendance'); return }
        const ev = { id: eventId, ...snap.data() }
        setEvent(ev)

        if (!studentsLoaded) {
          studentsLoaded = true
          if (ev.studentGroupId) {
            const groupDoc = await getDoc(doc(db, 'schools', schoolId, 'studentGroups', ev.studentGroupId))
            if (groupDoc.exists()) {
              const { studentIds } = groupDoc.data()
              const studentsSnap = await getDocs(collection(db, 'schools', schoolId, 'students'))
              const filtered = studentsSnap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(s => studentIds.includes(s.studentId))
                .sort((a, b) => a.grade - b.grade || a.class - b.class || a.number - b.number)
              setStudents(filtered)
            }
          }
          setLoading(false)
        }
      }
    )
    return unsub
  }, [schoolId, eventId])

  // ── 이전 날짜 라이브 세션 자동 초기화 ────────────────────────
  // 전날(또는 그 이전) 세션이 Cloud Function 오류 등으로 남아 있으면
  // 다음 날 "QR 마감" 상태로 굳어버리는 버그 방지
  useEffect(() => {
    if (!event?.liveOpenedAt || !schoolId) return
    const openedAt = event.liveOpenedAt?.toDate?.() ?? new Date(event.liveOpenedAt)
    const openedDateStr = `${openedAt.getFullYear()}-${String(openedAt.getMonth() + 1).padStart(2, '0')}-${String(openedAt.getDate()).padStart(2, '0')}`
    if (openedDateStr !== todayStr()) {
      updateDoc(doc(db, 'schools', schoolId, 'events', eventId), {
        liveToken: null,
        liveOpenedAt: null,
        liveLateCutoff: null,
        liveClosesAt: null,
        lateWindowProcessed: null,
      })
    }
  }, [event?.liveOpenedAt])

  // ── 외출 실시간 타이머 ────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

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
  const checkinRankMap = (() => {
    const sorted = Object.values(attendedMap)
      .sort((a, b) => (a.checkedAt?.toMillis?.() ?? 0) - (b.checkedAt?.toMillis?.() ?? 0))
    const map = {}
    sorted.forEach((l, i) => { map[l.studentId] = i + 1 })
    return map
  })()

  // 체크인 등수(checkinRankMap) 순으로 정렬한다 — 예전엔 학생부 번호순 그대로라
  // 메달(1·2·3등)이 목록 중간중간에 흩어져 보였다(사용자 지적, 2026-09-09 —
  // "정렬 규칙을 모르겠다"). 먼저 체크인한 사람이 위로 오게 한다.
  const attended = students
    .filter(s => attendedMap[s.studentId])
    .sort((a, b) => checkinRankMap[a.studentId] - checkinRankMap[b.studentId])
  const absent = students.filter(s => !attendedMap[s.studentId])
  const rate = students.length > 0 ? Math.round((attended.length / students.length) * 100) : null

  // ── 전원 출석 시 폭죽 축하 ────────────────────────────────────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { confettiShownRef.current = false }, [selectedDate])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (students.length > 0 && attended.length === students.length && !confettiShownRef.current) {
      confettiShownRef.current = true
      setShowConfetti(true)
      const t = setTimeout(() => setShowConfetti(false), 5500)
      return () => clearTimeout(t)
    } else if (attended.length < students.length) {
      confettiShownRef.current = false
    }
  }, [attended.length, students.length])

  // ── 오늘의 추첨(행운번호) ──────────────────────────────────────
  // 매일 시스템이 자동으로 번호 하나를 뽑는다 — 그 번호와 같은 체크인 등수의 학생이
  // "행운상"을 받는다(사용자 요청, 2026-09-09). 새로고침마다 번호가 바뀌면 안 되므로
  // (같은 날 여러 번 봐도 같은 결과여야 "오늘의" 추첨이라 할 수 있다) Firestore에
  // 하루 한 번만 저장해 두고 그 뒤로는 읽기만 한다. 1~3등은 이미 메달로 따로
  // 표시하므로, 행운번호는 겹치지 않게 4등부터만 뽑는다 — 4명이 안 되면(학생 3명
  // 이하) 추첨 자체를 하지 않는다.
  //
  // 번호는 당첨자가 정해지기 전엔 교사에게도 학생에게도 보여주지 않는다(사용자 요청,
  // 이 화면을 교실 화면에 띄워두는 경우가 있어, 미리 보이면 학생들이 번호에 맞춰
  // 등원 순서를 조작할 수 있다). 당첨자가 정해진 순간 번호와 당첨자를 한 번에
  // 공개한다 — 그 전까지는 luckyBanner 자체가 렌더링되지 않는다.
  const [luckyNumber, setLuckyNumber] = useState(null)
  useEffect(() => {
    if (!schoolId || !eventId || !selectedDate || students.length < 4) { setLuckyNumber(null); return undefined }
    let alive = true
    const ref = doc(db, 'schools', schoolId, 'events', eventId, 'luckyDraws', selectedDate)
    getDoc(ref).then(async (snap) => {
      if (!alive) return
      if (snap.exists()) { setLuckyNumber(snap.data().number); return }
      const number = Math.floor(Math.random() * (students.length - 3)) + 4
      await setDoc(ref, { number, createdAt: serverTimestamp() }).catch(() => {})
      if (alive) setLuckyNumber(number)
    }).catch(() => {})
    return () => { alive = false }
  }, [schoolId, eventId, selectedDate, students.length])

  // 뽑힌 번호와 같은 등수로 이미 체크인한 학생 — 아직 아무도 그 등수에 도달하지
  // 않았으면 undefined(추첨 배너가 "진행 중"으로 표시한다).
  const luckyStudentId = luckyNumber
    ? Object.keys(checkinRankMap).find(id => checkinRankMap[id] === luckyNumber)
    : null
  const luckyBanner = luckyStudentId && (
    <div style={styles.luckyBanner}>
      <span style={{ fontSize: '1.1rem' }}>🎰</span>
      <span>
        오늘의 행운번호는 <strong>{luckyNumber}번</strong>이었습니다 — 출석순서 {luckyNumber}번째{' '}
        <span style={styles.luckyWinnerName}>{attendedMap[luckyStudentId]?.studentName}</span> 학생 당첨! 🍀
      </span>
    </div>
  )

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
        {
          studentId: student.studentId, studentName: student.name,
          grade: student.grade, class: student.class, number: student.number,
          checkedAt: serverTimestamp(), method: 'manual', qrToken: event.qrToken,
          // 1/3 이후 수동 입력은 지각 초과 표시
          ...(event.lateWindowProcessed && { lateOverLimit: true }),
        }
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
      // 반복 이벤트: selectedDate 기준 정오 타임스탬프 사용 (날짜 필터 정합성 보장)
      const checkedAt = event?.isRecurring
        ? (() => { const [y, m, d] = selectedDate.split('-').map(Number); return new Date(y, m - 1, d, 12, 0, 0) })()
        : serverTimestamp()
      await setDoc(
        doc(db, 'schools', schoolId, 'events', eventId, 'attendanceLogs', logId(student.studentId, 'absent')),
        { studentId: student.studentId, studentName: student.name,
          grade: student.grade, class: student.class, number: student.number,
          method: 'absent', reason, checkedAt, qrToken: event.qrToken }
      )
      // draft 유지: 삭제 후 재등록 시 마지막 사유로 pre-fill되어 저장 버튼 활성화 유지
    } finally { setProcessingId(null) }
  }

  const deleteAbsentReason = async (student) => {
    setProcessingId(student.studentId)
    try {
      await deleteDoc(doc(db, 'schools', schoolId, 'events', eventId, 'attendanceLogs', logId(student.studentId, 'absent')))
    } finally { setProcessingId(null) }
  }

  // ── 수업 중 외출 관리 ─────────────────────────────────────────
  const getActiveOuting = (studentId) => {
    const outings = attendedMap[studentId]?.outings || []
    for (let i = outings.length - 1; i >= 0; i--) {
      if (!outings[i].returnAt) return outings[i]
    }
    return null
  }

  const getTotalOutingMs = (studentId) => {
    const outings = attendedMap[studentId]?.outings || []
    return outings.reduce((total, o) => {
      const exit = o.exitAt?.toDate?.() ?? new Date(o.exitAt)
      const ret = o.returnAt ? (o.returnAt?.toDate?.() ?? new Date(o.returnAt)) : now
      return total + Math.max(0, ret - exit)
    }, 0)
  }

  const fmtMs = (ms) => {
    const m = Math.floor(ms / 60000)
    const s = Math.floor((ms % 60000) / 1000)
    return m > 0 ? `${m}분 ${s}초` : `${s}초`
  }

  const startOuting = async (student) => {
    const existing = attendedMap[student.studentId]?.outings || []
    // serverTimestamp()은 배열 내부에 사용 불가 → new Date() 사용
    const newOuting = { id: crypto.randomUUID(), type: outingType, reason: outingReason.trim() || null, exitAt: new Date() }
    setProcessingId(student.studentId)
    try {
      await updateDoc(
        doc(db, 'schools', schoolId, 'events', eventId, 'attendanceLogs', logId(student.studentId)),
        { outings: [...existing, newOuting] }
      )
      setOutingPanel(null)
      setOutingType('보건실')
      setOutingReason('')
    } finally { setProcessingId(null) }
  }

  const endOuting = async (student) => {
    const existing = [...(attendedMap[student.studentId]?.outings || [])]
    let idx = -1
    for (let i = existing.length - 1; i >= 0; i--) {
      if (!existing[i].returnAt) { idx = i; break }
    }
    if (idx < 0) return
    const returnAt = new Date()
    existing[idx] = { ...existing[idx], returnAt }

    // 복귀 후 누적 외출 시간 계산 → 1/3 초과 시 DB에 경고 기록
    const totalMs = existing.reduce((sum, o) => {
      const exit = o.exitAt?.toDate?.() ?? new Date(o.exitAt)
      const ret = o.returnAt ? (o.returnAt?.toDate?.() ?? new Date(o.returnAt)) : returnAt
      return sum + Math.max(0, ret - exit)
    }, 0)
    const isOver = totalMs > classDuration * 60000 / 3

    setProcessingId(student.studentId)
    try {
      await updateDoc(
        doc(db, 'schools', schoolId, 'events', eventId, 'attendanceLogs', logId(student.studentId)),
        {
          outings: existing,
          ...(isOver && !attendedMap[student.studentId]?.outingOverLimit && {
            outingOverLimit: true,
            outingWarnedAt: new Date(),
          }),
        }
      )
    } finally { setProcessingId(null) }
  }

  // 외출 중에 이미 1/3 초과 시 교사가 수동으로 경고 저장
  const saveOutingWarning = async (student) => {
    setProcessingId(student.studentId)
    try {
      await updateDoc(
        doc(db, 'schools', schoolId, 'events', eventId, 'attendanceLogs', logId(student.studentId)),
        { outingOverLimit: true, outingWarnedAt: new Date() }
      )
    } finally { setProcessingId(null) }
  }

  const formatTime = (ts) => {
    if (!ts) return ''
    const d = ts?.toDate?.() ?? new Date(ts)
    return d.toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  // 타겟 타임스탬프까지 남은 시간을 MM:SS 형식으로 반환 (경과 시 null)
  const fmtCountdown = (target) => {
    if (!target) return null
    const t = target?.toDate?.() ?? new Date(target)
    const ms = t - now
    if (ms <= 0) return null
    const totalSec = Math.floor(ms / 1000)
    const min = Math.floor(totalSec / 60)
    const sec = totalSec % 60
    return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }

  // ── 라이브 세션 (수업/방과후/행사/기타) ────────────────────────
  const startLiveSession = async () => {
    const token = crypto.randomUUID()
    const openedAt = new Date()
    const classDurMs = classDuration * 60 * 1000
    const lateCutoff = new Date(openedAt.getTime() + classDurMs / 3)
    const closesAt = new Date(openedAt.getTime() + classDurMs)

    await updateDoc(doc(db, 'schools', schoolId, 'events', eventId), {
      liveToken: token,
      liveOpenedAt: openedAt,
      liveLateCutoff: lateCutoff,
      liveClosesAt: closesAt,
      classDuration,
      lateWindowProcessed: false,
    })
    // onSnapshot이 event 상태 자동 업데이트
  }

  // 교사가 0~1/3 구간에서 마감 후 재오픈
  const reopenLiveSession = async () => {
    const token = crypto.randomUUID()
    await updateDoc(doc(db, 'schools', schoolId, 'events', eventId), { liveToken: token })
    // liveOpenedAt, liveLateCutoff, liveClosesAt은 유지
  }

  const closeLiveSession = async () => {
    // 출석 마감 시 미복귀 외출 자동 마감
    const closeAt = new Date()
    const openOutingStudents = attended.filter(s => getActiveOuting(s.studentId))
    if (openOutingStudents.length > 0) {
      await Promise.all(openOutingStudents.map(async (s) => {
        const existing = [...(attendedMap[s.studentId]?.outings || [])]
        let idx = -1
        for (let i = existing.length - 1; i >= 0; i--) {
          if (!existing[i].returnAt) { idx = i; break }
        }
        if (idx < 0) return
        existing[idx] = { ...existing[idx], returnAt: closeAt }
        const totalMs = existing.reduce((sum, o) => {
          const exit = o.exitAt?.toDate?.() ?? new Date(o.exitAt)
          const ret = o.returnAt ? (o.returnAt?.toDate?.() ?? new Date(o.returnAt)) : closeAt
          return sum + Math.max(0, ret - exit)
        }, 0)
        const isOver = totalMs > classDuration * 60000 / 3
        await updateDoc(
          doc(db, 'schools', schoolId, 'events', eventId, 'attendanceLogs', logId(s.studentId)),
          {
            outings: existing,
            ...(isOver && !attendedMap[s.studentId]?.outingOverLimit && {
              outingOverLimit: true, outingWarnedAt: closeAt,
            }),
          }
        )
      }))
    }
    await updateDoc(doc(db, 'schools', schoolId, 'events', eventId), { liveToken: null })
    // onSnapshot이 event 상태 자동 업데이트
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

    // 전날 세션이 남아있으면 즉시 Phase 1/5(시작 전)로 취급 (useEffect 초기화 대기 중)
    const liveOpenedAt = event.liveOpenedAt?.toDate?.() ?? (event.liveOpenedAt ? new Date(event.liveOpenedAt) : null)
    const isLiveFromToday = !liveOpenedAt || (() => {
      const d = liveOpenedAt
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` === todayStr()
    })()

    const cutdownTocut = fmtCountdown(event.liveLateCutoff)
    const cutdownToEnd = fmtCountdown(event.liveClosesAt)

    // Phase 2: QR 활성
    if (event.liveToken && isLiveFromToday) {
      return (
        <>
          <div style={styles.liveActiveBadge}>● 출석 진행 중</div>
          <QRDisplay eventName={event.name} checkinUrl={liveCheckinUrl} />
          <button onClick={closeLiveSession} style={styles.closeSessionBtn}>⏹ 출석 마감</button>
        </>
      )
    }

    // Phase 1/5: 세션 미시작 or 완전 종료
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

  // ── 출석 패널 내용 ────────────────────────────────────────────
  // 모바일·데스크톱이 각자 따로 들고 있던 거의 같은 목록을 하나로 합쳤다 — 학생 그룹이
  // 없을 때의 대체 표시(원본 로그만 나열)는 예전엔 데스크톱에만 있었는데, 이제 둘 다
  // 같은 걸 본다.
  const classDurRow = (
    <div style={styles.classDurRow}>
      <span style={styles.classDurLabel}>수업시간</span>
      {[50, 45, 40, 35].map(d => (
        <button key={d} onClick={() => setClassDuration(d)}
          style={{ ...styles.classDurBtn, ...(classDuration === d ? styles.classDurBtnActive : {}) }}>
          {d}분
        </button>
      ))}
    </div>
  )

  const AttendedPanel = () => {
    if (!hasGroup) {
      const noGroupLogs = filteredLogs.filter(l => l.method !== 'absent')
        .sort((a, b) => (checkinRankMap[a.studentId] ?? 0) - (checkinRankMap[b.studentId] ?? 0))
      return noGroupLogs.length === 0
        ? <p style={styles.empty}>출석 기록이 없습니다.</p>
        : noGroupLogs.map(l => {
            const rank = checkinRankMap[l.studentId]
            return (
              <div key={l.id} style={styles.studentRow}>
                <div style={styles.studentInfo}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    {rank && rank <= 3 && <span style={{ fontSize: '1rem', lineHeight: 1 }}>{MEDALS[rank]}</span>}
                    <span style={styles.studentName}>{l.studentName}</span>
                    {rank && rank <= 3 && <span style={rankBadgeStyle(rank)}>{rank}등</span>}
                    {rank && rank === luckyNumber && <span style={luckyBadgeStyle}>🍀 행운상</span>}
                  </div>
                  <span style={styles.studentIdText}>{l.grade}학년 {l.class}반 {l.number}번</span>
                </div>
                <span style={styles.timeText}>{formatTime(l.checkedAt)}</span>
              </div>
            )
          })
    }
    if (attended.length === 0) return <p style={styles.empty}>아직 출석한 학생이 없습니다.</p>
    return attended.map(s => {
      const log = attendedMap[s.studentId]
      const activeOuting = getActiveOuting(s.studentId)
      const totalMs = getTotalOutingMs(s.studentId)
      const isOver = totalMs > classDuration * 60000 / 3
      const rank = checkinRankMap[s.studentId]
      return (
        <div key={s.studentId}>
          <div style={styles.studentRow}>
            <StudentInfo student={s} rank={rank} isLucky={rank === luckyNumber} />
            <div style={styles.logInfo}>
              <span style={{ ...styles.methodBadge, backgroundColor: log?.method === 'manual' ? '#fff3e0' : '#e8f5e9', color: log?.method === 'manual' ? '#e65100' : '#2e7d32' }}>{log?.method === 'manual' ? '수동' : 'QR'}</span>
              {hasLateCheck && log?.late && <span style={styles.lateBadge}>지각</span>}
              <span style={styles.timeText}>{formatTime(log?.checkedAt)}</span>
              {activeOuting && (
                <span style={styles.outingActiveBadge}>
                  🚶 {fmtMs(now - (activeOuting.exitAt?.toDate?.() ?? new Date(activeOuting.exitAt)))}
                </span>
              )}
              {!activeOuting && totalMs > 0 && (
                <span style={log?.outingOverLimit ? styles.outingWarnBadge : isOver ? styles.outingWarnBadge : styles.outingDoneBadge}>
                  {log?.outingOverLimit ? '⚠기록됨' : isOver ? '⚠' : '✓'} {fmtMs(totalMs)}
                </span>
              )}
              {isOver && !log?.outingOverLimit && (
                <button onClick={() => saveOutingWarning(s)} disabled={processingId === s.studentId} style={styles.outingWarnSaveBtn}>⚠저장</button>
              )}
              <button onClick={() => cancelCheckin(s)} disabled={processingId === s.studentId} style={styles.cancelBtn}>취소</button>
              {activeOuting
                ? <button onClick={() => endOuting(s)} disabled={processingId === s.studentId} style={styles.returnBtn}>↙복귀</button>
                : <button onClick={() => setOutingPanel(p => p === s.studentId ? null : s.studentId)} style={styles.outingBtn}>↗외출</button>
              }
            </div>
          </div>
          {outingPanel === s.studentId && !activeOuting && (
            <div style={styles.outingPanelInline}>
              {['보건실', '화장실', '기타'].map(t => (
                <button key={t} onClick={() => setOutingType(t)}
                  style={{ ...styles.outingTypeBtn, ...(outingType === t ? styles.outingTypeBtnActive : {}) }}>
                  {t}
                </button>
              ))}
              <input value={outingReason} onChange={e => setOutingReason(e.target.value)}
                placeholder="메모 (선택)" style={styles.outingReasonInput} />
              <button onClick={() => startOuting(s)} disabled={processingId === s.studentId} style={styles.outingConfirmBtn}>출발</button>
              <button onClick={() => setOutingPanel(null)} style={styles.outingCancelSmBtn}>✕</button>
            </div>
          )}
        </div>
      )
    })
  }

  // QR·출석·미출석을 한 화면에 3분할해서 동시에 보여준다 — 슬라이드로 하나씩 넘겨보게
  // 했더니 오히려 불편하다는 피드백(사용자 요청, 2026-09-09: "3가지를 슬라이드 방식이
  // 아니고, 한 화면에 한번에 보이도록"). 칸마다 내용이 길어지면 그 칸만 스크롤된다.
  // 모바일·데스크톱 모두 같은 3분할 레이아웃을 쓴다.
  const panelsGrid = (
    <ThreeColumnPanels
      titles={['QR 출석', `✅ 출석 ${attended.length}명`, `❌ 미출석 ${absent.length}명`]}
      colors={[undefined, '#2e7d32', '#c62828']}
      panels={[
        <QRPanelContent key="qr" />,
        <>{classDurRow}<AttendedPanel /></>,
        hasGroup ? <AbsentPanel /> : <p style={styles.empty}>학생 그룹이 연결되지 않았습니다.</p>,
      ]}
    />
  )

  // 이벤트에서 허용된 요일 추출
  const allowedDays = event?.schedules?.length > 0
    ? [...new Set(event.schedules.map(s => s.dayOfWeek))]
    : null

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
              <button
                onClick={() => setShowCalendar(!showCalendar)}
                style={styles.dateSelectorBtn}
              >
                📅 {selectedDate}
              </button>
              {showCalendar && (
                <div style={styles.calendarPopup}>
                  <Calendar
                    selectedDate={selectedDate}
                    onSelectDate={(date) => {
                      setSelectedDate(date)
                      setShowCalendar(false)
                    }}
                    allowedDays={allowedDays}
                    isMobile={true}
                  />
                </div>
              )}
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
        {luckyBanner}
        {panelsGrid}
        {showConfetti && <ConfettiCelebration onDone={() => setShowConfetti(false)} />}
      </Layout>
    )
  }

  // ── 데스크탑 ──────────────────────────────────────────────────
  return (
    <Layout wide>
      {/* 통계 바 + 달력 좌우 배치 */}
      {event.isRecurring && hasGroup && (
        <div style={styles.calendarStatsRow}>
          <div style={styles.leftSection}>
            {/* 헤더 */}
            <div style={styles.headerInline}>
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
            </div>
            {/* 통계 바 */}
            <div style={styles.statsBarCompact}>
              <StatBox label="전체" value={students.length} color="#555" />
              <StatBox label="출석" value={attended.length} color="#2e7d32" />
              {hasLateCheck && <StatBox label="지각" value={lateCount} color="#e65100" />}
              <StatBox label="미출석" value={absent.length} color="#c62828" />
              <StatBox label="사유등록" value={Object.keys(absentLogMap).length} color="#e65100" />
              {rate !== null && <StatBox label="출석률" value={`${rate}%`} color="#1a73e8" large />}
              <div style={styles.progressWrap}><div style={{ ...styles.progressBar, width: `${rate ?? 0}%` }} /></div>
            </div>
          </div>
          <div style={styles.calendarDesktop}>
            <Calendar
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              allowedDays={allowedDays}
              isMobile={false}
              showTwoMonths={true}
            />
          </div>
        </div>
      )}
      {/* 기타 케이스들 */}
      {(!event.isRecurring || !hasGroup) && (
        <>
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
          </div>
          {event.isRecurring && !hasGroup && (
            <div style={styles.calendarDesktopFullWidth}>
              <Calendar
                selectedDate={selectedDate}
                onSelectDate={setSelectedDate}
                allowedDays={allowedDays}
                isMobile={false}
              />
            </div>
          )}
          {!event.isRecurring && hasGroup && (
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
        </>
      )}

      {luckyBanner}
      {panelsGrid}
      {showConfetti && <ConfettiCelebration onDone={() => setShowConfetti(false)} />}
    </Layout>
  )
}

// ── 전원 출석 축하 폭죽 ──────────────────────────────────────────
function ConfettiCelebration({ onDone }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    const ctx = canvas.getContext('2d')
    const COLORS = ['#f44336','#e91e63','#9c27b0','#3f51b5','#2196f3','#4caf50','#ffeb3b','#ff9800','#ff5722','#00bcd4']
    const particles = []

    const addBurst = (x, y) => {
      for (let i = 0; i < 70; i++) {
        const angle = (Math.PI * 2 * i) / 70
        const speed = Math.random() * 10 + 4
        particles.push({
          x, y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 6,
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
          size: Math.random() * 6 + 3,
          life: 1,
          decay: Math.random() * 0.016 + 0.008,
          rotation: Math.random() * 360,
          rotSpeed: (Math.random() - 0.5) * 12,
          rect: Math.random() > 0.4,
        })
      }
    }

    const W = canvas.width, H = canvas.height
    addBurst(W * 0.5, H * 0.75)
    const t1 = setTimeout(() => addBurst(W * 0.2, H * 0.8), 400)
    const t2 = setTimeout(() => addBurst(W * 0.8, H * 0.8), 700)
    const t3 = setTimeout(() => addBurst(W * 0.35, H * 0.7), 1100)
    const t4 = setTimeout(() => addBurst(W * 0.65, H * 0.7), 1400)

    for (let i = 0; i < 90; i++) {
      particles.push({
        x: Math.random() * W, y: -Math.random() * H * 0.5,
        vx: (Math.random() - 0.5) * 2.5, vy: Math.random() * 2 + 1.5,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        size: Math.random() * 9 + 4, life: 1, decay: 0,
        rotation: Math.random() * 360, rotSpeed: (Math.random() - 0.5) * 7,
        rect: true, falling: true,
      })
    }

    let animId
    const draw = () => {
      ctx.clearRect(0, 0, W, H)
      let alive = 0
      for (const p of particles) {
        if (!p.falling && p.life <= 0) continue
        if (p.falling && p.y > H + 20) continue
        alive++
        p.vx *= 0.99
        p.vy += 0.13
        p.x += p.vx; p.y += p.vy
        p.rotation += p.rotSpeed
        if (!p.falling) p.life -= p.decay
        ctx.save()
        ctx.globalAlpha = p.falling ? 0.85 : Math.max(0, p.life)
        ctx.fillStyle = p.color
        ctx.translate(p.x, p.y)
        ctx.rotate((p.rotation * Math.PI) / 180)
        if (p.rect) ctx.fillRect(-p.size / 2, -p.size * 0.22, p.size, p.size * 0.44)
        else { ctx.beginPath(); ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2); ctx.fill() }
        ctx.restore()
      }
      if (alive > 0) animId = requestAnimationFrame(draw)
      else onDone?.()
    }
    animId = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(animId)
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4)
    }
  }, [])

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9999 }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
      <div style={{
        position: 'absolute', top: '13%', left: '50%', transform: 'translateX(-50%)',
        backgroundColor: 'rgba(255,255,255,0.96)', borderRadius: '20px',
        padding: '1.25rem 2.75rem', boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
        textAlign: 'center', border: '2px solid #ffd54f', whiteSpace: 'nowrap',
      }}>
        <div style={{ fontSize: '2.5rem', lineHeight: 1, marginBottom: '0.35rem' }}>🎉</div>
        <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1a73e8', letterSpacing: '-0.01em' }}>전원 출석 완료!</div>
        <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.3rem' }}>모든 학생이 출석했습니다 🏆</div>
      </div>
    </div>
  )
}

// 슬라이드 캐러셀 — QR·출석·미출석 3개 구역을 화면 하나에서 넘겨보게 한다(3열 드래그
// 리사이즈 대신, 사용자 요청 2026-09-09 — "3개 구역을 별도로 슬라이드 할 수 있도록").
// 탭(제목) 클릭·좌우 화살표·터치 스와이프 세 가지를 다 지원해서 마우스로 쓰는 교사도,
// 태블릿/키오스크로 화면만 띄워 놓고 보는 경우도 같은 방식으로 넘길 수 있다. 탭 글자
// 자체가 각 패널의 제목(참여자 수 포함)을 대신하므로 패널 안에는 따로 제목을 두지 않는다.
// QR·출석·미출석을 나란히 3분할해서 동시에 보여준다 — 칸마다 제목을 고정해 두고
// 내용만 그 칸 안에서 스크롤된다(사용자 요청, 2026-09-09).
function ThreeColumnPanels({ panels, titles, colors = [] }) {
  return (
    <div style={styles.threeCol}>
      {panels.map((p, i) => (
        <div key={i} style={styles.threeColPanel}>
          <h3 style={{ ...styles.threeColTitle, color: colors[i] || '#333' }}>{titles[i]}</h3>
          <div style={styles.threeColBody}>{p}</div>
        </div>
      ))}
    </div>
  )
}

const MEDALS = { 1: '🥇', 2: '🥈', 3: '🥉' }
const rankBadgeStyle = (rank) => ({
  fontSize: '0.68rem', fontWeight: 700,
  color: rank === 1 ? '#d97706' : rank === 2 ? '#6b7280' : '#b45309',
  backgroundColor: rank === 1 ? '#fef3c7' : rank === 2 ? '#f3f4f6' : '#fef9e7',
  padding: '0.1rem 0.3rem', borderRadius: '4px',
})
const luckyBadgeStyle = {
  fontSize: '0.68rem', fontWeight: 700, color: '#15803d', backgroundColor: '#dcfce7',
  padding: '0.1rem 0.3rem', borderRadius: '4px',
}

function StudentInfo({ student: s, rank, isLucky }) {
  return (
    <div style={styles.studentInfo}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
        {rank && rank <= 3 && <span style={{ fontSize: '1rem', lineHeight: 1 }}>{MEDALS[rank]}</span>}
        <span style={styles.studentName}>{s.name}</span>
        {rank && rank <= 3 && <span style={rankBadgeStyle(rank)}>{rank}등</span>}
        {isLucky && <span style={luckyBadgeStyle}>🍀 행운상</span>}
      </div>
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

  // 달력 - 모바일 (토글)
  dateSelector: { position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem' },
  dateSelectorBtn: {
    padding: '0.5rem 1rem',
    backgroundColor: '#fff',
    border: '1px solid #ddd',
    borderRadius: '8px',
    fontSize: '0.9rem',
    cursor: 'pointer',
    fontWeight: 600,
    color: '#333',
  },
  calendarPopup: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: '0.5rem',
    backgroundColor: '#fff',
    border: '1px solid #ddd',
    borderRadius: '10px',
    padding: '1rem',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    zIndex: 100,
    minWidth: '320px',
    maxHeight: '400px',
    overflowY: 'auto',
  },

  // 달력 + 통계 좌우 배치
  calendarStatsRow: {
    display: 'flex',
    gap: '1rem',
    marginBottom: '1rem',
    alignItems: 'flex-end',
  },

  // 왼쪽 섹션 (헤더 + 통계)
  leftSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    flex: 1,
  },

  // 인라인 헤더
  headerInline: {
    backgroundColor: '#fff',
    borderRadius: '8px',
    padding: '0.75rem 1rem',
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
  },

  // 컴팩트 통계 바
  statsBarCompact: {
    display: 'flex',
    alignItems: 'center',
    gap: '1.25rem',
    backgroundColor: '#fff',
    borderRadius: '10px',
    padding: '0.75rem 1rem',
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
    flexWrap: 'wrap',
  },

  // 달력 - 데스크탑 (항상 표시)
  calendarDesktop: {
    backgroundColor: '#fff',
    border: '1px solid #e0e0e0',
    borderRadius: '8px',
    padding: '0.5rem 0.75rem',
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
    minWidth: '600px',
    flexShrink: 0,
  },

  // 달력 전체 너비 (그룹 없을 때)
  calendarDesktopFullWidth: {
    backgroundColor: '#fff',
    border: '1px solid #e0e0e0',
    borderRadius: '8px',
    padding: '0.5rem 0.75rem',
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
    marginBottom: '1rem',
    maxWidth: '320px',
  },

  // 통계 바
  statsBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '1.25rem',
    backgroundColor: '#fff',
    borderRadius: '10px',
    padding: '1rem 1.5rem',
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
    flexWrap: 'wrap',
    flex: 1,
  },
  progressWrap: { flex: 1, height: '8px', backgroundColor: '#eee', borderRadius: '4px', minWidth: '80px' },
  progressBar: { height: '100%', backgroundColor: '#1a73e8', borderRadius: '4px', transition: 'width 0.4s' },
  noGroupNote: { color: '#888', fontSize: '0.85rem', marginBottom: '1rem' },

  // QR·출석·미출석 3분할 — 한 화면에 동시에 보여주고 칸마다 따로 스크롤된다.
  threeCol: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '1rem', alignItems: 'start' },
  threeColPanel: {
    backgroundColor: '#fff', borderRadius: '10px', padding: '1rem 1.25rem',
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)', boxSizing: 'border-box',
    display: 'flex', flexDirection: 'column', minWidth: 0,
  },
  threeColTitle: { fontSize: '0.9rem', fontWeight: 700, margin: '0 0 0.75rem', textAlign: 'center' },
  threeColBody: { overflowY: 'auto', maxHeight: '70vh' },

  // 오늘의 추첨(행운번호) 배너
  luckyBanner: {
    display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap',
    backgroundColor: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '10px',
    padding: '0.6rem 1rem', marginBottom: '0.75rem', fontSize: '0.85rem', color: '#9a3412',
  },
  luckyWinnerName: { fontWeight: 700, color: '#15803d' },

  empty: { color: '#aaa', fontSize: '0.85rem', textAlign: 'center', padding: '1rem 0' },

  // 학생 행
  // flexWrap: 'wrap' — 3분할이라 칸 폭이 좁을 때(특히 모바일) 이름 옆 배지·버튼이
  // 자리를 다 차지하면 이름 자체가 눌려 글자 단위로 줄바꿈됐다(사용자 확인,
  // 2026-09-09). 대신 배지·버튼이 다음 줄로 내려가게 한다.
  studentRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.3rem', padding: '0.5rem 0', borderBottom: '1px solid #f5f5f5' },
  studentInfo: { display: 'flex', flexDirection: 'column', gap: '0.1rem' },
  studentName: { fontSize: '0.9rem', fontWeight: 600, whiteSpace: 'nowrap' },
  studentIdText: { fontSize: '0.75rem', color: '#888', whiteSpace: 'nowrap' },
  logInfo: { display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' },
  methodBadge: { fontSize: '0.72rem', padding: '0.15rem 0.4rem', borderRadius: '8px', fontWeight: 600 },
  lateBadge: { fontSize: '0.72rem', padding: '0.15rem 0.4rem', borderRadius: '8px', fontWeight: 600, backgroundColor: '#fff3e0', color: '#e65100' },
  timeText: { fontSize: '0.78rem', color: '#888' },
  cancelBtn: { padding: '0.25rem 0.5rem', backgroundColor: '#fff', color: '#888', border: '1px solid #ddd', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem' },

  // 수업 중 외출 관리
  classDurRow: { display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.5rem', flexWrap: 'wrap' },
  classDurLabel: { fontSize: '0.75rem', color: '#888', marginRight: '0.2rem' },
  classDurBtn: { padding: '0.15rem 0.5rem', border: '1px solid #ddd', borderRadius: '999px', cursor: 'pointer', fontSize: '0.72rem', backgroundColor: '#fff', color: '#666' },
  classDurBtnActive: { backgroundColor: '#1a73e8', color: '#fff', borderColor: '#1a73e8' },
  outingBtn: { padding: '0.25rem 0.5rem', backgroundColor: '#fff', color: '#f57c00', border: '1px solid #f57c00', borderRadius: '6px', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600, whiteSpace: 'nowrap' },
  returnBtn: { padding: '0.25rem 0.5rem', backgroundColor: '#e8f5e9', color: '#2e7d32', border: '1px solid #a5d6a7', borderRadius: '6px', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600, whiteSpace: 'nowrap' },
  outingActiveBadge: { fontSize: '0.72rem', backgroundColor: '#fff3e0', color: '#e65100', padding: '0.15rem 0.45rem', borderRadius: '999px', fontWeight: 600 },
  outingDoneBadge: { fontSize: '0.72rem', backgroundColor: '#f5f5f5', color: '#888', padding: '0.15rem 0.45rem', borderRadius: '999px' },
  outingWarnBadge: { fontSize: '0.72rem', backgroundColor: '#ffebee', color: '#c62828', padding: '0.15rem 0.45rem', borderRadius: '999px', fontWeight: 700 },
  outingPanelInline: { display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.4rem 0.5rem 0.5rem 0.5rem', backgroundColor: '#fffde7', borderRadius: '0 0 6px 6px', flexWrap: 'wrap', marginBottom: '0.25rem' },
  outingTypeBtn: { padding: '0.2rem 0.55rem', border: '1px solid #ddd', borderRadius: '999px', cursor: 'pointer', fontSize: '0.75rem', backgroundColor: '#fff', color: '#555' },
  outingTypeBtnActive: { backgroundColor: '#f57c00', color: '#fff', borderColor: '#f57c00' },
  outingReasonInput: { flex: 1, minWidth: '80px', padding: '0.2rem 0.5rem', border: '1px solid #ddd', borderRadius: '6px', fontSize: '0.78rem' },
  outingConfirmBtn: { padding: '0.2rem 0.6rem', backgroundColor: '#f57c00', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 },
  outingCancelSmBtn: { padding: '0.2rem 0.45rem', backgroundColor: '#fff', color: '#aaa', border: '1px solid #ddd', borderRadius: '6px', cursor: 'pointer', fontSize: '0.78rem' },
  outingWarnSaveBtn: { padding: '0.2rem 0.5rem', backgroundColor: '#ffebee', color: '#c62828', border: '1px solid #ef9a9a', borderRadius: '6px', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700 },
  manualBtn: { padding: '0.3rem 0.6rem', backgroundColor: '#1a73e8', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.78rem', whiteSpace: 'nowrap' },

  // 미출석 블록
  absentBlock: { borderBottom: '1px solid #f5f5f5', paddingBottom: '0.75rem', marginBottom: '0.25rem' },
  absentTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.3rem', padding: '0.5rem 0 0.35rem' },
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
  cutoffCountdown: { textAlign: 'center', fontSize: '0.82rem', color: '#e65100', backgroundColor: '#fff3e0', border: '1px solid #ffcc80', borderRadius: '8px', padding: '0.3rem 0.75rem', marginBottom: '0.5rem' },
  sessionPausedBadge: { textAlign: 'center', fontSize: '0.8rem', fontWeight: 700, color: '#e65100', backgroundColor: '#fff3e0', border: '1px solid #ffcc80', borderRadius: '20px', padding: '0.3rem 1rem' },
  lateCutoffBadge: { textAlign: 'center', fontSize: '0.8rem', fontWeight: 700, color: '#c62828', backgroundColor: '#ffebee', border: '1px solid #ef9a9a', borderRadius: '20px', padding: '0.3rem 1rem' },
  closeCountdown: { textAlign: 'center', fontSize: '0.82rem', color: '#555', backgroundColor: '#f5f5f5', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '0.3rem 0.75rem' },
}
