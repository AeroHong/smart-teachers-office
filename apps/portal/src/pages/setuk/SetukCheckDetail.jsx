import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { collection, query, where, getDocs } from 'firebase/firestore'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Checkbox from '@mui/material/Checkbox'
import TextField from '@mui/material/TextField'
import Autocomplete from '@mui/material/Autocomplete'
import FormControlLabel from '@mui/material/FormControlLabel'
import Table from '@mui/material/Table'
import TableHead from '@mui/material/TableHead'
import TableBody from '@mui/material/TableBody'
import TableRow from '@mui/material/TableRow'
import TableCell from '@mui/material/TableCell'
import Paper from '@mui/material/Paper'
import CircularProgress from '@mui/material/CircularProgress'
import Alert from '@mui/material/Alert'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import Tooltip from '@mui/material/Tooltip'
import DownloadIcon from '@mui/icons-material/Download'
import { useAuth } from '@shared/contexts/AuthContext'
import { db } from '@shared/lib/firebase'
import { USERS } from '@shared/lib/schema'
import { subscribeCheck, subscribeItems, updateItemNote, updateItemResolved, updateSubjectAssignment } from '@shared/lib/setukCheck'
import { AUTHORITY_LABELS } from './setukUtils'
import { exportCheckResults } from './setukExport'
import SetukDictionaryDialog from './SetukDictionaryDialog'
import Layout from '../../components/Layout'

const SEVERITY_COLORS = { ERROR: 'error', WARNING: 'warning', INFO: 'info' }

const STAFF_ROLES = ['teacher', 'admin', 'school_admin', 'principal']

