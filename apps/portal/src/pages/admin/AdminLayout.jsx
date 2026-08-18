import { useEffect, useState } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import Layout from '../../components/Layout'
import Box from '@mui/material/Box'
import Tabs from '@mui/material/Tabs'
import Tab from '@mui/material/Tab'
import Badge from '@mui/material/Badge'

const MENU_ITEMS = [
  { path: '/admin', label: '홈', icon: '🏠' },
  { path: '/admin/accounts', label: '계정 관리', icon: '👥', badge: 'pending' },
  { path: '/admin/subjects', label: '과목 관리', icon: '📚' },
  { path: '/admin/staff', label: '교직원 관리', icon: '👨‍🏫' },
  { path: '/admin/students', label: '학생 관리', icon: '🎓' },
  { path: '/admin/spaces', label: '공간 관리', icon: '🏢' },
  { path: '/admin/academic-calendar', label: '학사일정', icon: '📅' },
  { path: '/admin/dashboard-modules', label: '대시보드 모듈', icon: '🧩' },
  { path: '/admin/evaluation-plan-managers', label: '평가계획 담당자', icon: '📐' },
  { path: '/admin/asa-cutoffs', label: '분할점수 기준', icon: '📊' },
  { path: '/admin/asa-checklist', label: 'ASA 체크리스트', icon: '✅' },
  { path: '/admin/training-presets', label: '연수 명단', icon: '📋' },
]

export default function AdminLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { role, schoolId } = useAuth()
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    if (role !== 'admin' && role !== 'school_admin') return
    if (!schoolId) return
    const q = query(collection(db, 'users'),
      where('schoolId', '==', schoolId),
      where('role', '==', 'pending'))
    const unsub = onSnapshot(q, (snap) => setPendingCount(snap.size))
    return unsub
  }, [role, schoolId])

  const currentTab = MENU_ITEMS.findIndex(item => {
    if (item.path === '/admin') {
      return location.pathname === '/admin'
    }
    return location.pathname.startsWith(item.path)
  })

  const handleTabChange = (event, newValue) => {
    navigate(MENU_ITEMS[newValue].path)
  }

  return (
    <Layout wide>
      <Box sx={{ width: '100%' }}>
        {/* 탭 네비게이션 */}
        <Box sx={{
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: '#fff',
          mb: 3,
          mx: -3,
          px: 3,
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}>
          <Tabs
            value={currentTab === -1 ? 0 : currentTab}
            onChange={handleTabChange}
            variant="scrollable"
            scrollButtons="auto"
            sx={{
              '& .MuiTab-root': {
                minHeight: 64,
                fontSize: '0.95rem',
                fontWeight: 600,
                textTransform: 'none',
              },
            }}
          >
            {MENU_ITEMS.map((item) => (
              <Tab
                key={item.path}
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <span>{item.icon}</span>
                    <span>{item.label}</span>
                    {item.badge === 'pending' && pendingCount > 0 && (
                      <Badge
                        badgeContent={pendingCount}
                        color="error"
                        sx={{ ml: 0.5 }}
                      />
                    )}
                  </Box>
                }
              />
            ))}
          </Tabs>
        </Box>

        {/* 메인 콘텐츠 영역 */}
        <Box sx={{ width: '100%' }}>
          <Outlet />
        </Box>
      </Box>
    </Layout>
  )
}
