import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Table from '@mui/material/Table'
import TableHead from '@mui/material/TableHead'
import TableBody from '@mui/material/TableBody'
import TableRow from '@mui/material/TableRow'
import TableCell from '@mui/material/TableCell'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Alert from '@mui/material/Alert'
import { useAuth } from '@shared/contexts/AuthContext'
import { useTableSort } from '@shared/hooks/useTableSort'
import { loadAdoptionsWithProgress, STATUS_LABELS } from '@shared/lib/textbookAdoption'
import Layout from '../../components/Layout'
import { ACCENT, ACCENT_BG } from './TextbookSection'

const SORT_GETTERS = {
  subjectName: (r) => r.subjectName || '',
  cycleYear: (r) => r.cycleYear || 0,
  candidateCount: (r) => r.candidates?.length || 0,
  committeeCount: (r) => r.committeeUids?.length || 0,
  submitted: (r) => r.submittedCount ?? -1,
  status: (r) => r.status || '',
}

export default function TextbookManagerDashboard() {
  const navigate = useNavigate()
  const { schoolId, isAdmin } = useAuth()

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const { toggle, sortData, Ind } = useTableSort('subjectName')

  useEffect(() => {
    if (!schoolId || !isAdmin) return
    let cancelled = false
    setLoading(true)
    loadAdoptionsWithProgress(schoolId)
      .then((withCounts) => { if (!cancelled) setRows(withCounts) })
      .catch((e) => setError(e.message))
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [schoolId, isAdmin])

  if (!isAdmin) {
    return <Layout><Alert severity="warning" sx={{ borderRadius: '10px' }}>관리자만 전체 현황을 볼 수 있습니다.</Alert></Layout>
  }

  const sorted = sortData(rows, SORT_GETTERS)

  return (
    <Layout wide>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
        <Box sx={{ width: 40, height: 40, borderRadius: '10px', bgcolor: ACCENT_BG, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>📊</Box>
        <Typography sx={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a' }}>검·인정도서 선정 — 전체 현황</Typography>
      </Box>
      <Typography sx={{ fontSize: '0.85rem', color: '#64748b', mb: 3 }}>
        모든 선정 건의 채점 진행 상태를 조회합니다. 선정 건 등록·수정은 관리자 페이지 &gt; 선정 건 관리에서 합니다.
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2, borderRadius: '10px' }}>{error}</Alert>}

      {loading ? (
        <Box display="flex" justifyContent="center" py={6}><CircularProgress sx={{ color: ACCENT }} /></Box>
      ) : rows.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 6, borderRadius: '14px', border: '1px dashed #e2e8f0', bgcolor: '#f8fafc' }}>
          <Typography sx={{ fontSize: '2rem', mb: 1 }}>🧑‍🏫</Typography>
          <Typography sx={{ fontSize: '0.9rem', color: '#64748b' }}>등록된 선정 건이 없습니다.</Typography>
        </Box>
      ) : (
        <Box sx={{ overflowX: 'auto', borderRadius: '14px', border: '1px solid #e2e8f0', bgcolor: '#fff' }}>
          <Table size="small">
            <TableHead sx={{ '& th': { bgcolor: '#f8fafc', color: '#475569', fontWeight: 700, fontSize: '0.74rem', borderBottom: '1px solid #e2e8f0', cursor: 'pointer', whiteSpace: 'nowrap' } }}>
              <TableRow>
                <TableCell onClick={() => toggle('subjectName')}>과목{Ind('subjectName')}</TableCell>
                <TableCell align="center" onClick={() => toggle('cycleYear')}>선정연도{Ind('cycleYear')}</TableCell>
                <TableCell align="center" onClick={() => toggle('candidateCount')}>후보 수{Ind('candidateCount')}</TableCell>
                <TableCell align="center" onClick={() => toggle('committeeCount')}>위원 수{Ind('committeeCount')}</TableCell>
                <TableCell align="center" onClick={() => toggle('submitted')}>제출{Ind('submitted')}</TableCell>
                <TableCell align="center" onClick={() => toggle('status')}>상태{Ind('status')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sorted.map((r) => (
                <TableRow
                  key={r.id} hover onClick={() => navigate(`/textbook/${r.id}`)}
                  sx={{ cursor: 'pointer', '& td': { borderBottom: '1px solid #f1f5f9' } }}
                >
                  <TableCell sx={{ fontWeight: 700, color: '#1e293b' }}>{r.subjectName}</TableCell>
                  <TableCell align="center">{r.cycleYear}</TableCell>
                  <TableCell align="center">{r.candidates?.length || 0}</TableCell>
                  <TableCell align="center">{r.committeeUids?.length || 0}</TableCell>
                  <TableCell align="center">{r.submittedCount ?? '-'} / {r.committeeUids?.length || 0}</TableCell>
                  <TableCell align="center">
                    <Chip
                      size="small"
                      label={STATUS_LABELS[r.status] || r.status}
                      sx={r.status === 'closed' ? { bgcolor: '#dcfce7', color: '#166534', fontWeight: 700 } : { bgcolor: '#fef9c3', color: '#854d0e', fontWeight: 700 }}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}
    </Layout>
  )
}