export default function SetukCheckDetail() {
  const { checkId } = useParams()
  const navigate = useNavigate()
  const { user, userName, schoolId, isAdmin } = useAuth()
  const [dictOpen, setDictOpen] = useState(false)

  const [check, setCheck] = useState(null)
  const [items, setItems] = useState([])
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [subjectFilter, setSubjectFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [unresolvedOnly, setUnresolvedOnly] = useState(true)
  const [savingNote, setSavingNote] = useState({})

  useEffect(() => {
    if (!schoolId || !checkId) return
    const unsub = subscribeCheck(schoolId, checkId, (data) => { setCheck(data); setLoading(false) }, (err) => { setError(err.message); setLoading(false) })
    return unsub
  }, [schoolId, checkId])

  useEffect(() => {
    if (!schoolId || !checkId) return
    return subscribeItems(schoolId, checkId, setItems, (err) => console.error('[SetukCheckDetail] 항목 조회 실패:', err))
  }, [schoolId, checkId])

  useEffect(() => {
    if (!schoolId) return
    getDocs(query(collection(db, USERS), where('schoolId', '==', schoolId), where('role', 'in', STAFF_ROLES)))
      .then((snap) => setStaff(snap.docs.map((d) => ({ uid: d.id, name: d.data().name || d.data().email }))))
      .catch(() => {})
  }, [schoolId])

  const staffByUid = useMemo(() => Object.fromEntries(staff.map((s) => [s.uid, s])), [staff])

  const subjects = useMemo(() => [...new Set(items.map((it) => it.subjectName))].sort((a, b) => a.localeCompare(b, 'ko')), [items])
  const categories = useMemo(() => [...new Set(items.map((it) => it.category))].sort((a, b) => a.localeCompare(b, 'ko')), [items])

  const filteredItems = useMemo(() => {
    return items
      .filter((it) => subjectFilter === 'all' || it.subjectName === subjectFilter)
      .filter((it) => categoryFilter === 'all' || it.category === categoryFilter)
      .filter((it) => !unresolvedOnly || !it.resolved)
      .sort((a, b) => a.studentNumber - b.studentNumber || a.subjectName.localeCompare(b.subjectName, 'ko'))
  }, [items, subjectFilter, categoryFilter, unresolvedOnly])

  const resolvedCount = items.filter((it) => it.resolved).length

  // 실제 세특 수정은 그 과목 담당 교사만 나이스에서 할 수 있으므로, "처리완료" 체크도
  // 그 과목에 배정된 담당 교사 본인(또는 관리자)만 누를 수 있게 한다(firestore.rules로도
  // 서버에서 강제). 담당 교사가 아직 지정되지 않은 과목은 관리자만 처리할 수 있다.
  const canResolve = (item) => isAdmin || (!!user && check.subjectAssignments?.[item.subjectName]?.teacherUid === user.uid)

  const handleToggleResolved = async (item) => {
    if (!canResolve(item)) return
    try {
      await updateItemResolved(schoolId, checkId, item.id, !item.resolved, user?.uid, userName)
    } catch (e) {
      setError(`처리 상태 변경 실패: ${e.message}`)
    }
  }

  const handleNoteBlur = async (item, value) => {
    if (value === (item.note || '')) return
    setSavingNote((prev) => ({ ...prev, [item.id]: true }))
    try {
      await updateItemNote(schoolId, checkId, item.id, value)
    } catch (e) {
      setError(`메모 저장 실패: ${e.message}`)
    } finally {
      setSavingNote((prev) => ({ ...prev, [item.id]: false }))
    }
  }

  const handleAssignTeacher = async (subjectName, staffOption) => {
    try {
      await updateSubjectAssignment(schoolId, checkId, subjectName, staffOption?.uid || '', staffOption?.name || '')
    } catch (e) {
      setError(`담당교사 지정 실패: ${e.message}`)
    }
  }

  const handleExport = () => exportCheckResults(check, items)

  if (loading) return <Layout wide><Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box></Layout>
  if (error && !check) return <Layout wide><Alert severity="error">{error}</Alert></Layout>
  if (!check) return <Layout wide><Alert severity="warning">점검 결과를 찾을 수 없습니다.</Alert></Layout>

  return (
    <Layout wide>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1.5 }}>
        <Box>
          <Typography variant="h5" fontWeight={700} mb={0.5}>{check.classLabel}</Typography>
          <Typography variant="body2" color="text.secondary">{check.uploadedByName} 업로드 · 전체 {items.length}건 · 미처리 {items.length - resolvedCount}건</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button size="small" onClick={() => setDictOpen(true)} sx={{ textTransform: 'none', fontWeight: 700 }}>
            점검 기준 보기
          </Button>
          <Button variant="outlined" startIcon={<DownloadIcon />} onClick={handleExport} sx={{ textTransform: 'none', fontWeight: 700 }}>
            결과 파일 다운로드
          </Button>
        </Box>
      </Box>

      <SetukDictionaryDialog
        open={dictOpen} onClose={() => setDictOpen(false)}
        schoolId={schoolId} isAdmin={isAdmin} uid={user?.uid} userName={userName}
      />

      {error && <Alert severity="error" sx={{ mt: 2, mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Paper variant="outlined" sx={{ p: 2, mb: 2.5, mt: 2 }}>
        <Typography variant="subtitle1" fontWeight={700} mb={1.5}>과목별 담당 교사</Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
          {subjects.map((subjectName) => {
            const assign = check.subjectAssignments?.[subjectName]
            return (
              <Autocomplete
                key={subjectName}
                size="small" sx={{ width: 220 }}
                options={staff}
                getOptionLabel={(o) => o.name || ''}
                isOptionEqualToValue={(a, b) => a.uid === b.uid}
                value={assign?.teacherUid ? (staffByUid[assign.teacherUid] || { uid: assign.teacherUid, name: assign.teacherName }) : null}
                onChange={(_, value) => handleAssignTeacher(subjectName, value)}
                renderInput={(params) => (
                  <TextField {...params} label={subjectName}
                    color={assign?.source === 'auto' ? 'success' : undefined}
                  />
                )}
              />
            )
          })}
        </Box>
      </Paper>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>과목 필터</InputLabel>
          <Select label="과목 필터" value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)}>
            <MenuItem value="all">전체 과목</MenuItem>
            {subjects.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>유형 필터</InputLabel>
          <Select label="유형 필터" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <MenuItem value="all">전체 유형</MenuItem>
            {categories.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControlLabel
          control={<Checkbox checked={unresolvedOnly} onChange={(e) => setUnresolvedOnly(e.target.checked)} />}
          label="미처리만 보기"
        />
      </Box>

      <Paper variant="outlined">
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: '#f9fafb', whiteSpace: 'nowrap' } }}>
                <TableCell align="center">완료</TableCell>
                <TableCell align="center">번호</TableCell>
                <TableCell>이름</TableCell>
                <TableCell>과목</TableCell>
                <TableCell align="center">유형</TableCell>
                <TableCell>수정 요청 내용</TableCell>
                <TableCell>메모</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredItems.length === 0 ? (
                <TableRow><TableCell colSpan={7} align="center" sx={{ color: '#94a3b8', py: 4 }}>표시할 항목이 없습니다.</TableCell></TableRow>
              ) : filteredItems.map((it) => {
                const assignedName = check.subjectAssignments?.[it.subjectName]?.teacherName
                const allowed = canResolve(it)
                return (
                  <TableRow key={it.id} hover sx={it.resolved ? { opacity: 0.55 } : undefined}>
                    <TableCell align="center">
                      <Tooltip title={allowed ? '' : `담당 교사${assignedName ? `(${assignedName})` : ''}만 처리 완료로 표시할 수 있습니다.`}>
                        <span>
                          <Checkbox size="small" checked={!!it.resolved} disabled={!allowed} onChange={() => handleToggleResolved(it)} />
                        </span>
                      </Tooltip>
                    </TableCell>
                    <TableCell align="center">{it.studentNumber}</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>{it.studentName}</TableCell>
                    <TableCell sx={{ fontSize: '0.82rem' }}>{it.subjectName}</TableCell>
                    <TableCell align="center">
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.4, alignItems: 'center' }}>
                        <Chip size="small" variant="outlined" label={AUTHORITY_LABELS[it.authority] || it.authority} sx={{ fontSize: '0.68rem' }} />
                        <Chip size="small" label={it.category} color={SEVERITY_COLORS[it.severity]} sx={{ fontWeight: 700 }} />
                      </Box>
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.82rem', maxWidth: 420 }}>
                      <span style={{ color: '#94a3b8' }}>{it.before}</span>
                      <strong style={{ color: '#dc2626', margin: '0 2px' }}>{it.matched}</strong>
                      <span style={{ color: '#94a3b8' }}>{it.after}</span>
                      {it.message && <Typography sx={{ fontSize: '0.74rem', color: '#64748b', mt: 0.25 }}>→ {it.message}</Typography>}
                    </TableCell>
                    <TableCell sx={{ minWidth: 160 }}>
                      <TextField
                        size="small" fullWidth variant="standard" placeholder="메모"
                        defaultValue={it.note || ''}
                        disabled={!!savingNote[it.id]}
                        onBlur={(e) => handleNoteBlur(it, e.target.value)}
                      />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Box>
      </Paper>

      <Button size="small" onClick={() => navigate('/setuk')} sx={{ mt: 2, textTransform: 'none', color: '#64748b' }}>
        ← 목록으로
      </Button>
    </Layout>
  )
}
