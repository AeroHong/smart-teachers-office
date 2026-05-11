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
    <Box sx={{ minHeight: '100vh', bgcolor: '#fdf8ff', display: 'flex', flexDirection: 'column' }}>

      {/* ── 헤더 ── */}
      <Box sx={{
        background: 'linear-gradient(135deg, #6d28d9 0%, #7c3aed 60%, #8b5cf6 100%)',
        px: { xs: 3, md: 6 }, py: 2,
        display: 'flex', alignItems: 'center', gap: 1.5,
      }}>
        <Typography fontWeight={800} fontSize="1.1rem" color="#fff" letterSpacing="-0.02em">
          🏫 스마트 교무실
        </Typography>
        <Chip label="Beta" size="small" sx={{ bgcolor: 'rgba(255,255,255,0.18)', color: '#fff', fontSize: '0.7rem', height: 20 }} />
      </Box>

      {/* ── 히어로 ── */}
      <Box sx={{
        background: 'linear-gradient(135deg, #6d28d9 0%, #7c3aed 55%, #9333ea 100%)',
        px: { xs: 3, md: 8 },
        pt: { xs: 5, md: 7 },
        pb: { xs: 6, md: 8 },
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* 배경 장식 원 */}
        <Box sx={{ position: 'absolute', top: -80, right: -80, width: 360, height: 360, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.05)', pointerEvents: 'none' }} />
        <Box sx={{ position: 'absolute', bottom: -50, right: 100, width: 200, height: 200, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.04)', pointerEvents: 'none' }} />
        <Box sx={{ position: 'absolute', top: 40, right: '30%', width: 100, height: 100, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.03)', pointerEvents: 'none' }} />

        <Box sx={{ maxWidth: 680, position: 'relative' }}>
          <Box sx={{ display: 'inline-block', bgcolor: 'rgba(255,255,255,0.15)', px: 1.5, py: 0.4, borderRadius: 2, mb: 2 }}>
            <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: 'rgba(255,255,255,0.9)', letterSpacing: '0.04em' }}>
              학교 교무 업무 통합 플랫폼
            </Typography>
          </Box>
          <Typography sx={{
            fontSize: { xs: '1.8rem', md: '2.6rem' },
            fontWeight: 800, color: '#fff', lineHeight: 1.2, mb: 1.5, letterSpacing: '-0.03em',
          }}>
            교무 업무,<br />더 스마트하게
          </Typography>
          <Typography sx={{ fontSize: { xs: '0.95rem', md: '1.05rem' }, color: 'rgba(255,255,255,0.72)', lineHeight: 1.75, mb: 3.5, maxWidth: 480 }}>
            보강 신청부터 연수 서명, 학생 출결까지 —<br />학교 Google 계정 하나로 모든 교무 업무를 처리하세요.
          </Typography>

          <Button
            variant="contained"
            size="large"
            onClick={login}
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
              borderRadius: 3,
              boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
              '&:hover': { bgcolor: '#faf5ff', boxShadow: '0 8px 28px rgba(0,0,0,0.26)' },
            }}
          >
            학교 Google 계정으로 로그인
          </Button>
          <Typography sx={{ mt: 1.5, fontSize: '0.77rem', color: 'rgba(255,255,255,0.45)' }}>
            학교 Workspace 계정(@학교도메인)만 접속 가능합니다
          </Typography>
        </Box>
      </Box>

      {/* ── 기능 카드 ── */}
      <Box sx={{ px: { xs: 3, md: 8 }, py: { xs: 5, md: 7 }, maxWidth: 1080, mx: 'auto', width: '100%' }}>
        <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#a78bfa', letterSpacing: '0.1em', mb: 3, textTransform: 'uppercase' }}>
          주요 기능
        </Typography>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2.5 }}>
          {FEATURES.map(f => (
            <Paper key={f.title} elevation={0} sx={{
              border: '1px solid #ede9fe',
              borderRadius: 3,
              p: 3,
              bgcolor: '#fff',
              transition: 'box-shadow 0.2s, transform 0.2s',
              '&:hover': { boxShadow: '0 8px 32px rgba(109,40,217,0.1)', transform: 'translateY(-2px)' },
            }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5 }}>
                <Box sx={{ bgcolor: f.bg, borderRadius: 2.5, p: 1.25, fontSize: '1.4rem', lineHeight: 1 }}>
                  {f.icon}
                </Box>
                <Typography fontWeight={700} fontSize="0.95rem" color="#2e1065">{f.title}</Typography>
              </Box>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {f.points.map((pt, i) => (
                  <Box key={i} sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start' }}>
                    <Box sx={{ mt: '6px', flexShrink: 0, width: 5, height: 5, borderRadius: '50%', bgcolor: '#8b5cf6' }} />
                    <Typography fontSize="0.84rem" color="#5b4b8a" lineHeight={1.65}>{pt}</Typography>
                  </Box>
                ))}
              </Box>
            </Paper>
          ))}
        </Box>
      </Box>

      {/* ── 푸터 ── */}
      <Box sx={{ mt: 'auto', py: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5, flexWrap: 'wrap' }}>
        <Typography fontSize="0.75rem" sx={{ color: '#c4b5fd' }}>Designed &amp; Built by</Typography>
        <Typography
          component="a"
          href="https://github.com/AeroHong"
          target="_blank"
          rel="noopener noreferrer"
          fontSize="0.75rem"
          fontWeight={700}
          sx={{ color: '#a78bfa', textDecoration: 'none', '&:hover': { color: '#fff' } }}
        >
          @AeroHong
        </Typography>
        <Typography fontSize="0.75rem" sx={{ color: '#c4b5fd' }}>·</Typography>
        <Typography
          component="a"
          href="https://github.com/AeroHong/smart-teachers-office"
          target="_blank"
          rel="noopener noreferrer"
          fontSize="0.75rem"
          sx={{ color: '#c4b5fd', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 0.5, '&:hover': { color: '#a78bfa' } }}
        >
          <span style={{ fontSize: '0.85rem' }}>⭐</span> GitHub
        </Typography>
      </Box>
    </Box>
  )
}
