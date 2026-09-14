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
import Alert from '@mui/material/Alert'
import CircularProgress from '@mui/material/CircularProgress'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { USERS } from '@shared/lib/schema'
import { SUBJECT_GROUPS } from '@shared/lib/subjectData'
import { subscribeDeptHeads, saveDeptHead, removeDeptHead } from '@shared/lib/textbookAdoption'

const STAFF_ROLES = ['teacher', 'admin', 'school_admin', 'principal']

// PostComposer.jsx의 "담당자" Autocomplete와 같은 스타일(칩+개별 삭제+필드 클리어 버튼).
// value를 Firestore 구독 결과(byGroup)에서 곧바로 계산해 쓰면, 선택 직후 Firestore
// 왕복이 끝나기 전까지 컨트롤 값이 "선택 안 됨"으로 잠깐 되돌아가 버려 클릭·Enter 선택이
// 안 먹는 것처럼 보인다(PostComposer는 ownerUids가 로컬 state라 이 문제가 없다). 그래서
// 선택은 로컬 state에 즉시 반영(낙관적 갱신)하고, Firestore가 확정한 값으로는 그 값이
// 실제로 바뀌었을 때만(다른 사람이 바꿨거나 최초 로드) 동기화한다.
function DeptHeadCell({ group, current, staff, onPick }) {
  const currentStaff = current ? { uid: current.uid, name: current.name, email: current.email } : null
  const [localValue, setLocalValue] = useState(currentStaff)

  useEffect(() => { setLocalValue(currentStaff) }, [current?.uid])

  const handleChange = (_, value) => {
    const picked = value.length ? value[value.length - 1] : null
    setLocalValue(picked)
    onPick(group, picked)
  }

  return (
    <Autocomplete
      multiple
      size="small"
      autoHighlight
      options={staff}
      getOptionLabel={(o) => o.name || o.email || ''}
      isOptionEqualToValue={(a, b) => a.uid === b.uid}
      value={localValue ? [localValue] : []}
      onChange={handleChange}
      renderInput={(params) => <TextField {...params} placeholder="교사 검색" />}
      sx={{ width: 260 }}
    />
  )
}

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
        <Paper variant="outlined" sx={{ maxWidth: 560 }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: '#f9fafb' } }}>
                <TableCell width={140}>교과군</TableCell>
                <TableCell>교과부장</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {SUBJECT_GROUPS.map((group) => (
                <TableRow key={group} hover>
                  <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{group}</TableCell>
                  <TableCell>
                    <DeptHeadCell group={group} current={byGroup[group]} staff={staff} onPick={handlePick} />
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
