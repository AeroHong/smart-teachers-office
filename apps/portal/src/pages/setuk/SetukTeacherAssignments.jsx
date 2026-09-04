// 과목별 담당 교사 지정 — 예전엔 학급 상세 화면(SetukCheckDetail)에 들어가야만 보였는데,
// 관리자가 학급마다 들어가지 않고 한 화면에서 전체 배정을 훑고 고칠 수 있게 모아뒀다.
// 조회는 교사 전체, 수정은 관리자만(firestore.rules로 서버에서도 강제). 한 과목을
// 여러 교사가 나눠 맡는 경우(공동 수업 등)가 있어 다중 선택으로 받는다.
import { useState, useEffect, useMemo } from 'react'
import { collection, query, where, getDocs } from 'firebase/firestore'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Paper from '@mui/material/Paper'
import Chip from '@mui/material/Chip'
import TextField from '@mui/material/TextField'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import Autocomplete, { createFilterOptions } from '@mui/material/Autocomplete'
import Table from '@mui/material/Table'
import TableHead from '@mui/material/TableHead'
import TableBody from '@mui/material/TableBody'
import TableRow from '@mui/material/TableRow'
import TableCell from '@mui/material/TableCell'
import CircularProgress from '@mui/material/CircularProgress'
import Alert from '@mui/material/Alert'
import { useAuth } from '@shared/contexts/AuthContext'
import { useTableSort } from '@shared/hooks/useTableSort'
import { db } from '@shared/lib/firebase'
import { USERS, currentSchoolYear } from '@shared/lib/schema'
import {
  subscribeChecks, updateSubjectAssignment, assignedTeacherNames,
  buildTeacherSubjectIndex, subjectIndexKey,
} from '@shared/lib/setukCheck'
import { useSetukTermFilter, useSetukTermBackfill, filterChecksByTerm, SetukTermFilterControls } from './setukShared'

const STAFF_ROLES = ['teacher', 'admin', 'school_admin', 'principal']
const thSortSx = { cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }

/** 배정에서 현재 선택된 교사 목록을 Autocomplete가 쓸 {uid,name} 배열로 복원한다. */
function assignedOptions(assign, staffByUid) {
  const uids = Array.isArray(assign?.teacherUids) ? assign.teacherUids : (assign?.teacherUid ? [assign.teacherUid] : [])
  const names = assignedTeacherNames(assign)
  return uids.map((uid, i) => staffByUid[uid] || { uid, name: names[i] || '' })
}

/** 같은 학년 접두어를 공유하는 학급명들을 "2학년 1,2,3반"처럼 압축해서 보여준다. */
function formatClassLabels(labels) {
  if (labels.length === 1) return labels[0]
  const parsed = labels.map((l) => l.match(/^(\d+학년)\s*(\d+반)$/))
  if (parsed.every(Boolean) && new Set(parsed.map((p) => p[1])).size === 1) {
    return `${parsed[0][1]} ${parsed.map((p) => p[2].replace('반', '')).join(',')}반`
  }
  return labels.join(', ')
}

