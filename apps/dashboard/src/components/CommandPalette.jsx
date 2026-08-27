/**
 * 빠른 이동 + 통합 검색 (Cmd/Ctrl + K).
 *
 * 화면이 대시보드·안내/요청·쪽지·구성원으로 늘어나면서, 매번 레일로 손을 옮겨 클릭하는
 * 비용이 눈에 띄기 시작했다. Slack에서 가장 많이 쓰이는 기능이 이것이고, 학교 업무처럼
 * "특정 요청 하나를 다시 열어보는" 일이 잦은 곳에서 특히 효과가 크다.
 *
 * 검색 대상은 이동할 화면 · 내가 읽을 수 있는 모든 글(Canvas) · 내가 속한 채널의
 * 메시지다(PLAN_channels.md P5, 2026-08-27). 사람은 명단 패널이 이미 담당하므로 뺐다.
 *
 * ── 두 검색 대상의 비용이 달라 게이트도 다르다 ──────────────────
 * 글 검색은 팔레트를 여는 즉시 연다(기존부터 그랬다) — 쿼리 2개 고정, `where` 조건만
 * "내 글·받은 글"에서 "내가 읽을 수 있는 모든 글"로 넓혔을 뿐 비용은 그대로다.
 *
 * 메시지 검색은 "내가 속한 채널마다 리스너 하나"라 채널이 수십 개면 리스너도 수십 개다.
 * 그래서 팔레트를 열어도 바로 안 열고, **키워드를 2자 이상 입력하는 순간**에만 연다 —
 * 화면 이동으로만 쓰는(가장 흔한 용법) 팔레트 오픈에서는 비용이 0이다. 채널도
 * 최근 활동순 상위 `MAX_SEARCH_CHANNELS`개, 채널당 최근 `MESSAGE_SEARCH_WINDOW`건까지만
 * 본다 — 메시지가 실제로 쌓인 뒤 이 상한을 다시 보거나 서버 검색으로 옮길지 판단한다
 * (PLAN_channels.md "발견 3").
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, limitToLast, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import Box from '@mui/material/Box'
import Dialog from '@mui/material/Dialog'
import InputAdornment from '@mui/material/InputAdornment'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import SearchIcon from '@mui/icons-material/Search'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { ALL_STAFF_CHANNEL_ID, COL, schoolPath } from '@shared/lib/schema'
import { POST_KIND, isRequest } from '@shared/lib/workRequests'
import { dmTitle, hasLeft, isDm } from '@shared/lib/channels'
import { previewText } from '../lib/useDesktopNotifications'

const PAGES = [
  { id: 'page:/', label: '홈', hint: '채널 목록', to: '/', emoji: '🏠' },
  { id: 'page:/activity', label: '내 활동', hint: '안 한 일', to: '/activity', emoji: '✅' },
  { id: 'page:/calendar', label: '학사일정', hint: '다가오는 일정', to: '/calendar', emoji: '🗓' },
  { id: 'page:/requests', label: '요청 현황', hint: '내가 보낸 안내·요청의 진행', to: '/requests', emoji: '📋' },
  // 글쓰기는 이제 채널 안에서 하는 일이라 채널 맥락이 없는 여기서는 기본 채널(전체
  // 공지)로 보낸다(PLAN_composer.md).
  { id: 'page:/channels/new', label: '글 쓰기', hint: '안내 또는 요청 만들기', to: `/channels/${ALL_STAFF_CHANNEL_ID}/new`, emoji: '✏️' },
  { id: 'page:/messages', label: '쪽지', hint: '받은 쪽지·보낸 쪽지', to: '/messages', emoji: '✉️' },
  { id: 'page:/members', label: '구성원', hint: '조직도·연락', to: '/members', emoji: '👥' },
]

const MAX_POSTS = 8
const MAX_MESSAGES = 8
/** 메시지 검색이 뒤질 채널 수 상한 — 최근 활동순으로 이만큼만 (튜닝 가능한 값, 위 설명 참고). */
const MAX_SEARCH_CHANNELS = 20
/** 채널당 메시지 검색 창 — useChannelMessages.js·useMentionNotifications.js와 같은 패턴. */
const MESSAGE_SEARCH_WINDOW = 25
/** 이만큼 입력해야 메시지 검색 리스너를 연다 — 한두 글자로는 결과도 무의미하고 비용만 든다. */
const MESSAGE_SEARCH_MIN_LEN = 2

