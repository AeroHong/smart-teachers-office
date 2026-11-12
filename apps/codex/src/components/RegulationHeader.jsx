import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { CATEGORIES } from '@shared/lib/regulationTree'
import { fmtDate } from '../pages/Home'

/** 규정 머리 — 제목, 분류, 시행일, 제·개정 연혁(법령정보센터의 [시행 …] 줄과 같은 자리) */
export default function RegulationHeader({ entry, version, actions, notice }) {
  const cat = CATEGORIES.find((c) => c.key === entry?.category)
  const history = (entry?.history || []).filter((h) => h.kind !== '최초적재' && h.kind !== '다시적재')
  return (
    <Box sx={{ mb: 3, pb: 2, borderBottom: '2px solid', borderColor: 'primary.main' }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }} useFlexGap flexWrap="wrap">
        {cat && <Chip size="small" label={cat.label} variant="outlined" />}
        {entry?.reference && <Chip size="small" label="참고 자료" />}
        {version?.effectiveDate && <Typography variant="body2" color="text.secondary">[시행 {fmtDate(version.effectiveDate)}]</Typography>}
        {version?.kind && !/적재/.test(version.kind) && <Typography variant="body2" color="text.secondary">[{version.kind}]</Typography>}
      </Stack>
      <Typography variant="h4" component="h1" sx={{ textAlign: 'center', my: 1.5 }}>{entry?.title}</Typography>
      {!!history.length && (
        <Typography variant="body2" color="text.secondary" textAlign="center">
          {history.map((h) => `${h.kind} ${fmtDate(h.date)}`).join(' · ')}
        </Typography>
      )}
      {notice}
      {actions && <Stack direction="row" spacing={1} justifyContent="center" sx={{ mt: 2 }} className="no-print" useFlexGap flexWrap="wrap">{actions}</Stack>}
    </Box>
  )
}
