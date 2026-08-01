/**
 * 좌측 이동 레일 — 화면에서 유일하게 어두운 영역.
 *
 * 이동 수단만 세로로 세워 가로 공간을 목록과 상세에 넘긴다. 레일은 항상 같은 자리에
 * 고정돼 있어 어느 화면에 있든 위치 감각이 유지된다.
 */
import { Link, useLocation } from 'react-router-dom'
import Box from '@mui/material/Box'
import Badge from '@mui/material/Badge'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import DashboardIcon from '@mui/icons-material/SpaceDashboard'
import RequestIcon from '@mui/icons-material/PlaylistAddCheck'
import TagIcon from '@mui/icons-material/Tag'
import MailIcon from '@mui/icons-material/MailOutline'
import PeopleIcon from '@mui/icons-material/Groups'
import LaunchIcon from '@mui/icons-material/Launch'
import LogoutIcon from '@mui/icons-material/Logout'
import { useAuth } from '@shared/contexts/AuthContext'
import { portalLink } from '../lib/portalUrl'
import useUnreadNotices from '../lib/useUnreadNotices'

const RAIL_WIDTH = 64

function RailButton({ icon: Icon, label, active, onClick, to, href, badge }) {
  const linkProps = to
    ? { component: Link, to }
    : href
      ? { component: 'a', href, target: '_blank', rel: 'noopener' }
      : { component: 'button', onClick, type: 'button' }

  return (
    <Tooltip title={label} placement="right">
      <Box
        {...linkProps}
        aria-label={label}
        sx={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.3,
          width: 48, py: 0.9, borderRadius: 1,
          border: 0, background: 'none', cursor: 'pointer',
          textDecoration: 'none', position: 'relative',
          color: active ? 'rail.iconActive' : 'rail.icon',
          bgcolor: active ? 'rail.activeBg' : 'transparent',
          transition: 'background-color .15s ease, color .15s ease',
          '&:hover': { bgcolor: active ? 'rail.activeBg' : 'rail.hoverBg', color: 'rail.iconActive' },
          // 활성 표시는 왼쪽 인디고 막대 — 배경만으로는 어두운 면에서 잘 안 보인다
          ...(active && {
            '&::before': {
              content: '""', position: 'absolute', left: -8, top: 6, bottom: 6,
              width: 3, borderRadius: 3, bgcolor: 'primary.light',
            },
          }),
        }}
      >
        <Badge
          badgeContent={badge}
          color="error"
          overlap="circular"
          sx={{ '& .MuiBadge-badge': { fontSize: '0.6rem', height: 15, minWidth: 15 } }}
        >
          <Icon sx={{ fontSize: 21 }} />
        </Badge>
        {/* 64px 레일에서 '로그아웃' 같은 네 글자가 줄바꿈돼 두 줄로 깨졌다. 줄바꿈을 막고
            넘치면 자른다 — 아이콘과 툴팁이 이미 뜻을 전달하므로 라벨이 잘려도 읽는 데 지장이 없다 */}
        <Typography
          noWrap
          sx={{ fontSize: '0.62rem', fontWeight: 600, lineHeight: 1.2, maxWidth: 46, textAlign: 'center' }}
        >
          {label}
        </Typography>
      </Box>
    </Tooltip>
  )
}

export default function AppRail() {
  const { userName, logout } = useAuth()
  const { pathname } = useLocation()
  const unreadNotices = useUnreadNotices()

  return (
    <Box
      component="nav"
      sx={{
        width: RAIL_WIDTH, flexShrink: 0,
        bgcolor: 'rail.bg',
        borderRight: '1px solid', borderColor: 'rail.border',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        py: 1.5, gap: 0.5,
      }}
    >
      <Typography sx={{ fontSize: '1.35rem', mb: 1 }} aria-hidden>📋</Typography>

      <RailButton
        icon={DashboardIcon}
        label="홈"
        to="/"
        active={pathname === '/' || pathname.startsWith('/posts')}
      />
      <RailButton
        icon={RequestIcon}
        label="요청 현황"
        to="/requests"
        active={pathname.startsWith('/requests')}
      />
      <RailButton
        icon={TagIcon}
        label="채널"
        to="/channels"
        active={pathname.startsWith('/channels')}
      />
      <RailButton
        icon={MailIcon}
        label="쪽지"
        to="/messages"
        active={pathname.startsWith('/messages')}
        badge={unreadNotices}
      />
      <RailButton
        icon={PeopleIcon}
        label="구성원"
        to="/members"
        active={pathname.startsWith('/members')}
      />

      <Box sx={{ flexGrow: 1 }} />

      <RailButton icon={LaunchIcon} label="포털" href={portalLink('/')} />
      <Tooltip title={userName || ''} placement="right">
        <Box sx={{ width: 30, height: 30, my: 0.6, borderRadius: '50%',
          bgcolor: 'primary.main', color: 'primary.contrastText',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.8rem', fontWeight: 700, cursor: 'default' }}>
          {(userName || '?').trim().slice(-2)}
        </Box>
      </Tooltip>
      <RailButton icon={LogoutIcon} label="로그아웃" onClick={logout} />
    </Box>
  )
}
