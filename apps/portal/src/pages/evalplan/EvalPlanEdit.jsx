import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Alert from '@mui/material/Alert'
import CircularProgress from '@mui/material/CircularProgress'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import Layout from '../../components/Layout'
import EvalPlanForm from './EvalPlanForm'
import { ACCENT, ACCENT_BG } from './EvalPlanSection'
import { emptyExamRatio, emptyGradeMethod, emptyMinAchievementPlan } from './evalPlanUtils'

export default function EvalPlanEdit() {
  const { planId } = useParams()
  const navigate = useNavigate()
  const { schoolId } = useAuth()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [meta, setMeta] = useState(null)
  const [data, setData] = useState(null)
  const [subjectGroupError, setSubjectGroupError] = useState(false)

  useEffect(() => {
    if (!schoolId || !planId) return
    getDoc(doc(db, 'schools', schoolId, 'evaluationPlans', planId))
      .then((snap) => {
        if (!snap.exists()) { setError('제출물을 찾을 수 없습니다.'); return }
        const plan = snap.data()
        setMeta({
          year: plan.year,
          semester: plan.semester,
          grades: plan.grades || [],
          gradeRaw: plan.gradeRaw || '',
          subjectGroup: plan.subjectGroup || '',
          subject: plan.subject || '',
          weeklyHours: plan.weeklyHours ?? null,
          classes: plan.classes || '',
          teacherNames: plan.teacherNames || [],
        })
        setData({
          examRatio: plan.data?.examRatio || emptyExamRatio(),
          performanceAreas: plan.data?.performanceAreas || [],
          gradeMethod: plan.data?.gradeMethod || emptyGradeMethod(),
          minAchievementPlan: plan.data?.minAchievementPlan || emptyMinAchievementPlan(),
        })
      })
      .catch((err) => {
        console.error('[EvalPlanEdit] 조회 실패:', err)
        setError('제출물을 불러오지 못했습니다. 접근 권한이 없을 수 있습니다.')
      })
      .finally(() => setLoading(false))
  }, [schoolId, planId])

  const handleMetaChange = (next) => {
    setMeta(next)
    if (next.subjectGroup) setSubjectGroupError(false)
  }

  const handleSave = async () => {
    if (!meta.subjectGroup) {
      setSubjectGroupError(true)
      setError('교과(군)을 선택해주세요.')
      return
    }
    setSubjectGroupError(false)
    setSaving(true)
    setError(null)
    try {
      await updateDoc(doc(db, 'schools', schoolId, 'evaluationPlans', planId), {
        year: meta.year,
        semester: meta.semester,
        grades: meta.grades,
        gradeRaw: meta.gradeRaw,
        subjectGroup: meta.subjectGroup || '',
        subject: meta.subject,
        weeklyHours: meta.weeklyHours,
        classes: meta.classes,
        teacherNames: meta.teacherNames,
        data,
        status: 'confirmed',
        confirmedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      navigate(`/evalplan/${planId}`)
    } catch (err) {
      console.error('[EvalPlanEdit] 저장 실패:', err)
      setError(err.message || '저장 중 오류가 발생했습니다.')
      setSaving(false)
    }
  }

  if (loading) {
    return <Layout><Box display="flex" justifyContent="center" py={6}><CircularProgress sx={{ color: ACCENT }} /></Box></Layout>
  }
  if (error && !meta) {
    return <Layout><Alert severity="error" sx={{ borderRadius: '10px' }}>{error}</Alert></Layout>
  }

  return (
    <Layout>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
        <Box sx={{
          width: 40, height: 40, borderRadius: '10px', bgcolor: ACCENT_BG,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem',
        }}>
          📐
        </Box>
        <Typography sx={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a' }}>제출 내용 수정</Typography>
      </Box>
      <Typography sx={{ fontSize: '0.85rem', color: '#64748b', mb: 3 }}>
        원본 파일은 그대로 두고 확정된 데이터만 수정합니다. 파일을 다시 올리려면 새로 제출해주세요.
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2, borderRadius: '10px' }}>{error}</Alert>}

      {meta && data && (
        <Box>
          <EvalPlanForm meta={meta} onMetaChange={handleMetaChange} data={data} onDataChange={setData} subjectGroupError={subjectGroupError} />
          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mt: 1 }}>
            <Button
              variant="outlined" disabled={saving} onClick={() => navigate(`/evalplan/${planId}`)}
              sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 700, borderColor: '#e2e8f0', color: '#475569' }}
            >
              취소
            </Button>
            <Button
              variant="contained" disabled={saving} onClick={handleSave}
              sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 700, bgcolor: ACCENT, boxShadow: 'none', '&:hover': { bgcolor: '#6d28d9', boxShadow: 'none' } }}
            >
              {saving ? '저장 중...' : '저장'}
            </Button>
          </Box>
        </Box>
      )}
    </Layout>
  )
}
