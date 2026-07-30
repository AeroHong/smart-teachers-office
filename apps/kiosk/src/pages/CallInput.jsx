import { useEffect, useState, useCallback } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import CircularProgress from '@mui/material/CircularProgress'
import { httpsCallable } from 'firebase/functions'
import { functions } from '@shared/lib/firebase'
import { useKiosk } from '../contexts/KioskContext'

const STUDENT_ID_LENGTH = 5   // 학년1 + 반2 + 번호2
const SUCCESS_RESET_MS = 5000
const IDLE_RESET_MS = 90000   // 학생이 중간에 자리를 뜬 경우 자동 초기화

// 자리 배치 캔버스의 카드 크기 — 관리자 편집기(OfficeLayoutEditor)와 같은 16:9 기준
const CARD_W_PCT = 15.5
const CARD_H_PCT = 15.5

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
  const [result, setResult] = useState(null)

  useEffect(() => {
    httpsCallable(functions, 'getKioskTeachers')()
      .then(({ data }) => {
        setTeachers(data.teachers || [])
        setHasLayout(!!data.hasLayout)
      })
      .catch(err => setLoadError(err.message || '교사 목록을 불러오지 못했습니다.'))
  }, [])

  const reset = useCallback(() => {
    setTeacher(null); setStudentId(''); setStudent(null); setResult(null)
  }, [])

  useEffect(() => {
    if (!result) return
    const t = setTimeout(reset, SUCCESS_RESET_MS)
    return () => clearTimeout(t)
  }, [result, reset])

  // 입력하다 만 상태로 방치되면 자동 초기화
  useEffect(() => {
    if (!teacher && !studentId) return
    const t = setTimeout(reset, IDLE_RESET_MS)
    return () => clearTimeout(t)
  }, [teacher, studentId, reset])

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
    if (result) return
    const onKey = (e) => {
      if (/^\d$/.test(e.key)) setStudentId(prev => (prev + e.key).slice(0, STUDENT_ID_LENGTH))
      else if (e.key === 'Backspace') setStudentId(prev => prev.slice(0, -1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [result])

  const submit = async () => {
    if (submitting || !teacher || !student?.found) return
    setSubmitting(true)
    try {
      const { data } = await httpsCallable(functions, 'submitCallRequest')({
        teacherUid: teacher.uid, studentId,
      })
      setResult({ ok: true, message: `${data.teacherName} 선생님을 호출했습니다.` })
    } catch (err) {
      setResult({ ok: false, message: err.message || '호출에 실패했습니다.' })
    } finally {
      setSubmitting(false)
    }
  }

  if (loadError) return <FullScreen icon="⚠️" title="교사 목록을 불러오지 못했습니다" sub={loadError} />
  if (teachers === null) return <FullScreen spinner />
  if (result) {
    return (
      <FullScreen
        icon={result.ok ? '✅' : '⚠️'}
        title={result.ok ? '호출 완료' : '호출하지 못했습니다'}
        sub={result.message}
        extra={
          <Button variant="contained" size="large" onClick={reset} sx={{ mt: 3, px: 5, py: 1.5, fontSize: '1.05rem' }}>
            처음으로
          </Button>
        }
      />
    )
  }

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: '#f8fafc', overflow: 'hidden' }}>
      <Box sx={{
        px: 3, py: 1.5, bgcolor: '#fff', borderBottom: '1px solid #e8eaed',
        display: 'flex', alignItems: 'center', gap: 1.5, flexShrink: 0,
      }}>
        <Typography fontWeight={800} fontSize="1.1rem">🔔 선생님 호출</Typography>
        <Typography color="text.secondary" fontSize="0.9rem">{device.office}</Typography>
      </Box>

      <Box sx={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* ── 왼쪽: 선생님 자리 배치 ── */}
        <Box sx={{ flex: 1, p: 2.5, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <Typography fontSize="1.05rem" fontWeight={700} mb={1.5}>
            1. 찾는 선생님을 선택하세요
          </Typography>
          {teachers.length === 0 ? (
            <Typography color="text.secondary">
              이 사무실에 배정된 선생님이 없습니다. 관리자에게 문의하세요.
            </Typography>
          ) : hasLayout ? (
            <SeatMap teachers={teachers} selected={teacher} onSelect={setTeacher} />
          ) : (
            <TeacherGrid teachers={teachers} selected={teacher} onSelect={setTeacher} />
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
            {submitting ? '호출 중...' : '호출하기'}
          </Button>
        </Box>
      </Box>
    </Box>
  )
}

// ── 실제 사무실 배치대로 카드 표시 ────────────────────────────
function SeatMap({ teachers, selected, onSelect }) {
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
              position: 'absolute',
              left: `${t.seat.x * 100}%`,
              top: `${t.seat.y * 100}%`,
              width: `${CARD_W_PCT}%`,
              minHeight: `${CARD_H_PCT}%`,
              px: 1, py: 0.8, cursor: 'pointer', borderRadius: 2, overflow: 'hidden',
              border: '2px solid',
              borderColor: selected?.uid === t.uid ? '#4f46e5' : '#e2e8f0',
              bgcolor: selected?.uid === t.uid ? '#eef2ff' : '#fff',
              boxShadow: selected?.uid === t.uid ? '0 0 0 3px rgba(79,70,229,0.15)' : '0 1px 3px rgba(0,0,0,0.06)',
              transition: 'background-color .12s, border-color .12s',
            }}
          >
            <Typography fontWeight={700} fontSize="1rem" noWrap>{t.name}</Typography>
            {t.positionLabel && (
              <Typography fontSize="0.72rem" color="primary.main" noWrap>{t.positionLabel}</Typography>
            )}
            {t.subject && (
              <Typography fontSize="0.72rem" color="text.secondary" noWrap>{t.subject}</Typography>
            )}
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
function TeacherGrid({ teachers, selected, onSelect }) {
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
          sx={{
            px: 1.5, py: 1.4, cursor: 'pointer', borderRadius: 2,
            border: '2px solid',
            borderColor: selected?.uid === t.uid ? '#4f46e5' : '#e2e8f0',
            bgcolor: selected?.uid === t.uid ? '#eef2ff' : '#fff',
          }}
        >
          <Typography fontWeight={700} fontSize="1.1rem" noWrap>{t.name}</Typography>
          {t.positionLabel && (
            <Typography fontSize="0.78rem" color="primary.main" noWrap>{t.positionLabel}</Typography>
          )}
          {t.subject && (
            <Typography fontSize="0.78rem" color="text.secondary" noWrap>{t.subject}</Typography>
          )}
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
