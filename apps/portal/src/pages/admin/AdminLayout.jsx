import { useEffect, useState } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import Layout from '../../components/Layout'
import Box from '@mui/material/Box'
import Drawer from '@mui/material/Drawer'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Badge from '@mui/material/Badge'
import HomeIcon from '@mui/icons-material/Home'
import PeopleIcon from '@mui/icons-material/People'
import SchoolIcon from '@mui/icons-material/School'
import PersonIcon from '@mui/icons-material/Person'
import MeetingRoomIcon from '@mui/icons-material/MeetingRoom'
import Toolbar from '@mui/material/Toolbar'

const DRAWER_WIDTH = 240

const MENU_ITEMS = [
  { path: '/admin', icon: HomeIcon, label: '홈' },
  { path: '/admin/accounts', icon: PeopleIcon, label: '계정 관리', badge: 'pending' },
  { path: '/admin/staff', icon: SchoolIcon, label: '교직원 관리' },
  { path: '/admin/students', icon: PersonIcon, label: '학생 관리' },
  { path: '/admin/spaces', icon: MeetingRoomIcon, label: '공간 관리' },
]

export default function AdminLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { role } = useAuth()
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    if (role !== 'admin' && role !== 'school_admin') return
    const q = query(collection(db, 'users'), where('role', '==', 'pending'))
    const unsub = onSnapshot(q, (snap) => setPendingCount(snap.size))
    return unsub
  }, [role])

  const isActive = (path) => {
    if (path === '/admin') {
      return location.pathname === '/admin'
    }
    return location.pathname.startsWith(path)
  }

  return (
    <Layout>
      <Box sx={{ display: 'flex', minHeight: 'calc(100vh - 64px)' }}>
        {/* 좌측 사이드바 */}
        <Drawer
          variant="permanent"
          sx={{
            width: DRAWER_WIDTH,
            flexShrink: 0,
            '& .MuiDrawer-paper': {
              width: DRAWER_WIDTH,
              boxSizing: 'border-box',
              position: 'relative',
              borderRight: '1px solid #e0e0e0',
            },
          }}
        >
          <Toolbar />
          <List>
            {MENU_ITEMS.map((item) => {
              const Icon = item.icon
              const active = isActive(item.path)

              return (
                <ListItem key={item.path} disablePadding>
                  <ListItemButton
                    selected={active}
                    onClick={() => navigate(item.path)}
                    sx={{
                      '&.Mui-selected': {
                        backgroundColor: '#e3f2fd',
                        borderLeft: '3px solid #1976d2',
                        '& .MuiListItemIcon-root': {
                          color: '#1976d2',
                        },
                        '& .MuiListItemText-primary': {
                          color: '#1976d2',
                          fontWeight: 700,
                        },
                      },
                    }}
                  >
                    <ListItemIcon>
                      {item.badge === 'pending' && pendingCount > 0 ? (
                        <Badge badgeContent={pendingCount} color="error">
                          <Icon />
                        </Badge>
                      ) : (
                        <Icon />
                      )}
                    </ListItemIcon>
                    <ListItemText primary={item.label} />
                  </ListItemButton>
                </ListItem>
              )
            })}
          </List>
        </Drawer>

        {/* 메인 콘텐츠 영역 */}
        <Box component="main" sx={{ flexGrow: 1, p: 3, backgroundColor: '#fafafa', minHeight: '100%' }}>
          <Outlet />
        </Box>
      </Box>
    </Layout>
  )
}
