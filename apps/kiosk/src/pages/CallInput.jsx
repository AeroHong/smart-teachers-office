import { useEffect, useState, useCallback, useMemo } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import CircularProgress from '@mui/material/CircularProgress'
import Snackbar from '@mui/material/Snackbar'
import Alert from '@mui/material/Alert'
import { collection, doc, onSnapshot } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '@shared/lib/firebase'
import DeskIcon from '@shared/components/DeskIcon'
import { PRESENCE, effectivePresence } from '@shared/lib/presence'
import { useKiosk } from '../contexts/KioskContext'

const STUDENT_ID_LENGTH = 5   // 학년1 + 반2 + 번호2
const IDLE_RESET_MS = 90000   // 학생이 중간에 자리를 뜬 경우 입력 초기화
const CALL_STRIP_TTL_MS = 10 * 60 * 1000   // 신청 현황 표시는 10분 뒤 자동 삭제

const CALL_STRIP_STYLE = {
  pending:      { label: '신청 중…',        bg: '#fff7ed', border: '#fdba74', fg: '#c2410c' },
  acknowledged: { label: '들어오세요!',      bg: '#ecfdf5', border: '#34d399', fg: '#047857' },
  done:         { label: '완료되었습니다',    bg: '#f1f5f9', border: '#e2e8f0', fg: '#64748b' },
  expired:      { label: '응답이 없습니다',   bg: '#f1f5f9', border: '#e2e8f0', fg: '#94a3b8' },
}

// 자리 배치 카드 크기 — 관리자 편집기(OfficeLayoutEditor.jsx)와 반드시 같은 값이어야
// 관리자가 맞춘 배치가 키오스크에서 그대로 재현된다
const CARD_W_PCT = 19
const CARD_H_PCT = 18

