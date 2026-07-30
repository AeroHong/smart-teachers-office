import { useEffect, useState, useCallback, useRef } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import CircularProgress from '@mui/material/CircularProgress'
import { httpsCallable } from 'firebase/functions'
import { functions } from '@shared/lib/firebase'
import { useKiosk } from '../contexts/KioskContext'

const STUDENT_ID_LENGTH = 5   // 학년1 + 반2 + 번호2
const SUCCESS_RESET_MS = 5000
const IDLE_RESET_MS = 60000   // 학생이 중간에 자리를 뜬 경우 자동 초기화

export default function CallInput() {
  const { device } = useKiosk()
  const [teachers, setTeachers] = useState(null)
  const [loadError, setLoadError] = useState('')

  const [teacher, setTeacher] = useState(null)
  const [studentId, setStudentId] = useState('')
  const [student, setStudent] = useState(null)     // { found, name, ... }
  const [checking, setChecking] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)       // { ok, message }

  // ── 교사 목록 로드 ────────────────────────────────────────
  useEffect(() => {
    httpsCallable(functions, 'getKioskTeachers')()
      .then(({ data }) => setTeachers(data.teachers || []))
      .catch(err => setLoadError(err.message || '교사 목록을 불러오지 못했습니다.'))
  }, [])

  const reset = useCallback(() => {
    setTeacher(null); setStudentId(''); setStudent(null); setResult(null)
  }, [])

  // ── 성공/실패 후 자동 초기화 ───────────────────────────────
  useEffect(() => {
    if (!result) return
    const t = setTimeout(reset, SUCCESS_RESET_MS)
    return () => clearTimeout(t)
  }, [result, reset])

  // ── 입력하다 만 상태로 방치되면 자동 초기화 ─────────────────
  useEffect(() => {
    if (!teacher || result) return
    const t = setTimeout(reset, IDLE_RESET_MS)
    return () => clearTimeout(t)
  }, [teacher, studentId, result, reset])

  // ── 학번 다 입력되면 이름 조회 ─────────────────────────────
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

  // ── 물리 키보드 입력도 지원 ────────────────────────────────
  const studentIdRef = useRef(studentId)
  studentIdRef.current = studentId
  useEffect(() => {
    if (!teacher || result) return
    const onKey = (e) => {
      if (/^\d$/.test(e.key)) {
        setStudentId(prev => (prev + e.key).slice(0, STUDENT_ID_LENGTH))
      } else if (e.key === 'Backspace') {
        setStudentId(prev => prev.slice(0, -1))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [teacher, result])

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

  // ── 화면 상태별 렌더 ──────────────────────────────────────
  if (loadError) return <Centered icon="⚠️" title="교사 목록을 불러오지 못했습니다" sub={loadError} />
  if (teachers === null) return <Centered spinner />

  if (result) {
    return (
      <Centered
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
    <Box sx={{ minHeight: '100vh', bgcolor: '#f8fafc', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{
        px: 4, py: 2, bgcolor: '#fff', borderBottom: '1px solid #e8eaed',
        display: 'flex', alignItems: 'center', gap: 2,
      }}>
        <Typography fontWeight={800} fontSize="1.15rem">🔔 선생님 호출</Typography>
        <Typography color="text.secondary" fontSize="0.95rem">{device.office}</Typography>
        {teacher && (
          <Button onClick={reset} sx={{ ml: 'auto' }}>처음으로</Button>
        )}
      </Box>

      {!teacher ? (
        <TeacherPicker teachers={teachers} onPick={setTeacher} />
      ) : (
        <StudentIdEntry
          teacher={teacher}
          studentId={studentId}
          student={student}
          checking={checking}
          submitting={submitting}
          onDigit={(d) => setStudentId(prev => (prev + d).slice(0, STUDENT_ID_LENGTH))}
          onBackspace={() => setStudentId(prev => prev.slice(0, -1))}
          onClear={() => setStudentId('')}
          onSubmit={submit}
        />
      )}
    </Box>
  )
}

// ── 1단계: 선생님 선택 ────────────────────────────────────────
function TeacherPicker({ teachers, onPick }) {
  if (teachers.length === 0) {
    return (
      <Centered
        icon="📋"
        title="이 사무실에 배정된 선생님이 없습니다"
        sub="관리자 페이지의 교원 배정에서 사무실을 지정해 주세요."
      />
    )
  }
  return (
    <Box sx={{ flex: 1, p: 4, overflowY: 'auto' }}>
      <Typography fontSize="1.35rem" fontWeight={700} mb={3}>
        어느 선생님을 찾으시나요?
      </Typography>
      <Box sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
        gap: 2,
      }}>
        {teachers.map(t => (
          <Button
            key={t.uid}
            variant="outlined"
            onClick={() => onPick(t)}
            sx={{
              py: 2.5, fontSize: '1.2rem', fontWeight: 600, borderRadius: 3,
              bgcolor: '#fff', borderColor: '#e2e8f0', color: '#1e293b',
              '&:hover': { bgcolor: '#eef2ff', borderColor: '#4f46e5' },
            }}
          >
            {t.name}
          </Button>
        ))}
      </Box>
    </Box>
  )
}

// ── 2단계: 학번 입력 + 본인 확인 ──────────────────────────────
function StudentIdEntry({ teacher, studentId, student, checking, submitting, onDigit, onBackspace, onClear, onSubmit }) {
  const filled = studentId.length === STUDENT_ID_LENGTH
  return (
    <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, p: 4, flexWrap: 'wrap' }}>
      {/* 왼쪽: 안내 + 입력 상태 */}
      <Box sx={{ textAlign: 'center', minWidth: 300 }}>
        <Typography color="text.secondary" fontSize="1rem">호출할 선생님</Typography>
        <Typography fontSize="1.8rem" fontWeight={800} mb={3}>{teacher.name}</Typography>

        <Typography color="text.secondary" fontSize="1rem" mb={1}>본인 학번을 입력하세요</Typography>
        <Box sx={{ display: 'flex', gap: 1.2, justifyContent: 'center', mb: 2 }}>
          {Array.from({ length: STUDENT_ID_LENGTH }).map((_, i) => (
            <Box key={i} sx={{
              width: 52, height: 66, borderRadius: 2,
              border: '2px solid', borderColor: studentId[i] ? '#4f46e5' : '#e2e8f0',
              bgcolor: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '2rem', fontWeight: 700,
            }}>
              {studentId[i] || ''}
            </Box>
          ))}
        </Box>

        <Box sx={{ minHeight: 56 }}>
          {checking && <CircularProgress size={26} />}
          {!checking && filled && student?.found && (
            <>
              <Typography fontSize="1.5rem" fontWeight={800} color="primary.main">{student.name}</Typography>
              <Typography variant="body2" color="text.secondary">
                {student.grade}학년 {student.classNo}반 {student.number}번 — 본인이 맞으면 호출하기를 누르세요
              </Typography>
            </>
          )}
          {!checking && filled && student && !student.found && (
            <Typography color="error" fontWeight={600}>학번을 찾을 수 없습니다. 다시 확인해 주세요.</Typography>
          )}
        </Box>

        <Button
          variant="contained"
          size="large"
          disabled={!filled || !student?.found || submitting}
          onClick={onSubmit}
          sx={{ mt: 2, px: 6, py: 1.6, fontSize: '1.15rem' }}
        >
          {submitting ? '호출 중...' : '호출하기'}
        </Button>
      </Box>

      {/* 오른쪽: 숫자 키패드 (터치 없는 기기에서도 물리 키보드로 입력 가능) */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 92px)', gap: 1.5 }}>
        {['1','2','3','4','5','6','7','8','9'].map(d => (
          <KeypadButton key={d} onClick={() => onDigit(d)}>{d}</KeypadButton>
        ))}
        <KeypadButton onClick={onClear} muted>지움</KeypadButton>
        <KeypadButton onClick={() => onDigit('0')}>0</KeypadButton>
        <KeypadButton onClick={onBackspace} muted>←</KeypadButton>
      </Box>
    </Box>
  )
}

function KeypadButton({ children, onClick, muted }) {
  return (
    <Button
      onClick={onClick}
      sx={{
        height: 76, fontSize: muted ? '1.1rem' : '1.7rem', fontWeight: 700, borderRadius: 3,
        bgcolor: muted ? '#f1f5f9' : '#fff', color: muted ? '#64748b' : '#1e293b',
        border: '1px solid #e2e8f0',
        '&:hover': { bgcolor: muted ? '#e2e8f0' : '#eef2ff' },
      }}
    >
      {children}
    </Button>
  )
}

function Centered({ icon, title, sub, extra, spinner }) {
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
