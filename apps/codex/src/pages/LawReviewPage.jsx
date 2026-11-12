import { useMemo, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Link from '@mui/material/Link'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { lawIndex } from '@shared/lib/regulationHierarchy'
import { useAuth } from '@shared/contexts/AuthContext'
import AdminFrame from '../components/AdminFrame'
import { nodeHref } from '../components/RegulationBody'
import { markLawReviewed, useBook } from '../lib/data'
import { fmtDate } from './Home'

const STALE_DAYS = 180 // 반년 넘게 확인하지 않은 법령은 표시
const daysSince = (d) => (d ? Math.floor((Date.now() - new Date(d).getTime()) / 86400000) : Infinity)

/**
 * 상위 법령 점검 — 규정집이 기대는 법령·조례·지침과 그 규정. 법령이 바뀌었는지 법령정보센터에서 보고 「확인함」을 남긴다.
 * 자동 감지(국가법령정보 공동활용 Open API, 인증키 필요)는 다음 단계 — 그때는 바뀐 법령에 「개정됨」 표시가 붙는다.
 */
export default function LawReviewPage() {
  const { schoolId, userName } = useAuth()
  const { book, loading } = useBook(schoolId)
  const [busy, setBusy] = useState(null)
  const [err, setErr] = useState('')
  const laws = useMemo(() => (book ? lawIndex(book.regulations) : []), [book])
  const reviews = book?.lawReviews || {}
  const mark = async (key) => {
    setBusy(key); setErr('')
    try { await markLawReviewed(schoolId, key, {}, { name: userName }) } catch (e) { setErr(e.message) }
    setBusy(null)
  }
  return (
    <AdminFrame title="상위 법령 점검">
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        규정의 「근거」로 적힌 법령·조례·교육청 지침입니다. 법령명을 누르면 법령정보센터에서 현행과 개정 연혁을 볼 수 있습니다.
        바뀐 것이 없으면 「확인함」을 누르고, 바뀌었으면 해당 규정의 개정안을 만드세요. 교육청 지침은 해마다(보통 3월) 확인합니다.
      </Typography>
      {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}
      {loading && <CircularProgress />}
      {book && !laws.length && <Alert severity="info">근거 법령이 아직 없습니다. 「체계 설정」에서 자동 제안을 받거나 직접 넣어 주세요.</Alert>}
      {!!laws.length && (
        <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead><TableRow><TableCell>법령·지침</TableCell><TableCell>이 법령에 기대는 규정</TableCell><TableCell>마지막 확인</TableCell><TableCell /></TableRow></TableHead>
            <TableBody>
              {laws.map((l) => {
                const rv = reviews[l.key]
                const stale = daysSince(rv?.checkedAt) > STALE_DAYS
                return (
                  <TableRow key={l.key}>
                    <TableCell sx={{ minWidth: 220 }}>
                      {l.url ? <Link href={l.url} target="_blank" rel="noreferrer" fontWeight={700}>{l.name}</Link> : <Typography fontWeight={700}>{l.name}</Typography>}
                      {!l.url && <Typography variant="caption" color="text.secondary" display="block">법령정보센터에 없는 지침 — 교육청 자료로 확인</Typography>}
                    </TableCell>
                    <TableCell>
                      <Stack spacing={0.25}>
                        {l.refs.map((r, i) => (
                          <Link key={i} component={RouterLink} to={nodeHref('', r.regId)} variant="body2" underline="hover">{r.title}{r.article ? ` (제${r.article}조)` : ''}</Link>
                        ))}
                      </Stack>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {rv ? <Typography variant="body2">{fmtDate(rv.checkedAt)} · {rv.byName}</Typography> : <Typography variant="body2" color="text.secondary">확인 기록 없음</Typography>}
                      {stale && <Chip size="small" color="warning" label="확인 필요" sx={{ mt: 0.5 }} />}
                    </TableCell>
                    <TableCell><Button size="small" disabled={busy === l.key} onClick={() => mark(l.key)}>확인함</Button></TableCell>
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
