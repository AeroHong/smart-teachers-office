import { useState, useEffect } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import Avatar from '@mui/material/Avatar'
import Divider from '@mui/material/Divider'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Tooltip from '@mui/material/Tooltip'
import { Link, useLocation, useNavigate } from 'react-router-dom'
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
]

// 경로 → 페이지 제목 매핑
const PAGE_TITLES = {
  '/': '홈',
  '/admin': '관리자',
  '/attendance': '대시보드',
  '/attendance/students': '학생 명단',
  '/attendance/events/new': '이벤트 생성',
  '/attendance/stats': '출결 통계',
  '/cover': '보강 목록',
  '/cover/mypage': '내 현황',
  '/cover/status': '현황판',
  '/training': '연수 목록',
  '/training/new': '연수 만들기',
  '/training/presets': '연수 명단',
}

function getPageTitle(pathname) {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname]
  if (pathname.match(/\/attendance\/events\/[^/]+\/edit/)) return '이벤트 수정'
  if (pathname.match(/\/attendance\/events\/[^/]+/)) return '출결 현황'
  if (pathname.match(/\/training\/[^/]+\/sign/)) return '서명'
  if (pathname.match(/\/training\/[^/]+/)) return '연수 상세'
  return ''
}

function getSectionLabel(pathname) {
  if (pathname === '/admin') return '관리자'
  if (pathname.startsWith('/attendance')) return '스마트 출결'
  if (pathname.startsWith('/cover')) return '보강 신청'
  if (pathname.startsWith('/training')) return '연수 서명부'
  return '포털'
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

  // 탭 타이틀 동적 업데이트
  useEffect(() => {
    const base = schoolName ? `${schoolName} 스마트 교무실` : '스마트 교무실'
    document.title = pageTitle ? `${pageTitle} — ${base}` : base
  }, [schoolName, pageTitle])

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>

      {/* ── 사이드바 경계 토글 탭 ── */}
      <Tooltip title={sidebarOpen ? '사이드바 접기' : '사이드바 펼치기'} placement="right">
        <Box
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
      <Box sx={{
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
            ]

            return (
              <Box key={section.key} sx={{ mb: 1 }}>
                {/* 섹션 헤더 */}
                <Typography sx={{
                  px: 2.5, py: 0.5,
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  color: '#94a3b8',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.75,
                }}>
                  <span>{section.icon}</span>
                  {section.label}
                </Typography>

                {/* 섹션 아이템들 */}
                {items.map((item) => {
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
                        px: 1.25,
                        py: 0.65,
                        borderRadius: '8px',
                        textDecoration: 'none',
                        fontSize: '0.875rem',
                        fontWeight: active ? 600 : 400,
                        color: active ? '#4f46e5' : '#475569',
                        bgcolor: active ? '#eef2ff' : 'transparent',
                        transition: 'all 0.15s',
                        '&:hover': {
                          bgcolor: active ? '#eef2ff' : '#f8fafc',
                          color: active ? '#4f46e5' : '#1e293b',
                        },
                      }}
                    >
                      <Box sx={{
                        width: 6, height: 6,
                        borderRadius: '50%',
                        bgcolor: active ? '#4f46e5' : '#cbd5e1',
                        flexShrink: 0,
                      }} />
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
      </Box>
    </Box>
  )
}
