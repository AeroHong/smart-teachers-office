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
import TextField from '@mui/material/TextField'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import CheckIcon from '@mui/icons-material/Check'
import CloseIcon from '@mui/icons-material/Close'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import { useAuth } from '@shared/contexts/AuthContext'
import { subscribeChecks, loadItemsBySubject, isAssignedTeacher, renameSubjectAcrossChecks } from '@shared/lib/setukCheck'
import { useSetukTermFilter, useSetukTermBackfill, filterChecksByTerm, SetukTermFilterControls } from './setukShared'

// 이 교사가 어떤 학급의 항목을 볼 자격이 있는지 — 관리자, 그 학급 담임(업로더),
// 그 과목의 담당 교사(여러 명 가능)만.
const canSeeCheckForSubject = (check, subjectName, isAdmin, user) => (
  isAdmin || check.uploadedByUid === user?.uid || isAssignedTeacher(check.subjectAssignments?.[subjectName], user?.uid)
)

export default function SetukBySubject() {
  const navigate = useNavigate()
  const { user, schoolId, isAdmin } = useAuth()

  const [checks, setChecks] = useState([])
  const [loadingChecks, setLoadingChecks] = useState(true)
  const [subjectStats, setSubjectStats] = useState({})
  const [loadingStats, setLoadingStats] = useState(false)
  const [error, setError] = useState('')
  const [editingSubject, setEditingSubject] = useState(null) // { oldName, value }
  const [savingSubject, setSavingSubject] = useState(false)

  useEffect(() => {
    if (!schoolId) return
    return subscribeChecks(schoolId, (list) => { setChecks(list); setLoadingChecks(false) }, (err) => { setError(err.message); setLoadingChecks(false) })
  }, [schoolId])

  // "학급별 목록"·"과목별 담당 교사"와 같은 학년도-학기 필터.
  const { year, setYear, semester, setSemester } = useSetukTermFilter(schoolId)
  useSetukTermBackfill(schoolId, checks, isAdmin)
  const filteredChecks = useMemo(() => filterChecksByTerm(checks, year, semester), [checks, year, semester])

  // "이 교사가 자격이 있는" 과목 = 관리자면 전체, 아니면 자신이 담당으로 배정됐거나
  // 자신이 업로드한(담임인) 학급에 등장하는 과목들의 합집합.
  const mySubjects = useMemo(() => {
    const set = new Set()
    filteredChecks.forEach((c) => {
      Object.entries(c.subjectAssignments || {}).forEach(([subjectName, a]) => {
        if (isAdmin || c.uploadedByUid === user?.uid || isAssignedTeacher(a, user?.uid)) set.add(subjectName)
      })
    })
    return [...set].sort((a, b) => a.localeCompare(b, 'ko'))
  }, [filteredChecks, isAdmin, user])

  // 과목마다 전체/미처리 건수를 미리 집계해 둔다("학급별 목록"과 같은 방식).
  useEffect(() => {
    if (mySubjects.length === 0 || filteredChecks.length === 0) { setSubjectStats({}); return }
    let cancelled = false
    setLoadingStats(true)
    Promise.all(mySubjects.map(async (subjectName) => {
      const relevantChecks = filteredChecks.filter((c) => (
        Object.prototype.hasOwnProperty.call(c.subjectAssignments || {}, subjectName) &&
        canSeeCheckForSubject(c, subjectName, isAdmin, user)
      ))
      const itemsPerCheck = await Promise.all(relevantChecks.map((c) => loadItemsBySubject(schoolId, c.id, subjectName)))
      const allItems = itemsPerCheck.flat()
      return [subjectName, { total: allItems.length, unresolved: allItems.filter((it) => !it.resolved).length }]
    }))
      .then((entries) => { if (!cancelled) setSubjectStats(Object.fromEntries(entries)) })
      .catch((e) => !cancelled && setError(`과목별 집계 실패: ${e.message}`))
      .finally(() => !cancelled && setLoadingStats(false))
    return () => { cancelled = true }
  }, [mySubjects, filteredChecks, schoolId, isAdmin, user])

  // 나이스 파싱이 잘못 잘라낸 과목명을 고친다. 이 화면은 여러 학급을 모아 과목
  // 단위로 보여주므로, 그 이름을 쓰는 학급을 전부 찾아 한 번에 고친다
  // (renameSubjectAcrossChecks). 고친 이름이 이미 있는 과목이면 자동으로 합쳐진다.
  const handleSaveSubject = async () => {
    if (!editingSubject) return
    const value = editingSubject.value.trim()
    if (!value) { setError('과목명을 입력하세요.'); return }
    setSavingSubject(true)
    setError('')
    try {
      await renameSubjectAcrossChecks(schoolId, checks, editingSubject.oldName, value)
      setEditingSubject(null)
    } catch (e) {
      setError(`과목명 수정 실패: ${e.message}`)
    } finally {
      setSavingSubject(false)
    }
  }

  if (loadingChecks) return <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box>

  return (
    <Box>
      <SetukTermFilterControls year={year} semester={semester} onYearChange={setYear} onSemesterChange={setSemester} />

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {mySubjects.length === 0 ? (
        <Alert severity="info">배정된 담당 과목이 없습니다(선택한 학년도·학기 기준). 관리자에게 과목별 담당 교사 지정을 요청하세요.</Alert>
      ) : (
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
              const isEditingThis = editingSubject?.oldName === s
              return (
                <TableRow key={s} hover sx={{ cursor: isEditingThis ? 'default' : 'pointer' }} onClick={() => !isEditingThis && navigate(`/setuk/subject/${encodeURIComponent(s)}`)}>
                  <TableCell sx={{ fontWeight: 600 }}>
                    {isEditingThis ? (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4 }} onClick={(e) => e.stopPropagation()}>
                        <TextField
                          size="small" variant="standard" autoFocus value={editingSubject.value}
                          disabled={savingSubject}
                          onChange={(e) => setEditingSubject((v) => ({ ...v, value: e.target.value }))}
                          onKeyDown={(e) => {
                            e.stopPropagation()
                            if (e.key === 'Enter') handleSaveSubject()
                            if (e.key === 'Escape') setEditingSubject(null)
                          }}
                        />
                        <IconButton size="small" disabled={savingSubject} onClick={handleSaveSubject}>
                          {savingSubject ? <CircularProgress size={14} /> : <CheckIcon fontSize="small" color="success" />}
                        </IconButton>
                        <IconButton size="small" disabled={savingSubject} onClick={() => setEditingSubject(null)}>
                          <CloseIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    ) : (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.3 }}>
                        {s}
                        <Tooltip title="과목명이 잘못 인식됐다면 고치세요 — 고친 이름이 이미 있는 과목이면 자동으로 그 과목에 합쳐집니다.">
                          <IconButton
                            size="small"
                            onClick={(e) => { e.stopPropagation(); setEditingSubject({ oldName: s, value: s }) }}
                          >
                            <EditOutlinedIcon sx={{ fontSize: 15 }} />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    )}
                  </TableCell>
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
      )}
    </Box>
  )
}
