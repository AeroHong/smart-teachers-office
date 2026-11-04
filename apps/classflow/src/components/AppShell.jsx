import { useEffect, useState } from 'react'
import { Link as RouterLink, useLocation } from 'react-router-dom'
import AppBar from '@mui/material/AppBar'
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Collapse from '@mui/material/Collapse'
import Divider from '@mui/material/Divider'
import Drawer from '@mui/material/Drawer'
import IconButton from '@mui/material/IconButton'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import Toolbar from '@mui/material/Toolbar'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ExpandLess from '@mui/icons-material/ExpandLess'
import ExpandMore from '@mui/icons-material/ExpandMore'
import MenuOpenIcon from '@mui/icons-material/MenuOpen'
import MenuIcon from '@mui/icons-material/Menu'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import EditNoteIcon from '@mui/icons-material/EditNoteOutlined'
import ViewModuleIcon from '@mui/icons-material/ViewModuleOutlined'
import SettingsIcon from '@mui/icons-material/AdminPanelSettingsOutlined'
import { useAuth } from '@shared/contexts/AuthContext'
import { PORTAL_URL } from '../lib/links'
import { useHubRoles } from '../lib/useHubRoles'
import { logHub, setLogUserName } from '../lib/activity'
import RecentActivityTicker from './RecentActivityTicker'

const DRAWER = '16rem'
const DRAWER_MINI = '4.2rem'
const COLLAPSE_KEY = 'classflow.navCollapsed'
const readCollapsed = () => { try { return localStorage.getItem(COLLAPSE_KEY) === '1' } catch { return false } }
const writeCollapsed = (v) => { try { localStorage.setItem(COLLAPSE_KEY, v ? '1' : '0') } catch { /* 이번 화면에서만 */ } }
// StudentHub 화면으로 — portal 중간 페이지를 거치면 재로그인 없이 넘어간다
const hubHref = (next) => `${PORTAL_URL}/studenthub?next=${encodeURIComponent(next)}`
const ROLE_LABEL = { enrollment: '학적', exam: '고사', absence: '결시', elective: '선택과목' }

/**
 * StudentHub AppShell과 같은 틀 — 왼쪽 사이드바(로고·묶음 메뉴·「← 스마트교무실」) + 얇은 상단 바(최근 활동·프로필).
 * work: 작업 화면이면 { title, subtitle, steps: [{ key, label, icon, badge, badgeColor, active, onClick }] } — 「작업」 묶음
 * header: 상단 바 왼쪽, toolbar: 상단 바 오른쪽(최근 활동 뒤, 프로필 앞)
 * fill: 본문이 화면 높이를 꽉 채우는 작업 화면(안에서 스크롤)
 * 배정표(17개 과목 열) 때문에 StudentHub와 달리 사이드바를 아이콘만 남기고 접을 수 있다.
 * autoCollapse: 배정표 단계처럼 넓은 표를 보는 동안 자동으로 접는다(끝나면 원래 상태로).
 */
