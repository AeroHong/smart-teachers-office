import { useEffect, useState } from 'react'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Select from '@mui/material/Select'
import Switch from '@mui/material/Switch'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import { CATEGORIES } from '@shared/lib/regulationTree'
import { useAuth } from '@shared/contexts/AuthContext'
import AdminFrame from '../components/AdminFrame'
import { saveBookSettings, useBook } from '../lib/data'
import { publishPublicBook, publicUrl } from '../lib/publicBook'

/** 목차 설정 — 이름·분류·순서·외부 공개 */
export default function SettingsPage() {
  const { schoolId, schoolName, user, userName } = useAuth()
  const { book, loading } = useBook(schoolId)
  const [rows, setRows] = useState(null)
  const [msg, setMsg] = useState(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => { if (book && !rows) setRows([...book.regulations].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) }, [book, rows])

  const set = (i, patch) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)))
  const move = (i, d) => setRows((rs) => { const a = [...rs]; const j = i + d; if (j < 0 || j >= a.length) return a; [a[i], a[j]] = [a[j], a[i]]; return a })

  const save = async () => {
    setSaving(true); setMsg(null)
    try {
      const regulations = rows.map((r, i) => ({ ...r, order: i, reference: r.category === 'reference' }))
      await saveBookSettings(schoolId, book, regulations, { uid: user.uid, name: userName, schoolName })
      const n = await publishPublicBook(schoolId, { ...book, regulations }, { name: userName, schoolName })
      setMsg({ type: 'success', text: `저장했습니다.${n ? ` 외부 공개 규정 ${n}개를 공개 사본에 반영했습니다.` : ''}` })
    } catch (e) { setMsg({ type: 'error', text: `저장하지 못했습니다: ${e.message}` }) }
    setSaving(false)
  }

  return (
    <AdminFrame title="목차 설정" actions={rows && <Button variant="contained" disabled={saving} onClick={save}>저장</Button>}>
      {loading && <CircularProgress />}
      {!loading && !book && <Alert severity="info">규정집을 먼저 가져와 주세요.</Alert>}
      {msg && <Alert severity={msg.type} sx={{ mb: 2 }}>{msg.text}</Alert>}
      {rows && (
        <>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            「외부 공개」를 켠 규정은 로그인 없이 읽을 수 있는 공개 주소에 실립니다(학교 홈페이지 링크용):{' '}
            <a href={publicUrl(schoolId)} target="_blank" rel="noreferrer">{publicUrl(schoolId)}</a>
          </Typography>
          <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead><TableRow><TableCell>순서</TableCell><TableCell>번호</TableCell><TableCell>이름</TableCell><TableCell>분류</TableCell><TableCell align="center">외부 공개</TableCell></TableRow></TableHead>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={r.id}>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      <IconButton size="small" onClick={() => move(i, -1)} disabled={i === 0} aria-label="위로"><ArrowUpwardIcon fontSize="small" /></IconButton>
                      <IconButton size="small" onClick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label="아래로"><ArrowDownwardIcon fontSize="small" /></IconButton>
                    </TableCell>
                    <TableCell><TextField size="small" value={r.no || ''} onChange={(e) => set(i, { no: e.target.value })} sx={{ width: 80 }} /></TableCell>
                    <TableCell><TextField size="small" fullWidth value={r.title} onChange={(e) => set(i, { title: e.target.value })} sx={{ minWidth: 260 }} /></TableCell>
                    <TableCell>
                      <Select size="small" value={r.category || 'school'} onChange={(e) => set(i, { category: e.target.value })}>
                        {CATEGORIES.map((c) => <MenuItem key={c.key} value={c.key}>{c.label}</MenuItem>)}
                      </Select>
                    </TableCell>
                    <TableCell align="center"><Switch checked={!!r.public} onChange={(e) => set(i, { public: e.target.checked })} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
        </>
      )}
    </AdminFrame>
  )
}
