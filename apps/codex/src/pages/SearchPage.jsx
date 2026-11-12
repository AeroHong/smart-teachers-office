import { useMemo, useState } from 'react'
import { Link as RouterLink, useSearchParams } from 'react-router-dom'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { highlight, searchRegulations } from '@shared/lib/regulationSearch'
import { useAuth } from '@shared/contexts/AuthContext'
import AppBar from '../components/AppBar'
import { nodeHref } from '../components/RegulationBody'
import { useBook } from '../lib/data'
import { useSearchIndex } from '../lib/useSearchIndex'
import { SearchField } from './Home'

function Hl({ text, terms }) {
  return highlight(text, terms).map((h, i) => (h.hit ? <mark key={i} style={{ background: '#fde68a' }}>{h.text}</mark> : h.text))
}

/** 검색 결과 목록 — 공개 화면도 같이 쓴다(book·entries를 받아서) */
export function SearchResults({ book, entries, q, base = '' }) {
  const [regFilter, setRegFilter] = useState(null)
  const { terms, results } = useMemo(
    () => (entries ? searchRegulations(entries, q, { regs: book?.regulations || [], limit: 200 }) : { terms: [], results: [] }),
    [entries, q, book],
  )
  const byReg = useMemo(() => {
    const m = new Map()
    for (const r of results) m.set(r.r, (m.get(r.r) || 0) + 1)
    return [...m].map(([id, n]) => ({ id, n, title: book?.regulations?.find((x) => x.id === id)?.title || '' }))
  }, [results, book])
  const shown = regFilter ? results.filter((r) => r.r === regFilter) : results
  if (!entries) return <CircularProgress />
  return (
    <Stack spacing={2}>
      <Typography color="text.secondary">「{q}」 검색 결과 {results.length}곳{terms.length ? ` · 찾은 말: ${terms.join(', ')}` : ''}</Typography>
      {byReg.length > 1 && (
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
          <Chip label={`전체 ${results.length}`} color={!regFilter ? 'primary' : 'default'} onClick={() => setRegFilter(null)} />
          {byReg.map((r) => <Chip key={r.id} label={`${r.title} ${r.n}`} color={regFilter === r.id ? 'primary' : 'default'} variant={regFilter === r.id ? 'filled' : 'outlined'} onClick={() => setRegFilter(r.id)} />)}
        </Stack>
      )}
      {!results.length && <Paper variant="outlined" sx={{ p: 3 }}><Typography>찾는 내용이 없습니다. 낱말을 줄이거나 바꿔 보세요.</Typography></Paper>}
      {shown.map((r) => (
        <Paper key={r.a} variant="outlined" component={RouterLink} to={nodeHref(base, r.r, r.hits[0].n)} sx={{ p: 2, textDecoration: 'none', color: 'inherit', display: 'block', '&:hover': { borderColor: 'primary.main' } }}>
          <Typography variant="body2" fontWeight={800} color="primary">{r.title} · {r.hits[0].p}</Typography>
          {r.hits.map((h) => (
            <Typography key={h.n} variant="body2" sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}>
              {h.p !== r.hits[0].p && <Typography component="span" variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>{h.p}</Typography>}
              <Hl text={h.t.length > 300 ? `${h.t.slice(0, 300)}…` : h.t} terms={terms} />
            </Typography>
          ))}
        </Paper>
      ))}
    </Stack>
  )
}

export default function SearchPage() {
  const [params] = useSearchParams()
  const q = params.get('q') || ''
  const { schoolId } = useAuth()
  const { book } = useBook(schoolId)
  const { entries } = useSearchIndex(schoolId, book)
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar />
      <Box sx={{ maxWidth: 900, mx: 'auto', px: 2, py: 3 }}>
        <Stack spacing={3}>
          <SearchField key={q} initial={q} size="small" />
          <SearchResults book={book} entries={entries} q={q} />
        </Stack>
      </Box>
    </Box>
  )
}
