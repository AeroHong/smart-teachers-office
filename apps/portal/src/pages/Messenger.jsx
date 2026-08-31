import { useEffect, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import LaunchIcon from '@mui/icons-material/Launch'
import DownloadIcon from '@mui/icons-material/Download'
import Layout from '../components/Layout'

const DASHBOARD_URL = 'https://smart-school-dashboard.web.app'
const INSTALL_BAT_URL = 'https://smart-school-updates.web.app/install-smart-office.bat'

// 실제 화면 캡처가 준비되면 apps/portal/public/images/messenger/ 아래 이 파일명 그대로
// 넣으면 된다 — 코드 수정 없이 바로 반영된다(캡처 전에는 자리표시자가 대신 보인다).
const IMG_BASE = '/images/messenger'

const HERO_IMAGE = {
  src: `${IMG_BASE}/hero.png`,
  label: '대표 화면 캡처',
  hint: '채널 목록이 열려 있는 전체 화면 (권장 1600×1000px 이상, 와이드)',
}

const FEATURES = [
  {
    eyebrow: '채널',
    headline: '마감이 있는 일은,\n놓치지 않게.',
    body: '마감이 있는 업무는 채널 머리의 탭(캔버스)에 그대로 떠 있습니다. 채널을 열어보지 않아도 진행 중인지, 마감이 지났는지 목록에서 바로 보입니다.',
    image: { src: `${IMG_BASE}/channels.png`, label: '채널 화면', hint: '채널 목록 + 캔버스 탭이 보이는 화면 (1200×800px)' },
  },
  {
    eyebrow: '내 활동',
    headline: '여러 채널, 할 일은\n한 곳에.',
    body: "여러 채널에 흩어진 '아직 안 한 일'을 한 화면에 모아 보여줍니다. 완료로 체크하기 전까지는 알림이 사라져도 목록에 그대로 남습니다.",
    image: { src: `${IMG_BASE}/activity.png`, label: '내 활동 화면', hint: "'안 한 일' 목록 화면 (1200×800px)" },
  },
  {
    eyebrow: '쪽지',
    headline: '간단한 연락은,\n쪽지로.',
    body: '기존에 쓰던 메신저를 대체하지 않고 병행하는 보조 수단입니다. 안읽음은 배지로 바로 보이고, 여러 명에게 보낸 쪽지는 하나로 묶여 정리됩니다.',
    image: { src: `${IMG_BASE}/messages.png`, label: '쪽지 화면', hint: '쪽지 목록 + 상세 화면 (1200×800px)' },
  },
  {
    eyebrow: '구성원',
    headline: '누구에게 보낼지,\n고민하지 않게.',
    body: '사무실·교과·부서 조직도를 익숙한 구조 그대로 옮겼습니다. 그룹을 펼쳐 여러 명을 한 번에 골라 쪽지를 보낼 수 있습니다.',
    image: { src: `${IMG_BASE}/members.png`, label: '구성원 조직도 화면', hint: '조직도 트리 + 상세 패널 화면 (1200×800px)' },
  },
  {
    eyebrow: '보강 신청',
    headline: '보강 신청도,\n메신저 안에서.',
    body: '결강이 생기면 등록하고, 선착순으로 신청받습니다. 신청·취소, 오픈 예약까지 메신저를 벗어나지 않고 처리합니다.',
    image: { src: `${IMG_BASE}/coverage.png`, label: '보강 목록 화면', hint: '보강 카드 그리드 화면 (1200×800px)' },
  },
  {
    eyebrow: '학사일정',
    headline: '학사일정은,\n구글 캘린더와 함께.',
    body: '월 단위 캘린더로 학사일정을 조회합니다. 구글 캘린더와 자동으로 동기화되어 따로 옮겨 적을 필요가 없습니다.',
    image: { src: `${IMG_BASE}/calendar.png`, label: '학사일정 화면', hint: '월 그리드 캘린더 화면 (1200×800px)' },
  },
]

/** 스크롤로 들어오면 페이드업 — IntersectionObserver 한 번 트리거 후 해제. */
function useReveal() {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return }
    const io = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); io.unobserve(el) } },
      { threshold: 0.15 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return [ref, visible]
}

/** 캡처 이미지가 아직 없으면(404) 어떤 화면이 필요한지 안내하는 자리표시자를 보여준다. */
function FeatureImage({ src, label, hint, hero = false }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <Box sx={{
        aspectRatio: hero ? '16/9' : '4/3',
        borderRadius: hero ? 5 : 4,
        border: '2px dashed #cbd5e1',
        bgcolor: '#f8fafc',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 1, p: 3, textAlign: 'center',
      }}>
        <Box sx={{ fontSize: '2rem' }}>🖼️</Box>
        <Typography fontWeight={700} color="text.secondary" fontSize="0.9rem">{label} 필요</Typography>
        <Typography fontSize="0.76rem" color="text.disabled" sx={{ maxWidth: 260 }}>{hint}</Typography>
        <Typography fontSize="0.7rem" color="text.disabled" sx={{ fontFamily: 'monospace', mt: 0.5 }}>{src}</Typography>
      </Box>
    )
  }
  return (
    <Box
      component="img"
      src={src}
      alt={label}
      onError={() => setFailed(true)}
      sx={{
        width: '100%',
        display: 'block',
        borderRadius: hero ? 5 : 4,
        boxShadow: hero ? '0 30px 80px rgba(15,23,42,0.18)' : '0 16px 40px rgba(15,23,42,0.12)',
        border: '1px solid #e2e8f0',
      }}
    />
  )
}

