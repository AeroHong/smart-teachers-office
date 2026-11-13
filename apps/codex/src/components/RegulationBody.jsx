import { memo, useEffect, useMemo, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import Link from '@mui/material/Link'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableRow from '@mui/material/TableRow'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import MoreHorizIcon from '@mui/icons-material/MoreHoriz'
import { articleHeading, circled, indexNodes, nodePreview, nodeRefLabel, plainText, refText, resolvePlain, splitRefs, unitOf } from '@shared/lib/regulationTree'
import { highlight } from '@shared/lib/regulationSearch'
import { useAuth } from '@shared/contexts/AuthContext'
import { getCurrentNodes, makeFindReg } from '../lib/data'

/** 조문 주소 — /r/규정#n-노드 (공개 화면은 base를 바꾼다) */
export const nodeHref = (base, regId, nodeId) => `${base}/r/${regId}${nodeId ? `#n-${nodeId}` : ''}`

const histLabel = (h) => `<${h.kind} ${h.date.replace(/-/g, '.').replace(/\.0/g, '.')}.>`

// 다른 규정 노드 색인 — 미리보기·고정 링크가 같은 규정을 여러 번 읽지 않게(버전 캐시 위에 한 번 더)
const foreignIndex = new Map()
function loadIndex(loadNodes, regId) {
  if (!foreignIndex.has(regId)) {
    foreignIndex.set(regId, Promise.resolve(loadNodes(regId)).then((nodes) => (nodes ? indexNodes(nodes) : null)).catch(() => { foreignIndex.delete(regId); return null }))
  }
  return foreignIndex.get(regId)
}

/** 미리보기 창 내용 */
function PreviewBox({ title, preview }) {
  return (
    <Box sx={{ maxWidth: 420 }}>
      <Typography variant="caption" fontWeight={800} color="primary" display="block" sx={{ mb: 0.5 }}>{title}</Typography>
      {!preview ? <Typography variant="body2" color="text.secondary">불러오는 중…</Typography> : (
        <>
          {preview.lines.map((l, i) => (
            <Typography key={i} variant="body2" sx={{ pl: `${Math.min(l.depth, 4) * 0.9}rem`, lineHeight: 1.6, wordBreak: 'keep-all', ...(l.focus ? { bgcolor: '#fef9c3' } : {}) }}>
              {l.text}
            </Typography>
          ))}
          {preview.more && <Typography variant="caption" color="text.secondary">… 눌러서 전체 보기</Typography>}
        </>
      )}
    </Box>
  )
}

const tipSx = { bgcolor: 'background.paper', color: 'text.primary', border: '1px solid', borderColor: 'divider', boxShadow: '0 6px 20px rgba(20,39,94,0.16)', p: 1.25, maxWidth: 440 }

/**
 * 조문 링크 + 미리보기 — 마우스를 잠깐 올리면(휴대폰은 길게 누르면) 그 조문이 작은 창으로 뜬다.
 * 같은 규정은 이미 있는 색인으로, 다른 규정은 창이 열릴 때 그 규정 노드를 불러온다.
 */
function RefLink({ regId, nodeId, ctx, children }) {
  const same = regId === ctx.regId
  const [loaded, setLoaded] = useState(null)
  const index = same ? ctx.index : loaded
  const reg = ctx.book?.regulations?.find((r) => r.id === regId)
  const preview = useMemo(() => {
    if (!index) return null
    const textOf = (t) => plainText(t, { regId, regTitle: () => '', byIdOf: (r) => (r === regId ? index.byId : null) })
    return nodePreview(index, nodeId, { textOf })
  }, [index, nodeId, regId])
  const onOpen = () => { if (!index && ctx.loadNodes) loadIndex(ctx.loadNodes, regId).then(setLoaded) }
  const title = `${same ? ctx.regTitle : reg?.title || ''} ${preview?.title || ''}`.trim()
  return (
    <Tooltip
      title={<PreviewBox title={title} preview={preview} />}
      onOpen={onOpen}
      enterDelay={350} enterNextDelay={200} leaveDelay={80} enterTouchDelay={450}
      placement="bottom-start"
      componentsProps={{ tooltip: { sx: tipSx } }}
    >
      <Link component={RouterLink} to={nodeHref(ctx.base, regId, nodeId)} underline="hover">{children}</Link>
    </Tooltip>
  )
}

/** 다른 규정의 고정 링크 — 그 규정 노드를 불러 지금 번호로 */
function ForeignRef({ refInfo, ctx }) {
  const [label, setLabel] = useState(null)
  const reg = ctx.book?.regulations?.find((r) => r.id === refInfo.regId)
  useEffect(() => {
    let alive = true
    if (!reg || !ctx.loadNodes) return undefined
    loadIndex(ctx.loadNodes, refInfo.regId).then((idx) => {
      if (alive && idx) setLabel(idx.byId.has(refInfo.nodeId) ? nodeRefLabel(idx.byId, refInfo.nodeId) : null)
    })
    return () => { alive = false }
  }, [reg, ctx.loadNodes, refInfo.regId, refInfo.nodeId])
  if (!reg) return <span>(없어진 규정)</span>
  return <RefLink regId={refInfo.regId} nodeId={refInfo.nodeId} ctx={ctx}>「{reg.title}」 {label || '…'}</RefLink>
}

/** 글 + 참조 링크 + 검색어 강조 */
export function RefText({ text, ctx }) {
  const segs = splitRefs(text)
  return segs.map((s, i) => {
    if (s.ref) {
      if (s.ref.regId === ctx.regId) {
        const ok = ctx.byId.has(s.ref.nodeId)
        return ok
          ? <RefLink key={i} regId={ctx.regId} nodeId={s.ref.nodeId} ctx={ctx}>{refText(s.ref, { regId: ctx.regId, regTitle: () => '', byIdOf: () => ctx.byId, fromArticleId: ctx.articleId })}</RefLink>
          : <span key={i}>(없어진 조문)</span>
      }
      return <ForeignRef key={i} refInfo={s.ref} ctx={ctx} />
    }
    if (s.plain && ctx.findReg) {
      const to = resolvePlain(s.plain, ctx)
      if (to) return <RefLink key={i} regId={to.regId} nodeId={to.nodeId} ctx={ctx}>{s.text}</RefLink>
    }
    return <Marked key={i} text={s.text} terms={ctx.terms} />
  })
}

function Marked({ text, terms }) {
  if (!terms?.length) return text
  return highlight(text, terms).map((h, i) => (h.hit ? <mark key={i} style={{ background: '#fde68a', padding: 0 }}>{h.text}</mark> : h.text))
}

function NodeTable({ node }) {
  return (
    <Box sx={{ overflowX: 'auto', my: 1 }}>
      <Table size="small" sx={{ '& td': { border: '1px solid', borderColor: 'divider', px: 1, py: 0.5, fontSize: '0.88rem', whiteSpace: 'pre-wrap', verticalAlign: 'middle' } }}>
        <TableBody>
          {node.rows.map((r, ri) => (
            <TableRow key={ri} sx={ri === 0 ? { bgcolor: 'action.hover', '& td': { fontWeight: 700, textAlign: 'center' } } : undefined}>
              {r.cells.map((c, ci) => <TableCell key={ci} colSpan={c.colSpan || 1} rowSpan={c.rowSpan || 1}>{c.text}</TableCell>)}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  )
}

function ArticleMenu({ node, ctx }) {
  const [anchor, setAnchor] = useState(null)
  const cites = ctx.citedBy?.(node.id) || []
  const copy = () => {
    const url = `${window.location.origin}${nodeHref(ctx.base, ctx.regId, node.id)}`
    navigator.clipboard?.writeText(`${ctx.regTitle} ${nodeRefLabel(ctx.byId, node.id)} ${url}`)
    setAnchor(null)
  }
  return (
    <>
      <IconButton size="small" className="no-print cx-art-menu" onClick={(e) => setAnchor(e.currentTarget)} aria-label="조문 메뉴" sx={{ ml: 0.5, opacity: 0.4 }}>
        <MoreHorizIcon fontSize="small" />
      </IconButton>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        <MenuItem onClick={copy}>링크 복사</MenuItem>
        {(node.hist || []).length > 0 && <MenuItem disabled>연혁: {node.hist.map(histLabel).join(' ')}</MenuItem>}
        {cites.length === 0 && <MenuItem disabled>이 조를 인용하는 곳 없음</MenuItem>}
        {cites.map((c) => (
          <MenuItem key={c.key} component={RouterLink} to={nodeHref(ctx.base, c.regId, c.nodeId)} onClick={() => setAnchor(null)}>
            인용: 「{c.regTitle}」 {c.label}
          </MenuItem>
        ))}
      </Menu>
    </>
  )
}

const INDENT = { chapter: 0, section: 0, article: 0, paragraph: 1.2, item: 2.4, subitem: 3.6, line: 4.6, text: 1.2 }

/** 노드 한 줄 */
const NodeRow = memo(function NodeRow({ node, depth, ctx, focused }) {
  const id = `n-${node.id}`
  const hist = (node.hist || []).length ? <Typography component="span" sx={{ color: 'secondary.main', fontSize: '0.82rem', ml: 0.5 }}>{node.hist.map(histLabel).join(' ')}</Typography> : null
  const sx = { scrollMarginTop: 80, ...(focused ? { bgcolor: '#fef9c3', borderRadius: 1, transition: 'background 1s' } : {}) }
  if (node.type === 'chapter' || node.type === 'section') {
    return <Typography id={id} variant={node.type === 'chapter' ? 'h6' : 'subtitle1'} sx={{ ...sx, textAlign: 'center', mt: 3, mb: 1.5, fontWeight: 800 }}>제{node.num}{node.type === 'chapter' ? '장' : '절'} {node.title}</Typography>
  }
  if (node.type === 'addendum') {
    return <Typography id={id} variant="h6" sx={{ ...sx, textAlign: 'center', mt: 4, mb: 1.5 }}>부칙{node.date ? ` (${node.date})` : ''}</Typography>
  }
  if (node.type === 'appendix') {
    return <Typography id={id} variant="subtitle1" sx={{ ...sx, mt: 3, mb: 1, fontWeight: 800 }}>{node.title}</Typography>
  }
  if (node.type === 'table') return <Box id={id} sx={{ ...sx, pl: `${Math.min(depth, 4) * 1.2}rem` }}><NodeTable node={node} /></Box>
  const pl = `${(INDENT[node.type] ?? depth * 1.2) + (node.box ? 1 : 0)}rem`
  if (node.type === 'article') {
    return (
      <Box id={id} sx={{ ...sx, mt: 1.75, '&:hover .cx-art-menu': { opacity: 1 } }} className="cx-body">
        <Typography component="span" fontWeight={800}>{articleHeading(node)}</Typography>
        {' '}
        {node.deleted ? '삭제' : <RefText text={node.text} ctx={{ ...ctx, articleId: node.id }} />}
        {hist}
        {!ctx.readOnlyMenu && <ArticleMenu node={node} ctx={ctx} />}
      </Box>
    )
  }
  const prefix = node.type === 'paragraph' ? circled(node.num) : node.type === 'item' || node.type === 'subitem' ? `${node.num}.` : node.type === 'line' ? node.num : ''
  return (
    <Box id={id} className="cx-body" sx={{ ...sx, pl, textIndent: prefix ? '-1.1em' : 0, ml: prefix ? '1.1em' : 0, ...(node.box ? { borderLeft: '3px solid', borderColor: 'divider', pl: `calc(${pl} + 0.5rem)` } : {}) }}>
      {prefix && <span style={{ marginRight: '0.35em' }}>{prefix}</span>}
      {node.deleted ? '삭제' : <RefText text={node.text} ctx={{ ...ctx, articleId: ctx.articleOf(node.id) }} />}
      {hist}
    </Box>
  )
})

/**
 * 규정 본문.
 * @param {{ regId, regTitle, nodes, book, base?, terms?, focusId?, readOnlyMenu?, loadNodes? }} p
 *   loadNodes(regId) — 다른 규정의 고정 링크를 그릴 때 그 규정 노드를 읽는 법(공개 화면은 공개 사본에서)
 */
export default function RegulationBody({ regId, regTitle, nodes, book, base = '', terms, focusId, readOnlyMenu = false, loadNodes: loadNodesProp }) {
  const { schoolId } = useAuth()
  const loadNodes = useMemo(() => loadNodesProp || ((id) => getCurrentNodes(schoolId, book, id)), [loadNodesProp, schoolId, book])
  const index = useMemo(() => indexNodes(nodes), [nodes])
  const { byId } = index
  const depth = useMemo(() => {
    const m = new Map()
    for (const n of nodes) m.set(n.id, n.parent ? (m.get(n.parent) ?? 0) + 1 : 0)
    return m
  }, [nodes])
  const findReg = useMemo(() => makeFindReg(book), [book])
  const ctx = useMemo(() => ({
    regId, regTitle, byId, index, book, base, terms, findReg, loadNodes, readOnlyMenu,
    articleOf: (id) => { const u = unitOf(byId, id); return u?.type === 'article' ? u.id : null },
    citedBy: (nodeId) => (book?.citations?.[`${regId}/${nodeId}`] || []).map((s) => {
      const [r, n] = s.split('/')
      const reg = book.regulations.find((x) => x.id === r)
      const t = reg?.toc?.find((x) => x.id === n)
      return { key: s, regId: r, nodeId: n, regTitle: reg?.title || '', label: t ? `제${t.num}조${t.branch ? `의${t.branch}` : ''}${t.title ? `(${t.title})` : ''}` : '' }
    }),
  }), [regId, regTitle, byId, index, book, base, terms, findReg, loadNodes, readOnlyMenu])
  return (
    <Box>
      {nodes.map((n) => <NodeRow key={n.id} node={n} depth={depth.get(n.id) || 0} ctx={ctx} focused={focusId === n.id} />)}
    </Box>
  )
}
