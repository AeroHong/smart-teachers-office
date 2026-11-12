import { useRef, useState } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardActionArea from '@mui/material/CardActionArea'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Drawer from '@mui/material/Drawer'
import Grid from '@mui/material/Grid'
import InputAdornment from '@mui/material/InputAdornment'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import SearchIcon from '@mui/icons-material/Search'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import AccountTreeIcon from '@mui/icons-material/AccountTree'
import UpdateIcon from '@mui/icons-material/Update'
import { useAuth } from '@shared/contexts/AuthContext'
import AppBar from '../components/AppBar'
import AssistantPanel from '../components/AssistantPanel'
import { groupByCategory } from '../components/TocSidebar'
import { nodeHref } from '../components/RegulationBody'
import { useBook } from '../lib/data'
import { useRegulationRole } from '../lib/useRegulationRole'
import { useSearchIndex } from '../lib/useSearchIndex'
import { SIDEBAR_BG } from '../theme'

export const fmtDate = (d) => (d ? String(d).replace(/-/g, '.') + '.' : '')

// 자주 찾는 말 — 누르면 바로 검색
const QUICK = ['벌점', '체험학습', '결석', '학업성적', '징계', '학교운영위원회', '동아리', '휴가']

/** 검색창 — 첫 화면과 검색 결과 화면이 같이 쓴다 */
export function SearchField({ initial = '', base = '', size = 'large', autoFocus = false }) {
  const [q, setQ] = useState(initial)
  const navigate = useNavigate()
  return (
    <Box component="form" sx={{ width: '100%' }} onSubmit={(e) => { e.preventDefault(); if (q.trim()) navigate(`${base}/search?q=${encodeURIComponent(q.trim())}`) }}>
      <TextField
        fullWidth autoFocus={autoFocus} value={q} onChange={(e) => setQ(e.target.value)}
        placeholder="규정 이름이나 내용으로 찾기"
        inputProps={{ 'aria-label': '규정 검색' }}
        InputProps={{
          startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment>,
          // 알약 안의 알약 — 버튼이 위아래 4px만 남기고 칸 높이를 채워 두 곡선이 나란히 간다
          endAdornment: (
            <Button type="submit" variant="contained" sx={{ borderRadius: 999, px: 3, alignSelf: 'stretch', flexShrink: 0, whiteSpace: 'nowrap', minWidth: 76 }}>검색</Button>
          ),
          sx: {
            bgcolor: 'background.paper', borderRadius: 999, p: '4px', pl: 2, alignItems: 'stretch',
            fontSize: size === 'large' ? '1.1rem' : '1rem',
            '& input': { textOverflow: 'ellipsis', py: size === 'large' ? 1.5 : 1 },
            '& .MuiInputAdornment-positionStart': { alignSelf: 'center' },
          },
        }}
      />
    </Box>
  )
}

/** 자주 찾는 말 버튼 */
export function QuickTerms({ base = '' }) {
  const navigate = useNavigate()
  return (
    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" justifyContent="center" alignItems="center">
      <Typography variant="body2" color="text.secondary">자주 찾는 말</Typography>
      {QUICK.map((w) => <Chip key={w} label={w} size="small" clickable onClick={() => navigate(`${base}/search?q=${encodeURIComponent(w)}`)} />)}
    </Stack>
  )
}

/** 분야 머리 — 사이드바와 같은 모양(왼쪽 막대 + 개수) */
function GroupHead({ label, count }) {
  return (
    <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 2, pt: 1.75, pb: 1 }}>
      <Box sx={{ width: 4, height: 16, borderRadius: 1, bgcolor: 'primary.main' }} />
      <Typography fontWeight={800} color="primary.main" flex={1}>{label}</Typography>
      <Typography variant="caption" color="text.secondary">{count}</Typography>
    </Stack>
  )
}

/** 최근 개정 목록 */
export function RecentList({ book, base = '' }) {
  if (!book.recent?.length) return null
  return (
    <Paper variant="outlined" sx={{ width: '100%' }}>
      <GroupHead label="최근 개정" count={book.recent.length} />
      <List dense disablePadding sx={{ pb: 1 }}>
        {book.recent.slice(0, 6).map((r) => (
          <ListItemButton key={`${r.regId}-${r.amendmentId}`} component={RouterLink} to={nodeHref(base, r.regId)} sx={{ px: 2 }}>
            <Chip size="small" label={r.kind} sx={{ mr: 1 }} />
            <Typography variant="body2" flex={1}>{r.title}</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>시행 {fmtDate(r.date)}</Typography>
            <ChevronRightIcon fontSize="small" color="action" />
          </ListItemButton>
        ))}
      </List>
    </Paper>
  )
}