function CtaButtons({ size = 'medium', onWeb, onInstall }) {
  return (
    <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'center', flexWrap: 'wrap' }}>
      <Button
        variant="contained"
        size={size}
        startIcon={<LaunchIcon />}
        onClick={onWeb}
        sx={{ bgcolor: '#4f46e5', '&:hover': { bgcolor: '#4338ca' } }}
      >
        웹에서 사용하기
      </Button>
      <Button
        variant="outlined"
        size={size}
        startIcon={<DownloadIcon />}
        onClick={onInstall}
        sx={{ borderColor: '#cbd5e1', color: '#334155', '&:hover': { borderColor: '#94a3b8', bgcolor: '#f8fafc' } }}
      >
        PC 앱 설치
      </Button>
    </Box>
  )
}

function FeatureSection({ feature, reverse }) {
  const [ref, visible] = useReveal()
  return (
    <Box
      ref={ref}
      sx={{
        display: 'flex',
        flexDirection: { xs: 'column', md: reverse ? 'row-reverse' : 'row' },
        alignItems: 'center',
        gap: { xs: 5, md: 9 },
        py: { xs: 8, md: 13 },
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(32px)',
        transition: 'opacity 0.8s cubic-bezier(0.22,1,0.36,1), transform 0.8s cubic-bezier(0.22,1,0.36,1)',
      }}
    >
      <Box sx={{ flex: '1 1 0', minWidth: 0, width: '100%' }}>
        <FeatureImage {...feature.image} />
      </Box>
      <Box sx={{ flex: '1 1 0', minWidth: 0, width: '100%' }}>
        <Typography sx={{ fontSize: '0.78rem', fontWeight: 800, color: '#4f46e5', letterSpacing: '0.08em', textTransform: 'uppercase', mb: 1.5 }}>
          {feature.eyebrow}
        </Typography>
        <Typography variant="h4" fontWeight={800} sx={{ whiteSpace: 'pre-line', lineHeight: 1.25, mb: 2.5, fontSize: { xs: '1.6rem', md: '2.1rem' } }}>
          {feature.headline}
        </Typography>
        <Typography color="text.secondary" sx={{ fontSize: '1.02rem', lineHeight: 1.85, maxWidth: 440 }}>
          {feature.body}
        </Typography>
      </Box>
    </Box>
  )
}

export default function Messenger() {
  const openWeb = () => window.open(DASHBOARD_URL, '_blank', 'noopener,noreferrer')
  const openInstall = () => window.open(INSTALL_BAT_URL, '_blank', 'noopener,noreferrer')

  return (
    <Layout wide>
      <Box sx={{ maxWidth: 1040, mx: 'auto' }}>
        {/* 히어로 */}
        <Box sx={{ textAlign: 'center', pt: { xs: 6, md: 10 }, pb: { xs: 6, md: 8 } }}>
          <Box sx={{ fontSize: '2.75rem', lineHeight: 1, mb: 2 }}>💬</Box>
          <Typography
            fontWeight={800}
            sx={{ fontSize: { xs: '2.1rem', md: '3rem' }, lineHeight: 1.15, mb: 2.5 }}
          >
            업무 메신저
          </Typography>
          <Typography color="text.secondary" sx={{ maxWidth: 560, mx: 'auto', mb: 4, fontSize: '1.05rem', lineHeight: 1.8 }}>
            채널로 업무를 주고받고, 마감을 놓치지 않고, 조직도 그대로 쪽지를 보내는
            학교 전용 업무 메신저입니다.
          </Typography>
          <CtaButtons size="large" onWeb={openWeb} onInstall={openInstall} />
          <Typography color="text.disabled" sx={{ mt: 1.5, fontSize: '0.76rem' }}>
            PC 앱은 웹과 같은 서비스를 별도 창으로 띄운 것입니다. install-smart-office.bat 실행 시
            보안 인증서 등록과 설치가 자동으로 진행됩니다(관리자 권한 확인 필요).
          </Typography>
        </Box>

        {/* 대표 화면 */}
        <Box sx={{ pb: { xs: 4, md: 6 } }}>
          <FeatureImage {...HERO_IMAGE} hero />
        </Box>

        {/* 기능 소개 — 교차 배치 */}
        <Box sx={{ borderTop: '1px solid #f1f5f9' }}>
          {FEATURES.map((feature, i) => (
            <Box key={feature.eyebrow} sx={{ borderBottom: i < FEATURES.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
              <FeatureSection feature={feature} reverse={i % 2 === 1} />
            </Box>
          ))}
        </Box>

        {/* 하단 CTA */}
        <Box sx={{ textAlign: 'center', py: { xs: 8, md: 10 } }}>
          <Typography variant="h5" fontWeight={800} mb={3}>지금 바로 시작해보세요</Typography>
          <CtaButtons size="large" onWeb={openWeb} onInstall={openInstall} />
        </Box>
      </Box>
    </Layout>
  )
}
