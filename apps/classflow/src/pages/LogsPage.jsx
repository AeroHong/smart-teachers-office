import { Fragment, useEffect, useMemo, useState } from 'react'
import { getDocs, limit, orderBy, query, startAfter, where } from 'firebase/firestore'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Collapse from '@mui/material/Collapse'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import ExpandMoreIcon from '@mui/icons-material/KeyboardArrowDown'
import ExpandLessIcon from '@mui/icons-material/KeyboardArrowUp'
import DownloadIcon from '@mui/icons-material/Download'
import { useAuth } from '@shared/contexts/AuthContext'
import { useHubRoles } from '../lib/useHubRoles'
import { ACTIONS, logCol, relativeTime } from '../lib/activity'
import AppShell from '../components/AppShell'

const PAGE = 100

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * 사용자 로그 — StudentHub LogsPage를 그대로 옮겼다(컬렉션만 classflowLogs).
 * 서버에는 필터 하나만(액션) 걸어 복합 색인 없이 조회하고, 사용자 검색은 화면에서 거른다.
 * 열람은 선택과목 담당자·관리자·교감·교장(firestore.rules).
 */
export default function LogsPage() {
  const { schoolId } = useAuth()
  const { canView, loading: rl } = useHubRoles()
  const [action, setAction] = useState('')
  const [userQ, setUserQ] = useState('')
  const [rows, setRows] = useState([])
  const [cursor, setCursor] = useState(null)
  const [more, setMore] = useState(false)
  const [open, setOpen] = useState(new Set())
  const [error, setError] = useState('')

  const load = async (reset) => {
    setError('')
    try {
      const parts = [logCol(schoolId)]
      if (action) parts.push(where('action', '==', action))
      parts.push(orderBy('at', 'desc'))
      if (!reset && cursor) parts.push(startAfter(cursor))
      parts.push(limit(PAGE))
      const snap = await getDocs(query(...parts))
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      setRows((prev) => (reset ? docs : [...prev, ...docs]))
      setCursor(snap.docs.at(-1) || null)
      setMore(snap.docs.length === PAGE)
    } catch (e) {
      setError(e.code === 'failed-precondition' ? '이 필터에는 색인이 필요합니다. 관리자에게 알려 주세요.' : e.message)
    }
  }

  useEffect(() => { if (canView && schoolId) load(true) }, [action, canView, schoolId]) // eslint-disable-line react-hooks/exhaustive-deps

  const shown = useMemo(() => {
    const q = userQ.trim().toLowerCase()
    return q ? rows.filter((r) => (r.name || '').toLowerCase().includes(q) || (r.email || '').includes(q)) : rows
  }, [rows, userQ])

  const toggle = (id) => setOpen((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const at = (r) => (r.at?.toDate ? r.at.toDate().toLocaleString('ko-KR') : '')

  const exportXlsx = async () => {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('사용자 로그')
    ws.addRow(['시각', '이름', '이메일', '활동', '내용', '상세']).font = { bold: true }
    for (const r of shown) ws.addRow([at(r), r.name, r.email, ACTIONS[r.action]?.label || r.action, r.summary, (r.details || []).join('\n')])
    ws.columns.forEach((c, i) => { c.width = [20, 10, 26, 16, 50, 60][i] })
    downloadBlob(new Blob([await wb.xlsx.writeBuffer()]), `ClassFlow 사용자로그_${new Date().toLocaleDateString('sv-SE')}.xlsx`)
  }

  return (
    <AppShell header={<Typography fontWeight={800}>사용자 로그</Typography>}>
      {rl ? null : !canView ? (
        <Alert severity="info">사용자 로그는 선택과목 담당자·관리자·교감·교장만 볼 수 있습니다.</Alert>
      ) : (
        <Stack spacing={2}>
          <Stack direction="row" alignItems="center" spacing={2} flexWrap="wrap" useFlexGap>
            <Typography variant="h5">사용자 로그</Typography>
            <Box flex={1} />
            <TextField select size="small" label="활동" value={action} onChange={(e) => setAction(e.target.value)} sx={{ minWidth: '12rem' }}>
              <MenuItem value="">전체</MenuItem>
              {Object.entries(ACTIONS).map(([k, v]) => <MenuItem key={k} value={k}>{v.label}</MenuItem>)}
            </TextField>
            <TextField size="small" label="사용자(이름·이메일)" value={userQ} onChange={(e) => setUserQ(e.target.value)} />
            <Button startIcon={<DownloadIcon />} onClick={exportXlsx} disabled={!shown.length}>엑셀</Button>
          </Stack>
          {error && <Alert severity="error">{error}</Alert>}
          <Paper variant="outlined">
            <Table size="small">
              <TableHead><TableRow><TableCell width={40} /><TableCell>시각</TableCell><TableCell>사용자</TableCell><TableCell>활동</TableCell><TableCell>내용</TableCell></TableRow></TableHead>
              <TableBody>
                {shown.length === 0 && <TableRow><TableCell colSpan={5} sx={{ color: 'text.secondary' }}>기록이 없습니다.</TableCell></TableRow>}
                {shown.map((r) => {
                  const a = ACTIONS[r.action] || { label: r.action }
                  const hasDetail = (r.details || []).length > 0
                  return (
                    <Fragment key={r.id}>
                      <TableRow hover onClick={() => hasDetail && toggle(r.id)} sx={{ cursor: hasDetail ? 'pointer' : 'default', '& td': { borderBottom: open.has(r.id) ? 0 : undefined } }}>
                        <TableCell>{hasDetail && <IconButton size="small">{open.has(r.id) ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}</IconButton>}</TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }} title={at(r)}>{relativeTime(r.at)}</TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          <Button size="small" onClick={(e) => { e.stopPropagation(); setUserQ(r.email || r.name) }}>{r.name || r.email}</Button>
                        </TableCell>
                        <TableCell><Chip size="small" label={a.label} color={a.color || 'default'} variant={a.color ? 'filled' : 'outlined'} /></TableCell>
                        <TableCell>{r.summary}</TableCell>
                      </TableRow>
                      {hasDetail && (
                        <TableRow>
                          <TableCell colSpan={5} sx={{ py: 0, borderBottom: open.has(r.id) ? undefined : 0 }}>
                            <Collapse in={open.has(r.id)}>
                              <Box component="ul" sx={{ m: 0, py: 1, pl: 6, color: 'text.secondary', fontSize: '0.85rem' }}>
                                {r.details.map((d, i) => <li key={i}>{d}</li>)}
                              </Box>
                            </Collapse>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  )
                })}
              </TableBody>
            </Table>
          </Paper>
          {more && <Button onClick={() => load(false)}>더 보기</Button>}
        </Stack>
      )}
    </AppShell>
  )
}
