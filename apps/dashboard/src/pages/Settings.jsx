/**
 * 설정 — 1단 톱니바퀴로 여는 별도 창(2026-08-28). main.js의 setWindowOpenHandler가
 * "/settings" URL만 외부 브라우저 대신 진짜 새 Electron 창으로 띄운다 — 그래야
 * window.smartOfficeDesktop(자동실행·업데이트 확인)이 그 창에서도 살아있다.
 *
 * WorkspaceLayout(레일+2단+3단)을 안 쓴다 — 독립된 작은 창이라 자기만의 간단한
 * 레이아웃(왼쪽 세로 탭 + 오른쪽 내용, Windows 설정 앱과 같은 모양)을 쓴다.
 *
 * 데스크톱 전용 기능(자동실행, 업데이트 확인)은 일반 웹 브라우저로 이 라우트에
 * 들어왔을 때(window.smartOfficeDesktop 없음) 안내 문구로 대체한다 — 기존
 * useDesktopNotifications.js/useDesktopPresence.js와 같은 감지 관례.
 */
import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import FormControlLabel from '@mui/material/FormControlLabel'
import Switch from '@mui/material/Switch'
import Typography from '@mui/material/Typography'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import PaletteOutlinedIcon from '@mui/icons-material/PaletteOutlined'
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined'
import { useToast } from '../components/ToastProvider'
import { openOnboarding } from '../components/OnboardingTour'

const isDesktop = typeof window !== 'undefined' && !!window.smartOfficeDesktop

const TABS = [
  { key: 'general', label: '일반', icon: SettingsOutlinedIcon },
  { key: 'theme', label: '테마', icon: PaletteOutlinedIcon },
  { key: 'about', label: '정보', icon: InfoOutlinedIcon },
]

export default function Settings() {
  const [tab, setTab] = useState('general')

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: 'background.paper' }}>
      {/* 메인 창과 같은 titleBarOverlay(main.js) 자리 — 이 44px 띠는 OS가 최소화·닫기
          버튼을 겹쳐 그리는 영역이라 실제로는 클릭이 전혀 안 먹힌다(ProfileCardProvider.jsx
          드로어에서 겪은 것과 같은 문제, 2026-08-27) — 그래서 장식(같은 rail.bg 색 +
          드래그 가능 표시)만 하고 버튼은 하나도 안 둔다. 일반 웹 브라우저에서는
          WebkitAppRegion이 그냥 무시되는 빈 줄일 뿐이라 문제없다. */}
      <Box sx={{ flexShrink: 0, height: '44px', bgcolor: 'rail.bg', WebkitAppRegion: 'drag' }} />
      <Box sx={{ display: 'flex', flexGrow: 1, minHeight: 0 }}>
        <Box sx={{ width: 160, flexShrink: 0, borderRight: '1px solid', borderColor: 'divider', py: 2 }}>
          <Typography sx={{ px: 2, mb: 1, fontSize: '1rem', fontWeight: 800 }}>설정</Typography>
          {TABS.map(t => (
            <Box
              key={t.key} component="button" type="button"
              onClick={() => setTab(t.key)}
              sx={{
                display: 'flex', alignItems: 'center', gap: 1, width: '100%',
                border: 0, background: 'none', cursor: 'pointer', textAlign: 'left',
                px: 2, py: 1, fontSize: '0.88rem', fontFamily: 'inherit',
                bgcolor: tab === t.key ? 'action.selected' : 'transparent',
                color: tab === t.key ? 'primary.main' : 'text.primary',
                fontWeight: tab === t.key ? 700 : 500,
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              <t.icon sx={{ fontSize: 18 }} />
              {t.label}
            </Box>
          ))}
        </Box>
        <Box sx={{ flexGrow: 1, p: 3, overflowY: 'auto' }}>
          {tab === 'general' && <GeneralTab />}
          {tab === 'theme' && <ThemeTab />}
          {tab === 'about' && <AboutTab />}
        </Box>
      </Box>
    </Box>
  )
}

function SectionTitle({ children }) {
  return <Typography sx={{ fontSize: '1rem', fontWeight: 800, mb: 2 }}>{children}</Typography>
}

function DesktopOnlyNote() {
  return (
    <Typography color="text.secondary" fontSize="0.85rem">
      데스크톱 앱에서만 사용할 수 있습니다.
    </Typography>
  )
}

function GeneralTab() {
  const toast = useToast()
  const [autoLaunch, setAutoLaunch] = useState(null) // null = 로딩 중

  useEffect(() => {
    if (!isDesktop) return
    window.smartOfficeDesktop.getAutoLaunch()
      .then(setAutoLaunch)
      .catch(() => setAutoLaunch(false))
  }, [])

  const handleToggle = async (e) => {
    const next = e.target.checked
    setAutoLaunch(next) // 낙관적 갱신 — 토글은 즉시 반응해야 스위치를 눌렀다는 게 느껴진다
    try {
      await window.smartOfficeDesktop.setAutoLaunch(next)
    } catch (err) {
      setAutoLaunch(!next)
      toast.error('설정을 바꾸지 못했습니다.', err)
    }
  }

  return (
    <Box>
      <SectionTitle>일반</SectionTitle>
      {!isDesktop ? (
        <DesktopOnlyNote />
      ) : autoLaunch === null ? (
        <CircularProgress size={20} />
      ) : (
        <FormControlLabel
          control={<Switch checked={autoLaunch} onChange={handleToggle} />}
          label="윈도우 시작 시 자동 실행"
        />
      )}
    </Box>
  )
}

function ThemeTab() {
  return (
    <Box>
      <SectionTitle>테마</SectionTitle>
      <Typography color="text.secondary" fontSize="0.85rem">준비 중입니다.</Typography>
    </Box>
  )
}

function AboutTab() {
  const toast = useToast()
  const [checking, setChecking] = useState(false)
  const version = isDesktop ? window.smartOfficeDesktop.version : null

  const handleCheck = async () => {
    setChecking(true)
    try {
      const result = await window.smartOfficeDesktop.checkForUpdates()
      if (!result.ok) {
        toast.error('업데이트를 확인하지 못했습니다.', new Error(result.error))
      } else if (result.latestVersion && result.latestVersion !== result.currentVersion) {
        toast.success(`새 버전(v${result.latestVersion})을 내려받는 중입니다.`)
      } else {
        toast.success('최신 버전입니다.')
      }
    } catch (err) {
      toast.error('업데이트를 확인하지 못했습니다.', err)
    } finally {
      setChecking(false)
    }
  }

  return (
    <Box>
      <SectionTitle>정보</SectionTitle>
      <Typography fontSize="0.9rem" sx={{ mb: 2 }}>
        현재 버전: {version || '웹 버전'}
      </Typography>
      {isDesktop ? (
        <Button variant="outlined" size="small" onClick={handleCheck} disabled={checking}>
          {checking ? <CircularProgress size={16} /> : '지금 업데이트 확인'}
        </Button>
      ) : (
        <DesktopOnlyNote />
      )}
      <Button size="small" onClick={openOnboarding} sx={{ display: 'block', mt: 2 }}>
        소개 다시 보기
      </Button>
    </Box>
  )
}
