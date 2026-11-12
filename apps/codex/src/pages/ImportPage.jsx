import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import JSZip from 'jszip'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Select from '@mui/material/Select'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import { parseRegulationBook } from '@shared/lib/regulationParse'
import { CATEGORIES, guessCategory } from '@shared/lib/regulationTree'
import { useAuth } from '@shared/contexts/AuthContext'
import AdminFrame from '../components/AdminFrame'
import RegulationBody from '../components/RegulationBody'
import { importBook, useBook } from '../lib/data'

async function readBook(file) {
  let zip
  try { zip = await JSZip.loadAsync(file) } catch { throw new Error('한글(hwpx) 파일이 아닙니다. 한글에서 "다른 이름으로 저장 → hwpx"로 저장해 주세요.') }
  const names = Object.keys(zip.files).filter((n) => /^Contents\/section\d+\.xml$/.test(n)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]))
  if (!names.length) throw new Error('hwpx 안에 본문(section)이 없습니다.')
  const xmls = await Promise.all(names.map((n) => zip.file(n).async('string')))
  return parseRegulationBook(xmls)
}

/** 표지에서 규정집 이름·기준일 짐작 — 「2026학년도」 「(2026.3.1. 현재)」 */
function guessMeta(cover, fileName) {
  const year = cover.join(' ').match(/(\d{4})\s*학년도/)?.[1]
  const fileDate = fileName.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.?\s*개정/)
  const coverDate = cover.join(' ').match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/)
  const d = fileDate || coverDate
  return {
    title: year ? `${year}학년도 규정집` : '학교 규정집',
    date: d ? `${d[1]}-${d[2].padStart(2, '0')}-${d[3].padStart(2, '0')}` : new Date().toISOString().slice(0, 10),
  }
}

