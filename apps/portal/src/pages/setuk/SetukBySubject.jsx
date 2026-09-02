// 과목별 보기 — "학급별 목록"과 같은 방식으로, 담당 과목마다 전체/미처리 건수를 목록으로
// 보여준다. 과목을 클릭하면 별도 페이지(SetukSubjectDetail)로 이동해 그 과목의
// 학급×학생 상세를 본다.
import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Chip from '@mui/material/Chip'
import Table from '@mui/material/Table'
import TableHead from '@mui/material/TableHead'
import TableBody from '@mui/material/TableBody'
import TableRow from '@mui/material/TableRow'
import TableCell from '@mui/material/TableCell'
import CircularProgress from '@mui/material/CircularProgress'
import Alert from '@mui/material/Alert'
import { useAuth } from '@shared/contexts/AuthContext'
import { subscribeChecks, loadItemsBySubject } from '@shared/lib/setukCheck'

export default function SetukBySubject() {
  const navigate = useNavigate()
  const { user, schoolId, isAdmin } = useAuth()

  const [checks, setChecks] = useState([])
  const [loadingChecks, setLoadingChecks] = useState(true)
  const [subjectStats, setSubjectStats] = useState({})
  const [loadingStats, setLoadingStats] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!schoolId) return
    return subscribeChecks(schoolId, (list) => { setChecks(list); setLoadingChecks(false) }, (err) => { setError(err.message); setLoadingChecks(false) })
  }, [schoolId])

  // "이 교사가 자격이 있는" 과목 = 관리자면 전체, 아니면 자신이 담당으로 배정됐거나
  // 자신이 업로드한(담임인) 학급에 등장하는 과목들의 합집합.
  const mySubjects = useMemo(() => {
    const set = new Set()
    checks.forEach((c) => {
      Object.entries(c.subjectAssignments || {}).forEach(([subjectName, a]) => {
        if (isAdmin || c.uploadedByUid === user?.uid || a?.teacherUid === user?.uid) set.add(subjectName)
      })
    })
    return [...set].sort((a, b) => a.localeCompare(b, 'ko'))
  }, [checks, isAdmin, user])

  // 과목마다 전체/미처리 건수를 미리 집계해 둔다("학급별 목록"과 같은 방식).
  useEffect(() => {
    if (mySubjects.length === 0 || checks.length === 0) { setSubjectStats({}); return }
    let cancelled = false
    setLoadingStats(true)
    Promise.all(mySubjects.map(async (subjectName) => {
      const relevantChecks = checks.filter((c) => (
        Object.prototype.hasOwnProperty.call(c.subjectAssignments || {}, subjectName) &&
        (isAdmin || c.uploadedByUid === user?.uid || c.subjectAssignments?.[subjectName]?.teacherUid === user?.uid)
      ))
      const itemsPerCheck = await Promise.all(relevantChecks.map((c) => loadItemsBySubject(schoolId, c.id, subjectName)))
      const allItems = itemsPerCheck.flat()
      return [subjectName, { total: allItems.length, unresolved: allItems.filter((it) => !it.resolved).length }]
    }))
      .then((entries) => { if (!cancelled) setSubjectStats(Object.fromEntries(entries)) })
      .catch((e) => !cancelled && setError(`과목별 집계 실패: ${e.message}`))
      .finally(() => !cancelled && setLoadingStats(false))
    return () => { cancelled = true }
  }, [mySubjects, checks, schoolId, isAdmin, user])

  if (loadingChecks) return <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box>

  if (mySubjects.length === 0) {
    return <Alert severity="info">배정된 담당 과목이 없습니다. 관리자에게 과목별 담당 교사 지정을 요청하세요.</Alert>
  }

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      <Paper variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: '#f9fafb' } }}>
              <TableCell>과목</TableCell>
              <TableCell align="center">전체 항목</TableCell>
              <TableCell align="center">미처리</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {mySubjects.map((s) => {
              const stat = subjectStats[s]
              return (
                <TableRow key={s} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/setuk/subject/${encodeURIComponent(s)}`)}>
                  <TableCell sx={{ fontWeight: 600 }}>{s}</TableCell>
                  <TableCell align="center">
                    {loadingStats && !stat ? <CircularProgress size={14} /> : (stat?.total ?? '-')}
                  </TableCell>
                  <TableCell align="center">
                    {loadingStats && !stat ? <CircularProgress size={14} /> : (
                      <Chip
                        size="small"
                        label={stat?.unresolved ?? 0}
                        color={(stat?.unresolved ?? 0) > 0 ? 'warning' : 'success'}
                      />
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Paper>
    </Box>
  )
}
