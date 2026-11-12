import { useEffect, useMemo, useState } from 'react'
import { Link as RouterLink, useLocation } from 'react-router-dom'
import IconButton from '@mui/material/IconButton'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
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
import { hierarchyTree } from '@shared/lib/regulationHierarchy'
import { normTitle } from '@shared/lib/regulationParse'
import { nodeHref } from './RegulationBody'
import { SIDEBAR_BG } from '../theme'

/** 규정 목록을 분류별로 — 목차 문서의 순서대로. 폐지된 규정은 뺀다 */
export function groupByCategory(regulations = []) {
  const sorted = [...regulations].filter((r) => r.status !== 'repealed').sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  return CATEGORIES.map((c) => ({ ...c, regs: sorted.filter((r) => (r.category || 'school') === c.key) })).filter((g) => g.regs.length)
}

/** 체계별 묶음 — [{ key, label, regs: [{ ...reg, depth }] }] (학칙 → 규정 → 세칙을 들여쓰기로) */
export function groupByHierarchy(regulations = []) {
  const { roots, guides, bylaws, repealed } = hierarchyTree(regulations)
  const flat = []
  const walk = (n, depth) => { flat.push({ ...n.reg, depth }); n.children.forEach((c) => walk(c, depth + 1)) }
  roots.forEach((r) => walk(r, 0))
  return [
    { key: 'tree', label: '학칙·규정·세칙', regs: flat },
    { key: 'guide', label: '지침·안내', regs: guides.map((r) => ({ ...r, depth: 0 })) },
    { key: 'bylaw', label: '자치 회칙', regs: bylaws.map((r) => ({ ...r, depth: 0 })) },
    { key: 'repealed', label: '폐지된 규정', regs: repealed.map((r) => ({ ...r, depth: 0 })) },
  ].filter((g) => g.regs.length)
}

/** 목차를 장(부칙·첨부) 단위로 묶는다 — [{ head: 장 줄|null, items: [조·절 …] }] */
export function tocSections(toc = []) {
  const out = [{ head: null, items: [] }]
  for (const t of toc) {
    if (t.type === 'chapter' || t.type === 'addendum' || t.type === 'appendix') out.push({ head: t, items: [] })
    else out[out.length - 1].items.push(t)
  }
  return out.filter((sec) => sec.head || sec.items.length)
}

