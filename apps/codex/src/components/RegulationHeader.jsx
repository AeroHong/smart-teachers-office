import { Link as RouterLink } from 'react-router-dom'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { CATEGORIES } from '@shared/lib/regulationTree'
import { childrenOf, levelLabel } from '@shared/lib/regulationHierarchy'
import { fmtDate } from '../pages/Home'
import BasisLinks from './BasisLinks'
import { nodeHref } from './RegulationBody'

/**
 * 규정 머리 — 제목, 분류·위계, 시행일, 제·개정 연혁, 체계(상위·근거·하위).
 * entry는 목차 문서의 규정 줄(+ history). 법령정보센터의 [시행 …] 줄과 같은 자리.
 */
export default function RegulationHeader({ entry, version, actions, notice, book, base = '' }) {
  const cat = CATEGORIES.find((c) => c.key === entry?.category)
  const history = (entry?.history || []).filter((h) => h.kind !== '최초적재' && h.kind !== '다시적재')
  const parent = entry?.parentId ? book?.regulations?.find((r) => r.id === entry.parentId) : null
  const kids = book ? childrenOf(book.regulations, entry?.id) : []
  const basis = entry?.basis || []
  return (
    <Box sx={{ mb: 3, pb: 2, borderBottom: '2px solid', borderColor: 'primary.main' }}>
      {entry?.status === 'repealed' && (
        <Alert severity="warning" sx={{ mb: 2 }}>폐지된 규정입니다{entry.repealedDate ? `(${fmtDate(entry.repealedDate)} 폐지)` : ''}. 연혁 확인용으로만 남아 있습니다.</Alert>
      )}
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }} useFlexGap flexWrap="wrap">
        {entry?.level && <Chip size="small" color="primary" variant="outlined" label={levelLabel(entry.level)} />}
        {cat && <Chip size="small" label={cat.label} variant="outlined" />}
        {version?.effectiveDate && <Typography variant="body2" color="text.secondary">[시행 {fmtDate(version.effectiveDate)}]</Typography>}
        {version?.kind && !/적재/.test(version.kind) && <Typography variant="body2" color="text.secondary">[{version.kind}]</Typography>}
      </Stack>
      <Typography variant="h4" component="h1" sx={{ textAlign: 'center', my: 1.5 }}>{entry?.title}</Typography>
      {!!history.length && (
        <Typography variant="body2" color="text.secondary" textAlign="center">
          {history.map((h) => `${h.kind} ${fmtDate(h.date)}`).join(' · ')}
        </Typography>
      )}
      {(parent || basis.length || kids.length) ? (
        <Box sx={{ mt: 2, p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
          <Stack spacing={0.5}>
            {parent && <Typography variant="body2"><b>상위</b> <Link component={RouterLink} to={nodeHref(base, parent.id)}>{parent.title}</Link></Typography>}
            {!!basis.length && <Typography variant="body2"><b>근거</b> <BasisLinks basis={basis} book={book} base={base} /></Typography>}
            {!!kids.length && (
              <Typography variant="body2"><b>하위</b> {kids.map((k, i) => <span key={k.id}>{i > 0 && ' · '}<Link component={RouterLink} to={nodeHref(base, k.id)}>{k.title}</Link></span>)}</Typography>
            )}
          </Stack>
        </Box>
      ) : null}
      {notice}
      {actions && <Stack direction="row" spacing={1} justifyContent="center" sx={{ mt: 2 }} className="no-print" useFlexGap flexWrap="wrap">{actions}</Stack>}
    </Box>
  )
}
