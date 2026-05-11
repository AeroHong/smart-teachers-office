import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardActionArea from '@mui/material/CardActionArea'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import Layout from '../../components/Layout'

const SCHOOL_ID = 'seonyoo-hs'

export default function TrainingList() {
  const navigate = useNavigate()
  const [trainings, setTrainings] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const q = query(
      collection(db, 'schools', SCHOOL_ID, 'trainings'),
      orderBy('date', 'desc'),
    )
    const unsub = onSnapshot(q, (snap) => {
      setTrainings(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    }, () => {
      setLoading(false)
    })
    return unsub
  }, [])

  return (
    <Layout>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>연수 목록</Typography>
        <Button variant="contained" onClick={() => navigate('/training/new')}>
          + 연수 만들기
        </Button>
      </Box>

      {loading ? (
        <Box display="flex" justifyContent="center" py={8}><CircularProgress /></Box>
      ) : trainings.length === 0 ? (
        <Box textAlign="center" py={10} color="text.secondary">
          <Typography fontSize="2rem" mb={1}>✍️</Typography>
          <Typography fontWeight={600} mb={0.5}>등록된 연수가 없습니다</Typography>
          <Typography fontSize="0.88rem">연수를 만들어 디지털 서명을 수집해보세요.</Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {trainings.map(t => (
            <TrainingCard key={t.id} training={t} onClick={() => navigate(`/training/${t.id}`)} />
          ))}
        </Box>
      )}
    </Layout>
  )
}

function TrainingCard({ training: t, onClick }) {
  const signedCount = t.signedCount ?? 0
  const memberCount = t.members?.length ?? 0
  const allSigned = memberCount > 0 && signedCount >= memberCount
  const isClosed = t.status === 'closed'

  const timeStr = t.startTime && t.endTime
    ? `${t.startTime}–${t.endTime}`
    : t.startTime || ''

  const metaStr = [t.date, timeStr, t.location].filter(Boolean).join(' · ')

  return (
    <Card sx={{ borderLeft: `4px solid ${isClosed ? '#94a3b8' : '#4f46e5'}` }}>
      <CardActionArea onClick={onClick}>
        <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 1.5 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, flexWrap: 'wrap' }}>
              <Typography fontWeight={700} fontSize="0.95rem" noWrap>{t.title}</Typography>
              <Chip
                label={isClosed ? '마감' : '서명 중'}
                size="small"
                color={isClosed ? 'default' : 'primary'}
                variant="outlined"
              />
            </Box>
            <Typography fontSize="0.82rem" color="text.secondary" noWrap>{metaStr}</Typography>
            {t.createdByName && (
              <Typography fontSize="0.76rem" color="text.disabled" mt={0.25}>
                주관: {t.createdByName}
              </Typography>
            )}
          </Box>
          <Box textAlign="right" flexShrink={0}>
            <Typography
              fontSize="1.1rem"
              fontWeight={700}
              color={allSigned ? 'success.main' : 'text.primary'}
            >
              {signedCount}/{memberCount}
            </Typography>
            <Typography fontSize="0.72rem" color="text.secondary">서명</Typography>
          </Box>
        </CardContent>
      </CardActionArea>
    </Card>
  )
}
