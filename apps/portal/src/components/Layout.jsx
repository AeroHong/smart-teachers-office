import { useState, useEffect } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import Avatar from '@mui/material/Avatar'
import Divider from '@mui/material/Divider'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Tooltip from '@mui/material/Tooltip'
import { Link, useLocation, useNavigate, Link as RouterLink } from 'react-router-dom'
import { collection, query, where, onSnapshot, getDoc, doc } from 'firebase/firestore'
import { useAuth } from '../contexts/AuthContext'
import { db } from '../lib/firebase'

// ── 사이드바 네비 구조 ─────────────────────────────────
const NAV_SECTIONS = [
  {
    key: 'portal',
    label: '포털',
    icon: '🏠',
    items: [
      { label: '홈', path: '/', icon: '⊞', exact: true },
    ],
    adminItems: [
      { label: '관리자', path: '/admin', icon: '◈' },
    ],
  },
  {
    key: 'attendance',
    label: '스마트 출결',
    icon: '📋',
    prefix: '/attendance',
    items: [
      { label: '대시보드', path: '/attendance', icon: '◈', exact: true },
      { label: '학생 명단', path: '/attendance/students', icon: '◈' },
      { label: '이벤트 생성', path: '/attendance/events/new', icon: '◈' },
      { label: '출결 통계', path: '/attendance/stats', icon: '◈' },
      { label: '공지 관리', path: '/notices', icon: '◈' },
    ],
  },
  {
    key: 'cover',
    label: '보강 신청',
    icon: '👨‍🏫',
    prefix: '/cover',
    items: [
      { label: '보강 목록', path: '/cover', icon: '◈', exact: true },
      { label: '내 현황', path: '/cover/mypage', icon: '◈' },
      { label: '현황판', path: '/cover/status', icon: '◈' },
    ],
  },
  {
    key: 'training',
    label: '연수 서명부',
    icon: '✍️',
    prefix: '/training',
    items: [
      { label: '연수 목록', path: '/training', icon: '◈', exact: true },
      { label: '연수 만들기', path: '/training/new', icon: '◈' },
    ],
    adminItems: [
      { label: '연수 명단', path: '/training/presets', icon: '◈' },
    ],
  },
  {
    key: 'asa-checklist',
    label: '성취평가제 체크리스트',
    icon: '✅',
    prefix: '/tools/asa-checklist',
    items: [
      { label: '체크리스트 홈', path: '/tools/asa-checklist', icon: '◈', exact: true },
    ],
    adminItems: [
      { label: '과목·교사 관리', path: '/tools/asa-checklist/admin', icon: '◈' },
    ],
    principalItems: [
      { label: '서명 관리', path: '/tools/asa-checklist/principal', icon: '◈' },
    ],
  },
  {
    key: 'tools',
    label: '도구모음',
    icon: '🧰',
    prefix: '/tools',
    items: [
      { label: '전체 보기', path: '/tools', icon: '◈', exact: true },
      { label: 'QR 안내문 생성기', path: '/tools/qr-notice', icon: '◈' },
      { label: '성취평가제 점검 도구', path: '/tools/asa-support', icon: '◈' },
      { label: '내신등급 계산기', path: '/tools/grade-rank', icon: '◈' },
    ],
    adminItems: [
      { label: '분할점수 기준 관리', path: '/tools/asa-support/cutoffs', icon: '◈' },
    ],
  },
]

// 경로 → 페이지 제목 매핑
const PAGE_TITLES = {
  '/': '홈',
  '/admin': '관리자',
  '/attendance': '대시보드',
  '/attendance/students': '학생 명단',
  '/attendance/events/new': '이벤트 생성',
  '/attendance/stats': '출결 통계',
  '/notices': '공지 관리',
  '/cover': '보강 목록',
  '/cover/mypage': '내 현황',
  '/cover/status': '현황판',
  '/training': '연수 목록',
  '/training/new': '연수 만들기',
  '/training/presets': '연수 명단',
  '/tools': '도구모음',
  '/tools/qr-notice': 'QR 안내문 생성기',
  '/tools/asa-support': '성취평가제 체크리스트',
  '/tools/asa-support/cutoffs': '분할점수 기준 관리',
  '/tools/asa-checklist': '체크리스트 홈',
  '/tools/asa-checklist/admin': '과목·교사 관리',
  '/tools/asa-checklist/principal': '서명 관리',
  '/tools/grade-rank': '내신등급 계산기',
}

