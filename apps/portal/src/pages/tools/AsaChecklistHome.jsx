import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Alert from '@mui/material/Alert'
import Divider from '@mui/material/Divider'
import { db } from '../../lib/firebase'
import { useAuth } from '../../contexts/AuthContext'
import Layout from '../../components/Layout'

// 제출 상태 → Chip 표시 설정
const STATUS_CHIP = {
  draft:     { label: '작성중',   color: 'warning' },
  submitted: { label: '제출완료', color: 'success' },
  locked:    { label: '잠금',     color: 'default' },
}

function StatusChip({ status }) {
  if (!status) return <Chip size="small" label="미작성" variant="outlined" />
  const cfg = STATUS_CHIP[status] || { label: status, color: 'default' }
  return <Chip size="small" label={cfg.label} color={cfg.color} />
}

export default function AsaChecklistHome() {
  const navigate = useNavigate()
  const { user, schoolId, role, isAdmin, isPrincipal } = useAuth()

  const [matchedSubjects, setMatchedSubjects] = useState([]) // 교사에게 매칭된 모든 과목 (학년 무관)
  const [submissions, setSubmissions] = useState({}) // subjectId → { process: status, result: status }
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // 체크리스트 대상: 1·2학년 + 성취도 5단계 산출 과목만
  // (achievementLevel 필드가 없는 기존 과목은 5단계로 취급 — 과학탐구실험/체육·예술 교과군 등만 3단계로 별도 등록됨)
  // useMemo로 참조를 고정 — 아래 submissions 조회 useEffect가 매 렌더마다 재구독되는 것 방지
  const isTargetSubject = (s) => (s.grade === 1 || s.grade === 2) && (s.achievementLevel ?? 5) === 5
  const subjects = useMemo(
    () => matchedSubjects.filter(isTargetSubject),
    [matchedSubjects],
  )
  const nonTargetSubjects = useMemo(
    () => matchedSubjects.filter((s) => !isTargetSubject(s)),
    [matchedSubjects],
  )

  // 교감은 서명 페이지로 redirect
  useEffect(() => {
    if (isPrincipal) navigate('/tools/asa-checklist/principal', { replace: true })
  }, [isPrincipal, navigate])

  // 배정 과목 조회 — admin도 교사로 배정될 수 있으므로 포함
  useEffect(() => {
    if (!schoolId || !user || isPrincipal) return

    const q = query(
      collection(db, 'schools', schoolId, 'asaSubjects'),
      where('teacherEmails', 'array-contains', user.email),
    )
    const unsub = onSnapshot(q, (snap) => {
      setMatchedSubjects(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      setLoading(false)
    }, (err) => {
      setError(`과목 목록을 불러오지 못했습니다: ${err.message}`)
      setLoading(false)
    })
    return unsub
  }, [schoolId, user, isPrincipal])

  // 과정/결과 체크리스트 submission 상태 조회
  useEffect(() => {
    if (!schoolId || !subjects.length) return

    const subjectIds = subjects.map((s) => s.id)
    const chunks = []
    for (let i = 0; i < subjectIds.length; i += 30) chunks.push(subjectIds.slice(i, i + 30))

    const processUnsubs = chunks.map((chunk) => {
      const q = query(
        collection(db, 'schools', schoolId, 'asaSubmissions'),
        where('subjectId', 'in', chunk),
        where('checklistType', '==', 'process'),
      )
      return onSnapshot(q, (snap) => {
        setSubmissions((prev) => {
          const next = { ...prev }
          snap.docs.forEach((d) => {
            const data = d.data()
            if (!next[data.subjectId]) next[data.subjectId] = {}
            next[data.subjectId].process = data.status
          })
          return next
        })
      })
    })

    const resultUnsubs = chunks.map((chunk) => {
      const q = query(
        collection(db, 'schools', schoolId, 'asaSubmissions'),
        where('subjectId', 'in', chunk),
        where('checklistType', '==', 'result'),
      )
      return onSnapshot(q, (snap) => {
        setSubmissions((prev) => {
          const next = { ...prev }
          snap.docs.forEach((d) => {
            const data = d.data()
            if (!next[data.subjectId]) next[data.subjectId] = {}
            next[data.subjectId].result = data.status
          })
          return next
        })
      })
    })

    const allUnsubs = [...processUnsubs, ...resultUnsubs]
    return () => allUnsubs.forEach((u) => u())
  }, [schoolId, subjects])

  if (isPrincipal) return null

  return (
    <Layout>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 0.5, flexWrap: 'wrap', gap: 1 }}>
        <Typography variant="h5" fontWeight={700}>
          성취평가제 체크리스트
        </Typography>
        {/* 관리자는 관리 페이지 바로가기 버튼 표시 */}
        {isAdmin && (
          <Button
            variant="outlined"
            size="small"
            onClick={() => navigate('/tools/asa-checklist/admin')}
          >
            과목·교사 관리 →
          </Button>
        )}
      </Box>
      <Typography variant="body2" color="text.secondary" mb={3}>
        배정된 과목의 체크리스트를 작성·제출합니다.
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading ? (
        <Box display="flex" justifyContent="center" py={6}>
          <CircularProgress />
        </Box>
      ) : subjects.length === 0 && nonTargetSubjects.length > 0 ? (
        <Alert severity="warning">
          성취평가제 체크리스트 대상 과목이 아닙니다. (대상: 1·2학년 성취도 5단계 산출 과목)
          <Box component="span" sx={{ display: 'block', mt: 0.5, fontSize: '0.8rem', color: 'text.secondary' }}>
            배정된 과목: {nonTargetSubjects.map((s) => `${s.name || '(과목명 없음)'}(${s.grade}학년·${(s.achievementLevel ?? 5) === 3 ? '3단계' : '5단계'})`).join(', ')}
          </Box>
        </Alert>
      ) : subjects.length === 0 ? (
        <Alert severity={isAdmin ? 'info' : 'warning'}>
          {isAdmin
            ? '배정된 과목이 없습니다. 과목·교사 관리에서 본인 이메일을 교사로 추가하세요.'
            : '권한이 없습니다.'}
        </Alert>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {subjects.map((subject) => {
            const processStatus = submissions[subject.id]?.process ?? null
            const resultStatus = submissions[subject.id]?.result ?? null
            return (
              <Card key={subject.id} variant="outlined">
                <CardContent sx={{ pb: '16px !important' }}>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
                    <Box>
                      <Typography variant="h6" fontWeight={700}>
                        {subject.name || '(과목명 없음)'}
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 1, mt: 0.5, flexWrap: 'wrap' }}>
                        {subject.grade && <Chip size="small" label={`${subject.grade}학년`} variant="outlined" />}
                        {subject.semester && <Chip size="small" label={`${subject.semester}학기`} variant="outlined" />}
                      </Box>
                    </Box>

                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 260 }}>
                      <Divider textAlign="left">
                        <Typography variant="caption" color="text.secondary">체크리스트</Typography>
                      </Divider>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => navigate(`/tools/asa-checklist/${subject.id}/process`)}
                          sx={{ flexShrink: 0 }}
                        >
                          붙임1 과정 체크리스트
                        </Button>
                        <StatusChip status={processStatus} />
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Button
                          size="small"
                          variant="outlined"
                          color="secondary"
                          onClick={() => navigate(`/tools/asa-checklist/${subject.id}/result`)}
                          sx={{ flexShrink: 0 }}
                        >
                          붙임2 결과 체크리스트
                        </Button>
                        <StatusChip status={resultStatus} />
                      </Box>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            )
          })}
        </Box>
      )}
    </Layout>
  )
}