const Chevron = ({ open, onClick, label }) => (
  <IconButton size="small" onClick={onClick} aria-label={label} aria-expanded={open} sx={{ p: 0.25, ml: 'auto', flexShrink: 0 }}>
    {open ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
  </IconButton>
)

/**
 * 규정 하나의 장·조 목록 — 장은 처음에 접혀 있고(장 제목만), ▸를 누르거나 장 이름을 누르면 그 장의 조가 펼쳐진다.
 * 장이 없는 규정은 조를 바로 보인다. 주소(#n-…)가 가리키는 조가 든 장, 목차 찾기 중일 때는 펼친다.
 */
function RegToc({ toc, filtering, onPick, focusId }) {
  const sections = useMemo(() => tocSections(toc), [toc])
  const [openHeads, setOpenHeads] = useState(() => new Set())
  // 주소가 가리키는 조가 들어 있는 장은 펼친다
  useEffect(() => {
    if (!focusId) return
    const sec = sections.find((x) => x.head && (x.head.id === focusId || x.items.some((i) => i.id === focusId)))
    if (sec) setOpenHeads((s) => (s.has(sec.head.id) ? s : new Set([...s, sec.head.id])))
  }, [focusId, sections])
  const toggle = (id) => setOpenHeads((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const item = (t) => (
    <ListItemButton key={t.id} component="a" href={`#n-${t.id}`} onClick={onPick} sx={{ py: 0.15, pl: t.type === 'section' ? 1 : 1.5 }}>
      <Typography variant="caption" sx={{ fontWeight: t.type === 'section' ? 700 : 400, color: t.deleted ? 'text.disabled' : 'text.primary', lineHeight: 1.5 }}>
        {tocLabel(t)}
      </Typography>
    </ListItemButton>
  )
  return sections.map((sec) => {
    if (!sec.head) return sec.items.map(item)
    const open = filtering || openHeads.has(sec.head.id)
    return (
      <Box key={sec.head.id}>
        <ListItemButton
          component="a" href={`#n-${sec.head.id}`} sx={{ py: 0.2, pl: 0.5, pr: 0.5 }}
          onClick={() => { if (sec.items.length && !openHeads.has(sec.head.id)) toggle(sec.head.id); onPick?.() }}
        >
          <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.primary', lineHeight: 1.5, flex: 1 }}>{tocLabel(sec.head)}</Typography>
          {!!sec.items.length && !filtering && (
            <Chevron open={open} label={open ? '장 접기' : '장 펼치기'} onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle(sec.head.id) }} />
          )}
        </ListItemButton>
        <Collapse in={open} unmountOnExit>{sec.items.map(item)}</Collapse>
      </Box>
    )
  })
}

const tocLabel = (t) => (t.type === 'chapter' ? `제${t.num}장 ${t.title}`
  : t.type === 'section' ? `제${t.num}절 ${t.title}`
    : t.type === 'article' ? `제${t.num}조${t.branch ? `의${t.branch}` : ''} ${t.title}`
      : t.title)

/**
 * 왼쪽 목차 — 분야별(분류 > 규정), 지금 규정은 장·조까지 펼친다.
 * 체계별(학칙 > 규정 > 세칙)은 학교 규정 대부분이 학칙 바로 아래라 목록으로는 쓸모가 적어 사이드바에서 뺐다(2026-11-12).
 * 위계는 규정 머리의 상위·근거·하위 줄과 「규정 체계도」 화면에서 본다. groupByHierarchy는 그대로 둔다.
 * @param {{ book, regId?, base?, onPick?: () => void }} p onPick은 휴대폰 서랍을 닫는 데 쓴다
 */
export default function TocSidebar({ book, regId, base = '', onPick }) {
  const [filter, setFilter] = useState('')
  const [folded, setFolded] = useState(() => new Set()) // 지금 규정이라도 접어 둔 규정
  const { hash } = useLocation()
  const focusId = hash.startsWith('#n-') ? decodeURIComponent(hash.slice(3)) : null
  const toggleReg = (id) => setFolded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const groups = useMemo(() => {
    const g = groupByCategory(book?.regulations)
    const repealed = (book?.regulations || []).filter((r) => r.status === 'repealed')
    return repealed.length ? [...g, { key: 'repealed', label: '폐지된 규정', regs: repealed }] : g
  }, [book])
  const f = normTitle(filter)
  const current = book?.regulations?.find((r) => r.id === regId)
  const tocFiltered = useMemo(() => {
    if (!current) return []
    if (!f) return current.toc
    return current.toc.filter((t) => normTitle(`${t.num}${t.title}`).includes(f) || t.type === 'chapter')
  }, [current, f])

  return (
    <Box component="nav" sx={{ height: '100%', overflowY: 'auto', pb: 4 }} aria-label="규정 목차">
      <Box sx={{ p: 1.5, position: 'sticky', top: 0, bgcolor: SIDEBAR_BG, zIndex: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
        <TextField
          size="small" fullWidth value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="목차에서 찾기"
          InputProps={{ startAdornment: <InputAdornment position="start"><FilterListIcon fontSize="small" /></InputAdornment> }}
        />
      </Box>
      {groups.map((g) => {
        const regs = f ? g.regs.filter((r) => normTitle(r.title).includes(f) || r.id === regId) : g.regs
        if (!regs.length) return null
        return (
          <List
            key={g.key} dense disablePadding sx={{ pb: 1 }}
            subheader={(
              <ListSubheader disableSticky sx={{ bgcolor: 'transparent', color: 'primary.main', fontWeight: 800, fontSize: '0.78rem', lineHeight: 1.4, letterSpacing: '0.02em', pt: 1.75, pb: 0.75, display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box component="span" sx={{ width: 4, height: 14, borderRadius: 1, bgcolor: 'primary.main', flexShrink: 0 }} />
                <Box component="span" sx={{ flex: 1 }}>{g.label}</Box>
                <Box component="span" sx={{ color: 'text.secondary', fontWeight: 600 }}>{regs.length}</Box>
              </ListSubheader>
            )}
          >
            {regs.map((r) => {
              const current = r.id === regId
              const open = current && (!folded.has(r.id) || !!f)
              return (
                <Box key={r.id}>
                  <ListItemButton
                    component={RouterLink} to={nodeHref(base, r.id)} selected={current}
                    onClick={(e) => { if (current) { e.preventDefault(); toggleReg(r.id) } else onPick?.() }}
                    sx={{ py: 0.4, pl: 3.5 + (r.depth || 0) * 1.5, mx: 1, borderRadius: 1, '&.Mui-selected': { bgcolor: 'background.paper', boxShadow: '0 1px 2px rgba(20,39,94,0.12)' }, '&.Mui-selected:hover': { bgcolor: 'background.paper' } }}
                  >
                    <Typography variant="body2" fontWeight={current ? 800 : 400} sx={{ flex: 1, color: r.status === 'repealed' ? 'text.disabled' : current ? 'primary.dark' : 'text.primary' }}>
                      {r.depth ? '└ ' : ''}{r.title}
                    </Typography>
                    {current && !!r.toc?.length && (
                      <Chevron open={open} label={open ? '목차 접기' : '목차 펼치기'} onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleReg(r.id) }} />
                    )}
                  </ListItemButton>
                  <Collapse in={open} unmountOnExit>
                    <List dense disablePadding sx={{ pl: 1.5, borderLeft: '2px solid', borderColor: 'primary.light', ml: 4.5 + (r.depth || 0) * 1.5, mr: 1 }}>
                      <RegToc toc={tocFiltered} filtering={!!f} onPick={onPick} focusId={focusId} />
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