function getPageTitle(pathname) {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname]
  if (pathname.match(/\/attendance\/events\/[^/]+\/edit/)) return '이벤트 수정'
  if (pathname.match(/\/attendance\/events\/[^/]+/)) return '출결 현황'
  if (pathname.match(/\/training\/[^/]+\/sign/)) return '서명'
  if (pathname.match(/\/training\/[^/]+/)) return '연수 상세'
  if (pathname.match(/\/tools\/asa-checklist\/[^/]+\/process/)) return '과정 체크리스트 작성'
  if (pathname.match(/\/tools\/asa-checklist\/[^/]+/)) return '체크리스트 작성'
  return ''
}

function getSectionLabel(pathname) {
  if (pathname === '/admin') return '관리자'
  if (pathname.startsWith('/attendance') || pathname.startsWith('/notices')) return '스마트 출결'
  if (pathname.startsWith('/cover')) return '보강 신청'
  if (pathname.startsWith('/training')) return '연수 서명부'
  if (pathname.startsWith('/tools/asa-checklist')) return '성취평가제 체크리스트'
  if (pathname.startsWith('/tools')) return '도구모음'
  return '포털'
}

// 현재 경로가 속한 사이드바 섹션의 key (아코디언 자동 펼침용)
function getActiveSectionKey(pathname) {
  if (pathname === '/admin') return 'portal'
  if (pathname.startsWith('/attendance') || pathname.startsWith('/notices')) return 'attendance'
  if (pathname.startsWith('/cover')) return 'cover'
  if (pathname.startsWith('/training')) return 'training'
  if (pathname.startsWith('/tools/asa-checklist')) return 'asa-checklist'
  if (pathname.startsWith('/tools')) return 'tools'
  return 'portal'
}

const SIDEBAR_WIDTH = 220

