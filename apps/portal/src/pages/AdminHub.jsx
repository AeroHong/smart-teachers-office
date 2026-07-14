import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardActionArea from '@mui/material/CardActionArea'
import Grid from '@mui/material/Grid'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../contexts/AuthContext'
import Layout from '../components/Layout'

const ADMIN_MENUS = [
  {
    icon: '👤',
    title: '사용자 관리',
    description: '교사 계정 승인·거부 및 역할·직종 변경을 관리합니다.',
    path: '/admin/users',
    color: '#4f46e5',
    bgColor: '#eef2ff',
    badgeKey: 'pending',
  },
  {
    icon: '📊',
    title: '분할점수 기준 관리',
    description: '성취평가제 과목별 등급 분할점수(추정·고정)를 등록하고 수정합니다.',
    path: '/admin/asa-cutoffs',
    color: '#0ea5e9',
    bgColor: '#e0f2fe',
  },
  {
    icon: '✅',
    title: '성취평가제 과목·교사 관리',
    description: '성취평가제 체크리스트 과목 배정 및 제출 현황을 관리합니다.',
    path: '/admin/asa-checklist',
    color: '#16a34a',
    bgColor: '#dcfce7',
  },
  {
    icon: '✍️',
    title: '연수 명단 관리',
    description: '연수 서명부 사전 명단(참석 예정자)을 등록합니다.',
    path: '/admin/training-presets',
    color: '#d97706',
    bgColor: '#fef3c7',
  },
]

export default function AdminHub() {
  const navigate = useNavigate()
  const { role } = useAuth()
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    if (role !== 'admin' && role !== 'school_admin') return
    const q = query(collection(db, 'users'), where('role', '==', 'pending'))
    const unsub = onSnapshot(q, (snap) => setPendingCount(snap.size))
    return unsub
  }, [role])

  return (
    <Layout>
      <Typography variant="h5" fontWeight={700} mb={0.5}>
        관리자 페이지 ⚙️
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={4}>
        학교 관리자 권한을 가진 사용자만 접근할 수 있는 메뉴입니다.
      </Typography>

      <Grid container spacing={3}>
        {ADMIN_MENUS.map((menu) => (
          <Grid item xs={12} sm={6} md={4} key={menu.title}>
            <Card sx={{ height: '100%', borderTop: `3px solid ${menu.color}` }}>
              <CardActionArea onClick={() => navigate(menu.path)} sx={{ height: '100%', alignItems: 'flex-start' }}>
                <CardContent sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, mb: 2 }}>
                    <Box sx={{ bgcolor: menu.bgColor, p: 1.5, borderRadius: 3, fontSize: '1.5rem', lineHeight: 1, flexShrink: 0 }}>
                      {menu.icon}
                    </Box>
                    {menu.badgeKey === 'pending' && pendingCount > 0 && (
                      <Box sx={{
                        mt: 0.5,
                        minWidth: 22, height: 22,
                        px: 0.75,
                        borderRadius: '11px',
                        bgcolor: '#ef4444',
                        color: '#fff',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                        {pendingCount}
                      </Box>
                    )}
                  </Box>
                  <Typography variant="h6" fontWeight={700} mb={0.75}>{menu.title}</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
                    {menu.description}
                  </Typography>
                </CardContent>
              </CardActionArea>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Layout>
  )
}