/** 분야별 규정 카드 — 첫 화면·공개 화면이 같이 쓴다. 규정마다 눌러 들어가는 줄 */
export function BookOverview({ book, base = '', showRecent = true }) {
  const groups = groupByCategory(book.regulations)
  return (
    <Stack spacing={3} sx={{ width: '100%' }}>
      {showRecent && <RecentList book={book} base={base} />}
      <Grid container spacing={2}>
        {groups.map((g) => (
          <Grid item xs={12} sm={6} md={4} key={g.key}>
            <Paper variant="outlined" sx={{ height: '100%', bgcolor: SIDEBAR_BG }}>
              <GroupHead label={g.label} count={g.regs.length} />
              <List dense disablePadding sx={{ px: 1, pb: 1 }}>
                {g.regs.map((r) => (
                  <ListItemButton key={r.id} component={RouterLink} to={nodeHref(base, r.id)} sx={{ borderRadius: 1, py: 0.6, bgcolor: 'background.paper', mb: 0.5, '&:hover': { bgcolor: 'background.paper', boxShadow: '0 1px 3px rgba(20,39,94,0.18)' } }}>
                    <Typography variant="body2" flex={1}>{r.title}</Typography>
                    <ChevronRightIcon fontSize="small" color="action" />
                  </ListItemButton>
                ))}
              </List>
            </Paper>
          </Grid>
        ))}
      </Grid>
    </Stack>
  )
}

function ActionCard({ icon, title, text, onClick, to }) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardActionArea component={to ? RouterLink : 'button'} to={to} onClick={onClick} sx={{ height: '100%', p: 2, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-start', gap: 1.5 }}>
        <Box sx={{ color: 'primary.main', pt: 0.25 }}>{icon}</Box>
        <Box>
          <Typography fontWeight={800}>{title}</Typography>
          <Typography variant="body2" color="text.secondary">{text}</Typography>
        </Box>
      </CardActionArea>
    </Card>
  )
}

/** 첫 화면 — 검색창 중심(법령정보센터 개편 방향과 같다) + 바로가기 + 분야별 규정 */
export default function Home() {
  const { schoolId, schoolName } = useAuth()
  const { book, loading } = useBook(schoolId)
  const { entries } = useSearchIndex(schoolId, book)
  const { canApply } = useRegulationRole()
  const [assist, setAssist] = useState(false)
  const recentRef = useRef(null)
  const listRef = useRef(null)
  const recentCount = book?.recent?.length || 0
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar />
      <Box sx={{ maxWidth: 1040, mx: 'auto', px: 2, pt: { xs: 4, md: 8 }, pb: 8 }}>
        <Stack spacing={2.5} alignItems="center">
          {schoolName && <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: '0.12em', mb: -1.5 }}>{schoolName}</Typography>}
          <Typography variant="h4" textAlign="center">어떤 규정을 찾으세요?</Typography>
          {book && (
            <Typography color="text.secondary" textAlign="center">
              {book.title} · 규정 {book.regulations.filter((r) => r.status !== 'repealed').length}개 · 조문 {book.regulations.reduce((s, r) => s + (r.status === 'repealed' ? 0 : r.articleCount || 0), 0)}개
            </Typography>
          )}
          <Box sx={{ width: '100%', maxWidth: 760 }}><SearchField autoFocus /></Box>
          {book && <QuickTerms />}
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
          {book && (
            <>
              <Grid container spacing={2} sx={{ pt: 2 }}>
                <Grid item xs={12} md={4}>
                  <ActionCard icon={<AutoAwesomeIcon />} title="도우미에게 묻기" text="「벌점 15점이면?」처럼 평소 말로 물으면 관련 조문을 찾아 드립니다." onClick={() => setAssist(true)} />
                </Grid>
                <Grid item xs={12} md={4}>
                  <ActionCard icon={<AccountTreeIcon />} title="규정 체계도" text="학칙 → 규정 → 세칙, 상위 법령까지 한눈에 봅니다." to="/structure" />
                </Grid>
                <Grid item xs={12} md={4}>
                  <ActionCard
                    icon={<UpdateIcon />} title={`최근 개정${recentCount ? ` ${recentCount}건` : ''}`}
                    text={recentCount ? '최근에 바뀐 규정과 시행일을 봅니다.' : '아직 개정 기록이 없습니다. 아래에서 분야별 규정을 골라 보세요.'}
                    onClick={() => (recentCount ? recentRef : listRef).current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  />
                </Grid>
              </Grid>
              <Box ref={recentRef} sx={{ width: '100%', scrollMarginTop: 70 }}><RecentList book={book} /></Box>
              <Box ref={listRef} sx={{ width: '100%', scrollMarginTop: 70 }}>
                <Typography variant="h6" sx={{ mb: 1.5 }}>분야별 규정</Typography>
                <BookOverview book={book} showRecent={false} />
              </Box>
            </>
          )}
        </Stack>
      </Box>
      <Drawer anchor="right" open={assist} onClose={() => setAssist(false)} PaperProps={{ sx: { width: 'min(420px, 94vw)' } }}>
        <AssistantPanel book={book} entries={entries} onClose={() => setAssist(false)} />
      </Drawer>
    </Box>
  )
}
