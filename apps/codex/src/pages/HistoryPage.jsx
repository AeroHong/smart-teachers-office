import { useEffect, useMemo, useState } from 'react'
import { Link as RouterLink, useParams } from 'react-router-dom'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import FormControlLabel from '@mui/material/FormControlLabel'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import { comparisonRows } from '@shared/lib/regulationDiff'
import { useAuth } from '@shared/contexts/AuthContext'
import AppBar from '../components/AppBar'
import CompareTable from '../components/CompareTable'
import { getVersion, listVersions, useBook } from '../lib/data'
import { downloadComparisonHwpx } from '../lib/hwpxExport'
import { fmtDate } from './Home'

const vLabel = (v) => `${fmtDate(v.effectiveDate)} ${v.kind || ''}${v.createdByName ? ` · ${v.createdByName}` : ''}`

/** 연혁 — 버전 목록과 두 버전 비교(신구대조표) */
export default function HistoryPage() {
  const { regId } = useParams()
  const { schoolId } = useAuth()
  const { book } = useBook(schoolId)
  const entry = book?.regulations?.find((r) => r.id === regId)
  const [versions, setVersions] = useState(null)
  const [pair, setPair] = useState({ a: '', b: '' })
  const [nodes, setNodes] = useState(null)
  const [strikeOld, setStrikeOld] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    listVersions(schoolId, regId).then((vs) => {
      setVersions(vs)
      if (vs.length >= 2) setPair({ a: vs[1].id, b: vs[0].id })
    }).catch((e) => setErr(e.message))
  }, [schoolId, regId])

  useEffect(() => {
    if (!pair.a || !pair.b) { setNodes(null); return }
    let alive = true
    Promise.all([getVersion(schoolId, regId, pair.a), getVersion(schoolId, regId, pair.b)])
      .then(([a, b]) => { if (alive) setNodes({ a: a.nodes, b: b.nodes }) })
      .catch((e) => setErr(e.message))
    return () => { alive = false }
  }, [schoolId, regId, pair])

  const rows = useMemo(() => (nodes ? comparisonRows(nodes.a, nodes.b) : []), [nodes])
  const va = versions?.find((v) => v.id === pair.a)
  const vb = versions?.find((v) => v.id === pair.b)

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar />
      <Box sx={{ maxWidth: 1200, mx: 'auto', px: 2, py: 3 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
          <Button size="small" startIcon={<ArrowBackIcon />} component={RouterLink} to={`/r/${regId}`}>규정으로</Button>
          <Typography variant="h5">{entry?.title} 연혁</Typography>
        </Stack>
        {err && <Alert severity="error">{err}</Alert>}
        {!versions ? <CircularProgress /> : (
          <Stack spacing={3}>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography fontWeight={800} gutterBottom>버전</Typography>
              <Stack spacing={0.75}>
                {versions.map((v, i) => (
                  <Stack key={v.id} direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                    {i === 0 && <Chip size="small" color="primary" label="현행" />}
                    <Typography variant="body2" fontWeight={700}>시행 {fmtDate(v.effectiveDate)}</Typography>
                    <Chip size="small" variant="outlined" label={v.kind || '버전'} />
                    {v.committeeDate && <Typography variant="caption" color="text.secondary">학운위 심의 {fmtDate(v.committeeDate)}</Typography>}
                    {v.note && <Typography variant="caption" color="text.secondary" sx={{ maxWidth: 420 }} noWrap>{v.note}</Typography>}
                    <Button size="small" component={RouterLink} to={`/r/${regId}?v=${v.id}`}>이 버전 보기</Button>
                    {v.amendmentId && <Button size="small" component={RouterLink} to={`/amendments/${v.amendmentId}`}>개정안</Button>}
                  </Stack>
                ))}
              </Stack>
            </Paper>
            {versions.length < 2 ? <Typography color="text.secondary">비교할 이전 버전이 아직 없습니다.</Typography> : (
              <>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }}>
                  <TextField select size="small" label="이전" value={pair.a} onChange={(e) => setPair((p) => ({ ...p, a: e.target.value }))} sx={{ minWidth: 260 }}>
                    {versions.map((v) => <MenuItem key={v.id} value={v.id}>{vLabel(v)}</MenuItem>)}
                  </TextField>
                  <TextField select size="small" label="이후" value={pair.b} onChange={(e) => setPair((p) => ({ ...p, b: e.target.value }))} sx={{ minWidth: 260 }}>
                    {versions.map((v) => <MenuItem key={v.id} value={v.id}>{vLabel(v)}</MenuItem>)}
                  </TextField>
                  <FormControlLabel control={<Switch checked={strikeOld} onChange={(e) => setStrikeOld(e.target.checked)} />} label="현행 쪽 취소선" />
                  <Button variant="outlined" disabled={!rows.length} onClick={() => downloadComparisonHwpx({
                    regTitle: entry?.title || '', kind: vb?.kind, reason: vb?.note, effectiveDate: vb?.effectiveDate,
                    staffMeetingDate: vb?.staffMeetingDate, committeeDate: vb?.committeeDate, rows, strikeOld,
                  }).catch((e) => setErr(e.message))}
                  >
                    신구대조표 한글(hwpx)
                  </Button>
                </Stack>
                {va && vb && <CompareTable rows={rows} leftLabel={`${fmtDate(va.effectiveDate)} 시행`} rightLabel={`${fmtDate(vb.effectiveDate)} 시행`} />}
              </>
            )}
          </Stack>
        )}
      </Box>
    </Box>
  )
}
