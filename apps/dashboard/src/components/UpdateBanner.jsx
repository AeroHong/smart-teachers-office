/**
 * 새 배포 알림 띠 — "새로고침하면 최신 화면이 됩니다".
 *
 * 데스크톱 앱의 **설치 파일** 업데이트도 여기서 알린다(2026-09-21). 그쪽은 새로고침이
 * 아니라 앱을 다시 시작해야 반영된다. 예전에는 윈도우 토스트로만 알렸는데, 자리를 비운
 * 사이 뜨면 알림 센터로 들어가 그대로 묻혔다(사용자 지적). 설치 대기가 있으면 그쪽을
 * 먼저 보여준다 — 껍데기가 낡은 것이 번들이 낡은 것보다 무겁고, 재시작 한 번이면 둘 다
 * 최신이 된다.
 *
 * 상단바 위에 자리를 차지하고 앉는다. 떠 있는 알림으로 만들면 내용을 가리고, 가리는
 * 알림은 읽기 전에 닫게 된다. 한 줄을 밀어내는 편이 성가심이 덜하다.
 *
 * 자동으로 새로고침하지 않는다. 글을 쓰던 중이면 쓰던 내용이 사라지고, 그런 일을 한 번
 * 겪으면 이 앱에서 긴 글을 안 쓰게 된다. 누르는 것은 사람이 정한다.
 */
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import CloseIcon from '@mui/icons-material/Close'
import RefreshIcon from '@mui/icons-material/Refresh'
import SystemUpdateAltIcon from '@mui/icons-material/SystemUpdateAlt'
import { useState } from 'react'
import useAppUpdate from '../lib/useAppUpdate'

export default function UpdateBanner() {
  const { outdated, reload, dismiss, desktopUpdate, installDesktopUpdate } = useAppUpdate()
  // 설치 대기 띠는 이 세션 동안만 닫아 둔다 — 다음에 앱을 열면 다시 보여야 한다.
  const [installHidden, setInstallHidden] = useState(false)
  const [installError, setInstallError] = useState('')
  const showInstall = !!desktopUpdate && !installHidden

  const handleInstall = async () => {
    setInstallError('')
    const result = await installDesktopUpdate().catch(() => ({ ok: false }))
    // 성공하면 앱이 곧바로 꺼졌다 켜지므로 이 줄은 거의 보이지 않는다.
    if (!result?.ok) setInstallError('설치를 시작하지 못했습니다. 트레이에서 앱을 완전히 종료했다 켜면 적용됩니다.')
  }

  if (showInstall) {
    return (
      <Box
        role="status"
        sx={{
          display: 'flex', alignItems: 'center', gap: 1,
          px: 1.5, py: 0.6, flexShrink: 0,
          bgcolor: 'success.main', color: 'primary.contrastText',
          pr: '138px',
        }}
      >
        <SystemUpdateAltIcon sx={{ fontSize: 18 }} />
        <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, flexGrow: 1, minWidth: 0 }} noWrap>
          {installError || `새 버전 v${desktopUpdate.version} 설치 준비가 끝났습니다. 다시 시작하면 적용됩니다.`}
        </Typography>
        <Button
          size="small"
          onClick={handleInstall}
          sx={{
            color: 'success.main', bgcolor: 'primary.contrastText',
            fontSize: '0.78rem', fontWeight: 700, py: 0.1, px: 1.2, flexShrink: 0,
            '&:hover': { bgcolor: 'primary.contrastText', opacity: 0.9 },
          }}
        >
          지금 재시작
        </Button>
        <IconButton
          size="small"
          aria-label="나중에 하기"
          onClick={() => setInstallHidden(true)}
          sx={{ color: 'primary.contrastText', p: 0.3, flexShrink: 0 }}
        >
          <CloseIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Box>
    )
  }

  if (!outdated) return null

  return (
    <Box
      role="status"
      sx={{
        display: 'flex', alignItems: 'center', gap: 1,
        px: 1.5, py: 0.6, flexShrink: 0,
        bgcolor: 'primary.main', color: 'primary.contrastText',
        // 데스크톱 앱은 창 맨 위, 이 띠가 걸리는 자리에 OS 최소화·최대화·닫기 버튼이
        // titleBarOverlay로 겹쳐 뜬다(apps/desktop/main.js) — 오른쪽 끝 버튼들이 거기
        // 가려 눌리지 않았다(사용자 확인, 2026-08-26). TopBar.jsx와 같은 폭만큼 비운다.
        pr: '138px',
      }}
    >
      <RefreshIcon sx={{ fontSize: 18 }} />
      <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, flexGrow: 1, minWidth: 0 }} noWrap>
        새 버전이 배포되었습니다. 새로고침하면 최신 화면으로 바뀝니다.
      </Typography>
      <Button
        size="small"
        onClick={reload}
        sx={{
          color: 'primary.main', bgcolor: 'primary.contrastText',
          fontSize: '0.78rem', fontWeight: 700, py: 0.1, px: 1.2, flexShrink: 0,
          '&:hover': { bgcolor: 'primary.contrastText', opacity: 0.9 },
        }}
      >
        새로고침
      </Button>
      <IconButton
        size="small"
        aria-label="나중에 하기"
        onClick={dismiss}
        sx={{ color: 'primary.contrastText', p: 0.3, flexShrink: 0 }}
      >
        <CloseIcon sx={{ fontSize: 16 }} />
      </IconButton>
    </Box>
  )
}
