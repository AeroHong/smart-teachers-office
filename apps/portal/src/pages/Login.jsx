import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import { useAuth } from '../contexts/AuthContext'

export default function Login() {
  const { user, role, isSuperAdmin, loading, login } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (loading) return
    if (!user) return
    if (isSuperAdmin) {
      navigate('/super-admin', { replace: true })
    } else if (role && role !== 'pending') {
      navigate('/', { replace: true })
    }
  }, [user, role, isSuperAdmin, loading])

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: '#f0f4ff',
        p: 2,
      }}
    >
      <Paper
        sx={{
          p: 5,
          width: '100%',
          maxWidth: 400,
          textAlign: 'center',
          borderRadius: 4,
          boxShadow: '0 4px 24px rgba(0,0,0,0.1)',
        }}
      >
        <Typography variant="h5" fontWeight={700} gutterBottom>
          스마트 교무실
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          학교 Google 계정으로 로그인하세요
        </Typography>

        <Button
          variant="outlined"
          size="large"
          fullWidth
          onClick={login}
          startIcon={
            <img
              src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
              width={20} height={20} alt=""
            />
          }
          sx={{
            borderColor: '#ddd',
            color: '#333',
            fontSize: '0.95rem',
            py: 1.25,
            '&:hover': { borderColor: '#1a73e8', bgcolor: '#f0f4ff' },
          }}
        >
          Google 계정으로 로그인
        </Button>
      </Paper>
    </Box>
  )
}
