import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, query, where, orderBy, onSnapshot, doc, getDoc } from 'firebase/firestore'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Alert from '@mui/material/Alert'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import AddIcon from '@mui/icons-material/Add'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import Layout from '../../components/Layout'
import { ACCENT, ACCENT_BG } from './EvalPlanSection'
import { STATUS_LABELS, fmtDate } from './evalPlanUtils'

const infoChipSx = { bgcolor: '#f8fafc', border: '1px solid #e2e8f0', color: '#64748b', fontWeight: 600, fontSize: '0.74rem' }

function PlanCard({ plan, onClick, extraChip }) {
  return (
    <Box
      onClick={onClick}
      sx={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, flexWrap: 'wrap',
        p: 2, borderRadius: '14px', border: '1px solid #e2e8f0', bgcolor: '#fff', cursor: 'pointer',
        transition: 'all 0.12s',
        '&:hover': { borderColor: ACCENT, boxShadow: '0 2px 8px rgba(124,58,237,0.08)' },
      }}
    >
      <Box>
        <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>
          {plan.subject || '(교과목명 없음)'}
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.6, mt: 0.75, flexWrap: 'wrap' }}>
          <Chip size="small" sx={infoChipSx} label={`${plan.year}학년도 ${plan.semester}학기`} />
          {(plan.grades || []).map((g) => <Chip key={g} size="small" sx={infoChipSx} label={`${g}학년`} />)}
          {plan.subjectGroup && <Chip size="small" sx={infoChipSx} label={plan.subjectGroup} />}
          {extraChip}
          <Chip size="small" sx={infoChipSx} label={`제출일 ${fmtDate(plan.createdAt)}`} />
        </Box>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Chip
          size="small"
          label={STATUS_LABELS[plan.status] || plan.status}
          sx={plan.status === 'confirmed'
            ? { bgcolor: '#dcfce7', color: '#166534', fontWeight: 700 }
            : { bgcolor: '#fef9c3', color: '#854d0e', fontWeight: 700 }}
        />
        <ChevronRightIcon sx={{ color: '#cbd5e1' }} />
      </Box>
    </Box>
  )
}

export default function EvalPlanHome() {
  const navigate = useNavigate()
  const { user, schoolId, isAdmin } = useAuth()

  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [coTaughtPlans, setCoTaughtPlans] = useState([])
  const [error, setError] = useState(null)
  const [isManager, setIsManager] = useState(false)

  useEffect(() => {
    if (!schoolId || !user) return
    const q = query(
      collection(db, 'schools', schoolId, 'evaluationPlans'),
      where('uploaderUid', '==', user.uid),
      orderBy('createdAt', 'desc'),
    )
    const unsub = onSnapshot(q, (snap) => {
      setPlans(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      setLoading(false)
    }, (err) => {
      console.error('[EvalPlanHome] 목록 조회 실패:', err)
      setError(err.message)
      setLoading(false)
    })
    return unsub
  }, [schoolId, user])

  // 본인이 직접 올리지 않았어도, 매칭된 공동 지도교사면 그 과목 계획을 볼 수 있다.
  // 본인이 올린 것은 위 목록에 이미 나오므로 여기서는 uploaderUid가 다른 것만 남긴다.
  useEffect(() => {
    if (!schoolId || !user) return
    const q = query(
      collection(db, 'schools', schoolId, 'evaluationPlans'),
      where('matchedTeacherUids', 'array-contains', user.uid),
      orderBy('createdAt', 'desc'),
    )
    const unsub = onSnapshot(q, (snap) => {
      setCoTaughtPlans(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => p.uploaderUid !== user.uid))
    }, (err) => {
      console.error('[EvalPlanHome] 공동 지도 과목 조회 실패:', err)
    })
    return unsub
  }, [schoolId, user])

  useEffect(() => {
    if (!schoolId || !user || isAdmin) { setIsManager(false); return }
    getDoc(doc(db, 'schools', schoolId, 'evaluationPlanManagers', user.uid))
      .then((snap) => setIsManager(snap.exists()))
      .catch(() => setIsManager(false))
  }, [schoolId, user, isAdmin])

  return (
    <Layout>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5, flexWrap: 'wrap', gap: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{
            width: 40, height: 40, borderRadius: '10px', bgcolor: ACCENT_BG,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem',
          }}>
            📐
          </Box>
          <Typography sx={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a' }}>
            교수학습 및 평가 운영 계획
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          {(isAdmin || isManager) && (
            <Button
              variant="outlined" size="small" onClick={() => navigate('/evalplan/all')}
              sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 700, borderColor: '#e2e8f0', color: '#475569' }}
            >
              전체 현황
            </Button>
          )}
          <Button
            variant="contained" size="small" startIcon={<AddIcon />} onClick={() => navigate('/evalplan/new')}
            sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 700, bgcolor: ACCENT, boxShadow: 'none', '&:hover': { bgcolor: '#6d28d9', boxShadow: 'none' } }}
          >
            새로 제출
          </Button>
        </Box>
      </Box>
      <Typography sx={{ fontSize: '0.85rem', color: '#64748b', mb: 3 }}>
        학기별 평가 운영 계획서(hwpx)를 업로드해 제출합니다. 본인이 제출했거나 공동 지도교사로 매칭된 과목만 조회할 수 있습니다.
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading ? (
        <Box display="flex" justifyContent="center" py={6}>
          <CircularProgress size={28} sx={{ color: ACCENT }} />
        </Box>
      ) : plans.length === 0 ? (
        <Box sx={{
          textAlign: 'center', py: 6, borderRadius: '14px', border: '1px dashed #e2e8f0', bgcolor: '#f8fafc',
        }}>
          <Typography sx={{ fontSize: '2rem', mb: 1 }}>🗂️</Typography>
          <Typography sx={{ fontSize: '0.9rem', color: '#64748b', mb: 2 }}>
            아직 제출한 계획서가 없습니다.
          </Typography>
          <Button
            variant="contained" size="small" startIcon={<AddIcon />} onClick={() => navigate('/evalplan/new')}
            sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 700, bgcolor: ACCENT, boxShadow: 'none', '&:hover': { bgcolor: '#6d28d9', boxShadow: 'none' } }}
          >
            새로 제출
          </Button>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
          {plans.map((plan) => (
            <PlanCard key={plan.id} plan={plan} onClick={() => navigate(`/evalplan/${plan.id}`)} />
          ))}
        </Box>
      )}

      {coTaughtPlans.length > 0 && (
        <Box sx={{ mt: 4 }}>
          <Typography sx={{ fontSize: '1rem', fontWeight: 800, color: '#1e293b', mb: 0.5 }}>공동 지도 과목</Typography>
          <Typography sx={{ fontSize: '0.8rem', color: '#94a3b8', mb: 1.5 }}>
            다른 선생님이 제출했지만 담당교사로 함께 매칭된 과목입니다.
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
            {coTaughtPlans.map((plan) => (
              <PlanCard
                key={plan.id} plan={plan} onClick={() => navigate(`/evalplan/${plan.id}`)}
                extraChip={<Chip size="small" sx={infoChipSx} label={`제출자 ${plan.uploaderName || '-'}`} />}
              />
            ))}
          </Box>
        </Box>
      )}
    </Layout>
  )
}
