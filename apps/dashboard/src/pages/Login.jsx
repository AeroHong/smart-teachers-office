import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import { useAuth } from '@shared/contexts/AuthContext'

export default function Login() {
  const { user, role, needsSchoolSetup, loading, login } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (loading || !user) return
    if (needsSchoolSetup) {
      navigate('/school-setup', { replace: true })
    } else if (role && role !== 'pending') {
      navigate('/', { replace: true })
    }
  }, [user, role, needsSchoolSetup, loading])

  const handleLogin = async () => {
    try {
      await login()
    } catch (e) {
      console.error('로그인 실패:', e)
    }
  }

  return (
    <Box sx={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 3,
      background: 'linear-gradient(135deg, #6d28d9 0%, #7c3aed 60%, #8b5cf6 100%)',
      px: 3,
    }}>
      <Typography fontWeight={800} fontSize="1.5rem" color="#fff" letterSpacing="-0.02em">
        📋 업무 대시보드
      </Typography>
      <Typography sx={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.95rem', textAlign: 'center' }}>
        스마트교무실 계정으로 로그인하세요
      </Typography>
      <Button
        variant="contained"
        size="large"
        onClick={handleLogin}
        startIcon={
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width={20} height={20} alt="" />
        }
        sx={{
          bgcolor: '#fff',
          color: '#4c1d95',
          fontWeight: 700,
          fontSize: '0.95rem',
          px: 3.5,
          py: 1.4,
          borderRadius: 1.25,
          boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
          '&:hover': { bgcolor: '#faf5ff', boxShadow: '0 8px 28px rgba(0,0,0,0.26)' },
        }}
      >
        학교 Google 계정으로 로그인
      </Button>
    </Box>
  )
}
