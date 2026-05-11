import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import { useAuth } from '../contexts/AuthContext'

const FEATURES = [
  {
    icon: '👨‍🏫',
    color: '#06b6d4',
    bg: '#ecfeff',
    title: '보강 신청 시스템',
    points: [
      '실시간 보강 현황 카드 뷰',
      '오픈 예약 & 초단위 티켓팅',
      '관리자 일괄 등록 (스프레드시트 붙여넣기)',
    ],
  },
  {
    icon: '✍️',
    color: '#16a34a',
    bg: '#f0fdf4',
    title: '연수 서명부',
    points: [
      '교사 누구나 연수 생성 가능',
      '터치·펜 디지털 서명 (QR 링크)',
      '미참가 사유 기록 (연가·조퇴 등)',
      'PDF·Excel 출력',
    ],
  },
  {
    icon: '📋',
    color: '#4f46e5',
    bg: '#eef2ff',
    title: '스마트 출결',
    points: [
      '학생 QR 직접 체크인',
      '선택과목 2·3학년 출결 최적화',
      '고정 QR로 아침 조회 출결 파악',
      '수업 중 외출 실시간 체크 (1/3 초과 자동 결과 처리)',
    ],
  },
]

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
    <Box sx={{ minHeight: '100vh', bgcolor: '#f8fafc', display: 'flex', flexDirection: 'column' }}>

      {/* ── 헤더 ── */}
      <Box sx={{ bgcolor: '#4f46e5', px: { xs: 3, md: 6 }, py: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Typography fontWeight={800} fontSize="1.1rem" color="#fff" letterSpacing="-0.02em">
          🏫 스마트 교무실
        </Typography>
        <Chip label="Beta" size="small" sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: '#fff', fontSize: '0.7rem', height: 20 }} />
      </Box>

      {/* ── 히어로 ── */}
      <Box sx={{
        bgcolor: '#4f46e5',
        px: { xs: 3, md: 8 },
        pt: { xs: 5, md: 7 },
        pb: { xs: 6, md: 8 },
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* 배경 장식 */}
        <Box sx={{
          position: 'absolute', top: -60, right: -60,
          width: 320, height: 320, borderRadius: '50%',
          bgcolor: 'rgba(255,255,255,0.06)',
          pointerEvents: 'none',
        }} />
        <Box sx={{
          position: 'absolute', bottom: -40, right: 120,
          width: 180, height: 180, borderRadius: '50%',
          bgcolor: 'rgba(255,255,255,0.04)',
          pointerEvents: 'none',
        }} />

        <Box sx={{ maxWidth: 720, position: 'relative' }}>
          <Typography
            sx={{ fontSize: { xs: '1.7rem', md: '2.4rem' }, fontWeight: 800, color: '#fff', lineHeight: 1.25, mb: 1.5, letterSpacing: '-0.02em' }}
          >
            교무 업무, 더 스마트하게
          </Typography>
          <Typography sx={{ fontSize: { xs: '0.95rem', md: '1.05rem' }, color: 'rgba(255,255,255,0.75)', lineHeight: 1.7, mb: 3, maxWidth: 500 }}>
            보강 신청부터 연수 서명, 학생 출결까지 — 학교 Google 계정 하나로 모든 교무 업무를 처리하세요.
          </Typography>

          {/* 로그인 버튼 */}
          <Button
            variant="contained"
            size="large"
            onClick={login}
            startIcon={
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width={20} height={20} alt="" />
            }
            sx={{
              bgcolor: '#fff',
              color: '#333',
              fontWeight: 700,
              fontSize: '0.95rem',
              px: 3.5,
              py: 1.4,
              borderRadius: 3,
              boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
              '&:hover': { bgcolor: '#f0f4ff', boxShadow: '0 6px 20px rgba(0,0,0,0.22)' },
            }}
          >
            학교 Google 계정으로 로그인
          </Button>
          <Typography sx={{ mt: 1.5, fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)' }}>
            학교 Workspace 계정(@학교도메인)만 접속 가능합니다
          </Typography>
        </Box>
      </Box>

      {/* ── 기능 카드 ── */}
      <Box sx={{ px: { xs: 3, md: 8 }, py: { xs: 5, md: 7 }, maxWidth: 1100, mx: 'auto', width: '100%' }}>
        <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.08em', mb: 3, textTransform: 'uppercase' }}>
          주요 기능
        </Typography>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2.5 }}>
          {FEATURES.map(f => (
            <Paper key={f.title} elevation={0} sx={{
              border: '1px solid #e2e8f0',
              borderRadius: 3,
              p: 3,
              transition: 'box-shadow 0.2s',
              '&:hover': { boxShadow: '0 4px 20px rgba(0,0,0,0.08)' },
            }}>
              {/* 아이콘 + 제목 */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                <Box sx={{ bgcolor: f.bg, borderRadius: 2.5, p: 1.25, fontSize: '1.4rem', lineHeight: 1 }}>
                  {f.icon}
                </Box>
                <Typography fontWeight={700} fontSize="0.95rem" color="#1e293b">{f.title}</Typography>
              </Box>

              {/* 포인트 */}
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.9 }}>
                {f.points.map((pt, i) => (
                  <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                    <Box sx={{
                      mt: '5px', flexShrink: 0,
                      width: 6, height: 6, borderRadius: '50%',
                      bgcolor: f.color,
                    }} />
                    <Typography fontSize="0.84rem" color="#475569" lineHeight={1.6}>{pt}</Typography>
                  </Box>
                ))}
              </Box>
            </Paper>
          ))}
        </Box>
      </Box>

      {/* ── 푸터 ── */}
      <Box sx={{ mt: 'auto', textAlign: 'center', py: 3, color: '#cbd5e1', fontSize: '0.75rem' }}>
        © 2026 스마트 교무실 · 학교 Google Workspace 전용
      </Box>
    </Box>
  )
}
