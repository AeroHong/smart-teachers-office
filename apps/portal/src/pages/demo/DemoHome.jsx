import { useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Paper from '@mui/material/Paper'
import Button from '@mui/material/Button'

const DEMOS = [
  {
    icon: '👨‍🏫',
    color: '#0891b2',
    bg: '#ecfeff',
    border: '#a5f3fc',
    title: '보강 신청 시스템',
    desc: '보강 카드 신청, 오픈 예약 카운트다운을 직접 체험해보세요.',
    points: ['실시간 카드 신청 · 마감', '티켓팅 카운트다운 ⏳', '관리자 등록/수정/삭제'],
    path: '/demo/cover',
    cta: '보강 신청 체험하기',
  },
  {
    icon: '✍️',
    color: '#16a34a',
    bg: '#f0fdf4',
    border: '#bbf7d0',
    title: '연수 서명부',
    desc: '터치·펜으로 직접 서명하고 서명 현황을 확인해보세요.',
    points: ['손가락·터치펜 서명 패드', '서명 현황 실시간 표시', 'PDF·Excel 출력'],
    path: '/demo/training',
    cta: '연수 서명 체험하기',
  },
  {
    icon: '📋',
    color: '#7c3aed',
    bg: '#faf5ff',
    border: '#ddd6fe',
    title: '스마트 출결',
    desc: 'QR 체크인 시뮬레이션으로 실시간 출결 현황을 확인해보세요.',
    points: ['학생 QR 체크인 시뮬레이션', '출석·지각·결석 실시간 집계', '수업 중 외출 관리'],
    path: '/demo/attendance',
    cta: '출결 시스템 체험하기',
  },
]

export default function DemoHome() {
  const navigate = useNavigate()

  return (
    <Box>
      <Box sx={{ mb: 5, textAlign: 'center' }}>
        <Typography variant="h4" fontWeight={800} color="#2e1065" letterSpacing="-0.03em" mb={1}>
          스마트 교무실 체험하기
        </Typography>
        <Typography color="#7c6d9a" fontSize="1rem">
          로그인 없이 주요 기능을 직접 체험해보세요.
        </Typography>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 3 }}>
        {DEMOS.map(d => (
          <Paper key={d.path} elevation={0} sx={{
            border: `1px solid ${d.border}`,
            borderRadius: 3, p: 3.5,
            display: 'flex', flexDirection: 'column',
            transition: 'transform 0.2s, box-shadow 0.2s',
            '&:hover': { transform: 'translateY(-3px)', boxShadow: `0 8px 32px ${d.border}` },
          }}>
            <Box sx={{ bgcolor: d.bg, borderRadius: 2.5, p: 1.5, fontSize: '2rem', lineHeight: 1, width: 'fit-content', mb: 2 }}>
              {d.icon}
            </Box>
            <Typography fontWeight={700} fontSize="1.05rem" color="#1e293b" mb={0.75}>{d.title}</Typography>
            <Typography fontSize="0.85rem" color="#64748b" lineHeight={1.6} mb={2}>{d.desc}</Typography>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, mb: 3, flex: 1 }}>
              {d.points.map((p, i) => (
                <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: d.color, flexShrink: 0 }} />
                  <Typography fontSize="0.82rem" color="#475569">{p}</Typography>
                </Box>
              ))}
            </Box>

            <Button
              variant="contained"
              fullWidth
              onClick={() => navigate(d.path)}
              sx={{
                bgcolor: d.color,
                fontWeight: 700,
                borderRadius: 2,
                py: 1.1,
                '&:hover': { bgcolor: d.color, filter: 'brightness(0.9)' },
              }}
            >
              {d.cta}
            </Button>
          </Paper>
        ))}
      </Box>
    </Box>
  )
}
