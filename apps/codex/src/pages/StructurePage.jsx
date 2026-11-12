import { Link as RouterLink } from 'react-router-dom'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Link from '@mui/material/Link'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import { hierarchyTree, lawIndex } from '@shared/lib/regulationHierarchy'
import { useAuth } from '@shared/contexts/AuthContext'
import AppBar from '../components/AppBar'
import BasisLinks from '../components/BasisLinks'
import { nodeHref } from '../components/RegulationBody'
import { useBook } from '../lib/data'
import { useRegulationRole } from '../lib/useRegulationRole'
import { fmtDate } from './Home'

function Node({ n, book, depth }) {
  const r = n.reg
  const regBasis = (r.basis || []).filter((b) => b.kind === 'reg')
  const lawBasis = (r.basis || []).filter((b) => b.kind === 'law')
  return (
    <Box sx={{ pl: depth ? 2.5 : 0, borderLeft: depth ? '2px solid' : 'none', borderColor: 'divider', ml: depth ? 1 : 0 }}>
      <Box sx={{ py: 0.75 }}>
        <Stack direction="row" spacing={1} alignItems="baseline" useFlexGap flexWrap="wrap">
          <Link component={RouterLink} to={nodeHref('', r.id)} fontWeight={depth === 0 ? 800 : 700} underline="hover">{r.title}</Link>
          {r.articleCount ? <Typography variant="caption" color="text.secondary">조문 {r.articleCount}</Typography> : null}
        </Stack>
        {(regBasis.length > 0 || lawBasis.length > 0) && (
          <Typography variant="caption" color="text.secondary" component="div">
            근거: <BasisLinks basis={[...regBasis, ...lawBasis]} book={book} />
          </Typography>
        )}
      </Box>
      {n.children.map((c) => <Node key={c.reg.id} n={c} book={book} depth={depth + 1} />)}
    </Box>
  )
}

function Flat({ title, regs }) {
  if (!regs.length) return null
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography fontWeight={800} gutterBottom>{title}</Typography>
      <Stack spacing={0.5}>
        {regs.map((r) => (
          <Stack key={r.id} direction="row" spacing={1} alignItems="baseline">
            <Link component={RouterLink} to={nodeHref('', r.id)} underline="hover" color={r.status === 'repealed' ? 'text.disabled' : 'primary'}>{r.title}</Link>
            {r.status === 'repealed' && r.repealedDate && <Typography variant="caption" color="text.secondary">{fmtDate(r.repealedDate)} 폐지</Typography>}
          </Stack>
        ))}
      </Stack>
    </Paper>
  )
}

/** 규정 체계도 — 상위 법령 → 학칙 → 규정 → 세칙, 그리고 지침·안내·자치 회칙·폐지 */
export default function StructurePage() {
  const { schoolId } = useAuth()
  const { canApply } = useRegulationRole()
  const { book, loading } = useBook(schoolId)
  const tree = book ? hierarchyTree(book.regulations) : null
  const laws = book ? lawIndex(book.regulations) : []
  const unset = book && !book.regulations.some((r) => r.level && r.level !== 'regulation')
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar />
      <Box sx={{ maxWidth: 1000, mx: 'auto', px: 2, py: 3 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
          <Button size="small" startIcon={<ArrowBackIcon />} component={RouterLink} to="/">첫 화면</Button>
          <Typography variant="h5" flex={1}>규정 체계도</Typography>
          {canApply && <Button component={RouterLink} to="/admin/structure">체계 설정</Button>}
        </Stack>
        {loading && <CircularProgress />}
        {unset && <Alert severity="info" sx={{ mb: 2 }}>아직 체계(위계)가 정해지지 않았습니다. 관리자가 「체계 설정」에서 자동 제안을 받아 확인하면 여기에 나옵니다.</Alert>}
        {tree && (
          <Stack spacing={2}>
            {!!laws.length && (
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography fontWeight={800} gutterBottom>상위 법령·지침</Typography>
                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                  {laws.map((l) => (
                    <Chip key={l.key} label={`${l.name} (${l.refs.length})`} variant="outlined" component={l.url ? 'a' : 'div'} href={l.url || undefined} target="_blank" clickable={!!l.url} />
                  ))}
                </Stack>
              </Paper>
            )}
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography fontWeight={800} gutterBottom>학칙 · 규정 · 세칙</Typography>
              {tree.roots.map((n) => <Node key={n.reg.id} n={n} book={book} depth={0} />)}
            </Paper>
            <Flat title="지침·안내" regs={tree.guides} />
            <Flat title="자치 회칙" regs={tree.bylaws} />
            <Flat title="폐지된 규정" regs={tree.repealed} />
          </Stack>
        )}
      </Box>
    </Box>
  )
}
