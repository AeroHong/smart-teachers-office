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
import Autocomplete from '@mui/material/Autocomplete'
import Table from '@mui/material/Table'
import TableHead from '@mui/material/TableHead'
import TableBody from '@mui/material/TableBody'
import TableRow from '@mui/material/TableRow'
import TableCell from '@mui/material/TableCell'
import CircularProgress from '@mui/material/CircularProgress'
import Alert from '@mui/material/Alert'
import { useAuth } from '@shared/contexts/AuthContext'
import { db } from '@shared/lib/firebase'
import { USERS, currentSchoolYear } from '@shared/lib/schema'
import {
  subscribeChecks, updateSubjectAssignment, assignedTeacherNames,
  buildTeacherSubjectIndex, subjectIndexKey,
} from '@shared/lib/setukCheck'

const STAFF_ROLES = ['teacher', 'admin', 'school_admin', 'principal']

/** 배정에서 현재 선택된 교사 목록을 Autocomplete가 쓸 {uid,name} 배열로 복원한다. */
function assignedOptions(assign, staffByUid) {
  const uids = Array.isArray(assign?.teacherUids) ? assign.teacherUids : (assign?.teacherUid ? [assign.teacherUid] : [])
  const names = assignedTeacherNames(assign)
  return uids.map((uid, i) => staffByUid[uid] || { uid, name: names[i] || '' })
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

  const rows = useMemo(() => {
    const list = []
    checks.forEach((c) => {
      Object.entries(c.subjectAssignments || {}).forEach(([subjectName, assign]) => {
        list.push({ key: `${c.id}__${subjectName}`, checkId: c.id, classLabel: c.classLabel, grade: c.grade, subjectName, assign })
      })
    })
    return list.sort((a, b) => a.classLabel.localeCompare(b.classLabel, 'ko') || a.subjectName.localeCompare(b.subjectName, 'ko'))
  }, [checks])

  const optionsForRow = (row) => {
    const candidateUids = new Set((teacherIndex[subjectIndexKey(row.grade, row.subjectName)] || []).map((c) => c.uid))
    const narrowed = staff.filter((s) => candidateUids.has(s.uid))
    return narrowed.length > 0 ? narrowed : staff
  }

  const handleAssign = async (row, staffOptions) => {
    try {
      await updateSubjectAssignment(schoolId, row.checkId, row.subjectName, staffOptions)
    } catch (e) {
      setError(`담당교사 지정 실패: ${e.message}`)
    }
  }

  if (loadingChecks) return <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box>

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.82rem', mb: 1.5 }}>
        학급마다 들어가지 않고 전체 학급의 과목별 담당 교사를 여기서 한 번에 확인·수정할 수 있습니다. 한 과목을 여러 교사가 나눠 맡는다면 여러 명을 선택하세요.
        {!isAdmin && ' 수정은 관리자만 가능합니다.'}
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {rows.length === 0 ? (
        <Paper variant="outlined" sx={{ py: 4, textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>표시할 항목이 없습니다.</Paper>
      ) : (
        <Paper variant="outlined">
          <Table size="small" sx={{ '& td, & th': { fontSize: '0.8rem', py: 0.5 } }}>
            <TableHead>
              <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: '#f9fafb' } }}>
                <TableCell>학급</TableCell>
                <TableCell>과목</TableCell>
                <TableCell>담당 교사</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.key} hover>
                  <TableCell sx={{ color: '#64748b' }}>{row.classLabel}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{row.subjectName}</TableCell>
                  <TableCell sx={{ minWidth: 260 }}>
                    {isAdmin ? (
                      <Autocomplete
                        multiple size="small" sx={{ minWidth: 260, '& .MuiAutocomplete-tag': { fontSize: '0.72rem', height: 20 } }}
                        options={optionsForRow(row)}
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
