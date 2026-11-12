import { useEffect, useMemo, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
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
import { LEVELS, lawUrl } from '@shared/lib/regulationHierarchy'
import { useAuth } from '@shared/contexts/AuthContext'
import AdminFrame from '../components/AdminFrame'
import { saveBookSettings, suggestBookHierarchy, useBook } from '../lib/data'
import { publishPublicBook } from '../lib/publicBook'

const artLabel = (t) => `제${t.num}조${t.branch ? `의${t.branch}` : ''}${t.title ? `(${t.title})` : ''}`

/** 근거 고치기 — 학교 규정(조까지) 또는 상위 법령(이름·조) */
function BasisDialog({ row, book, onClose, onSave }) {
  const [list, setList] = useState(row?.basis || [])
  const [kind, setKind] = useState('reg')
  const [regId, setRegId] = useState('')
  const [nodeId, setNodeId] = useState('')
  const [name, setName] = useState('')
  const [article, setArticle] = useState('')
  useEffect(() => { setList(row?.basis || []) }, [row])
  const target = book.regulations.find((r) => r.id === regId)
  const add = () => {
    if (kind === 'reg' && target) {
      const t = target.toc.find((x) => x.id === nodeId)
      setList((l) => [...l, { kind: 'reg', regId, ...(nodeId ? { nodeId } : {}), label: `${target.title}${t ? ` ${artLabel(t).replace(/\(.*\)$/, '')}` : ''}` }])
    } else if (kind === 'law' && name.trim()) {
      setList((l) => [...l, { kind: 'law', name: name.trim(), ...(article ? { article } : {}), url: lawUrl(name.trim(), article || null) }])
    }
    setNodeId(''); setName(''); setArticle('')
  }
  return (
    <Dialog open={!!row} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{row?.title} — 근거</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={1} sx={{ mb: 2 }}>
          {!list.length && <Typography color="text.secondary">근거가 없습니다.</Typography>}
          {list.map((b, i) => (
            <Chip key={i} label={b.kind === 'reg' ? b.label : `「${b.name}」${b.article ? ` 제${b.article}조` : ''}`} onDelete={() => setList((l) => l.filter((_, k) => k !== i))} sx={{ justifyContent: 'space-between' }} />
          ))}
        </Stack>
        <Stack spacing={1.5}>
          <TextField select size="small" label="종류" value={kind} onChange={(e) => setKind(e.target.value)}>
            <MenuItem value="reg">학교 규정의 조문</MenuItem>
            <MenuItem value="law">상위 법령·조례·지침</MenuItem>
          </TextField>
          {kind === 'reg' ? (
            <>
              <TextField select size="small" label="규정" value={regId} onChange={(e) => { setRegId(e.target.value); setNodeId('') }}>
                {book.regulations.filter((r) => r.id !== row?.id).map((r) => <MenuItem key={r.id} value={r.id}>{r.title}</MenuItem>)}
              </TextField>
              {target && (
                <TextField select size="small" label="조(없으면 규정 전체)" value={nodeId} onChange={(e) => setNodeId(e.target.value)}>
                  <MenuItem value="">규정 전체</MenuItem>
                  {target.toc.filter((t) => t.type === 'article').map((t) => <MenuItem key={t.id} value={t.id}>{artLabel(t)}</MenuItem>)}
                </TextField>
              )}
            </>
          ) : (
            <Stack direction="row" spacing={1}>
              <TextField size="small" fullWidth label="이름" placeholder="초·중등교육법" value={name} onChange={(e) => setName(e.target.value)} />
              <TextField size="small" label="조" placeholder="31" value={article} onChange={(e) => setArticle(e.target.value.replace(/\D/g, ''))} sx={{ width: 90 }} />
            </Stack>
          )}
          <Button onClick={add} disabled={kind === 'reg' ? !regId : !name.trim()}>근거 더하기</Button>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>취소</Button>
        <Button variant="contained" onClick={() => { onSave(list); onClose() }}>적용</Button>
      </DialogActions>
    </Dialog>
  )
}

/** 체계 설정 — 규정마다 위계·상위 규정·근거. 자동 제안을 받아 확인하고 고친다(관리자) */
export default function HierarchySettingsPage() {
  const { schoolId, user, userName } = useAuth()
  const { book, loading } = useBook(schoolId)
  const [rows, setRows] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [editing, setEditing] = useState(null)
  useEffect(() => { if (book && !rows) setRows([...book.regulations].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) }, [book, rows])
  const titleOf = useMemo(() => new Map((book?.regulations || []).map((r) => [r.id, r.title])), [book])

  const set = (id, patch) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch, hierarchySet: true } : r)))
  const suggest = async (onlyEmpty) => {
    setBusy(true); setMsg(null)
    try {
      const next = await suggestBookHierarchy(schoolId, { ...book, regulations: rows }, { onlyEmpty })
      const order = new Map(rows.map((r, i) => [r.id, i]))
      setRows(next.sort((a, b) => order.get(a.id) - order.get(b.id)))
      setMsg({ type: 'info', text: '본문(제1조 등)의 근거 문구로 체계를 제안했습니다. 확인하고 「저장」을 누르세요.' })
    } catch (e) { setMsg({ type: 'error', text: `제안하지 못했습니다: ${e.message}` }) }
    setBusy(false)
  }
  const save = async () => {
    setBusy(true); setMsg(null)
    try {
      // 상위가 자기 자신이나 자기 하위를 가리키면 끊는다(빙빙 도는 체계 방지)
      const byId = new Map(rows.map((r) => [r.id, r]))
      const cyc = (r) => { const seen = new Set([r.id]); let p = r.parentId; while (p) { if (seen.has(p)) return true; seen.add(p); p = byId.get(p)?.parentId } return false }
      const bad = rows.filter(cyc)
      if (bad.length) throw new Error(`상위 규정이 돌고 돕니다: ${bad.map((r) => r.title).join(', ')}`)
      const merged = book.regulations.map((r) => { const x = byId.get(r.id); return x ? { ...r, level: x.level, parentId: x.parentId || null, basis: x.basis || [], ...(x.hierarchySet ? { hierarchySet: true } : {}) } : r })
      await saveBookSettings(schoolId, book, merged, { uid: user.uid, name: userName })
      await publishPublicBook(schoolId, { ...book, regulations: merged }, { name: userName })
      setMsg({ type: 'success', text: '저장했습니다.' })
    } catch (e) { setMsg({ type: 'error', text: e.message }) }
    setBusy(false)
  }

  return (
    <AdminFrame
      title="체계 설정"
      actions={rows && (
        <Stack direction="row" spacing={1}>
          <Button disabled={busy} onClick={() => suggest(true)}>빈 곳 자동 제안</Button>
          <Button disabled={busy} onClick={() => suggest(false)}>전체 다시 제안</Button>
          <Button variant="contained" disabled={busy} onClick={save}>저장</Button>
        </Stack>
      )}
    >
      {loading && <CircularProgress />}
      {!loading && !book && <Alert severity="info">규정집을 먼저 가져와 주세요.</Alert>}
      {msg && <Alert severity={msg.type} sx={{ mb: 2 }}>{msg.text}</Alert>}
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        세로 기준 — 상위 법령 → 학칙 → 규정 → 세칙. 지침·안내(조문 없는 운영 안내)와 자치 회칙(상조회·학부모회처럼 그 단체가 고치는 것)은 따로 묶입니다.
        상위 규정의 근거 조문을 고치는 개정안에는 「하위 규정 영향」 경고가 나옵니다.
      </Typography>
      {rows && (
        <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead><TableRow><TableCell>규정</TableCell><TableCell>위계</TableCell><TableCell>상위 규정</TableCell><TableCell>근거</TableCell></TableRow></TableHead>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} sx={r.status === 'repealed' ? { opacity: 0.5 } : undefined}>
                  <TableCell sx={{ minWidth: 200 }}><Typography variant="body2" fontWeight={700}>{r.title}</Typography>{r.status === 'repealed' && <Chip size="small" label="폐지" />}</TableCell>
                  <TableCell>
                    <TextField select size="small" value={r.level || 'regulation'} onChange={(e) => set(r.id, { level: e.target.value, ...(e.target.value === 'guide' || e.target.value === 'bylaw' || e.target.value === 'rule' ? { parentId: null } : {}) })}>
                      {LEVELS.map((l) => <MenuItem key={l.key} value={l.key}>{l.label}</MenuItem>)}
                    </TextField>
                  </TableCell>
                  <TableCell>
                    <TextField select size="small" value={r.parentId || ''} disabled={['rule', 'guide', 'bylaw'].includes(r.level)} onChange={(e) => set(r.id, { parentId: e.target.value || null })} sx={{ minWidth: 180 }}>
                      <MenuItem value="">(없음)</MenuItem>
                      {rows.filter((o) => o.id !== r.id && o.status !== 'repealed' && !['guide', 'bylaw'].includes(o.level)).map((o) => <MenuItem key={o.id} value={o.id}>{o.title}</MenuItem>)}
                    </TextField>
                  </TableCell>
                  <TableCell sx={{ minWidth: 280 }}>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, alignItems: 'center' }}>
                      {(r.basis || []).map((b, i) => <Chip key={i} size="small" variant="outlined" color={b.kind === 'law' ? 'secondary' : 'primary'} label={b.kind === 'reg' ? (b.label || titleOf.get(b.regId)) : `「${b.name}」${b.article ? ` 제${b.article}조` : ''}`} />)}
                      <Button size="small" onClick={() => setEditing(r)}>고치기</Button>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}
      {book && <BasisDialog row={editing} book={book} onClose={() => setEditing(null)} onSave={(basis) => set(editing.id, { basis })} />}
    </AdminFrame>
  )
}
