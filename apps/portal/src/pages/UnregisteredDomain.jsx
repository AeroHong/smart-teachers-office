import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import { useAuth } from '../contexts/AuthContext'

const ADMIN_EMAIL = 'hckgood@gmail.com'

export default function UnregisteredDomain() {
  const { user, logout } = useAuth()
  const email = user?.email || ''
  const domain = email.split('@')[1] || ''

  const mailtoHref =
    `mailto:${ADMIN_EMAIL}` +
    `?subject=${encodeURIComponent('[스마트 교무실] 학교 등록 요청')}` +
    `&body=${encodeURIComponent(
      `안녕하세요,\n\n스마트 교무실 등록을 요청합니다.\n\n` +
      `- 학교명: \n` +
      `- Google 도메인: @${domain}\n` +
      `- 담당자 이메일: ${email}\n\n` +
      `감사합니다.`
    )}`

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
          maxWidth: 480,
          textAlign: 'center',
          borderRadius: 4,
          boxShadow: '0 4px 24px rgba(0,0,0,0.1)',
        }}
      >
        <Typography variant="h2" sx={{ mb: 2 }}>🏫</Typography>
        <Typography variant="h6" fontWeight={700} gutterBottom>
          미등록 학교 도메인
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          로그인한 계정
        </Typography>
        <Typography
          variant="body1"
          fontWeight={600}
          sx={{ mb: 0.5, color: '#1a73e8', wordBreak: 'break-all' }}
        >
          {email}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          <strong>@{domain}</strong> 도메인은 아직 등록되지 않았습니다.
        </Typography>

        <Divider sx={{ mb: 3 }} />

        <Typography variant="body2" sx={{ mb: 2, color: '#555', lineHeight: 1.7 }}>
          스마트 교무실 사용을 원하시면 아래 정보를 포함해<br />
          관리자에게 등록을 요청해 주세요.
        </Typography>

        <Box
          sx={{
            bgcolor: '#f8f9fa',
            borderRadius: 2,
            p: 2,
            mb: 3,
            textAlign: 'left',
            fontSize: '0.875rem',
            color: '#444',
            lineHeight: 2,
          }}
        >
          <Box>관리자 이메일: <strong>{ADMIN_EMAIL}</strong></Box>
          <Box>제목: <strong>[스마트 교무실] 학교 등록 요청</strong></Box>
          <Box>내용에 포함할 사항:</Box>
          <Box sx={{ pl: 1.5 }}>• 학교명 (예: 선유고등학교)</Box>
          <Box sx={{ pl: 1.5 }}>• Google 도메인 (예: @{domain || 'school.hs.kr'})</Box>
        </Box>

        <Button
          variant="contained"
          fullWidth
          href={mailtoHref}
          sx={{ mb: 1.5, py: 1.25, fontWeight: 600 }}
        >
          이메일로 등록 요청하기
        </Button>

        <Button
          variant="text"
          fullWidth
          onClick={logout}
          sx={{ color: '#888', fontSize: '0.85rem' }}
        >
          다른 계정으로 로그인
        </Button>
      </Paper>
    </Box>
  )
}
