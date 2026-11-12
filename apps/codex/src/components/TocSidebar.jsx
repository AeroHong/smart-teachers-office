import { useMemo, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import Box from '@mui/material/Box'
import Collapse from '@mui/material/Collapse'
import InputAdornment from '@mui/material/InputAdornment'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListSubheader from '@mui/material/ListSubheader'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import FilterListIcon from '@mui/icons-material/FilterList'
import { CATEGORIES } from '@shared/lib/regulationTree'
import { normTitle } from '@shared/lib/regulationParse'
import { nodeHref } from './RegulationBody'

/** 규정 목록을 분류별로 — 목차 문서의 순서대로 */
export function groupByCategory(regulations = []) {
  const sorted = [...regulations].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  return CATEGORIES.map((c) => ({ ...c, regs: sorted.filter((r) => (r.category || 'school') === c.key) })).filter((g) => g.regs.length)
}

/**
 * 왼쪽 목차 — 분류 > 규정, 지금 규정은 장·조까지 펼친다.
 * @param {{ book, regId?, base?, onPick?: () => void }} p onPick은 휴대폰 서랍을 닫는 데 쓴다
 */
export default function TocSidebar({ book, regId, base = '', onPick }) {
  const [filter, setFilter] = useState('')
  const groups = useMemo(() => groupByCategory(book?.regulations), [book])
  const f = normTitle(filter)
  const current = book?.regulations?.find((r) => r.id === regId)
  const tocFiltered = useMemo(() => {
    if (!current) return []
    if (!f) return current.toc
    return current.toc.filter((t) => normTitle(`${t.num}${t.title}`).includes(f) || t.type === 'chapter')
  }, [current, f])

  return (
    <Box component="nav" sx={{ height: '100%', overflowY: 'auto', pb: 4 }} aria-label="규정 목차">
      <Box sx={{ p: 1.5, position: 'sticky', top: 0, bgcolor: 'background.paper', zIndex: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
        <TextField
          size="small" fullWidth value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="목차에서 찾기"
          InputProps={{ startAdornment: <InputAdornment position="start"><FilterListIcon fontSize="small" /></InputAdornment> }}
        />
      </Box>
      {groups.map((g) => {
        const regs = f ? g.regs.filter((r) => normTitle(r.title).includes(f) || r.id === regId) : g.regs
        if (!regs.length) return null
        return (
          <List key={g.key} dense disablePadding subheader={<ListSubheader sx={{ lineHeight: 2.4, fontWeight: 800, bgcolor: 'background.paper' }}>{g.label}</ListSubheader>}>
            {regs.map((r) => {
              const open = r.id === regId
              return (
                <Box key={r.id}>
                  <ListItemButton component={RouterLink} to={nodeHref(base, r.id)} selected={open} onClick={onPick} sx={{ py: 0.5 }}>
                    <Typography variant="body2" fontWeight={open ? 800 : 500}>{r.title}</Typography>
                  </ListItemButton>
                  <Collapse in={open} unmountOnExit>
                    <List dense disablePadding sx={{ pl: 1.5, borderLeft: '2px solid', borderColor: 'primary.light', ml: 2 }}>
                      {tocFiltered.map((t) => (
                        <ListItemButton key={t.id} component="a" href={`#n-${t.id}`} onClick={onPick} sx={{ py: 0.15, pl: t.type === 'article' ? 1.5 : 0.5 }}>
                          <Typography variant="caption" sx={{ fontWeight: t.type === 'article' ? 400 : 800, color: t.deleted ? 'text.disabled' : 'text.primary', lineHeight: 1.5 }}>
                            {t.type === 'chapter' ? `제${t.num}장 ${t.title}` : t.type === 'section' ? `제${t.num}절 ${t.title}` : t.type === 'article' ? `제${t.num}조${t.branch ? `의${t.branch}` : ''} ${t.title}` : t.title}
                          </Typography>
                        </ListItemButton>
                      ))}
                    </List>
                  </Collapse>
                </Box>
              )
            })}
          </List>
        )
      })}
    </Box>
  )
}
