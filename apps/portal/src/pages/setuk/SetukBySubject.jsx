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
import { useTableSort } from '@shared/hooks/useTableSort'
import { subscribeChecks, loadItemsBySubject, isAssignedTeacher, renameSubjectAcrossChecks } from '@shared/lib/setukCheck'
import {
  useSetukTermFilter, useSetukTermBackfill, filterChecksByTerm, SetukTermFilterControls,
  useSetukDictionaryVersion, DictionaryVersionChip,
} from './setukShared'

const thSortSx = { cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }

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
  const dictDoc = useSetukDictionaryVersion(schoolId)

  useEffect(() => {
    if (!schoolId) return
    return subscribeChecks(schoolId, (list) => { setChecks(list); setLoadingChecks(false) }, (err) => { setError(err.message); setLoadingChecks(false) })
  }, [schoolId])

  // "학급별 목록"·"과목별 담당 교사"와 같은 학년도-학기 필터.
  const { year, setYear, semester, setSemester } = useSetukTermFilter(checks)
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

  // 과목마다 그 과목을 볼 자격이 있는 학급(check) 목록 — 통계 집계와 점검 기준
  // 버전 표시가 똑같은 기준으로 학급을 골라야 해서 한 곳에서 계산해 재사용한다.
  const subjectRelevantChecks = useMemo(() => {
    const map = {}
    mySubjects.forEach((subjectName) => {
      map[subjectName] = filteredChecks.filter((c) => (
        Object.prototype.hasOwnProperty.call(c.subjectAssignments || {}, subjectName) &&
        canSeeCheckForSubject(c, subjectName, isAdmin, user)
      ))
    })
    return map
  }, [mySubjects, filteredChecks, isAdmin, user])

  // 전입생 등으로 우리 학교에 개설되지 않아 담당 교사를 지정할 수 없다고 표시한
  // 과목("과목별 담당 교사" 화면의 노 아님 체크)인지 — 여러 학급 중 하나라도 그렇게
  // 표시돼 있으면 이 목록에서도 놓치지 않도록 보여준다.
  const subjectNoAssignment = useMemo(() => {
    const map = {}
    Object.entries(subjectRelevantChecks).forEach(([subjectName, list]) => {
      map[subjectName] = list.some((c) => c.subjectAssignments?.[subjectName]?.noAssignment)
    })
    return map
  }, [subjectRelevantChecks])

  // 한 과목이 여러 학급에 걸쳐 있어 학급마다 점검 기준 버전이 다를 수 있다 — 가장
  // 오래된(낮은) 버전을 대표로 보여준다. 하나라도 최신이 아니면 "다시 점검 필요"를
  // 놓치지 않기 위함(DictionaryVersionChip이 이 값과 현재 버전을 비교해 표시한다).
  const subjectMinVersion = useMemo(() => {
    const map = {}
    Object.entries(subjectRelevantChecks).forEach(([subjectName, list]) => {
      const versions = list.map((c) => c.dictionaryVersion || 0)
      map[subjectName] = versions.length ? Math.min(...versions) : 0
    })
    return map
  }, [subjectRelevantChecks])

  // 헤더 클릭 정렬 — mySubjects는 문자열 배열이라 getter가 항목(과목명) 자체를 받아
  // subjectStats에서 필요한 값을 찾아 반환한다. 기본(클릭 전)은 mySubjects의 가나다순을
  // 그대로 쓴다.
  const subjectSort = useTableSort()
  const subjectSortGetters = {
    subject: (s) => s,
    total: (s) => subjectStats[s]?.total,
    unresolved: (s) => subjectStats[s]?.unresolved,
    version: (s) => subjectMinVersion[s],
  }

  // 과목마다 전체/미처리 건수를 미리 집계해 둔다("학급별 목록"과 같은 방식).
  useEffect(() => {
    if (mySubjects.length === 0 || filteredChecks.length === 0) { setSubjectStats({}); return }
    let cancelled = false
    setLoadingStats(true)
    Promise.all(mySubjects.map(async (subjectName) => {
      const relevantChecks = subjectRelevantChecks[subjectName] || []
      const itemsPerCheck = await Promise.all(relevantChecks.map((c) => loadItemsBySubject(schoolId, c.id, subjectName)))
      const allItems = itemsPerCheck.flat()
      return [subjectName, { total: allItems.length, unresolved: allItems.filter((it) => !it.resolved).length }]
    }))
      .then((entries) => { if (!cancelled) setSubjectStats(Object.fromEntries(entries)) })
      .catch((e) => !cancelled && setError(`과목별 집계 실패: ${e.message}`))
      .finally(() => !cancelled && setLoadingStats(false))
    return () => { cancelled = true }
  }, [mySubjects, filteredChecks, schoolId, subjectRelevantChecks])

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
              <TableCell sx={thSortSx} onClick={() => subjectSort.toggle('subject')}>과목{subjectSort.Ind('subject')}</TableCell>
              <TableCell align="center" sx={thSortSx} onClick={() => subjectSort.toggle('total')}>전체 항목{subjectSort.Ind('total')}</TableCell>
              <TableCell align="center" sx={thSortSx} onClick={() => subjectSort.toggle('unresolved')}>미처리{subjectSort.Ind('unresolved')}</TableCell>
              <TableCell sx={thSortSx} onClick={() => subjectSort.toggle('version')}>점검 기준{subjectSort.Ind('version')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {subjectSort.sortData(mySubjects, subjectSortGetters).map((s) => {
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
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6, flexWrap: 'wrap' }}>
                        {s}
                        {subjectNoAssignment[s] && (
                          <Chip size="small" variant="outlined" color="warning" label="담당자 없음(전입)" sx={{ fontSize: '0.68rem', height: 20 }} />
                        )}
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
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DictionaryVersionChip version={subjectMinVersion[s]} dictDoc={dictDoc} />
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
