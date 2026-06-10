import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import { useAuth } from '../contexts/AuthContext'

function detectInAppBrowser() {
  const ua = navigator.userAgent
  if (/KAKAOTALK/i.test(ua)) return 'kakaotalk'
  if (/NAVER/i.test(ua)) return 'naver'
  if (/Line\//i.test(ua)) return 'line'
  if (/Instagram/i.test(ua)) return 'instagram'
  if (/FB_IAB|FBAN|FBDV/i.test(ua)) return 'facebook'
  // Android WebView
  if (/wv\)/.test(ua) && /Android/.test(ua)) return 'webview'
  // iOS WebView (Safari 없고 CriOS/FxiOS도 아닌 경우)
  if (/iPhone|iPad|iPod/.test(ua) && !/Safari/.test(ua) && !/CriOS/.test(ua) && !/FxiOS/.test(ua)) return 'webview'
  return null
}

const APP_NAMES = {
  kakaotalk: '카카오톡',
  naver: '네이버',
  line: '라인',
  instagram: '인스타그램',
  facebook: '페이스북',
  webview: '앱',
}

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
  {
    icon: '📝',
    color: '#dc2626',
    bg: '#fef2f2',
    title: '고사 업무 지원',
    badge: 'exam-support-kr.web.app',
    points: [
      '고사 시간표 자동 편성 & 편집',
      '감독관 배정 및 교환 신청',
      '엑셀 업로드로 학생 좌석 일괄 배치',
      '감독관·좌석 배치표 PDF 출력',
    ],
  },
]

export default function Login() {
  const { user, role, isSuperAdmin, needsSchoolSetup, loading, login } = useAuth()
  const navigate = useNavigate()
  const [inAppBrowser, setInAppBrowser] = useState(null)

  useEffect(() => {
    setInAppBrowser(detectInAppBrowser())
  }, [])

  useEffect(() => {
    if (loading) return
    if (!user) return
    if (isSuperAdmin) {
      navigate('/super-admin', { replace: true })
    } else if (needsSchoolSetup) {
      navigate('/school-setup', { replace: true })
    } else if (role && role !== 'pending') {
      navigate('/', { replace: true })
    }
  }, [user, role, isSuperAdmin, needsSchoolSetup, loading])

  const handleLogin = async () => {
    try {
      await login()
    } catch (e) {
      console.error('로그인 실패:', e)
    }
  }

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

      {/* ── 인앱 브라우저 경고 배너 ── */}
      {inAppBrowser && (
        <Box sx={{
          bgcolor: '#fff3cd',
          borderBottom: '1px solid #ffc107',
          px: { xs: 3, md: 6 },
          py: 1.5,
          display: 'flex',
          alignItems: 'flex-start',
          gap: 1.5,
        }}>
          <Typography sx={{ fontSize: '1.2rem', flexShrink: 0, mt: '1px' }}>⚠️</Typography>
          <Box>
            <Typography sx={{ fontSize: '0.88rem', fontWeight: 700, color: '#856404', lineHeight: 1.4 }}>
              {APP_NAMES[inAppBrowser] || '앱'} 내 브라우저에서는 Google 로그인이 차단됩니다
            </Typography>
            <Typography sx={{ fontSize: '0.82rem', color: '#664d03', mt: 0.5, lineHeight: 1.6 }}>
              {/Android/.test(navigator.userAgent)
                ? '오른쪽 상단 메뉴(⋮) → 다른 브라우저로 열기 → Chrome 선택 후 로그인해 주세요.'
                : '화면 하단 또는 오른쪽 메뉴 → Safari로 열기 선택 후 로그인해 주세요.'}
            </Typography>
          </Box>
        </Box>
      )}

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
              borderRadius: 3,
              boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
              '&:hover': { bgcolor: '#faf5ff', boxShadow: '0 8px 28px rgba(0,0,0,0.26)' },
            }}
          >
            학교 Google 계정으로 로그인
          </Button>
          <Typography sx={{ mt: 1.5, fontSize: '0.77rem', color: 'rgba(255,255,255,0.45)' }}>
            학교 Workspace 계정 또는 개인 Google 계정으로 로그인할 수 있습니다
          </Typography>
        </Box>
      </Box>

      {/* ── 기능 카드 ── */}
      <Box sx={{ px: { xs: 3, md: 8 }, py: { xs: 5, md: 7 }, maxWidth: 1080, mx: 'auto', width: '100%' }}>
        <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#a78bfa', letterSpacing: '0.1em', mb: 3, textTransform: 'uppercase' }}>
          주요 기능
        </Typography>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 2.5 }}>
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
                <Box sx={{ bgcolor: f.bg, borderRadius: 2.5, p: 1.25, fontSize: '1.4rem', lineHeight: 1, flexShrink: 0 }}>
                  {f.icon}
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Typography fontWeight={700} fontSize="0.95rem" color="#2e1065">{f.title}</Typography>
                  {f.badge && (
                    <Typography
                      component="a"
                      href={`https://${f.badge}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      sx={{ fontSize: '0.68rem', color: '#dc2626', textDecoration: 'none', fontFamily: 'monospace', '&:hover': { textDecoration: 'underline' } }}
                    >
                      {f.badge} ↗
                    </Typography>
                  )}
                </Box>
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

      {/* ── 카카오 오픈채팅 배너 ── */}
      <Box sx={{ px: { xs: 3, md: 8 }, pb: 4, maxWidth: 1080, mx: 'auto', width: '100%' }}>
        <Box
          component="a"
          href="https://open.kakao.com/o/gviUMYvi"
          target="_blank"
          rel="noopener noreferrer"
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            px: 2.5, py: 1.5,
            bgcolor: '#FEE500',
            borderRadius: 3,
            textDecoration: 'none',
            transition: 'opacity 0.15s, transform 0.15s',
            '&:hover': { opacity: 0.88, transform: 'translateY(-1px)' },
          }}
        >
          <Box sx={{ width: 32, height: 32, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#3A1D1D', borderRadius: '50%' }}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="#FEE500">
              <path d="M12 3C6.477 3 2 6.477 2 10.818c0 2.728 1.618 5.13 4.073 6.573l-.986 3.664 4.27-2.804A11.7 11.7 0 0012 18.636c5.523 0 10-3.477 10-7.818C22 6.477 17.523 3 12 3z"/>
            </svg>
          </Box>
          <Box>
            <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: '#3A1D1D', lineHeight: 1.3 }}>
              사용 문의 · 도입 상담 오픈채팅
            </Typography>
            <Typography sx={{ fontSize: '0.75rem', color: '#5c3d00' }}>
              참여코드 <strong>0124</strong> · 학교 도입, 기능 요청, 오류 신고 모두 환영합니다
            </Typography>
          </Box>
          <Typography sx={{ ml: 'auto', fontSize: '1rem', color: '#3A1D1D', opacity: 0.5, flexShrink: 0 }}>→</Typography>
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
        <Typography fontSize="0.75rem" sx={{ color: '#c4b5fd' }}>·</Typography>
        <Typography
          component={Link}
          to="/privacy-policy"
          fontSize="0.75rem"
          sx={{ color: '#c4b5fd', textDecoration: 'none', '&:hover': { color: '#a78bfa' } }}
        >
          개인정보처리방침
        </Typography>
      </Box>
    </Box>
  )
}
