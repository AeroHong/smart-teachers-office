import { useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardActionArea from '@mui/material/CardActionArea'
import Chip from '@mui/material/Chip'
import Grid from '@mui/material/Grid'
import { useAuth } from '../contexts/AuthContext'
import Layout from '../components/Layout'

const SERVICES = [
  {
    icon: '📋',
    title: '스마트 출결',
    description: 'QR 코드 기반 실시간 출결 관리 시스템입니다.',
    path: '/attendance',
    color: '#4f46e5',
    bgColor: '#eef2ff',
    status: '시범운영중',
    statusColor: 'warning',
  },
  {
    icon: '👨‍🏫',
    title: '보강(Cover) 신청',
    description: '보강 현황 확인 및 신청 시스템입니다.',
    path: '/cover',
    color: '#06b6d4',
    bgColor: '#ecfeff',
    status: '운영중',
    statusColor: 'secondary',
  },
  {
    icon: '📝',
    title: '고사 업무 지원 시스템',
    description: '시험 감독 배정 등 고사 관련 업무를 지원하는 시스템입니다.',
    path: null,
    color: '#cbd5e1',
    bgColor: '#f8fafc',
    status: '개발예정',
    statusColor: 'default',
    disabled: true,
  },
  {
    icon: '✈️',
    title: '교무 교과서 배정 업무',
    description: '교과서 선정 및 배부 업무 시스템입니다.',
    path: null,
    color: '#cbd5e1',
    bgColor: '#f8fafc',
    status: '개발예정',
    statusColor: 'default',
    disabled: true,
  },
]

// ── 개발 로그 ──────────────────────────────────────────────
// 버전 규칙: 새 업무시스템 추가 → 메이저(v1→v2), 기능개선/버그픽스 → 마이너(v2.0→v2.1)
const CHANGELOG = [
  {
    version: 'v2.3.1',
    date: '2026.04.15',
    type: 'bugfix',
    items: [
      '[버그수정] 반복 이벤트 라이브 세션 — 전날 마감 상태가 다음 날에도 유지되는 문제 수정',
    ],
  },
  {
    version: 'v2.3',
    date: '2026.04.13',
    type: 'improvement',
    items: [
      '수업 중 외출 관리 (보건실/화장실/기타 · 1/3 초과 경고)',
      'QR 자동 마감 시스템 — 1/3 지점 지각 자동처리 · 수업 종료 세션 초기화 (Cloud Functions)',
      'QR 패널 단계별 UI — 카운트다운 · 재오픈 · 1/3 이후 안내',
      '학생 결석 이력 조회 모달 (기간 필터 · 교시 정보 · 메일 발송)',
    ],
  },
  {
    version: 'v2.2',
    date: '2026.04.11',
    type: 'improvement',
    items: ['출결 대시보드 달력 UI 개선 (반응형 2개월/1개월 뷰)', '이벤트 요일 기반 날짜 필터링 구현', '프로젝트 문서화 구조 개선 (CLAUDE.md 분리)'],
  },
  {
    version: 'v2.1',
    date: '2026.04.08',
    type: 'improvement',
    items: ['사이드바 네비게이션 도입 (전 페이지 공통)', '페이지 제목 breadcrumb 표시', 'UI 색상 개편 (인디고 테마)'],
  },
  {
    version: 'v2.0',
    date: '2026.04.08',
    type: 'major',
    items: ['포털 React 전환 — 단일 도메인 통합', '보강신청 + 스마트출결 시스템 통합'],
  },
  {
    version: 'v1.2',
    date: '2026.04.07',
    type: 'improvement',
    items: ['조회 이벤트 지각 체크 기능 (lateCheckTime)', '미출석자 자동 결석 처리 (Firebase Functions)'],
  },
  {
    version: 'v1.1',
    date: '2026.04.01',
    type: 'improvement',
    items: ['반복 이벤트(매주 수업) 지원', '이벤트 보관/복원 기능', '출결 통계 대시보드'],
  },
  {
    version: 'v1.0',
    date: '2026.03',
    type: 'major',
    items: ['스마트 출결 시스템 최초 출시', 'QR 코드 기반 학생 출석 체크', '교사 이벤트 생성 및 관리'],
  },
]

const TYPE_STYLE = {
  major:       { label: '신규', bg: '#eef2ff', color: '#4f46e5', border: '#c7d2fe' },
  improvement: { label: '개선', bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' },
  fix:         { label: '수정', bg: '#fff7ed', color: '#ea580c', border: '#fed7aa' },
  bugfix:      { label: '버그수정', bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
}

export default function Home() {
  const { user } = useAuth()
  const navigate = useNavigate()

  return (
    <Layout>
      <Typography variant="h5" fontWeight={700} mb={0.5}>
        환영합니다, {user?.displayName?.split(' ')[0] || user?.displayName}님 👋
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={4}>
        원하시는 업무 시스템을 선택해 주세요.
      </Typography>

      {/* 서비스 카드 */}
      <Grid container spacing={3}>
        {SERVICES.map((svc) => (
          <Grid item xs={12} sm={6} md={4} key={svc.title}>
            <Card
              sx={{
                height: '100%',
                opacity: svc.disabled ? 0.5 : 1,
                filter: svc.disabled ? 'grayscale(0.6)' : 'none',
                borderTop: `3px solid ${svc.color}`,
                cursor: svc.disabled ? 'default' : 'pointer',
              }}
            >
              {svc.disabled ? (
                <CardContent sx={{ height: '100%' }}>
                  <ServiceContent svc={svc} />
                </CardContent>
              ) : (
                <CardActionArea onClick={() => navigate(svc.path)} sx={{ height: '100%', alignItems: 'flex-start' }}>
                  <CardContent>
                    <ServiceContent svc={svc} />
                  </CardContent>
                </CardActionArea>
              )}
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* 개발 로그 */}
      <Box sx={{ mt: 6 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5 }}>
          <Typography variant="subtitle1" fontWeight={700} color="text.primary">
            개발 현황
          </Typography>
          <Chip
            label={CHANGELOG[0].version}
            size="small"
            sx={{ bgcolor: '#eef2ff', color: '#4f46e5', fontWeight: 700, fontSize: '0.75rem' }}
          />
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {CHANGELOG.map((log, idx) => {
            const ts = TYPE_STYLE[log.type]
            return (
              <Box
                key={log.version}
                sx={{
                  display: 'flex',
                  gap: 2,
                  p: 2,
                  borderRadius: '12px',
                  bgcolor: idx === 0 ? '#fafafa' : 'transparent',
                  border: '1px solid',
                  borderColor: idx === 0 ? '#e2e8f0' : 'transparent',
                }}
              >
                {/* 버전 + 날짜 */}
                <Box sx={{ minWidth: 72, pt: 0.25 }}>
                  <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: '#1e293b' }}>
                    {log.version}
                  </Typography>
                  <Typography sx={{ fontSize: '0.72rem', color: '#94a3b8', mt: 0.25 }}>
                    {log.date}
                  </Typography>
                </Box>

                {/* 타입 뱃지 */}
                <Box sx={{ pt: 0.2 }}>
                  <Box sx={{
                    px: 0.9, py: 0.2,
                    borderRadius: '6px',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    bgcolor: ts.bg,
                    color: ts.color,
                    border: `1px solid ${ts.border}`,
                    whiteSpace: 'nowrap',
                  }}>
                    {ts.label}
                  </Box>
                </Box>

                {/* 변경 내용 */}
                <Box sx={{ flex: 1 }}>
                  {log.items.map((item, i) => (
                    <Typography key={i} sx={{ fontSize: '0.82rem', color: '#475569', lineHeight: 1.8 }}>
                      · {item}
                    </Typography>
                  ))}
                </Box>
              </Box>
            )
          })}
        </Box>
      </Box>

      <Box sx={{ mt: 4, textAlign: 'center', color: 'text.disabled', fontSize: '0.78rem' }}>
        © 2026 선유고등학교 스마트 교무실
      </Box>
    </Layout>
  )
}

function ServiceContent({ svc }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
        <Box sx={{ bgcolor: svc.bgColor, p: 1.5, borderRadius: 3, fontSize: '1.5rem', lineHeight: 1 }}>
          {svc.icon}
        </Box>
        <Chip
          label={svc.status}
          size="small"
          color={svc.statusColor}
          variant={svc.statusColor === 'default' ? 'outlined' : 'filled'}
        />
      </Box>
      <Typography variant="h6" fontWeight={700} mb={0.75}>{svc.title}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>{svc.description}</Typography>
    </Box>
  )
}
