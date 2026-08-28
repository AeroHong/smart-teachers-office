/**
 * 첫 사용자 온보딩 — 로그인 후 처음 한 번(브라우저·기기별) 핵심 화면을 짧게 훑어준다
 * (2026-08-29, 사용자 요청 — 소수 인원 베타 테스트 전에 "처음 사용자용 매뉴얼/소개
 * 페이지"가 필요하다고 판단).
 *
 * Firestore가 아니라 localStorage에만 "봤다"를 남긴다 — 기기를 바꾸면 다시 볼 수도
 * 있지만, 이 규모의 베타에서는 문제될 일이 없고 규칙·데이터 모델을 안 건드려도 된다.
 * 설정(Settings.jsx) "정보" 탭의 "소개 다시 보기"가 openOnboarding()으로 언제든
 * 다시 연다.
 *
 * 설정은 별도 작은 창(main.js가 "/settings"만 새 Electron 창으로 띄움)에서도 이
 * App.jsx 트리가 통째로 다시 마운트된다 — 그 창에서 첫 로그인 자동 팝업이 뜨면
 * 어색하므로(작은 유틸리티 창인데 갑자기 큰 환영 모달), 자동 팝업은 "/settings"
 * 경로에서는 건너뛴다. 다만 그 창 안에서 "소개 다시 보기"를 누르면 그 창 자체에서
 * 열리는 것은 자연스러워서 그대로 둔다.
 */
import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import Typography from '@mui/material/Typography'
import { useAuth } from '@shared/contexts/AuthContext'

const STORAGE_KEY = 'onboardingSeenUids'
const OPEN_EVENT = 'smart-office-open-onboarding'

/** Settings.jsx의 "소개 다시 보기"가 부른다. */
export function openOnboarding() {
  window.dispatchEvent(new Event(OPEN_EVENT))
}

const SLIDES = [
  {
    emoji: '👋',
    title: '스마트교무실에 오신 것을 환영합니다',
    body: '선유고 업무를 한 곳에서 처리하는 도구예요. 지금은 베타 테스트 기간이니, 이상하거나 불편한 점은 무엇이든 알려주세요.',
  },
  {
    emoji: '🏠',
    title: '홈 — 채널',
    body: '왼쪽 레일의 "홈"에서 채널별 대화와 업무 글을 봅니다. 채널마다 "메시지" 탭(대화)과 업무 글 탭(캔버스)이 나뉘어 있어요.',
  },
  {
    emoji: '📄',
    title: '업무 글 — 요청 · 안내',
    body: '"요청"은 완료 체크가 필요한 글, "안내"는 읽기만 하면 되는 글입니다. 대상은 채널 참여자로 자동 지정되고, 필요하면 "대상 좁히기"로 줄일 수 있어요.',
  },
  {
    emoji: '✉️',
    title: '쪽지 · 보강신청',
    body: '"쪽지"는 1:1 개인 메시지예요(쿨메신저를 대체하는 게 아니라 보조 수단). "보강신청"에서는 등록된 보강 시간표에 신청하고 내 현황을 볼 수 있습니다.',
  },
  {
    emoji: '⚙️',
    title: '더 알아보기',
    body: '왼쪽 아래 톱니바퀴(설정) → "정보" 탭에서 이 소개를 언제든 다시 볼 수 있어요. 궁금한 점이나 오류는 편하게 알려주세요.',
  },
]

function getSeenUids() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch {
    return []
  }
}

export default function OnboardingTour() {
  const { user, loading } = useAuth()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)

  // 첫 로그인 자동 팝업 — 설정 창(별도 작은 창)에서는 건너뛴다(위 파일 설명 참고).
  useEffect(() => {
    if (loading || !user || pathname.startsWith('/settings')) return
    if (!getSeenUids().includes(user.uid)) setOpen(true)
  }, [loading, user, pathname])

  // "소개 다시 보기" — 어디서든 수동으로 다시 연다.
  useEffect(() => {
    const handler = () => { setStep(0); setOpen(true) }
    window.addEventListener(OPEN_EVENT, handler)
    return () => window.removeEventListener(OPEN_EVENT, handler)
  }, [])

  const close = () => {
    setOpen(false)
    setStep(0)
    if (!user) return
    try {
      const seen = getSeenUids()
      if (!seen.includes(user.uid)) localStorage.setItem(STORAGE_KEY, JSON.stringify([...seen, user.uid]))
    } catch {
      // localStorage 실패는 무시 — 최악의 경우 다음에 또 뜰 뿐이다
    }
  }

  if (!open) return null
  const slide = SLIDES[step]
  const isLast = step === SLIDES.length - 1

  return (
    <Dialog open onClose={close} maxWidth="xs" fullWidth>
      <DialogContent sx={{ textAlign: 'center', pt: 4, pb: 2 }}>
        <Typography sx={{ fontSize: '2.5rem', mb: 1 }}>{slide.emoji}</Typography>
        <Typography fontWeight={800} fontSize="1.05rem" sx={{ mb: 1.5 }}>{slide.title}</Typography>
        <Typography color="text.secondary" fontSize="0.9rem" sx={{ lineHeight: 1.6 }}>{slide.body}</Typography>
        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 0.6, mt: 3 }}>
          {SLIDES.map((_, i) => (
            <Box
              key={i}
              sx={{
                width: 6, height: 6, borderRadius: '50%',
                bgcolor: i === step ? 'primary.main' : 'action.disabledBackground',
              }}
            />
          ))}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3, justifyContent: 'space-between' }}>
        <Button color="inherit" onClick={close} sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>
          건너뛰기
        </Button>
        <Box sx={{ display: 'flex', gap: 1 }}>
          {step > 0 && <Button onClick={() => setStep(s => s - 1)}>이전</Button>}
          <Button variant="contained" onClick={() => (isLast ? close() : setStep(s => s + 1))}>
            {isLast ? '시작하기' : '다음'}
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  )
}
