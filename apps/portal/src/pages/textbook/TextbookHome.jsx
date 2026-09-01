import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Alert from '@mui/material/Alert'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import SettingsIcon from '@mui/icons-material/Settings'
import { useAuth } from '@shared/contexts/AuthContext'
import { subscribeMyAdoptions, subscribeMySubjectHeadAdoptions, STATUS_LABELS } from '@shared/lib/textbookAdoption'
import Layout from '../../components/Layout'
import { ACCENT, ACCENT_BG } from './TextbookSection'

const infoChipSx = { bgcolor: '#f8fafc', border: '1px solid #e2e8f0', color: '#64748b', fontWeight: 600, fontSize: '0.74rem' }
const roleChipSx = { bgcolor: ACCENT_BG, color: ACCENT, fontWeight: 700, fontSize: '0.74rem' }

function AdoptionCard({ adoption, onClick }) {
  return (
    <Box
      onClick={onClick}
      sx={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, flexWrap: 'wrap',
        p: 2, borderRadius: '14px', border: '1px solid #e2e8f0', bgcolor: '#fff', cursor: 'pointer',
        transition: 'all 0.12s',
        '&:hover': { borderColor: ACCENT, boxShadow: '0 2px 8px rgba(15,118,110,0.08)' },
      }}
    >
      <Box>
        <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>
          {adoption.subjectName || '(과목명 없음)'}
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.6, mt: 0.75, flexWrap: 'wrap' }}>
          {adoption.isCommittee && <Chip size="small" sx={roleChipSx} label="위원" />}
          {adoption.isHead && <Chip size="small" sx={roleChipSx} label="교과주임" />}
          <Chip size="small" sx={infoChipSx} label={`${adoption.cycleYear}학년도 선정`} />
          <Chip size="small" sx={infoChipSx} label={`후보 ${adoption.candidates?.length || 0}개`} />
        </Box>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Chip
          size="small"
          label={STATUS_LABELS[adoption.status] || adoption.status}
          sx={adoption.status === 'closed'
            ? { bgcolor: '#dcfce7', color: '#166534', fontWeight: 700 }
            : { bgcolor: '#fef9c3', color: '#854d0e', fontWeight: 700 }}
        />
        <ChevronRightIcon sx={{ color: '#cbd5e1' }} />
      </Box>
    </Box>
  )
}

export default function TextbookHome() {
  const navigate = useNavigate()
  const { user, schoolId, isAdmin } = useAuth()

  const [committeeAdoptions, setCommitteeAdoptions] = useState([])
  const [headAdoptions, setHeadAdoptions] = useState([])
  const [committeeLoaded, setCommitteeLoaded] = useState(false)
  const [headLoaded, setHeadLoaded] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!schoolId || !user) return
    const unsub = subscribeMyAdoptions(schoolId, user.uid, (list) => {
      setCommitteeAdoptions(list)
      setCommitteeLoaded(true)
    }, (err) => {
      console.error('[TextbookHome] 위원 목록 조회 실패:', err)
      setError(err.message)
      setCommitteeLoaded(true)
    })
    return unsub
  }, [schoolId, user])

  // 교과주임은 채점 없이 진행상황만 관리하는 사람일 수도 있어 위원(committeeUids) 목록에
  // 없을 수 있다 — 그래서 별도 쿼리로 가져와 합친다.
  useEffect(() => {
    if (!schoolId || !user) return
    const unsub = subscribeMySubjectHeadAdoptions(schoolId, user.uid, (list) => {
      setHeadAdoptions(list)
      setHeadLoaded(true)
    }, (err) => {
      console.error('[TextbookHome] 교과주임 목록 조회 실패:', err)
      setHeadLoaded(true)
    })
    return unsub
  }, [schoolId, user])

  const loading = !committeeLoaded || !headLoaded

  const adoptions = useMemo(() => {
    const byId = new Map()
    committeeAdoptions.forEach((a) => byId.set(a.id, { ...a, isCommittee: true }))
    headAdoptions.forEach((a) => {
      const existing = byId.get(a.id)
      byId.set(a.id, existing ? { ...existing, isHead: true } : { ...a, isHead: true })
    })
    return [...byId.values()].sort((a, b) => (b.cycleYear - a.cycleYear) || a.subjectName.localeCompare(b.subjectName, 'ko'))
  }, [committeeAdoptions, headAdoptions])

  return (
    <Layout>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5, flexWrap: 'wrap', gap: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{
            width: 40, height: 40, borderRadius: '10px', bgcolor: ACCENT_BG,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem',
          }}>
            📚
          </Box>
          <Typography sx={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a' }}>
            검·인정도서 선정
          </Typography>
        </Box>
        {isAdmin && (
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="outlined" size="small" onClick={() => navigate('/textbook/all')}
              sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 700, borderColor: '#e2e8f0', color: '#475569' }}
            >
              전체 현황
            </Button>
            <Button
              variant="contained" size="small" startIcon={<SettingsIcon />} onClick={() => navigate('/admin/textbook-subjects')}
              sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 700, bgcolor: ACCENT, boxShadow: 'none', '&:hover': { bgcolor: '#0d5f59', boxShadow: 'none' } }}
            >
              선정 건 관리
            </Button>
          </Box>
        )}
      </Box>
      <Typography sx={{ fontSize: '0.85rem', color: '#64748b', mb: 3 }}>
        평가위원 또는 교과주임으로 지정된 과목을 관리합니다. 개별 위원의 점수는 마감 전까지 다른 위원에게 공개되지 않습니다.
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading ? (
        <Box display="flex" justifyContent="center" py={6}>
          <CircularProgress size={28} sx={{ color: ACCENT }} />
        </Box>
      ) : adoptions.length === 0 ? (
        <Box sx={{
          textAlign: 'center', py: 6, borderRadius: '14px', border: '1px dashed #e2e8f0', bgcolor: '#f8fafc',
        }}>
          <Typography sx={{ fontSize: '2rem', mb: 1 }}>📭</Typography>
          <Typography sx={{ fontSize: '0.9rem', color: '#64748b' }}>
            평가위원 또는 교과주임으로 지정된 선정 건이 없습니다. 관리자에게 문의하세요.
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
          {adoptions.map((a) => (
            <AdoptionCard key={a.id} adoption={a} onClick={() => navigate(`/textbook/${a.id}`)} />
          ))}
        </Box>
      )}
    </Layout>
  )
}
