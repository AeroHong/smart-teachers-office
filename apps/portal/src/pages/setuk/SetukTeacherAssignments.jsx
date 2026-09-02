// 과목별 담당 교사 지정 — 예전엔 학급 상세 화면(SetukCheckDetail)에 들어가야만 보였는데,
// 관리자가 학급마다 들어가지 않고 한 화면에서 전체 배정을 훑고 고칠 수 있게 모아뒀다.
// 조회는 교사 전체, 수정은 관리자만(firestore.rules로 서버에서도 강제).
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
import { USERS } from '@shared/lib/schema'
import { subscribeChecks, updateSubjectAssignment } from '@shared/lib/setukCheck'

const STAFF_ROLES = ['teacher', 'admin', 'school_admin', 'principal']

export default function SetukTeacherAssignments() {
  const { schoolId, isAdmin } = useAuth()

  const [checks, setChecks] = useState([])
  const [loadingChecks, setLoadingChecks] = useState(true)
  const [staff, setStaff] = useState([])
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

  const staffByUid = useMemo(() => Object.fromEntries(staff.map((s) => [s.uid, s])), [staff])

  const rows = useMemo(() => {
    const list = []
    checks.forEach((c) => {
      Object.entries(c.subjectAssignments || {}).forEach(([subjectName, assign]) => {
        list.push({ key: `${c.id}__${subjectName}`, checkId: c.id, classLabel: c.classLabel, subjectName, assign })
      })
    })
    return list.sort((a, b) => a.classLabel.localeCompare(b.classLabel, 'ko') || a.subjectName.localeCompare(b.subjectName, 'ko'))
  }, [checks])

  const handleAssign = async (row, staffOption) => {
    try {
      await updateSubjectAssignment(schoolId, row.checkId, row.subjectName, staffOption?.uid || '', staffOption?.name || '')
    } catch (e) {
      setError(`담당교사 지정 실패: ${e.message}`)
    }
  }

  if (loadingChecks) return <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box>

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" mb={2}>
        학급마다 들어가지 않고 전체 학급의 과목별 담당 교사를 여기서 한 번에 확인·수정할 수 있습니다.
        {!isAdmin && ' 수정은 관리자만 가능합니다.'}
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {rows.length === 0 ? (
        <Paper variant="outlined" sx={{ py: 4, textAlign: 'center', color: '#94a3b8' }}>표시할 항목이 없습니다.</Paper>
      ) : (
        <Paper variant="outlined">
          <Table size="small">
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
                  <TableCell sx={{ fontSize: '0.85rem' }}>{row.classLabel}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{row.subjectName}</TableCell>
                  <TableCell sx={{ minWidth: 220 }}>
                    {isAdmin ? (
                      <Autocomplete
                        size="small" sx={{ width: 220 }}
                        options={staff}
                        getOptionLabel={(o) => o.name || ''}
                        isOptionEqualToValue={(a, b) => a.uid === b.uid}
                        value={row.assign?.teacherUid ? (staffByUid[row.assign.teacherUid] || { uid: row.assign.teacherUid, name: row.assign.teacherName }) : null}
                        onChange={(_, value) => handleAssign(row, value)}
                        renderInput={(params) => (
                          <TextField {...params} placeholder="미지정" color={row.assign?.source === 'auto' ? 'success' : undefined} />
                        )}
                      />
                    ) : (
                      <Chip
                        size="small" variant="outlined"
                        label={row.assign?.teacherName || '미지정'}
                      />
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
