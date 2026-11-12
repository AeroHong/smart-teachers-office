import { useEffect, useMemo, useState } from 'react'
import Alert from '@mui/material/Alert'
import CircularProgress from '@mui/material/CircularProgress'
import InputAdornment from '@mui/material/InputAdornment'
import Paper from '@mui/material/Paper'
import Switch from '@mui/material/Switch'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import SearchIcon from '@mui/icons-material/Search'
import { HUB_ROLES } from '@shared/lib/schema'
import { useAuth } from '@shared/contexts/AuthContext'
import AdminFrame from '../components/AdminFrame'
import { listStaffWithRoles, setManagerRole } from '../lib/data'

const ADMIN_LIKE = ['admin', 'school_admin', 'principal']

/** 규정 담당자 지정 — StudentHub 담당자 지정과 같은 문서(studentHubManagers)의 'regulation' 역할만 켜고 끈다 */
export default function ManagersPage() {
  const { schoolId } = useAuth()
  const [staff, setStaff] = useState(null)
  const [q, setQ] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(null)
  useEffect(() => { listStaffWithRoles(schoolId).then(setStaff).catch((e) => setErr(e.message)) }, [schoolId])
  const shown = useMemo(() => (staff || []).filter((s) => !q || s.name.includes(q) || s.email.includes(q)), [staff, q])

  const toggle = async (s, on) => {
    setBusy(s.uid); setErr('')
    try {
      await setManagerRole(schoolId, s, HUB_ROLES.REGULATION, on)
      setStaff((list) => list.map((x) => (x.uid === s.uid ? { ...x, roles: on ? [...x.roles, HUB_ROLES.REGULATION] : x.roles.filter((r) => r !== HUB_ROLES.REGULATION) } : x)))
    } catch (e) { setErr(`바꾸지 못했습니다: ${e.message}`) }
    setBusy(null)
  }

  return (
    <AdminFrame title="규정 담당자 지정" maxWidth={820}>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        규정 담당자는 개정안을 만들고 고치며 신구대조표를 내려받습니다. 확정(현행 반영)은 관리자·교감이 합니다. 관리자·교감은 지정하지 않아도 담당자 권한이 있습니다.
      </Typography>
      {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}
      <TextField size="small" value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름으로 찾기" sx={{ mb: 2 }} InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }} />
      {!staff ? <CircularProgress /> : (
        <Paper variant="outlined">
          <Table size="small">
            <TableHead><TableRow><TableCell>이름</TableCell><TableCell>메일</TableCell><TableCell align="center">규정 담당</TableCell></TableRow></TableHead>
            <TableBody>
              {shown.map((s) => {
                const adminLike = ADMIN_LIKE.includes(s.role)
                return (
                  <TableRow key={s.uid}>
                    <TableCell>{s.name}</TableCell>
                    <TableCell><Typography variant="caption">{s.email}</Typography></TableCell>
                    <TableCell align="center">
                      {adminLike ? <Typography variant="caption" color="text.secondary">관리자(지정 불필요)</Typography> : (
                        <Switch checked={s.roles.includes(HUB_ROLES.REGULATION)} disabled={busy === s.uid} onChange={(e) => toggle(s, e.target.checked)} />
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Paper>
      )}
    </AdminFrame>
  )
}