export default function AppShell({ work = null, header = null, toolbar = null, fill = false, autoCollapse = false, children }) {
  const theme = useTheme()
  const wide = useMediaQuery('(min-width:1800px)')
  const { pathname } = useLocation()
  const { user, userName, photoURL, schoolId, schoolName, logout } = useAuth()
  const { manage, viewer, canView, roles } = useHubRoles()
  const [stored, setStored] = useState(readCollapsed)
  // autoCollapse(배정표 단계) 동안 직접 펴고 접은 것 — 저장하지 않고, 단계를 옮기면 지운다
  const [override, setOverride] = useState(null)
  useEffect(() => { setOverride(null) }, [autoCollapse])
  const collapsed = override ?? (autoCollapse || stored)
  const [userMenu, setUserMenu] = useState(null)
  const [open, setOpen] = useState(() => new Set(['work', 'classflow', 'admin']))
  const toggleCollapsed = () => {
    if (autoCollapse) { setOverride(!collapsed); return }
    writeCollapsed(!stored)
    setStored(!stored)
  }
  const toggleSection = (key) => setOpen((prev) => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key); else next.add(key)
    return next
  })

  useEffect(() => { setLogUserName(userName) }, [userName])

  // 접속 기록 — 탭(세션)마다 한 번(StudentHub와 같은 방식, ClassFlow 전용 classflowLogs)
  useEffect(() => {
    if (!schoolId || !user) return
    try {
      if (sessionStorage.getItem('classflow.loginLogged') === user.uid) return
      sessionStorage.setItem('classflow.loginLogged', user.uid)
    } catch { /* 저장소를 못 써도 기록은 남긴다 */ }
    logHub(schoolId, { action: 'login', summary: `${userName} 접속`, name: userName })
  }, [schoolId, user, userName])

  const sections = [
    work && {
      key: 'work', label: '작업', icon: EditNoteIcon,
      items: work.steps.map((s) => ({ key: s.key, label: s.label, icon: s.icon, onClick: s.onClick, selected: s.active, badge: s.badge, badgeColor: s.badgeColor })),
    },
    {
      key: 'classflow', label: '분반 배정', icon: ViewModuleIcon,
      items: [{ key: 'list', label: '작업 목록', to: '/', selected: pathname === '/' }],
    },
    canView && {
      key: 'admin', label: '관리', icon: SettingsIcon,
      items: [
        (manage || viewer) && { key: 'managers', label: '담당자 지정', href: hubHref('/admin/managers'), app: 'StudentHub' },
        { key: 'logs', label: '사용자 로그', to: '/logs', selected: pathname === '/logs' },
      ].filter(Boolean),
    },
  ].filter(Boolean)

  const itemProps = (i) => (i.href ? { component: 'a', href: i.href }
    : i.to ? { component: RouterLink, to: i.to } : { onClick: i.onClick })

  const nav = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflowX: 'hidden' }}>
      <Box sx={{ px: collapsed ? 0 : 2.5, py: 2.5, display: 'flex', alignItems: 'flex-start', justifyContent: collapsed ? 'center' : 'space-between' }}>
        {!collapsed && (
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.1 }}>
              Class<span style={{ color: theme.palette.primary.main }}>Flow</span>
            </Typography>
            <Typography variant="caption" color="text.secondary">{schoolName || '선택과목 분반 배정'}</Typography>
          </Box>
        )}
        <Tooltip title={collapsed ? '사이드바 펴기' : '사이드바 접기'} placement="right">
          <IconButton size="small" onClick={toggleCollapsed} sx={{ color: 'text.secondary' }}>{collapsed ? <MenuIcon fontSize="small" /> : <MenuOpenIcon fontSize="small" />}</IconButton>
        </Tooltip>
      </Box>

      {/* 작업 중 「‹ 작업 목록」 — ExamCore 고사 화면의 「‹ 고사 목록」과 같은 자리·모양 */}
      {work && (collapsed ? (
        <List dense sx={{ px: 1, pt: 0 }}>
          <Tooltip title="작업 목록" placement="right">
            <ListItemButton component={RouterLink} to="/" sx={{ borderRadius: 2, mb: 0.5, justifyContent: 'center', px: 0 }}>
              <ChevronLeftIcon fontSize="small" />
            </ListItemButton>
          </Tooltip>
        </List>
      ) : (
        <Box sx={{ px: 1 }}>
          <ListItemButton component={RouterLink} to="/" sx={{ borderRadius: 2, py: 0.25, color: 'text.secondary' }}>
            <ChevronLeftIcon fontSize="small" sx={{ mr: 0.5 }} />
            <ListItemText primary="작업 목록" primaryTypographyProps={{ variant: 'caption', fontWeight: 600 }} />
          </ListItemButton>
          <Box sx={{ px: 1.5, pt: 0.5, pb: 1 }}>
            <Typography variant="caption" color="text.secondary">{work.subtitle}</Typography>
            <Typography fontWeight={800} lineHeight={1.3} sx={{ wordBreak: 'keep-all' }}>{work.title}</Typography>
          </Box>
        </Box>
      ))}

      <List dense sx={{ px: 1, flex: 1, overflowY: 'auto' }}>
        {sections.map((n) => {
          const Icon = n.icon
          if (collapsed) {
            // 접힌 사이드바: 묶음 제목 없이 항목 아이콘만
            return (
              <Box key={n.key}>
                {n.items.map((i) => {
                  const ItemIcon = i.icon || Icon
                  return (
                    <Tooltip key={i.key} title={`${i.label}${i.badge ? ` (${i.badge})` : ''}${i.app ? ` · ${i.app}` : ''}`} placement="right">
                      <ListItemButton selected={!!i.selected} {...itemProps(i)} sx={{ borderRadius: 2, mb: 0.5, justifyContent: 'center', px: 0 }}>
                        <ItemIcon fontSize="small" color={i.selected ? 'primary' : 'inherit'} />
                      </ListItemButton>
                    </Tooltip>
                  )
                })}
                <Divider sx={{ my: 0.5, mx: 1 }} />
              </Box>
            )
          }
          const expanded = open.has(n.key)
          return (
            <Box key={n.key} sx={{ mb: 0.5 }}>
              <ListItemButton onClick={() => toggleSection(n.key)} sx={{ borderRadius: 2 }}>
                <ListItemIcon sx={{ minWidth: '2.2rem' }}><Icon fontSize="small" /></ListItemIcon>
                <ListItemText primary={n.label} primaryTypographyProps={{ fontWeight: 700 }} />
                {expanded ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
              </ListItemButton>
              <Collapse in={expanded}>
                <List dense disablePadding>
                  {n.items.map((i) => (
                    <ListItemButton key={i.key} selected={!!i.selected} {...itemProps(i)} sx={{ pl: '3.2rem', borderRadius: 2 }}>
                      <ListItemText primary={i.label} secondary={i.app} secondaryTypographyProps={{ variant: 'caption' }}
                        primaryTypographyProps={{ fontWeight: i.selected ? 700 : 400, color: i.selected ? 'primary' : undefined }} />
                      {i.badge ? <Chip size="small" color={i.badgeColor || 'warning'} label={i.badge} sx={{ height: '1.3rem' }} /> : null}
                      {i.href && <OpenInNewIcon sx={{ fontSize: '0.9rem', color: 'text.secondary' }} />}
                    </ListItemButton>
                  ))}
                </List>
              </Collapse>
            </Box>
          )
        })}
      </List>

      {/* 스마트교무실로 돌아가는 작은 배너 — StudentHub와 같은 모양 */}
      <Tooltip title={collapsed ? '스마트교무실' : ''} placement="right">
        <Box component="a" href={PORTAL_URL}
          sx={{
            ...(collapsed ? { justifyContent: 'center' } : {}),
            display: 'flex', alignItems: 'center', gap: 0.75, mx: 1.5, mb: 1.5, px: 1, py: 0.6,
            borderRadius: 1.5, textDecoration: 'none', color: 'text.secondary', bgcolor: 'action.hover',
            fontSize: '0.72rem', fontWeight: 600, transition: 'all .15s',
            '&:hover': { color: 'primary.main', bgcolor: 'action.selected' },
          }}>
          <Box sx={{ width: '1.4rem', height: '1.4rem', borderRadius: 1, bgcolor: 'primary.main', color: 'primary.contrastText', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <ArrowBackIcon sx={{ fontSize: '0.9rem' }} />
          </Box>
          {!collapsed && '스마트교무실'}
        </Box>
      </Tooltip>
    </Box>
  )

  const width = collapsed ? DRAWER_MINI : DRAWER
  // 작업 화면은 상단 바에 배정 도구가 많아 넓은 화면에서만 최근 활동을 함께 보인다
  const showTicker = canView && (!fill || wide)

  return (
    <Box sx={{ display: 'flex', height: fill ? '100vh' : 'auto', minHeight: '100vh', bgcolor: 'background.default', overflow: fill ? 'hidden' : 'visible' }}>
      <Drawer variant="permanent" open className="no-print"
        sx={{
          width, flexShrink: 0, transition: 'width .2s',
          '& .MuiDrawer-paper': { width, boxSizing: 'border-box', borderRight: 1, borderColor: 'divider', transition: 'width .2s', overflowX: 'hidden' },
        }}>
        {nav}
      </Drawer>
      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <AppBar position="sticky" color="inherit" elevation={0} className="no-print"
          sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
          <Toolbar sx={{ gap: 1.5, minHeight: '3.6rem !important' }}>
            {header}
            <Box sx={{ flex: 1, minWidth: 8 }} />
            {showTicker && <RecentActivityTicker />}
            {toolbar}
            <IconButton onClick={(e) => setUserMenu(e.currentTarget)}>
              <Avatar src={photoURL || undefined} sx={{ width: '2rem', height: '2rem' }}>{userName?.[0]}</Avatar>
            </IconButton>
            <Menu anchorEl={userMenu} open={!!userMenu} onClose={() => setUserMenu(null)}>
              <Box sx={{ px: 2, py: 1 }}>
                <Typography fontWeight={700}>{userName}</Typography>
                <Typography variant="caption" color="text.secondary">{user?.email}</Typography>
                {(roles.length > 0 || manage || viewer) && (
                  <Stack direction="row" gap={0.5} mt={1} flexWrap="wrap">
                    {manage && <Chip size="small" color="primary" variant="outlined" label="관리" />}
                    {viewer && <Chip size="small" variant="outlined" label="교장 열람" />}
                    {roles.map((r) => <Chip key={r} size="small" label={ROLE_LABEL[r] || r} />)}
                  </Stack>
                )}
              </Box>
              <Divider />
              <MenuItem component="a" href={PORTAL_URL}>스마트교무실로 이동</MenuItem>
              <MenuItem component="a" href={hubHref('/')}>StudentHub로 이동</MenuItem>
              <MenuItem onClick={logout}>로그아웃</MenuItem>
            </Menu>
          </Toolbar>
        </AppBar>
        <Box component="main" sx={fill
          ? { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }
          : { flex: 1, p: { xs: 2, md: 3 }, maxWidth: '100%' }}>
          {children}
        </Box>
      </Box>
    </Box>
  )
}