export default function SetukTeacherAssignments() {
  const { schoolId, isAdmin } = useAuth()

  const [checks, setChecks] = useState([])
  const [loadingChecks, setLoadingChecks] = useState(true)
  const [staff, setStaff] = useState([])
  const [teacherIndex, setTeacherIndex] = useState({})
  const [error, setError] = useState('')

  useEffect(() => {
    if (!schoolId) return
    return subscribeChecks(schoolId, (list) => { setChecks(list); setLoadingChecks(false) }, (err) => { setError(err.message); setLoadingChecks(false) })
  }, [schoolId])

  // year/semester가 생기기 전에 업로드된 건은 필터가 항상 통과시켜 둔 채라 학기로
  // 걸러지지 않는다 — 이 화면을 관리자가 열어볼 때 그런 건을 한 번씩 지연 보정한다.
  useSetukTermBackfill(schoolId, checks, isAdmin)

  useEffect(() => {
    if (!schoolId) return
    getDocs(query(collection(db, USERS), where('schoolId', '==', schoolId), where('role', 'in', STAFF_ROLES)))
      .then((snap) => setStaff(snap.docs.map((d) => ({ uid: d.id, name: d.data().name || d.data().email }))))
      .catch(() => {})
  }, [schoolId])

  // 업로드 시 자동 매칭에 쓰는 것과 같은 인덱스(학년+과목명 → 그 과목을 가르치는 교사
  // 후보) — 드롭다운을 전체 교사 대신 그 과목 후보로 좁히는 데 재사용한다. 후보가
  // 없으면(교과 정보가 아직 없거나 데이터가 안 맞는 경우) 전체 목록으로 폴백한다.
  useEffect(() => {
    if (!schoolId) return
    buildTeacherSubjectIndex(schoolId, currentSchoolYear()).then(setTeacherIndex).catch(() => {})
  }, [schoolId])

  const staffByUid = useMemo(() => Object.fromEntries(staff.map((s) => [s.uid, s])), [staff])

  // 현재 등록된 데이터 중 가장 최근 것의 학년도-학기를 기본값으로 쓴다.
  const { year, setYear, semester, setSemester } = useSetukTermFilter(checks)
  const filteredChecks = useMemo(() => filterChecksByTerm(checks, year, semester), [checks, year, semester])

  // 과목마다 학급 수만큼 같은 줄이 반복되는 게 대부분이었다(실측 — 공통 과목은 거의
  // 전 학급이 같은 교사). 그래서 "같은 과목 + 같은 교사 배정"을 공유하는 학급들은
  // 한 줄로 모아 보여주고, 교사를 바꾸면 그 줄에 속한 학급 전체에 한 번에 반영한다
  // (subjectAssignments 자체는 여전히 학급별로 따로 저장돼 있으므로, 실제로 학급마다
  // 다른 교사가 배정된 경우는 자동으로 별도 줄로 분리된다). 학년을 시그니처에 포함해,
  // 서로 다른 학년의 과목이 우연히 같은 이름·같은(빈) 배정으로 한 줄에 섞이지 않게 한다.
  const rows = useMemo(() => {
    const bySubject = new Map()
    filteredChecks.forEach((c) => {
      Object.entries(c.subjectAssignments || {}).forEach(([subjectName, assign]) => {
        const uids = Array.isArray(assign?.teacherUids) ? assign.teacherUids : (assign?.teacherUid ? [assign.teacherUid] : [])
        // 담당자 없음(전입 등)으로 표시한 과목은 교사가 없다는 것 자체가 배정 상태라,
        // 아직 아무도 지정 안 한 빈 배열(sigKey '')과 섞이지 않게 별도 시그니처로 묶는다.
        const sigKey = `${c.grade}__${assign?.noAssignment ? '__NO_ASSIGNMENT__' : [...uids].sort().join(',')}`
        if (!bySubject.has(subjectName)) bySubject.set(subjectName, new Map())
        const groups = bySubject.get(subjectName)
        if (!groups.has(sigKey)) groups.set(sigKey, { subjectName, grade: c.grade, assign, classLabels: [], checkIds: [] })
        const g = groups.get(sigKey)
        g.classLabels.push(c.classLabel)
        g.checkIds.push(c.id)
      })
    })
    const list = []
    bySubject.forEach((groups) => {
      groups.forEach((g, sigKey) => {
        g.classLabels.sort((a, b) => a.localeCompare(b, 'ko'))
        list.push({ key: `${g.subjectName}__${sigKey}`, ...g })
      })
    })
    return list.sort((a, b) => (a.grade || 0) - (b.grade || 0) ||
      a.subjectName.localeCompare(b.subjectName, 'ko') || a.classLabels.join(',').localeCompare(b.classLabels.join(','), 'ko'))
  }, [filteredChecks])

  // 헤더 클릭 정렬 — 기본(클릭 전)은 위에서 만든 학년→과목→학급 순서를 그대로 쓴다.
  const rowSort = useTableSort()
  const rowSortGetters = {
    grade: (r) => r.grade,
    classLabels: (r) => formatClassLabels(r.classLabels),
    subjectName: (r) => r.subjectName,
    teacher: (r) => assignedTeacherNames(r.assign).join(','),
  }

  // 기본(입력 전)은 그 과목의 교과 배정 후보만 보여주되, 이름을 직접 입력하면
  // 그 후보 목록을 벗어나 전체 교직원 중에서 검색되게 한다 — 교과 배정 데이터가
  // 없거나 틀린 과목(선택과목 등)도 이름만 알면 바로 지정할 수 있어야 하므로.
  const defaultFilter = useMemo(() => createFilterOptions(), [])
  const filterOptionsForRow = (row) => (options, state) => {
    if (!state.inputValue) {
      const candidateUids = new Set((teacherIndex[subjectIndexKey(row.grade, row.subjectName)] || []).map((c) => c.uid))
      const narrowed = options.filter((o) => candidateUids.has(o.uid))
      return narrowed.length > 0 ? narrowed : options
    }
    return defaultFilter(options, state)
  }

  const handleAssign = async (row, staffOptions) => {
    try {
      await Promise.all(row.checkIds.map((checkId) => updateSubjectAssignment(schoolId, checkId, row.subjectName, staffOptions)))
    } catch (e) {
      setError(`담당교사 지정 실패: ${e.message}`)
    }
  }

  // 전입생 등으로 우리 학교엔 개설되지 않아 담당 교사를 지정할 수 없는 과목을 체크로
  // 표시한다. 체크하면 그 과목은 "담당 교사 없음"이 확정 상태가 되어(미지정과 구분됨),
  // 학급 상세 화면에서 담임도 처리완료를 표시할 수 있도록 열린다(관리자 전용이 풀림).
  const handleNoAssignmentToggle = async (row, checked) => {
    try {
      await Promise.all(row.checkIds.map((checkId) => updateSubjectAssignment(schoolId, checkId, row.subjectName, [], checked)))
    } catch (e) {
      setError(`설정 실패: ${e.message}`)
    }
  }

  if (loadingChecks) return <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box>

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.82rem', mb: 1.5 }}>
        학급마다 들어가지 않고 전체 학급의 과목별 담당 교사를 여기서 한 번에 확인·수정할 수 있습니다. 한 과목을 여러 교사가 나눠 맡는다면 여러 명을 선택하세요.
        같은 과목을 같은 교사가 맡는 학급은 한 줄로 모아 보여주며, 교사를 바꾸면 그 줄에 속한 학급 전체에 한 번에 반영됩니다(학급마다 실제로 다른 교사가 맡고 있다면 자동으로 줄이 나뉩니다).
        전입생 등으로 우리 학교에 개설되지 않은 과목은 "담당자 없음(전입 등)"을 체크하면 담당 교사 없이도 담임이 처리완료까지 표시할 수 있게 열립니다.
        {!isAdmin && ' 수정은 관리자만 가능합니다.'}
      </Typography>

      <SetukTermFilterControls year={year} semester={semester} onYearChange={setYear} onSemesterChange={setSemester} />

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {rows.length === 0 ? (
        <Paper variant="outlined" sx={{ py: 4, textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>표시할 항목이 없습니다.</Paper>
      ) : (
        <Paper variant="outlined">
          <Table size="small" sx={{ '& td, & th': { fontSize: '0.8rem', py: 0.5 } }}>
            <TableHead>
              <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: '#f9fafb' } }}>
                <TableCell sx={thSortSx} onClick={() => rowSort.toggle('grade')}>학년-학기{rowSort.Ind('grade')}</TableCell>
                <TableCell sx={thSortSx} onClick={() => rowSort.toggle('classLabels')}>학급{rowSort.Ind('classLabels')}</TableCell>
                <TableCell sx={thSortSx} onClick={() => rowSort.toggle('subjectName')}>과목{rowSort.Ind('subjectName')}</TableCell>
                <TableCell sx={thSortSx} onClick={() => rowSort.toggle('teacher')}>담당 교사{rowSort.Ind('teacher')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rowSort.sortData(rows, rowSortGetters).map((row) => (
                <TableRow key={row.key} hover>
                  <TableCell sx={{ color: '#64748b', whiteSpace: 'nowrap' }}>{row.grade}학년-{semester}학기</TableCell>
                  <TableCell sx={{ color: '#64748b' }}>{formatClassLabels(row.classLabels)}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{row.subjectName}</TableCell>
                  <TableCell sx={{ minWidth: 260 }}>
                    {isAdmin ? (
                      <Box>
                        {row.assign?.noAssignment ? (
                          <Typography sx={{ fontSize: '0.8rem', color: '#94a3b8', fontStyle: 'italic' }}>담당자 없음 (전입 등)</Typography>
                        ) : (
                          <Autocomplete
                            multiple size="small" sx={{ minWidth: 260, '& .MuiAutocomplete-tag': { fontSize: '0.72rem', height: 20 } }}
                            options={staff}
                            filterOptions={filterOptionsForRow(row)}
                            getOptionLabel={(o) => o.name || ''}
                            isOptionEqualToValue={(a, b) => a.uid === b.uid}
                            value={assignedOptions(row.assign, staffByUid)}
                            onChange={(_, values) => handleAssign(row, values)}
                            ListboxProps={{ sx: { fontSize: '0.8rem', '& .MuiAutocomplete-option': { minHeight: 32, py: 0.5 } } }}
                            renderInput={(params) => (
                              <TextField
                                {...params} variant="standard" placeholder={assignedOptions(row.assign, staffByUid).length ? '' : '미지정'}
                                sx={{ '& .MuiInputBase-input': { fontSize: '0.8rem' } }}
                              />
                            )}
                          />
                        )}
                        {/* 이미 담당 교사가 지정된 과목엔 "담당자 없음" 체크가 의미 없으니
                            teacherUids가 비어 있을 때(또는 이미 no-assignment로 표시된
                            상태에서 해제할 때)만 보여준다. */}
                        {!assignedOptions(row.assign, staffByUid).length && (
                          <FormControlLabel
                            sx={{ ml: 0, mt: 0.25, '& .MuiFormControlLabel-label': { fontSize: '0.7rem', color: '#94a3b8' } }}
                            control={(
                              <Checkbox
                                size="small" checked={!!row.assign?.noAssignment}
                                onChange={(e) => handleNoAssignmentToggle(row, e.target.checked)}
                              />
                            )}
                            label="담당자 없음 (전입 등)"
                          />
                        )}
                      </Box>
                    ) : row.assign?.noAssignment ? (
                      <Typography sx={{ fontSize: '0.8rem', color: '#94a3b8', fontStyle: 'italic' }}>담당자 없음 (전입 등)</Typography>
                    ) : (
                      assignedTeacherNames(row.assign).length ? (
                        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                          {assignedTeacherNames(row.assign).map((name) => (
                            <Chip key={name} size="small" variant="outlined" label={name} sx={{ fontSize: '0.72rem', height: 20 }} />
                          ))}
                        </Box>
                      ) : (
                        <Typography sx={{ fontSize: '0.8rem', color: '#94a3b8' }}>미지정</Typography>
                      )
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}
    </Box>
  )
}
