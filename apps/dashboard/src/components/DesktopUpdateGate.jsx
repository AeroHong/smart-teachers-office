/**
 * 강제 업데이트 관문 — 최소 버전 미달인 데스크톱 앱의 화면 전체를 가린다.
 *
 * useAppUpdate.js/UpdateBanner.jsx의 배너는 닫을 수 있어 "누른 사람만" 고쳐진다.
 * 정말 방치하면 안 되는 결함(예: 2026-09-17 알림 무한 쓰기 루프 같은 것)이 나왔을 때,
 * 관리자가 schools/{schoolId}.minDesktopVersion을 정하면 이 화면이 대신 막는다 —
 * 닫기 버튼이 없다. App.jsx 맨 위에서 한 번만 마운트해 어느 페이지에 있든 가린다
 * (WorkspaceLayout은 페이지마다 다시 그려지므로 그 안에 두면 페이지를 옮길 때마다
 * 깜빡이거나 새로 판단해야 한다).
 *
 * 웹(일반 브라우저)에서는 useDesktopUpdateGate가 항상 blocked:false를 주므로
 * 완전히 no-op이다 — 새로고침 한 번으로 항상 최신인 브라우저 탭까지 막을 이유가 없다.
 */
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Paper from '@mui/material/Paper'
import SystemUpdateAltIcon from '@mui/icons-material/SystemUpdateAlt'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import useDesktopUpdateGate from '../lib/useDesktopUpdateGate'

// copy-release.js가 릴리즈마다 이 고정 파일명으로 최신 설치 파일을 함께 올린다 —
// 버전이 바뀌어도 링크를 고칠 필요가 없다.
const MANUAL_INSTALLER_URL = 'https://smart-school-updates.web.app/smart-office-setup-latest.exe'

export default function DesktopUpdateGate() {
  const { blocked, version, minVersion, updateInfo, recheck, install } = useDesktopUpdateGate()
  const [installError, setInstallError] = useState('')
  const [installing, setInstalling] = useState(false)

  if (!blocked) return null

  const handleInstall = async () => {
    setInstalling(true)
    setInstallError('')
    try {
      const result = await install()
      // 성공하면 앱이 곧바로 종료·재시작되어 이 상태가 보일 일이 거의 없다 —
      // 실패했을 때만 사용자가 이 메시지를 보게 된다.
      if (!result?.ok) setInstallError(result?.error || '설치를 시작하지 못했습니다.')
    } catch (err) {
      setInstallError(err?.message || '설치를 시작하지 못했습니다.')
    } finally {
      setInstalling(false)
    }
  }

  return (
    <Box
      role="alertdialog"
      aria-label="업데이트가 필요합니다"
      sx={{
        position: 'fixed', inset: 0, zIndex: 20000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        bgcolor: 'rgba(15, 23, 42, 0.92)', p: 3,
      }}
    >
      <Paper elevation={8} sx={{ maxWidth: 440, width: '100%', p: 4, textAlign: 'center' }}>
        <SystemUpdateAltIcon sx={{ fontSize: 40, color: 'primary.main', mb: 1 }} />
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
          업데이트가 필요합니다
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
          지금 버전({version || '알 수 없음'})은 더 이상 쓸 수 없습니다.
          {minVersion && ` ${minVersion} 이상으로 올린 뒤 계속 쓸 수 있습니다.`}
        </Typography>

        {updateInfo ? (
          <>
            <Typography variant="body2" sx={{ mb: 2 }}>
              새 버전(v{updateInfo.version})을 설치할 준비가 됐습니다.
            </Typography>
            <Button
              variant="contained"
              size="large"
              fullWidth
              disabled={installing}
              onClick={handleInstall}
              startIcon={installing ? <CircularProgress size={18} color="inherit" /> : null}
            >
              {installing ? '재시작하는 중…' : '지금 재시작하고 설치'}
            </Button>
            {installError && (
              <Typography variant="caption" color="error.main" display="block" sx={{ mt: 1.5 }}>
                {installError}
              </Typography>
            )}
          </>
        ) : (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mb: 2 }}>
              <CircularProgress size={18} />
              <Typography variant="body2" color="text.secondary">새 버전을 확인하고 있습니다…</Typography>
            </Box>
            <Button variant="outlined" size="small" onClick={recheck}>다시 확인</Button>
          </>
        )}

        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 3 }}>
          자동으로 안 되면{' '}
          <Box component="a" href={MANUAL_INSTALLER_URL} target="_blank" rel="noopener noreferrer">
            설치 파일을 직접 받아
          </Box>{' '}
          다시 설치해 주세요.
        </Typography>
      </Paper>
    </Box>
  )
}
