import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Table from '@mui/material/Table'
import TableHead from '@mui/material/TableHead'
import TableBody from '@mui/material/TableBody'
import TableRow from '@mui/material/TableRow'
import TableCell from '@mui/material/TableCell'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Alert from '@mui/material/Alert'
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined'
import { useAuth } from '@shared/contexts/AuthContext'
import { useTableSort } from '@shared/hooks/useTableSort'
import {
  loadAdoptions, attachProgress, subscribeMyDeptHeadGroups, getDeptHead, STATUS_LABELS,
} from '@shared/lib/textbookAdoption'
import { openBulkRecommendationPrint } from './textbookPrint'
import Layout from '../../components/Layout'
import { ACCENT, ACCENT_BG } from './TextbookSection'

const SORT_GETTERS = {
  subjectName: (r) => r.subjectName || '',
  cycleYear: (r) => r.cycleYear || 0,
  candidateCount: (r) => r.candidates?.length || 0,
  committeeCount: (r) => (r.committeeUids?.length || 0) + (r.externalMembers?.length || 0),
  submitted: (r) => r.submittedCount ?? -1,
  status: (r) => r.status || '',
}

export default function TextbookManagerDashboard() {
  const navigate = useNavigate()
  const { user, schoolId, isAdmin } = useAuth()

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [checkingAccess, setCheckingAccess] = useState(!isAdmin)
  const [myDeptGroups, setMyDeptGroups] = useState([])
  const [selected, setSelected] = useState(new Set())
  const [printing, setPrinting] = useState(false)
  const { toggle, sortData, Ind } = useTableSort('subjectName')

  // 관리자는 전체, 아니면 내가 교과부장으로 지정된 교과군만 — 이 결과가 오기 전까지는
  // "접근 불가"를 성급히 보여주지 않는다.
  useEffect(() => {
    if (isAdmin) { setCheckingAccess(false); return }
    if (!schoolId || !user) return
    const unsub = subscribeMyDeptHeadGroups(schoolId, user.uid, (groups) => {
      setMyDeptGroups(groups)
      setCheckingAccess(false)
    }, () => setCheckingAccess(false))
    return unsub
  }, [schoolId, user, isAdmin])

  const allowed = isAdmin || myDeptGroups.length > 0

  useEffect(() => {
    if (!schoolId || checkingAccess || !allowed) return
    let cancelled = false
    setLoading(true)
    loadAdoptions(schoolId)
      .then((all) => {
        const scoped = isAdmin ? all : all.filter((a) => myDeptGroups.includes(a.subjectGroup))
        return attachProgress(schoolId, scoped)
      })
      .then((withCounts) => { if (!cancelled) setRows(withCounts) })
      .catch((e) => setError(e.message))
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [schoolId, checkingAccess, allowed, isAdmin, myDeptGroups])

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  const toggleSelectAll = () => {
    setSelected((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id))))
  }

  const handleBulkPrint = async () => {
    const targets = rows.filter((r) => selected.has(r.id) && r.recommendation)
    if (!targets.length) return
    setPrinting(true)
    try {
      const groupCache = {}
      const items = []
      for (const adoption of targets) {
        if (adoption.subjectGroup && !(adoption.subjectGroup in groupCache)) {
          groupCache[adoption.subjectGroup] = await getDeptHead(schoolId, adoption.subjectGroup)
        }
        items.push({ adoption, deptHeadName: groupCache[adoption.subjectGroup]?.name || '' })
      }
      openBulkRecommendationPrint(items, `추천의견서_일괄출력_${targets.length}건`)
    } catch (e) {
      setError(`일괄 출력 실패: ${e.message}`)
    } finally {
      setPrinting(false)
    }
  }

  const sorted = useMemo(() => sortData(rows, SORT_GETTERS), [rows, sortData])

  if (checkingAccess) {
    return <Layout><Box display="flex" justifyContent="center" py={6}><CircularProgress sx={{ color: ACCENT }} /></Box></Layout>
  }
  if (!allowed) {
    return <Layout><Alert severity="warning" sx={{ borderRadius: '10px' }}>관리자 또는 교과부장만 전체 현황을 볼 수 있습니다.</Alert></Layout>
  }

  const selectableCount = rows.filter((r) => r.recommendation).length

  return (
    <Layout wide>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5, flexWrap: 'wrap', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{ width: 40, height: 40, borderRadius: '10px', bgcolor: ACCENT_BG, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>📊</Box>
          <Typography sx={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a' }}>
            검·인정도서 선정 — {isAdmin ? '전체 현황' : `${myDeptGroups.map((g) => g.replace(/_/g, '/')).join(', ')} 현황`}
          </Typography>
        </Box>
        <Button
          variant="outlined" size="small" startIcon={<PrintOutlinedIcon />}
          disabled={selected.size === 0 || printing}
          onClick={handleBulkPrint}
          sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 700 }}
        >
          {printing ? '준비 중...' : `선택 ${selected.size}건 서식3 일괄출력`}
        </Button>
      </Box>
      <Typography sx={{ fontSize: '0.85rem', color: '#64748b', mb: 3 }}>
        {isAdmin
          ? '모든 선정 건의 채점 진행 상태를 조회합니다. 선정 건 등록·수정은 관리자 페이지 > 선정 건 관리에서 합니다.'
          : '교과부장으로 지정된 교과군의 선정 건만 보입니다. 추천의견서(서식3)가 있는 건만 일괄출력에 포함됩니다.'}
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
            <TableHead sx={{ '& th': { bgcolor: '#f8fafc', color: '#475569', fontWeight: 700, fontSize: '0.74rem', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' } }}>
              <TableRow>
                <TableCell padding="checkbox">
                  <Checkbox size="small" checked={selected.size > 0 && selected.size === rows.length} indeterminate={selected.size > 0 && selected.size < rows.length} onChange={toggleSelectAll} disabled={selectableCount === 0} />
                </TableCell>
                <TableCell sx={{ cursor: 'pointer' }} onClick={() => toggle('subjectName')}>과목{Ind('subjectName')}</TableCell>
                <TableCell align="center" sx={{ cursor: 'pointer' }} onClick={() => toggle('cycleYear')}>선정연도{Ind('cycleYear')}</TableCell>
                <TableCell align="center" sx={{ cursor: 'pointer' }} onClick={() => toggle('candidateCount')}>후보 수{Ind('candidateCount')}</TableCell>
                <TableCell align="center" sx={{ cursor: 'pointer' }} onClick={() => toggle('committeeCount')}>위원 수{Ind('committeeCount')}</TableCell>
                <TableCell align="center" sx={{ cursor: 'pointer' }} onClick={() => toggle('submitted')}>제출{Ind('submitted')}</TableCell>
                <TableCell align="center" sx={{ cursor: 'pointer' }} onClick={() => toggle('status')}>상태{Ind('status')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sorted.map((r) => (
                <TableRow key={r.id} hover sx={{ '& td': { borderBottom: '1px solid #f1f5f9' } }}>
                  <TableCell padding="checkbox">
                    <Checkbox size="small" checked={selected.has(r.id)} disabled={!r.recommendation} onChange={() => toggleSelect(r.id)} onClick={(e) => e.stopPropagation()} />
                  </TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#1e293b', cursor: 'pointer' }} onClick={() => navigate(`/textbook/${r.id}`)}>{r.subjectName}</TableCell>
                  <TableCell align="center">{r.cycleYear}</TableCell>
                  <TableCell align="center">{r.candidates?.length || 0}</TableCell>
                  <TableCell align="center">
                    {(r.committeeUids?.length || 0) + (r.externalMembers?.length || 0)}
                    {r.externalMembers?.length > 0 && <Typography component="span" variant="caption" color="text.secondary"> (외부 {r.externalMembers.length})</Typography>}
                  </TableCell>
                  <TableCell align="center">{r.submittedCount ?? '-'} / {(r.committeeUids?.length || 0) + (r.externalMembers?.length || 0)}</TableCell>
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