/** 규정집 가져오기 — 원본 hwpx를 읽어 규정별로 검수한 뒤 적재(관리자) */
export default function ImportPage() {
  const { schoolId, schoolName, user, userName } = useAuth()
  const { book } = useBook(schoolId)
  const navigate = useNavigate()
  const [fileName, setFileName] = useState('')
  const [reading, setReading] = useState(false)
  const [regs, setRegs] = useState(null)
  const [meta, setMeta] = useState({ title: '', date: '' })
  const [err, setErr] = useState('')
  const [preview, setPreview] = useState(null)
  const [saving, setSaving] = useState(false)
  const [confirmReplace, setConfirmReplace] = useState(false)

  const onFile = async (file) => {
    if (!file) return
    setErr(''); setReading(true); setFileName(file.name)
    try {
      const parsed = await readBook(file)
      setMeta(guessMeta(parsed.cover, file.name))
      setRegs(parsed.regulations.map((r, i) => ({
        key: `${i}-${r.title}`, include: true, title: r.title, detectedTitle: r.detectedTitle,
        no: r.tocIndex >= 0 ? parsed.toc[r.tocIndex].no : '', reference: r.reference,
        category: guessCategory(r.title, r.reference), history: r.history, nodes: r.nodes, stats: r.stats, warnings: r.warnings,
        matchedToc: r.tocIndex >= 0,
      })))
    } catch (e) { setErr(e.message); setRegs(null) }
    setReading(false)
  }

  const update = (i, patch) => setRegs((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)))
  const mergeUp = (i) => setRegs((rs) => {
    const prev = rs[i - 1]; const cur = rs[i]
    const nodes = [...prev.nodes, ...cur.nodes]
    const merged = { ...prev, nodes, history: [...prev.history, ...cur.history], warnings: [...prev.warnings, ...cur.warnings], stats: { ...prev.stats, articles: prev.stats.articles + cur.stats.articles, tables: prev.stats.tables + cur.stats.tables, nodes: nodes.length } }
    return rs.flatMap((r, k) => (k === i - 1 ? [merged] : k === i ? [] : [r]))
  })

  const save = async () => {
    setSaving(true); setErr('')
    try {
      const picked = regs.filter((r) => r.include && r.title.trim())
      await importBook({ schoolId, schoolName, title: meta.title, effectiveDate: meta.date, sourceFileName: fileName, regs: picked.map((r) => ({ ...r, title: r.title.trim() })), user: { uid: user.uid, name: userName }, existingBook: book })
      navigate('/')
    } catch (e) { setErr(`적재하지 못했습니다: ${e.message}`); setSaving(false) }
  }

  const included = regs?.filter((r) => r.include) || []
  return (
    <AdminFrame title="규정집 가져오기">
      <Stack spacing={2}>
        <Typography color="text.secondary">
          학교 규정집 한글(hwpx) 파일을 올리면 규정·장·조·항·표를 자동으로 나눕니다. 규정 경계와 이름을 확인하고 「적재」를 누르세요.
          파일은 이 브라우저에서만 읽고 서버로 올리지 않습니다(나뉜 글만 저장).
        </Typography>
        {book && (
          <Alert severity="warning">
            이미 「{book.title}」(규정 {book.regulations.length}개)이 있습니다. 다시 적재하면 이름이 같은 규정은 새 버전으로 바뀌고(이전 버전은 연혁에 남음), 원본에 없는 규정은 목차에서 빠집니다.
            작업 중인 개정안은 기준 버전이 바뀌어 확정할 수 없게 됩니다.
          </Alert>
        )}
        <Box>
          <Button variant="contained" component="label" startIcon={reading ? <CircularProgress size={16} color="inherit" /> : <UploadFileIcon />} disabled={reading}>
            hwpx 파일 고르기
            <input type="file" hidden accept=".hwpx" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = '' }} />
          </Button>
          {fileName && <Typography component="span" sx={{ ml: 1.5 }} variant="body2">{fileName}</Typography>}
        </Box>
        {err && <Alert severity="error">{err}</Alert>}
        {regs && (
          <>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField label="규정집 이름" value={meta.title} onChange={(e) => setMeta((m) => ({ ...m, title: e.target.value }))} sx={{ minWidth: 260 }} />
              <TextField label="기준일(현행 시행일)" type="date" value={meta.date} onChange={(e) => setMeta((m) => ({ ...m, date: e.target.value }))} InputLabelProps={{ shrink: true }} />
            </Stack>
            <Typography variant="body2">
              규정 {included.length}개 · 조문 {included.reduce((s, r) => s + r.stats.articles, 0)}개 · 표 {included.reduce((s, r) => s + r.stats.tables, 0)}개
            </Typography>
            <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox">적재</TableCell>
                    <TableCell>번호</TableCell>
                    <TableCell sx={{ minWidth: 260 }}>규정 이름(목차 기준)</TableCell>
                    <TableCell>분류</TableCell>
                    <TableCell align="right">장</TableCell>
                    <TableCell align="right">조</TableCell>
                    <TableCell align="right">표</TableCell>
                    <TableCell>확인할 점</TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {regs.map((r, i) => (
                    <TableRow key={r.key} sx={!r.include ? { opacity: 0.45 } : undefined}>
                      <TableCell padding="checkbox"><Checkbox checked={r.include} onChange={(e) => update(i, { include: e.target.checked })} /></TableCell>
                      <TableCell>{r.no}</TableCell>
                      <TableCell>
                        <TextField size="small" fullWidth value={r.title} onChange={(e) => update(i, { title: e.target.value })} />
                        {r.detectedTitle && r.detectedTitle !== r.title && <Typography variant="caption" color="text.secondary">본문 제목: {r.detectedTitle}</Typography>}
                      </TableCell>
                      <TableCell>
                        <Select size="small" value={r.category} onChange={(e) => update(i, { category: e.target.value, reference: e.target.value === 'reference' })}>
                          {CATEGORIES.map((c) => <MenuItem key={c.key} value={c.key}>{c.label}</MenuItem>)}
                        </Select>
                      </TableCell>
                      <TableCell align="right">{r.stats.chapters}</TableCell>
                      <TableCell align="right">{r.stats.articles}</TableCell>
                      <TableCell align="right">{r.stats.tables}</TableCell>
                      <TableCell>
                        <Stack spacing={0.5}>
                          {!r.matchedToc && <Chip size="small" color="warning" label="목차에 없음" />}
                          {r.stats.articles === 0 && <Chip size="small" label="조문 없음(안내문·표)" />}
                          {r.warnings.slice(0, 2).map((w) => <Typography key={w} variant="caption" color="warning.main">{w}</Typography>)}
                        </Stack>
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        <Button size="small" onClick={() => setPreview(r)}>미리 보기</Button>
                        {i > 0 && (
                          <Tooltip title="이 규정이 따로 잘려 나온 것이면 바로 위 규정에 붙입니다">
                            <Button size="small" onClick={() => mergeUp(i)}>위와 합치기</Button>
                          </Tooltip>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
            <Stack direction="row" spacing={1} alignItems="center">
              {book && (
                <Stack direction="row" alignItems="center">
                  <Checkbox checked={confirmReplace} onChange={(e) => setConfirmReplace(e.target.checked)} />
                  <Typography variant="body2">기존 규정집을 이 파일로 바꿉니다</Typography>
                </Stack>
              )}
              <Button variant="contained" size="large" disabled={saving || !included.length || !meta.date || (book && !confirmReplace)} onClick={save} startIcon={saving ? <CircularProgress size={16} color="inherit" /> : null}>
                {book ? '다시 적재' : '규정집 적재'}
              </Button>
            </Stack>
          </>
        )}
      </Stack>
      <Dialog open={!!preview} onClose={() => setPreview(null)} maxWidth="md" fullWidth>
        <DialogTitle>{preview?.title}</DialogTitle>
        <DialogContent dividers>
          {preview && <RegulationBody regId="preview" regTitle={preview.title} nodes={preview.nodes} book={null} readOnlyMenu />}
        </DialogContent>
      </Dialog>
    </AdminFrame>
  )
}
