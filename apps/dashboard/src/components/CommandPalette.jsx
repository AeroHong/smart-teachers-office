/**
 * 빠른 이동 (Cmd/Ctrl + K).
 *
 * 화면이 대시보드·안내/요청·쪽지·구성원으로 늘어나면서, 매번 레일로 손을 옮겨 클릭하는
 * 비용이 눈에 띄기 시작했다. Slack에서 가장 많이 쓰이는 기능이 이것이고, 학교 업무처럼
 * "특정 요청 하나를 다시 열어보는" 일이 잦은 곳에서 특히 효과가 크다.
 *
 * 검색 대상은 이동할 화면과 내 글·받은 글이다. 사람은 명단 패널이 이미 담당하므로 뺐다.
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import Box from '@mui/material/Box'
import Dialog from '@mui/material/Dialog'
import InputAdornment from '@mui/material/InputAdornment'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import SearchIcon from '@mui/icons-material/Search'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { COL, schoolPath } from '@shared/lib/schema'
import { POST_KIND, isRequest } from '@shared/lib/workRequests'

const PAGES = [
  { id: 'page:/', label: '대시보드', hint: '위젯 한 화면', to: '/', emoji: '🏠' },
  { id: 'page:/requests', label: '안내 · 요청', hint: '내가 보낸 글', to: '/requests', emoji: '📋' },
  { id: 'page:/requests/new', label: '글 쓰기', hint: '안내 또는 요청 만들기', to: '/requests/new', emoji: '✏️' },
  { id: 'page:/messages', label: '쪽지', hint: '받은 쪽지·보낸 쪽지', to: '/messages', emoji: '✉️' },
]

const MAX_POSTS = 8

export default function CommandPalette() {
  const { user, schoolId } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [posts, setPosts] = useState([])
  const [cursor, setCursor] = useState(0)

  // 단축키는 입력 중에도 동작해야 한다 (제목을 쓰다가 다른 글을 찾아보는 경우)
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(v => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // 팔레트를 연 동안만 구독한다 — 늘 켜두면 모든 화면에 리스너가 하나씩 붙는다
  useEffect(() => {
    if (!open || !schoolId || !user) return
    const col = collection(db, ...schoolPath(schoolId, COL.REQUESTS))
    const merge = (snap) => setPosts(prev => {
      const byId = new Map(prev.map(p => [p.id, p]))
      snap.docs.forEach(d => byId.set(d.id, { id: d.id, ...d.data() }))
      return [...byId.values()]
    })
    const unsubs = [
      onSnapshot(query(col, where('createdBy', '==', user.uid)), merge, () => {}),
      onSnapshot(query(col, where('targetUids', 'array-contains', user.uid)), merge, () => {}),
    ]
    return () => unsubs.forEach(u => u())
  }, [open, schoolId, user])

  const results = useMemo(() => {
    const q = keyword.trim().toLowerCase()
    const pages = PAGES.filter(p => !q || p.label.toLowerCase().includes(q))
    const matched = (q
      ? posts.filter(p => (p.title || '').toLowerCase().includes(q))
      : [...posts].sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
    ).slice(0, MAX_POSTS).map(p => ({
      id: `post:${p.id}`,
      label: p.title || '(제목 없음)',
      hint: `${POST_KIND[isRequest(p) ? 'request' : 'notice'].label} · ${p.createdByName || ''}`,
      to: `/requests/${p.id}`,
      emoji: POST_KIND[isRequest(p) ? 'request' : 'notice'].emoji,
    }))
    return [...pages, ...matched]
  }, [keyword, posts])

  useEffect(() => { setCursor(0) }, [keyword])

  const close = () => { setOpen(false); setKeyword('') }
  const go = (item) => { if (item) { close(); navigate(item.to) } }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, results.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)) }
    if (e.key === 'Enter') { e.preventDefault(); go(results[cursor]) }
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      fullWidth
      maxWidth="sm"
      // 화면 한가운데보다 살짝 위 — 목록이 길어져도 눈이 따라가기 편하다
      sx={{ '& .MuiDialog-container': { alignItems: 'flex-start', pt: '12vh' } }}
    >
      <TextField
        autoFocus
        fullWidth
        placeholder="화면 이동 또는 글 제목 검색"
        value={keyword}
        onChange={e => setKeyword(e.target.value)}
        onKeyDown={onKeyDown}
        variant="standard"
        InputProps={{
          disableUnderline: true,
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon sx={{ color: 'text.disabled' }} />
            </InputAdornment>
          ),
          sx: { px: 2, py: 1.5, fontSize: '1rem' },
        }}
      />

      <Box sx={{ borderTop: '1px solid', borderColor: 'divider', maxHeight: 380, overflowY: 'auto', py: 0.5 }}>
        {results.length === 0 ? (
          <Typography color="text.secondary" fontSize="0.85rem" sx={{ px: 2, py: 2 }}>
            "{keyword.trim()}"에 해당하는 화면이나 글이 없습니다.
          </Typography>
        ) : results.map((item, i) => (
          <Box
            key={item.id}
            onClick={() => go(item)}
            onMouseEnter={() => setCursor(i)}
            sx={{
              display: 'flex', alignItems: 'center', gap: 1.2,
              px: 2, py: 1, cursor: 'pointer',
              bgcolor: i === cursor ? 'action.hover' : 'transparent',
            }}
          >
            <Typography fontSize="1rem">{item.emoji}</Typography>
            <Typography fontSize="0.9rem" fontWeight={600} noWrap sx={{ flexShrink: 0 }}>
              {item.label}
            </Typography>
            <Typography fontSize="0.78rem" color="text.secondary" noWrap sx={{ minWidth: 0 }}>
              {item.hint}
            </Typography>
          </Box>
        ))}
      </Box>

      <Box sx={{ px: 2, py: 1, borderTop: '1px solid', borderColor: 'divider' }}>
        <Typography fontSize="0.72rem" color="text.disabled">
          ↑↓ 이동 · Enter 열기 · Esc 닫기
        </Typography>
      </Box>
    </Dialog>
  )
}
