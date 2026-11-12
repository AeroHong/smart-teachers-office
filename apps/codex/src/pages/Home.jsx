import { useState } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Grid from '@mui/material/Grid'
import InputAdornment from '@mui/material/InputAdornment'
import Link from '@mui/material/Link'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import SearchIcon from '@mui/icons-material/Search'
import { useAuth } from '@shared/contexts/AuthContext'
import AppBar from '../components/AppBar'
import { groupByCategory } from '../components/TocSidebar'
import { nodeHref } from '../components/RegulationBody'
import { useBook } from '../lib/data'
import { useRegulationRole } from '../lib/useRegulationRole'

export const fmtDate = (d) => (d ? String(d).replace(/-/g, '.') + '.' : '')

/** 검색창 — 첫 화면과 검색 결과 화면이 같이 쓴다 */
export function SearchField({ initial = '', base = '', size = 'large', autoFocus = false }) {
  const [q, setQ] = useState(initial)
  const navigate = useNavigate()
  return (
    <Box component="form" sx={{ width: '100%' }} onSubmit={(e) => { e.preventDefault(); if (q.trim()) navigate(`${base}/search?q=${encodeURIComponent(q.trim())}`) }}>
      <TextField
        fullWidth autoFocus={autoFocus} value={q} onChange={(e) => setQ(e.target.value)}
        placeholder="규정 이름이나 내용으로 찾기 — 예: 벌점 20점, 체험학습 일수, 학칙 제9조"
        inputProps={{ 'aria-label': '규정 검색' }}
        InputProps={{
          startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment>,
          endAdornment: <Button type="submit" variant="contained" sx={{ borderRadius: 999, px: 3 }}>검색</Button>,
          sx: { bgcolor: 'background.paper', borderRadius: 999, py: size === 'large' ? 0.75 : 0.25, pl: 1.5, pr: 0.75, fontSize: size === 'large' ? '1.1rem' : '1rem' },
        }}
      />
    </Box>
  )
}

/** 분류 카드 + 최근 개정 — 첫 화면 아래쪽(공개 화면도 같이 쓴다) */
export function BookOverview({ book, base = '' }) {
  const groups = groupByCategory(book.regulations)
  return (
    <Stack spacing={3} sx={{ width: '100%' }}>
      {!!book.recent?.length && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography fontWeight={800} gutterBottom>최근 개정</Typography>
          <Stack spacing={0.5}>
            {book.recent.slice(0, 5).map((r) => (
              <Stack key={`${r.regId}-${r.amendmentId}`} direction="row" spacing={1} alignItems="center">
                <Chip size="small" label={r.kind} />
                <Link component={RouterLink} to={nodeHref(base, r.regId)}>{r.title}</Link>
                <Typography variant="caption" color="text.secondary">시행 {fmtDate(r.date)}</Typography>
              </Stack>
            ))}
          </Stack>
        </Paper>
      )}
      <Grid container spacing={2}>
        {groups.map((g) => (
          <Grid item xs={12} sm={6} md={4} key={g.key}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Typography fontWeight={800} gutterBottom>{g.label} <Typography component="span" variant="caption" color="text.secondary">{g.regs.length}</Typography></Typography>
                <Stack spacing={0.25}>
                  {g.regs.map((r) => (
                    <Link key={r.id} component={RouterLink} to={nodeHref(base, r.id)} underline="hover" color="text.primary" variant="body2">{r.title}</Link>
                  ))}
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Stack>
  )
}

/** 첫 화면 — 검색창 중심(법령정보센터 개편 방향과 같다) */
export default function Home() {
  const { schoolId } = useAuth()
  const { book, loading } = useBook(schoolId)
  const { canApply } = useRegulationRole()
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar />
      <Box sx={{ maxWidth: 980, mx: 'auto', px: 2, pt: { xs: 5, md: 10 }, pb: 8 }}>
        <Stack spacing={3} alignItems="center">
          <Typography variant="h4" textAlign="center">어떤 규정을 찾으세요?</Typography>
          {book && (
            <Typography color="text.secondary" textAlign="center">
              {book.title} · 규정 {book.regulations.length}개 · 조문 {book.regulations.reduce((s, r) => s + (r.articleCount || 0), 0)}개
            </Typography>
          )}
          <Box sx={{ width: '100%', maxWidth: 760 }}><SearchField autoFocus /></Box>
          {book && <Button component={RouterLink} to="/structure" size="small">규정 체계도 보기</Button>}
          {loading && <CircularProgress />}
          {!loading && !book && (
            <Paper variant="outlined" sx={{ p: 3, width: '100%', maxWidth: 760, textAlign: 'center' }}>
              <Typography fontWeight={700} gutterBottom>아직 규정집이 올라오지 않았습니다</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: canApply ? 2 : 0 }}>
                관리자가 규정집 한글(hwpx) 파일을 가져오면 여기에서 규정을 검색하고 목차를 따라 읽을 수 있습니다.
              </Typography>
              {canApply && <Button variant="contained" component={RouterLink} to="/admin/import">규정집 가져오기</Button>}
            </Paper>
          )}
          {book && <BookOverview book={book} />}
        </Stack>
      </Box>
    </Box>
  )
}