/**
 * 상단바 검색 상자에서 팔레트를 연다.
 *
 * 팔레트는 라우트 바깥에 한 벌만 떠 있고 상단바는 그 위에 없어서, 부모-자식으로 상태를
 * 내려줄 수 없다. 컨텍스트를 새로 두기엔 여는 동작 하나뿐이라 이벤트로 처리한다.
 */
const OPEN_EVENT = 'command-palette:open'

export function openCommandPalette() {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT))
}

export default function CommandPalette() {
  const { user, schoolId } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [posts, setPosts] = useState([])
  const [channelList, setChannelList] = useState([])
  const [messages, setMessages] = useState([])
  // 메시지 리스너를 이미 열었는지 — 세션(팔레트를 연 한 번) 안에서 한 번만 연다.
  // 지웠다 다시 2자를 입력해도 다시 열지 않는다(단순함 우선, 토글 최적화는 과하다).
  const [searchingMessages, setSearchingMessages] = useState(false)
  const [cursor, setCursor] = useState(0)

  // 단축키는 입력 중에도 동작해야 한다 (제목을 쓰다가 다른 글을 찾아보는 경우)
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(v => !v)
      }
    }
    const onOpen = () => setOpen(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener(OPEN_EVENT, onOpen)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener(OPEN_EVENT, onOpen)
    }
  }, [])

  // 팔레트를 연 동안만 구독한다 — 늘 켜두면 모든 화면에 리스너가 하나씩 붙는다.
  // where 조건을 "내 글·받은 글"에서 "내가 읽을 수 있는 모든 글"로 넓혔다(P5) —
  // useChannels.js가 posts를 모을 때 쓰는 것과 같은 두 쿼리(규칙과 맞물려야 하는 이유도
  // 같다: 채널 문서를 get()으로 읽는 방식은 목록 쿼리에 못 쓴다).
  useEffect(() => {
    if (!open || !schoolId || !user) return
    const col = collection(db, ...schoolPath(schoolId, COL.REQUESTS))
    const merge = (snap) => setPosts(prev => {
      const byId = new Map(prev.map(p => [p.id, p]))
      snap.docs.forEach(d => byId.set(d.id, { id: d.id, ...d.data() }))
      return [...byId.values()]
    })
    const unsubs = [
      onSnapshot(query(col, where('visibility', '==', 'school')), merge, () => {}),
      onSnapshot(query(col, where('visibleUids', 'array-contains', user.uid)), merge, () => {}),
    ]
    return () => unsubs.forEach(u => u())
  }, [open, schoolId, user])

  // 내가 속한 채널 목록 — 메시지 검색이 어느 채널을 뒤질지 정하는 데 쓰고, 글·메시지
  // 결과의 채널 이름 표시에도 쓴다. useChannels()를 그대로 구독하지 않는 이유: 그러면
  // Channels.jsx가 이미 열어 둔 것과 별개로 상시 리스너가 하나 더 생긴다 — 이 컴포넌트는
  // "열려 있을 때만" 원칙을 지키는 자기 완결형 쿼리를 쓴다.
  useEffect(() => {
    if (!open || !schoolId || !user) return
    return onSnapshot(
      query(
        collection(db, ...schoolPath(schoolId, COL.CHANNELS)),
        where('memberUids', 'array-contains', user.uid),
      ),
      snap => setChannelList(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      () => {},
    )
  }, [open, schoolId, user])

  const channelById = useMemo(() => {
    const m = new Map()
    channelList.forEach(c => m.set(c.id, isDm(c) ? dmTitle(c, user?.uid) : (c.name || '채널')))
    return m
  }, [channelList, user])

  // 메시지 검색이 뒤질 채널 — 보관·나간 채널 제외, 최근 활동순 상위 MAX_SEARCH_CHANNELS개.
  const searchChannels = useMemo(() => (
    channelList
      .filter(c => !c.archived && !hasLeft(c, user?.uid))
      .sort((a, b) => (b.lastMessageAt?.toMillis?.() ?? 0) - (a.lastMessageAt?.toMillis?.() ?? 0))
      .slice(0, MAX_SEARCH_CHANNELS)
  ), [channelList, user])
  const searchChannelsKey = searchChannels.map(c => c.id).join(',')

  // 키워드를 처음 MESSAGE_SEARCH_MIN_LEN자 이상 입력하는 순간에만 켠다 — 화면 이동으로만
  // 쓰는 팔레트 오픈에서는 비용이 0이다(위 파일 설명 참고).
  useEffect(() => {
    if (keyword.trim().length >= MESSAGE_SEARCH_MIN_LEN) setSearchingMessages(true)
  }, [keyword])

  // 채널마다 리스너 하나 — useChannelMessages.js·useMentionNotifications.js와 같은
  // orderBy+limitToLast 패턴. 채널 목록이 바뀌면(활동순 재정렬 등) 전부 다시 연다 —
  // 검색은 실시간성이 중요하지 않아 괜찮다.
  useEffect(() => {
    if (!open || !schoolId || !user || !searchingMessages || !searchChannelsKey) return
    const unsubs = searchChannels.map(c => onSnapshot(
      query(
        collection(db, ...schoolPath(schoolId, COL.CHANNELS, c.id, COL.CHANNEL_MESSAGES)),
        orderBy('createdAt', 'asc'),
        limitToLast(MESSAGE_SEARCH_WINDOW),
      ),
      snap => {
        const docs = snap.docs.map(d => ({ id: d.id, channelId: c.id, ...d.data() }))
        setMessages(prev => {
          const byId = new Map(prev.filter(m => m.channelId !== c.id).map(m => [m.id, m]))
          docs.forEach(m => byId.set(m.id, m))
          return [...byId.values()]
        })
      },
      () => {},
    ))
    return () => unsubs.forEach(u => u())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, schoolId, user, searchingMessages, searchChannelsKey])

  const results = useMemo(() => {
    const q = keyword.trim().toLowerCase()
    const pages = PAGES.filter(p => !q || p.label.toLowerCase().includes(q))
    const matchedPosts = (q
      ? posts.filter(p => (p.title || '').toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q))
      : [...posts].sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
    ).slice(0, MAX_POSTS).map(p => ({
      id: `post:${p.id}`,
      label: p.title || '(제목 없음)',
      hint: `${POST_KIND[isRequest(p) ? 'request' : 'notice'].label} · ${channelById.get(p.channelId) || ''} · ${p.createdByName || ''}`,
      to: `/posts/${p.id}`,
      emoji: POST_KIND[isRequest(p) ? 'request' : 'notice'].emoji,
    }))
    const matchedMessages = q.length >= MESSAGE_SEARCH_MIN_LEN
      ? messages
        .filter(m => (m.body || '').toLowerCase().includes(q))
        .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
        .slice(0, MAX_MESSAGES)
        .map(m => ({
          id: `msg:${m.id}`,
          label: previewText(m.body || ''),
          hint: `${m.authorName || ''} · ${channelById.get(m.channelId) || ''}`,
          to: `/channels/${m.channelId}`,
          emoji: '💬',
        }))
      : []
    return [...pages, ...matchedPosts, ...matchedMessages]
  }, [keyword, posts, messages, channelById])

  useEffect(() => { setCursor(0) }, [keyword])

  const close = () => { setOpen(false); setKeyword(''); setMessages([]); setSearchingMessages(false) }
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
        placeholder="화면 이동 또는 검색 (글·메시지)"
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
            "{keyword.trim()}"에 해당하는 화면이나 글·메시지가 없습니다.
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