export default function CallInput() {
  const { device } = useKiosk()
  const [teachers, setTeachers] = useState(null)
  const [hasLayout, setHasLayout] = useState(false)
  const [loadError, setLoadError] = useState('')

  const [teacher, setTeacher] = useState(null)
  const [studentId, setStudentId] = useState('')
  const [student, setStudent] = useState(null)
  const [checking, setChecking] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState(null)      // { ok, message }
  const [myCalls, setMyCalls] = useState([])    // 이 기기에서 신청한 호출의 진행 상황

  const [presence, setPresence] = useState({})   // { uid: 'available' | ... }

  useEffect(() => {
    httpsCallable(functions, 'getKioskTeachers')()
      .then(({ data }) => {
        setTeachers(data.teachers || [])
        setHasLayout(!!data.hasLayout)
      })
      .catch(err => setLoadError(err.message || '교사 목록을 불러오지 못했습니다.'))
  }, [])

  // 재실 상태 실시간 구독 — 자리에 계신지 학생이 보고 판단할 수 있도록
  useEffect(() => {
    return onSnapshot(
      collection(db, 'schools', device.schoolId, 'presence'),
      snap => {
        const next = {}
        snap.docs.forEach(d => { next[d.id] = effectivePresence(d.data()) })
        setPresence(next)
      },
      () => {},
    )
  }, [device.schoolId])

  // 입력 상태만 초기화 — 신청 현황(myCalls)은 그대로 남는다
  const reset = useCallback(() => {
    setTeacher(null); setStudentId(''); setStudent(null)
  }, [])

  // 입력하다 만 상태로 방치되면 자동 초기화
  useEffect(() => {
    if (!teacher && !studentId) return
    const t = setTimeout(reset, IDLE_RESET_MS)
    return () => clearTimeout(t)
  }, [teacher, studentId, reset])

  // 신청한 호출의 상태를 실시간 추적 (교사가 확인하면 '들어오세요!'로 바뀜)
  const trackedIds = useMemo(() => myCalls.map(c => c.id).join(','), [myCalls])
  useEffect(() => {
    if (!trackedIds) return
    const unsubs = trackedIds.split(',').map(id =>
      onSnapshot(
        doc(db, 'schools', device.schoolId, 'callRequests', id),
        snap => {
          const status = snap.data()?.status
          if (!status) return
          setMyCalls(prev => prev.map(c => (c.id === id ? { ...c, status } : c)))
        },
        () => {},
      )
    )
    return () => unsubs.forEach(u => u())
  }, [trackedIds, device.schoolId])

  // 10분 지난 신청 현황은 자동으로 지운다
  useEffect(() => {
    const t = setInterval(() => {
      setMyCalls(prev => prev.filter(c => Date.now() - c.submittedAt < CALL_STRIP_TTL_MS))
    }, 5000)
    return () => clearInterval(t)
  }, [])

  // 학번을 다 입력하면 이름 조회 (본인 확인용)
  useEffect(() => {
    if (studentId.length !== STUDENT_ID_LENGTH) { setStudent(null); return }
    let cancelled = false
    setChecking(true)
    httpsCallable(functions, 'lookupStudentName')({ studentId })
      .then(({ data }) => { if (!cancelled) setStudent(data) })
      .catch(() => { if (!cancelled) setStudent({ found: false }) })
      .finally(() => { if (!cancelled) setChecking(false) })
    return () => { cancelled = true }
  }, [studentId])

  // 물리 키보드 입력도 지원
  useEffect(() => {
    const onKey = (e) => {
      if (/^\d$/.test(e.key)) setStudentId(prev => (prev + e.key).slice(0, STUDENT_ID_LENGTH))
      else if (e.key === 'Backspace') setStudentId(prev => prev.slice(0, -1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const submit = async () => {
    if (submitting || !teacher || !student?.found) return
    setSubmitting(true)
    try {
      const { data } = await httpsCallable(functions, 'submitCallRequest')({
        teacherUid: teacher.uid, studentId,
      })
      // 화면을 넘기지 않고 자리표 아래에 진행 상황으로 남긴다
      setMyCalls(prev => [
        ...prev,
        {
          id: data.requestId,
          teacherName: data.teacherName,
          studentName: data.studentName,
          status: 'pending',
          submittedAt: Date.now(),
        },
      ])
      setToast({ ok: true, message: `${data.teacherName} 선생님께 신청하였습니다.` })
      reset()
    } catch (err) {
      setToast({ ok: false, message: err.message || '호출에 실패했습니다.' })
    } finally {
      setSubmitting(false)
    }
  }

  if (loadError) return <FullScreen icon="⚠️" title="교사 목록을 불러오지 못했습니다" sub={loadError} />
  if (teachers === null) return <FullScreen spinner />

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: '#f8fafc', overflow: 'hidden' }}>
      <Box sx={{
        px: 3, py: 1.5, bgcolor: '#fff', borderBottom: '1px solid #e8eaed',
        display: 'flex', alignItems: 'baseline', gap: 1.5, flexShrink: 0,
      }}>
        <Typography fontWeight={800} fontSize="2rem" lineHeight={1.2} color="#111827">
          {device.office}
        </Typography>
        <Typography fontWeight={700} fontSize="1rem" sx={{ color: '#6366f1' }}>
          선생님 호출
        </Typography>
      </Box>

      <Box sx={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* ── 왼쪽: 선생님 자리 배치 + 신청 현황 ── */}
        <Box sx={{ flex: 1, p: 2.5, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <Typography fontSize="1.05rem" fontWeight={700} mb={1.5}>
            1. 찾는 선생님을 선택하세요
          </Typography>

          <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            {teachers.length === 0 ? (
              <Typography color="text.secondary">
                이 사무실에 배정된 선생님이 없습니다. 관리자에게 문의하세요.
              </Typography>
            ) : hasLayout ? (
              <SeatMap teachers={teachers} presence={presence} selected={teacher} onSelect={setTeacher} />
            ) : (
              <TeacherGrid teachers={teachers} presence={presence} selected={teacher} onSelect={setTeacher} />
            )}
          </Box>

          {myCalls.length > 0 && (
            <Box sx={{ flexShrink: 0, mt: 1.5, display: 'flex', flexDirection: 'column', gap: 1, maxHeight: 190, overflowY: 'auto' }}>
              {myCalls.map(c => <CallStatusStrip key={c.id} call={c} />)}
            </Box>
          )}
        </Box>

        {/* ── 오른쪽: 학번 입력 ── */}
        <Box sx={{
          width: 430, flexShrink: 0, bgcolor: '#fff', borderLeft: '1px solid #e8eaed',
          p: 2.5, display: 'flex', flexDirection: 'column', overflowY: 'auto',
        }}>
          <Typography fontSize="1.05rem" fontWeight={700} mb={1.5}>
            2. 본인 학번을 입력하세요
          </Typography>

          <Box sx={{
            px: 2, py: 1.2, mb: 2, borderRadius: 2,
            bgcolor: teacher ? '#eef2ff' : '#f1f5f9',
            border: '1px solid', borderColor: teacher ? '#c7d2fe' : '#e2e8f0',
          }}>
            {teacher ? (
              <>
                <Typography fontSize="0.75rem" color="text.secondary">호출할 선생님</Typography>
                <Typography fontSize="1.25rem" fontWeight={800} sx={{ lineHeight: 1.3 }}>
                  {teacher.name}
                  {teacher.positionLabel && (
                    <Typography component="span" fontSize="0.85rem" color="primary.main" ml={0.8}>
                      {teacher.positionLabel}
                    </Typography>
                  )}
                </Typography>
                {teacher.subject && (
                  <Typography fontSize="0.8rem" color="text.secondary">{teacher.subject}</Typography>
                )}
                <Box sx={{ mt: 0.6 }}>
                  <PresenceDot status={presence[teacher.uid] || 'unknown'} withLabel />
                </Box>
              </>
            ) : (
              <Typography color="text.secondary" fontSize="0.9rem">
                왼쪽에서 선생님을 먼저 선택하세요
              </Typography>
            )}
          </Box>

          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', mb: 1.5 }}>
            {Array.from({ length: STUDENT_ID_LENGTH }).map((_, i) => (
              <Box key={i} sx={{
                width: 52, height: 62, borderRadius: 2,
                border: '2px solid', borderColor: studentId[i] ? '#4f46e5' : '#e2e8f0',
                bgcolor: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.9rem', fontWeight: 700,
              }}>
                {studentId[i] || ''}
              </Box>
            ))}
          </Box>

          <Box sx={{ minHeight: 52, textAlign: 'center', mb: 1 }}>
            {checking && <CircularProgress size={24} />}
            {!checking && student?.found && (
              <>
                <Typography fontSize="1.3rem" fontWeight={800} color="primary.main" sx={{ lineHeight: 1.3 }}>
                  {student.name}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {student.grade}학년 {student.classNo}반 {student.number}번
                </Typography>
              </>
            )}
            {!checking && student && !student.found && (
              <Typography color="error" fontWeight={600}>학번을 찾을 수 없습니다</Typography>
            )}
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, mb: 1.5 }}>
            {['1','2','3','4','5','6','7','8','9'].map(d => (
              <KeypadButton key={d} onClick={() => setStudentId(p => (p + d).slice(0, STUDENT_ID_LENGTH))}>{d}</KeypadButton>
            ))}
            <KeypadButton muted onClick={() => setStudentId('')}>지움</KeypadButton>
            <KeypadButton onClick={() => setStudentId(p => (p + '0').slice(0, STUDENT_ID_LENGTH))}>0</KeypadButton>
            <KeypadButton muted onClick={() => setStudentId(p => p.slice(0, -1))}>←</KeypadButton>
          </Box>

          <Button
            variant="contained"
            size="large"
            disabled={!teacher || !student?.found || submitting}
            onClick={submit}
            sx={{ py: 1.5, fontSize: '1.1rem', mt: 'auto' }}
          >
            {submitting ? '신청 중...' : '호출하기'}
          </Button>
        </Box>
      </Box>

      <Snackbar
        open={!!toast}
        autoHideDuration={3500}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {toast ? (
          <Alert severity={toast.ok ? 'success' : 'error'} variant="filled" sx={{ fontSize: '1rem' }}>
            {toast.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  )
}

// ── 신청 현황 (자리표 아래) ───────────────────────────────────
function CallStatusStrip({ call }) {
  const s = CALL_STRIP_STYLE[call.status] || CALL_STRIP_STYLE.pending
  const isReady = call.status === 'acknowledged'
  return (
    <Box sx={{
      display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1.2,
      borderRadius: 2, bgcolor: s.bg, border: '2px solid', borderColor: s.border,
    }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography fontSize="1rem" fontWeight={700} noWrap>
          {call.teacherName} 선생님
        </Typography>
        <Typography fontSize="0.8rem" color="text.secondary" noWrap>
          {call.studentName} 학생 신청
        </Typography>
      </Box>
      <Typography
        fontSize={isReady ? '1.35rem' : '1.05rem'}
        fontWeight={800}
        sx={{ color: s.fg, flexShrink: 0 }}
      >
        {s.label}
      </Typography>
    </Box>
  )
}

// 책상 카드 — 평소엔 담백하게 놓여 있다가 손을 대면 살짝 떠오른다
const deskCardSx = (active) => ({
  boxSizing: 'border-box',
  display: 'flex',
  alignItems: 'center',
  gap: 1.2,
  px: 1.4,
  py: 1,
  cursor: 'pointer',
  borderRadius: '14px',
  overflow: 'hidden',
  bgcolor: active ? '#f5f4ff' : '#fff',
  border: '1px solid',
  borderColor: active ? '#c7d2fe' : '#ececf1',
  boxShadow: active ? '0 8px 20px rgba(79,70,229,.18)' : 'none',
  transform: active ? 'translateY(-2px)' : 'none',
  transition: 'transform .18s cubic-bezier(.2,.8,.3,1), box-shadow .18s ease, border-color .18s ease, background-color .18s ease',
  '&:hover': {
    transform: 'translateY(-4px)',
    boxShadow: active ? '0 12px 26px rgba(79,70,229,.22)' : '0 12px 26px rgba(15,23,42,.13)',
    borderColor: active ? '#a5b4fc' : 'transparent',
    zIndex: 5,
  },
  '&:active': { transform: 'translateY(-1px)' },
})

// 재실 상태 점 — 카드에 작게, 이름 옆에
function PresenceDot({ status, withLabel }) {
  const p = PRESENCE[status] || PRESENCE.unknown
  if (status === 'unknown' && !withLabel) return null
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
      <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: p.color, flexShrink: 0 }} />
      {withLabel && (
        <Typography fontSize="0.78rem" fontWeight={700} sx={{ color: p.color }}>{p.label}</Typography>
      )}
    </Box>
  )
}

function DeskCardText({ teacher, status }) {
  return (
    <Box sx={{ minWidth: 0, flex: 1 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.7, minWidth: 0 }}>
        <Typography fontWeight={700} fontSize="1rem" lineHeight={1.3} color="#111827" noWrap>
          {teacher.name}
        </Typography>
        {status && <PresenceDot status={status} />}
      </Box>
      {teacher.positionLabel && (
        <Typography fontSize="0.75rem" fontWeight={600} lineHeight={1.35} sx={{ color: '#6366f1' }} noWrap>
          {teacher.positionLabel}
        </Typography>
      )}
      {teacher.subject && (
        <Typography fontSize="0.75rem" lineHeight={1.35} sx={{ color: '#8a94a6' }} noWrap>
          {teacher.subject}
        </Typography>
      )}
    </Box>
  )
}

// ── 실제 사무실 배치대로 카드 표시 ────────────────────────────
function SeatMap({ teachers, presence, selected, onSelect }) {
  const placed = teachers.filter(t => t.seat)
  const unplaced = teachers.filter(t => !t.seat)

  return (
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <Box sx={{
        position: 'relative', width: '100%', aspectRatio: '16 / 9',
        bgcolor: '#fff', border: '1px solid #e2e8f0', borderRadius: 3,
        backgroundImage: 'radial-gradient(#eef2f7 1px, transparent 1px)',
        backgroundSize: '24px 24px',
      }}>
        {placed.map(t => (
          <Box
            key={t.uid}
            onClick={() => onSelect(t)}
            sx={{
              ...deskCardSx(selected?.uid === t.uid),
              position: 'absolute',
              left: `${t.seat.x * 100}%`,
              top: `${t.seat.y * 100}%`,
              width: `${CARD_W_PCT}%`,
              height: `${CARD_H_PCT}%`,
            }}
          >
            <DeskIcon size={38} active={selected?.uid === t.uid} />
            <DeskCardText teacher={t} status={presence?.[t.uid]} />
          </Box>
        ))}
      </Box>

      {unplaced.length > 0 && (
        <Box sx={{ mt: 1.5 }}>
          <Typography fontSize="0.78rem" color="text.secondary" mb={0.8}>자리 미지정</Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {unplaced.map(t => (
              <TeacherChip key={t.uid} teacher={t} selected={selected?.uid === t.uid} onSelect={onSelect} />
            ))}
          </Box>
        </Box>
      )}
    </Box>
  )
}

// ── 배치 정보가 없을 때의 기본 격자 ───────────────────────────
function TeacherGrid({ teachers, presence, selected, onSelect }) {
  return (
    <Box sx={{
      flex: 1, overflowY: 'auto', display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(168px, 1fr))',
      gap: 1.5, alignContent: 'start',
    }}>
      {teachers.map(t => (
        <Box
          key={t.uid}
          onClick={() => onSelect(t)}
          sx={{ ...deskCardSx(selected?.uid === t.uid), minHeight: 76 }}
        >
          <DeskIcon size={38} active={selected?.uid === t.uid} />
          <DeskCardText teacher={t} status={presence?.[t.uid]} />
        </Box>
      ))}
    </Box>
  )
}

function TeacherChip({ teacher, selected, onSelect }) {
  return (
    <Box
      onClick={() => onSelect(teacher)}
      sx={{
        px: 1.5, py: 0.8, cursor: 'pointer', borderRadius: 5,
        border: '2px solid', borderColor: selected ? '#4f46e5' : '#e2e8f0',
        bgcolor: selected ? '#eef2ff' : '#fff',
      }}
    >
      <Typography fontWeight={600} fontSize="0.95rem" component="span">{teacher.name}</Typography>
      {teacher.positionLabel && (
        <Typography fontSize="0.75rem" color="primary.main" component="span" ml={0.6}>
          {teacher.positionLabel}
        </Typography>
      )}
    </Box>
  )
}

function KeypadButton({ children, onClick, muted }) {
  return (
    <Button
      onClick={onClick}
      sx={{
        height: 62, fontSize: muted ? '1rem' : '1.55rem', fontWeight: 700, borderRadius: 2,
        bgcolor: muted ? '#f1f5f9' : '#fff', color: muted ? '#64748b' : '#1e293b',
        border: '1px solid #e2e8f0', minWidth: 0,
        '&:hover': { bgcolor: muted ? '#e2e8f0' : '#eef2ff' },
      }}
    >
      {children}
    </Button>
  )
}

function FullScreen({ icon, title, sub, extra, spinner }) {
  return (
    <Box sx={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 1, p: 4, bgcolor: '#f8fafc',
    }}>
      {spinner ? <CircularProgress size={48} /> : (
        <>
          <Typography fontSize="4rem">{icon}</Typography>
          <Typography fontSize="1.6rem" fontWeight={800} textAlign="center">{title}</Typography>
          {sub && <Typography color="text.secondary" fontSize="1.05rem" textAlign="center">{sub}</Typography>}
          {extra}
        </>
      )}
    </Box>
  )
}
