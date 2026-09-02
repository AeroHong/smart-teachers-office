import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Alert from '@mui/material/Alert'
import Snackbar from '@mui/material/Snackbar'
import { useAuth } from '@shared/contexts/AuthContext'
import { subscribeAdoption, subscribeMyScore, saveScore, rubricMax, STATUS_LABELS } from '@shared/lib/textbookAdoption'
import { openScoreSheetPrint } from './textbookPrint'
import Layout from '../../components/Layout'
import ScoreEntryForm from './ScoreEntryForm'
import { ACCENT, ACCENT_BG } from './TextbookSection'

export default function TextbookEvaluate() {
  const { adoptionId } = useParams()
  const navigate = useNavigate()
  const { user, userName, schoolId, isAdmin } = useAuth()

  const [adoption, setAdoption] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [myScore, setMyScore] = useState(null)
  const [scoreLoaded, setScoreLoaded] = useState(false)
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

  const isCommittee = !!(user && adoption?.committeeUids?.includes(user.uid))
  // 점수 저장 규칙(firestore.rules)은 committeeUids 소속만 허용한다(superAdmin 예외 제외) —
  // 관리자는 이 화면을 볼 수는 있지만(구성 확인용) 위원으로 지정되지 않았다면 채점은 못 한다.
  const canEdit = isCommittee && adoption?.status === 'collecting'
  const maxSum = rubricMax(adoption?.rubric)

  const handleSave = async (byCandidate, opinion, submit) => {
    setSaving(true)
    try {
      await saveScore(schoolId, adoptionId, user.uid, userName, byCandidate, submit, opinion)
      setSnack(submit ? '채점을 제출했습니다.' : '임시저장했습니다.')
    } catch (e) {
      setError(`저장 실패: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  const handlePrint = (byCandidate, opinion) => {
    openScoreSheetPrint(adoption, { ...myScore, byCandidate, opinion, teacherName: userName })
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

      <ScoreEntryForm
        adoption={adoption}
        ready={scoreLoaded}
        initialByCandidate={myScore?.byCandidate}
        initialOpinion={myScore?.opinion}
        canEdit={canEdit}
        saving={saving}
        onSave={handleSave}
        onPrint={myScore ? handlePrint : undefined}
      />

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
