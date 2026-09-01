import { useState, useEffect, useMemo, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Table from '@mui/material/Table'
import TableHead from '@mui/material/TableHead'
import TableBody from '@mui/material/TableBody'
import TableRow from '@mui/material/TableRow'
import TableCell from '@mui/material/TableCell'
import CircularProgress from '@mui/material/CircularProgress'
import Alert from '@mui/material/Alert'
import Snackbar from '@mui/material/Snackbar'
import { useAuth } from '@shared/contexts/AuthContext'
import {
  subscribeAdoption, subscribeMyScore, saveScore, distributeScore, sumCriteria, rubricMax, STATUS_LABELS,
} from '@shared/lib/textbookAdoption'
import Layout from '../../components/Layout'
import TextbookSection, { ACCENT, ACCENT_BG } from './TextbookSection'

// byCandidate 문서 값 → 화면 편집용 로컬 상태(항목별 점수 맵)로 변환.
function toEditState(byCandidate, candidates) {
  const state = {}
  candidates.forEach((c) => {
    state[c.id] = { ...(byCandidate?.[c.id]?.byCriterion || {}) }
  })
  return state
}

export default function TextbookEvaluate() {
  const { adoptionId } = useParams()
  const navigate = useNavigate()
  const { user, userName, schoolId, isAdmin } = useAuth()

  const [adoption, setAdoption] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [myScore, setMyScore] = useState(null)
  const [scoreLoaded, setScoreLoaded] = useState(false)
  const [mode, setMode] = useState('quick') // 'quick' | 'detail'
  const [edits, setEdits] = useState({}) // { [candidateId]: { [criterionName]: number } }
  const [saving, setSaving] = useState(false)
  const [snack, setSnack] = useState('')

  useEffect(() => {
    if (!schoolId || !adoptionId) return
    const unsub = subscribeAdoption(schoolId, adoptionId, (data) => {
      setAdoption(data)
      setLoading(false)
    }, (err) => { setError(err.message); setLoading(false) })
    return unsub
  }, [schoolId, adoptionId])

  useEffect(() => {
    if (!schoolId || !adoptionId || !user) return
    // adoptionId가 바뀌면(라우트 파라미터 변경 — 컴포넌트는 재마운트되지 않는다) 이전 선정
    // 건의 점수를 들고 있지 않도록 먼저 초기화한다.
    setScoreLoaded(false)
    setMyScore(null)
    const unsub = subscribeMyScore(schoolId, adoptionId, user.uid, (data) => {
      setMyScore(data)
      setScoreLoaded(true)
    }, (err) => { console.error('[TextbookEvaluate] 내 점수 조회 실패:', err) })
    return unsub
  }, [schoolId, adoptionId, user])

  // 서버 값이 처음 도착했을 때만 로컬 편집 상태를 초기화한다 — 이후 로컬 편집 중에 다시
  // 덮어써지지 않도록.
  useEffect(() => {
    if (!scoreLoaded || !adoption) return
    setEdits(toEditState(myScore?.byCandidate, adoption.candidates || []))
  }, [scoreLoaded, adoptionId]) // eslint-disable-line react-hooks/exhaustive-deps

  const isCommittee = !!(user && adoption?.committeeUids?.includes(user.uid))
  // 점수 저장 규칙(firestore.rules)은 committeeUids 소속만 허용한다(superAdmin 예외 제외) —
  // 관리자는 이 화면을 볼 수는 있지만(구성 확인용) 위원으로 지정되지 않았다면 채점은 못 한다.
  const canEdit = isCommittee && adoption?.status === 'collecting'
  const maxSum = useMemo(() => rubricMax(adoption?.rubric), [adoption])

  const totalFor = useCallback((candidateId) => sumCriteria(edits[candidateId]), [edits])

  const handleQuickTotalChange = (candidateId, value) => {
    const total = Math.max(0, Math.min(Number(value) || 0, maxSum))
    setEdits((prev) => ({ ...prev, [candidateId]: distributeScore(total, adoption.rubric) }))
  }

  const handleCriterionChange = (candidateId, criterionName, value, max) => {
    const v = Math.max(0, Math.min(Number(value) || 0, max))
    setEdits((prev) => ({ ...prev, [candidateId]: { ...prev[candidateId], [criterionName]: v } }))
  }

  const buildByCandidate = () => {
    const byCandidate = {}
    ;(adoption.candidates || []).forEach((c) => {
      const byCriterion = edits[c.id] || {}
      byCandidate[c.id] = { byCriterion, total: sumCriteria(byCriterion) }
    })
    return byCandidate
  }

  const handleSave = async (submit) => {
    setSaving(true)
    try {
      await saveScore(schoolId, adoptionId, user.uid, userName, buildByCandidate(), submit)
      setSnack(submit ? '채점을 제출했습니다.' : '임시저장했습니다.')
    } catch (e) {
      setError(`저장 실패: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <Layout><Box display="flex" justifyContent="center" py={6}><CircularProgress sx={{ color: ACCENT }} /></Box></Layout>
  }
  if (error) {
    return <Layout><Alert severity="error" sx={{ borderRadius: '10px' }}>{error}</Alert></Layout>
  }
  if (!adoption) {
    return <Layout><Alert severity="warning" sx={{ borderRadius: '10px' }}>선정 건을 찾을 수 없습니다.</Alert></Layout>
  }
  if (!isAdmin && !isCommittee) {
    return <Layout><Alert severity="warning" sx={{ borderRadius: '10px' }}>이 선정 건의 평가위원으로 지정된 계정만 채점할 수 있습니다.</Alert></Layout>
  }

  const candidates = adoption.candidates || []
  const rubric = adoption.rubric || []

  return (
    <Layout wide>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5, flexWrap: 'wrap', gap: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{ width: 40, height: 40, borderRadius: '10px', bgcolor: ACCENT_BG, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>✍️</Box>
          <Box>
            <Typography sx={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a' }}>{adoption.subjectName} 채점</Typography>
            <Typography sx={{ fontSize: '0.8rem', color: '#94a3b8' }}>{adoption.cycleYear}학년도 선정 · 배점 합계 {maxSum}점</Typography>
          </Box>
        </Box>
        <Chip
          size="small"
          label={STATUS_LABELS[adoption.status] || adoption.status}
          sx={adoption.status === 'closed' ? { bgcolor: '#dcfce7', color: '#166534', fontWeight: 700 } : { bgcolor: '#fef9c3', color: '#854d0e', fontWeight: 700 }}
        />
      </Box>

      {adoption.status === 'closed' && (
        <Alert severity="info" sx={{ mb: 2, borderRadius: '10px' }}>
          채점이 마감되어 더 이상 수정할 수 없습니다. <a href={`/textbook/${adoptionId}`}>집계 결과 보기</a>
        </Alert>
      )}
      {myScore?.submittedAt && adoption.status === 'collecting' && (
        <Alert severity="success" sx={{ mb: 2, borderRadius: '10px' }}>
          이미 제출을 완료했습니다. 마감 전까지는 계속 수정할 수 있습니다.
        </Alert>
      )}

      <TextbookSection
        title="입력 방식"
        right={
          <ToggleButtonGroup
            size="small" exclusive value={mode} onChange={(_, v) => v && setMode(v)} disabled={!canEdit}
          >
            <ToggleButton value="quick" sx={{ textTransform: 'none', fontSize: '0.78rem', px: 1.5 }}>총점만 입력</ToggleButton>
            <ToggleButton value="detail" sx={{ textTransform: 'none', fontSize: '0.78rem', px: 1.5 }}>항목별 입력</ToggleButton>
          </ToggleButtonGroup>
        }
      >
        <Typography sx={{ fontSize: '0.82rem', color: '#64748b' }}>
          {mode === 'quick'
            ? '후보별 총점만 입력하면 배점 비율대로 세부 항목에 자동 배분됩니다.'
            : '항목별로 직접 점수를 입력합니다. 합계는 자동으로 계산됩니다.'}
        </Typography>
      </TextbookSection>

      <Box sx={{ overflowX: 'auto', borderRadius: '14px', border: '1px solid #e2e8f0', bgcolor: '#fff' }}>
        <Table size="small">
          <TableHead sx={{ '& th': { bgcolor: '#f8fafc', color: '#475569', fontWeight: 700, fontSize: '0.74rem', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' } }}>
            <TableRow>
              <TableCell>출판사 / 저자</TableCell>
              {mode === 'detail'
                ? rubric.map((r) => <TableCell key={r.name} align="center">{r.name}<br />({r.maxScore}점)</TableCell>)
                : <TableCell align="center">총점 (~{maxSum}점)</TableCell>}
              <TableCell align="center">합계</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {candidates.map((c) => (
              <TableRow key={c.id} sx={{ '& td': { borderBottom: '1px solid #f1f5f9' } }}>
                <TableCell>
                  <Typography sx={{ fontWeight: 700, fontSize: '0.86rem', color: '#1e293b' }}>{c.publisher}</Typography>
                  {c.author && <Typography sx={{ fontSize: '0.76rem', color: '#94a3b8' }}>{c.author}</Typography>}
                </TableCell>
                {mode === 'detail' ? (
                  rubric.map((r) => (
                    <TableCell key={r.name} align="center">
                      <TextField
                        type="number" size="small" disabled={!canEdit}
                        value={edits[c.id]?.[r.name] ?? 0}
                        onChange={(e) => handleCriterionChange(c.id, r.name, e.target.value, r.maxScore)}
                        inputProps={{ min: 0, max: r.maxScore, style: { width: 56, textAlign: 'center' } }}
                      />
                    </TableCell>
                  ))
                ) : (
                  <TableCell align="center">
                    <TextField
                      type="number" size="small" disabled={!canEdit}
                      value={totalFor(c.id)}
                      onChange={(e) => handleQuickTotalChange(c.id, e.target.value)}
                      inputProps={{ min: 0, max: maxSum, style: { width: 72, textAlign: 'center' } }}
                    />
                  </TableCell>
                )}
                <TableCell align="center">
                  <Chip size="small" label={`${totalFor(c.id)}점`} sx={{ bgcolor: ACCENT_BG, color: ACCENT, fontWeight: 700 }} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>

      {canEdit && (
        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mt: 2.5 }}>
          <Button variant="outlined" disabled={saving} onClick={() => handleSave(false)} sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 700 }}>
            임시저장
          </Button>
          <Button
            variant="contained" disabled={saving} onClick={() => handleSave(true)}
            sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 700, bgcolor: ACCENT, boxShadow: 'none', '&:hover': { bgcolor: '#0d5f59', boxShadow: 'none' } }}
          >
            제출 확정
          </Button>
        </Box>
      )}

      <Button
        size="small" onClick={() => navigate(`/textbook/${adoptionId}`)}
        sx={{ mt: 2, textTransform: 'none', color: '#64748b' }}
      >
        ← 상세로 돌아가기
      </Button>

      <Snackbar open={!!snack} autoHideDuration={2500} onClose={() => setSnack('')} message={snack} />
    </Layout>
  )
}
