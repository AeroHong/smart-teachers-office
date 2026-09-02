import { useState, useEffect, useMemo } from 'react'
import { collection, query, where, getDocs } from 'firebase/firestore'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Paper from '@mui/material/Paper'
import Table from '@mui/material/Table'
import TableHead from '@mui/material/TableHead'
import TableBody from '@mui/material/TableBody'
import TableRow from '@mui/material/TableRow'
import TableCell from '@mui/material/TableCell'
import Autocomplete from '@mui/material/Autocomplete'
import TextField from '@mui/material/TextField'
import IconButton from '@mui/material/IconButton'
import Alert from '@mui/material/Alert'
import CircularProgress from '@mui/material/CircularProgress'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { USERS } from '@shared/lib/schema'
import { SUBJECT_GROUPS } from '@shared/lib/subjectData'
import { subscribeDeptHeads, saveDeptHead, removeDeptHead } from '@shared/lib/textbookAdoption'

const STAFF_ROLES = ['teacher', 'admin', 'school_admin', 'principal']

export default function AdminTextbookDeptHeads() {
  const { user, userName, schoolId } = useAuth()

  const [staff, setStaff] = useState([])
  const [deptHeads, setDeptHeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!schoolId) return
    getDocs(query(collection(db, USERS), where('schoolId', '==', schoolId), where('role', 'in', STAFF_ROLES)))
      .then((snap) => setStaff(snap.docs.map((d) => ({ uid: d.id, name: d.data().name || d.data().email, email: d.data().email }))))
      .catch((e) => setError(`교직원 목록 조회 실패: ${e.message}`))
  }, [schoolId])

  useEffect(() => {
    if (!schoolId) return
    const unsub = subscribeDeptHeads(schoolId, (list) => {
      setDeptHeads(list)
      setLoading(false)
    }, (e) => { setError(e.message); setLoading(false) })
    return unsub
  }, [schoolId])

  // 교과군(sanitize된 값)별로 현재 지정된 사람을 찾기 쉽게 맵으로.
  const byGroup = useMemo(() => {
    const map = {}
    deptHeads.forEach((d) => { map[d.subjectGroup] = d })
    return map
  }, [deptHeads])

  const handlePick = async (subjectGroup, picked) => {
    if (!picked) {
      try {
        await removeDeptHead(schoolId, subjectGroup)
      } catch (e) {
        setError(`해제 실패: ${e.message}`)
      }
      return
    }
    try {
      await saveDeptHead(schoolId, subjectGroup, picked, user.uid, userName)
    } catch (e) {
      setError(`지정 실패: ${e.message}`)
    }
  }

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} mb={0.5}>검·인정도서 선정 — 교과부장 지정</Typography>
      <Typography variant="body2" color="text.secondary" mb={3}>
        교과군마다 1명씩 지정합니다. 교과부장은 해당 교과군 전체 선정 현황을 모아 보고,
        평가 총괄표(서식2)의 확인자·추천의견서(서식3)의 작성자가 됩니다.
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {loading ? (
        <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box>
      ) : (
        <Paper variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: '#f9fafb' } }}>
                <TableCell>교과군</TableCell>
                <TableCell>교과부장</TableCell>
                <TableCell align="center" width={56}>관리</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {SUBJECT_GROUPS.map((group) => {
                const current = byGroup[group]
                const currentStaff = current ? { uid: current.uid, name: current.name, email: current.email } : null
                return (
                  <TableRow key={group} hover>
                    <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{group}</TableCell>
                    <TableCell>
                      <Autocomplete
                        size="small"
                        options={staff}
                        getOptionLabel={(o) => o.name || o.email || ''}
                        isOptionEqualToValue={(a, b) => a.uid === b.uid}
                        value={currentStaff}
                        onChange={(_, value) => handlePick(group, value)}
                        renderInput={(params) => <TextField {...params} placeholder="교사 검색" />}
                        sx={{ minWidth: 240 }}
                      />
                    </TableCell>
                    <TableCell align="center">
                      {current && (
                        <IconButton size="small" onClick={() => handlePick(group, null)}>
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
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