export default function Layout({ children, wide = false }) {
  const { user, role, schoolName, schoolId, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [anchorEl, setAnchorEl] = useState(null)
  const [helpAnchorEl, setHelpAnchorEl] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 768)
  const [pendingCount, setPendingCount] = useState(0)
  const [logoUrl, setLogoUrl] = useState(null)
  // 사이드바 섹션 아코디언: 도구모음은 기본 펼침 + 현재 페이지가 속한 섹션은 자동 펼침
  const [openSections, setOpenSections] = useState(() => new Set([getActiveSectionKey(location.pathname)]))

  // 경로 이동 시 새로 활성화된 섹션을 자동으로 펼침 (기존에 펼쳐둔 섹션은 그대로 유지)
  useEffect(() => {
    const key = getActiveSectionKey(location.pathname)
    setOpenSections(prev => (prev.has(key) ? prev : new Set(prev).add(key)))
  }, [location.pathname])

  const toggleSection = (key) => {
    setOpenSections(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  useEffect(() => {
    if (!schoolId) { setLogoUrl(null); return }
    getDoc(doc(db, 'schools', schoolId))
      .then(snap => setLogoUrl(snap.data()?.logoUrl || null))
      .catch(() => setLogoUrl(null))
  }, [schoolId])

  // 승인 대기 인원 수 실시간 구독 (admin/school_admin만)
  useEffect(() => {
    if (role !== 'admin' && role !== 'school_admin') return
    const q = query(collection(db, 'users'), where('role', '==', 'pending'))
    const unsub = onSnapshot(q, (snap) => setPendingCount(snap.size))
    return unsub
  }, [role])

  const handleLogout = async () => {
    setAnchorEl(null)
    await logout()
    navigate('/login')
  }

  const isActive = (item) => {
    if (item.exact) return location.pathname === item.path
    return location.pathname.startsWith(item.path)
  }

  const pageTitle = getPageTitle(location.pathname)
  const sectionLabel = getSectionLabel(location.pathname)

  // 탭 타이틀 고정
  useEffect(() => {
    document.title = '스마트 교무실'
  }, [])

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>

      {/* ── 사이드바 경계 토글 탭 ── */}
      <Tooltip title={sidebarOpen ? '사이드바 접기' : '사이드바 펼치기'} placement="right">
        <Box data-print-hide="true"
          onClick={() => setSidebarOpen(p => !p)}
          sx={{
            position: 'fixed',
            left: sidebarOpen ? `${SIDEBAR_WIDTH}px` : 0,
            top: '50%',
            transform: 'translateY(-50%)',
            zIndex: 300,
            transition: 'left 0.22s cubic-bezier(0.4,0,0.2,1)',
            cursor: 'pointer',
            width: 14,
            height: 48,
            bgcolor: '#fff',
            border: '1px solid #e2e8f0',
            borderLeft: 'none',
            borderRadius: '0 10px 10px 0',
            boxShadow: '2px 2px 8px rgba(0,0,0,0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#94a3b8',
            userSelect: 'none',
            '&:hover': {
              width: 20,
              bgcolor: '#eef2ff',
              color: '#4f46e5',
              boxShadow: '3px 2px 12px rgba(79,70,229,0.18)',
            },
          }}
        >
          <span style={{ fontSize: '0.6rem', lineHeight: 1 }}>
            {sidebarOpen ? '‹' : '›'}
          </span>
        </Box>
      </Tooltip>

      {/* ── 사이드바 ── */}
      <Box data-print-hide="true" sx={{
        width: sidebarOpen ? SIDEBAR_WIDTH : 0,
        flexShrink: 0,
        bgcolor: '#fff',
        borderRight: sidebarOpen ? '1px solid #e2e8f0' : 'none',
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        top: 0, left: 0,
        height: '100vh',
        zIndex: 100,
        overflowY: 'auto',
        overflowX: 'hidden',
        transition: 'width 0.22s cubic-bezier(0.4,0,0.2,1)',
        whiteSpace: 'nowrap',
      }}>
        {/* 로고 */}
        <Box sx={{ px: 2.5, py: 2, borderBottom: '1px solid #f1f5f9' }}>
          <Box
            component={Link}
            to="/"
            sx={{ display: 'flex', alignItems: 'center', gap: 1, textDecoration: 'none' }}
          >
            {logoUrl ? (
              <Box component="img" src={logoUrl} alt="학교 로고"
                sx={{ width: 30, height: 30, objectFit: 'contain', borderRadius: '6px', flexShrink: 0 }} />
            ) : (
              <span style={{ fontSize: '1.3rem', flexShrink: 0, lineHeight: 1 }}>🏫</span>
            )}
            <Box sx={{ whiteSpace: 'normal', minWidth: 0 }}>
              <Typography sx={{ fontSize: '0.88rem', fontWeight: 700, color: '#1e293b', lineHeight: 1.3 }}>
                {schoolName || '스마트 교무실'}
              </Typography>
              {schoolName && (
                <Typography sx={{ fontSize: '0.68rem', color: '#94a3b8', lineHeight: 1.2 }}>
                  스마트교무실
                </Typography>
              )}
            </Box>
          </Box>
        </Box>

        {/* 네비 섹션들 */}
        <Box sx={{ flex: 1, py: 1.5 }}>
          {NAV_SECTIONS.map((section) => {
            const items = [
              ...section.items,
              ...(section.adminItems && (role === 'admin' || role === 'school_admin') ? section.adminItems : []),
              ...(section.principalItems && role === 'principal' ? section.principalItems : []),
            ]

            const open = openSections.has(section.key)

            return (
              <Box key={section.key} sx={{ mb: 0.5 }}>
                {/* 섹션 헤더 — 클릭 시 펼침/접힘 */}
                <Box
                  onClick={() => toggleSection(section.key)}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.75,
                    mx: 1.5,
                    px: 1,
                    py: 0.65,
                    borderRadius: '8px',
                    fontSize: '0.84rem',
                    fontWeight: 800,
                    color: '#1e293b',
                    cursor: 'pointer',
                    userSelect: 'none',
                    '&:hover': { bgcolor: '#f8fafc' },
                  }}
                >
                  <span style={{ fontSize: '1rem', lineHeight: 1 }}>{section.icon}</span>
                  <Typography sx={{ flex: 1, fontSize: 'inherit', fontWeight: 'inherit', color: 'inherit' }}>
                    {section.label}
                  </Typography>
                  <span style={{
                    fontSize: '0.62rem',
                    color: '#94a3b8',
                    transition: 'transform 0.16s ease',
                    transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
                    display: 'inline-block',
                  }}>
                    ▸
                  </span>
                </Box>

                {/* 섹션 아이템들 */}
                {open && items.map((item) => {
                  const active = isActive(item)
                  return (
                    <Box
                      key={item.path}
                      component={Link}
                      to={item.path}
                      {...(item.path === '/attendance' ? { state: { reset: Date.now() } } : {})}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1.25,
                        mx: 1.5,
                        pl: 2, pr: 1.25,
                        py: 0.55,
                        borderRadius: '0 8px 8px 0',
                        borderLeft: active ? '2.5px solid #4f46e5' : '2.5px solid transparent',
                        textDecoration: 'none',
                        fontSize: '0.8rem',
                        fontWeight: active ? 600 : 400,
                        color: active ? '#4f46e5' : '#64748b',
                        bgcolor: active ? '#eef2ff' : 'transparent',
                        transition: 'all 0.15s',
                        '&:hover': {
                          bgcolor: active ? '#eef2ff' : '#f8fafc',
                          color: active ? '#4f46e5' : '#1e293b',
                        },
                      }}
                    >
                      {item.label}
                      {item.path === '/admin' && pendingCount > 0 && (
                        <Box sx={{
                          ml: 'auto',
                          minWidth: 18, height: 18,
                          px: 0.5,
                          borderRadius: '9px',
                          bgcolor: '#ef4444',
                          color: '#fff',
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          lineHeight: 1,
                        }}>
                          {pendingCount}
                        </Box>
                      )}
                    </Box>
                  )
                })}
              </Box>
            )
          })}
        </Box>

        {/* 카카오 오픈채팅 문의 배너 */}
        <Box
          component="a"
          href="https://open.kakao.com/o/gviUMYvi"
          target="_blank"
          rel="noopener noreferrer"
          sx={{
            mx: 1.5, mb: 1.5,
            px: 1.5, py: 1,
            borderRadius: '10px',
            bgcolor: '#FEE500',
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            textDecoration: 'none',
            transition: 'opacity 0.15s, transform 0.15s',
            '&:hover': { opacity: 0.88, transform: 'translateY(-1px)' },
          }}
        >
          {/* 카카오 로고 */}
          <Box sx={{ width: 26, height: 26, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="#3A1D1D">
              <path d="M12 3C6.477 3 2 6.477 2 10.818c0 2.728 1.618 5.13 4.073 6.573l-.986 3.664 4.27-2.804A11.7 11.7 0 0012 18.636c5.523 0 10-3.477 10-7.818C22 6.477 17.523 3 12 3z"/>
            </svg>
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: '#3A1D1D', lineHeight: 1.3, whiteSpace: 'nowrap' }}>
              문의 오픈채팅
            </Typography>
            <Typography sx={{ fontSize: '0.65rem', color: '#5c3d00', lineHeight: 1.2, whiteSpace: 'nowrap' }}>
              참여코드 0124
            </Typography>
          </Box>
          <Typography sx={{ ml: 'auto', fontSize: '0.65rem', color: '#3A1D1D', opacity: 0.55, flexShrink: 0 }}>
            →
          </Typography>
        </Box>

        {/* 유저 영역 (사이드바 하단) */}
        <Box sx={{ p: 2, borderTop: '1px solid #f1f5f9' }}>
          <Box
            onClick={e => setAnchorEl(e.currentTarget)}
            sx={{
              display: 'flex', alignItems: 'center', gap: 1.25,
              cursor: 'pointer', borderRadius: '10px',
              px: 1, py: 0.75,
              '&:hover': { bgcolor: '#f8fafc' },
            }}
          >
            {user?.photoURL
              ? <Avatar src={user.photoURL} sx={{ width: 32, height: 32 }} />
              : <Avatar sx={{ width: 32, height: 32, bgcolor: '#4f46e5', fontSize: '0.8rem' }}>
                  {user?.displayName?.[0]}
                </Avatar>
            }
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: '#1e293b', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.displayName}
              </Typography>
              <Typography sx={{ fontSize: '0.72rem', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.email}
              </Typography>
            </Box>
          </Box>
          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={() => setAnchorEl(null)}
            transformOrigin={{ horizontal: 'left', vertical: 'bottom' }}
            anchorOrigin={{ horizontal: 'left', vertical: 'top' }}
          >
            <MenuItem disabled sx={{ fontSize: '0.82rem' }}>{role}</MenuItem>
            <Divider />
            <MenuItem onClick={handleLogout} sx={{ color: 'error.main', fontSize: '0.9rem' }}>
              로그아웃
            </MenuItem>
          </Menu>
        </Box>
      </Box>

      {/* ── 메인 영역 ── */}
      <Box sx={{
        flex: 1,
        ml: sidebarOpen ? `${SIDEBAR_WIDTH}px` : 0,
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        transition: 'margin-left 0.22s cubic-bezier(0.4,0,0.2,1)',
      }}>

        {/* 상단 헤더 (페이지 제목 + 섹션) */}
        <Box sx={{
          px: 4, py: 2,
          bgcolor: '#fff',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          position: 'sticky',
          top: 0,
          zIndex: 50,
        }}>
          <Typography sx={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 500 }}>
            {sectionLabel}
          </Typography>
          {pageTitle && (
            <>
              <Typography sx={{ color: '#cbd5e1', fontSize: '0.85rem' }}>/</Typography>
              <Typography sx={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>
                {pageTitle}
              </Typography>
            </>
          )}

          {/* ── 도움말 버튼 (헤더 우측) ── */}
          <Box sx={{ ml: 'auto' }}>
            <Tooltip title="사용 매뉴얼">
              <IconButton
                size="small"
                onClick={e => setHelpAnchorEl(e.currentTarget)}
                sx={{
                  width: 28, height: 28,
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  color: '#64748b',
                  border: '1.5px solid #e2e8f0',
                  borderRadius: '50%',
                  '&:hover': {
                    color: '#4f46e5',
                    borderColor: '#c7d2fe',
                    bgcolor: '#eef2ff',
                  },
                }}
              >
                ?
              </IconButton>
            </Tooltip>
            <Menu
              anchorEl={helpAnchorEl}
              open={Boolean(helpAnchorEl)}
              onClose={() => setHelpAnchorEl(null)}
              transformOrigin={{ horizontal: 'right', vertical: 'top' }}
              anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
              PaperProps={{ sx: { mt: 0.5, minWidth: 240, boxShadow: '0 4px 20px rgba(0,0,0,0.12)' } }}
            >
              <Typography sx={{
                px: 2, py: 1,
                fontSize: '0.72rem',
                color: '#94a3b8',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}>
                사용 매뉴얼
              </Typography>
              <Divider />
              <MenuItem
                onClick={() => {
                  window.open('/manual/index.html', '_blank')
                  setHelpAnchorEl(null)
                }}
                sx={{ fontSize: '0.88rem', gap: 1.25, py: 1.25 }}
              >
                <span style={{ fontSize: '1rem' }}>📖</span>
                스마트 출결 시스템 매뉴얼
              </MenuItem>
            </Menu>
          </Box>
        </Box>

        {/* 콘텐츠 */}
        <Box component="main" sx={{ flex: 1, maxWidth: wide ? '100%' : 1100, width: '100%', mx: 'auto', px: { xs: 2, md: wide ? 3 : 4 }, py: 3 }}>
          {children}
        </Box>

        {/* 푸터 */}
        <Box sx={{ px: { xs: 2, md: 4 }, py: 2, borderTop: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <Typography fontSize="0.72rem" color="text.disabled">
            Designed &amp; Built by
          </Typography>
          <Typography
            component="a"
            href="https://github.com/AeroHong"
            target="_blank"
            rel="noopener noreferrer"
            fontSize="0.72rem"
            fontWeight={600}
            sx={{ color: '#7c3aed', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
          >
            @AeroHong
          </Typography>
          <Typography fontSize="0.72rem" color="text.disabled">·</Typography>
          <Typography
            component="a"
            href="https://github.com/AeroHong/smart-teachers-office"
            target="_blank"
            rel="noopener noreferrer"
            fontSize="0.72rem"
            sx={{ color: '#94a3b8', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 0.5, '&:hover': { color: '#7c3aed' } }}
          >
            <span style={{ fontSize: '0.8rem' }}>⭐</span> GitHub
          </Typography>
          <Typography fontSize="0.72rem" color="text.disabled">·</Typography>
          <Typography
            component={RouterLink}
            to="/privacy-policy"
            fontSize="0.72rem"
            sx={{ color: '#94a3b8', textDecoration: 'none', '&:hover': { color: '#4f46e5' } }}
          >
            개인정보처리방침
          </Typography>
        </Box>
      </Box>
    </Box>
  )
}
