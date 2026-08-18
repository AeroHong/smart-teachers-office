import { useState, useEffect, useMemo } from 'react'
import { collection, query, where, getDocs, onSnapshot, doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Paper from '@mui/material/Paper'
import Autocomplete from '@mui/material/Autocomplete'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import IconButton from '@mui/material/IconButton'
import Alert from '@mui/material/Alert'
import CircularProgress from '@mui/material/CircularProgress'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { USERS, COL, schoolPath } from '@shared/lib/schema'

const STAFF_ROLES = ['teacher', 'admin', 'school_admin', 'principal']

export default function AdminEvalPlanManagers() {
  const { user, userName, schoolId } = useAuth()

  const [staff, setStaff] = useState([])
  const [managers, setManagers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [picked, setPicked] = useState(null)

  useEffect(() => {
    if (!schoolId) return
    getDocs(query(collection(db, USERS), where('schoolId', '==', schoolId), where('role', 'in', STAFF_ROLES)))
      .then((snap) => setStaff(snap.docs.map((d) => ({ uid: d.id, name: d.data().name || d.data().email, email: d.data().email }))))
      .catch((e) => setError(`교직원 목록 조회 실패: ${e.message}`))
  }, [schoolId])

  useEffect(() => {
    if (!schoolId) return
    const unsub = onSnapshot(
      collection(db, ...schoolPath(schoolId, COL.EVALUATION_PLAN_MANAGERS)),
      (snap) => {
        setManagers(snap.docs.map((d) => ({ uid: d.id, ...d.data() })))
        setLoading(false)
      },
      (err) => { setError(err.message); setLoading(false) },
    )
    return unsub
  }, [schoolId])

  const managerUids = useMemo(() => new Set(managers.map((m) => m.uid)), [managers])
  const candidates = useMemo(() => staff.filter((s) => !managerUids.has(s.uid)), [staff, managerUids])

  const handleAdd = async () => {
    if (!picked) return
    try {
      await setDoc(doc(db, ...schoolPath(schoolId, COL.EVALUATION_PLAN_MANAGERS), picked.uid), {
        uid: picked.uid,
        name: picked.name || '',
        email: picked.email || '',
        addedBy: user.uid,
        addedByName: userName || '',
        addedAt: serverTimestamp(),
      })
      setPicked(null)
    } catch (e) {
      setError(`담당자 지정 실패: ${e.message}`)
    }
  }

  const handleRemove = async (uid) => {
    try {
      await deleteDoc(doc(db, ...schoolPath(schoolId, COL.EVALUATION_PLAN_MANAGERS), uid))
    } catch (e) {
      setError(`담당자 해제 실패: ${e.message}`)
    }
  }

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} mb={0.5}>평가계획 업무 담당자</Typography>
      <Typography variant="body2" color="text.secondary" mb={3}>
        여기서 지정한 교사는 학교 전체 교과의 "교수학습 및 평가 운영 계획" 제출물을 조회할 수 있습니다.
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Paper variant="outlined" sx={{ p: 2, mb: 3, display: 'flex', gap: 1, alignItems: 'center' }}>
        <Autocomplete
          size="small"
          options={candidates}
          getOptionLabel={(o) => o.name || o.email || ''}
          isOptionEqualToValue={(a, b) => a.uid === b.uid}
          value={picked}
          onChange={(_, value) => setPicked(value)}
          renderInput={(params) => <TextField {...params} label="교사 검색" />}
          sx={{ flex: 1, minWidth: 240 }}
        />
        <Button variant="contained" size="small" disabled={!picked} onClick={handleAdd} sx={{ flexShrink: 0 }}>
          추가
        </Button>
      </Paper>

      {loading ? (
        <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box>
      ) : managers.length === 0 ? (
        <Alert severity="info">지정된 업무 담당자가 없습니다.</Alert>
      ) : (
        <Paper variant="outlined">
          <List disablePadding>
            {managers.map((m) => (
              <ListItem
                key={m.uid} divider
                secondaryAction={
                  <IconButton edge="end" onClick={() => handleRemove(m.uid)}>
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                }
              >
                <ListItemText primary={m.name || '(이름 없음)'} secondary={m.email} />
              </ListItem>
            ))}
          </List>
        </Paper>
      )}
    </Box>
  )
}
