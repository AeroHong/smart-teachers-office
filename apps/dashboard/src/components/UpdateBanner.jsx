/**
 * 새 배포 알림 띠 — "새로고침하면 최신 화면이 됩니다".
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
import useAppUpdate from '../lib/useAppUpdate'

export default function UpdateBanner() {
  const { outdated, reload, dismiss } = useAppUpdate()
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
