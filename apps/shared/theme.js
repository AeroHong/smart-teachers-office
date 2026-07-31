import { createTheme } from '@mui/material/styles'

export const theme = createTheme({
  palette: {
    primary: {
      main: '#4f46e5',
      light: '#818cf8',
      dark: '#3730a3',
      contrastText: '#ffffff',
    },
    secondary: { main: '#06b6d4' },
    background: {
      default: '#f8fafc',
      paper: '#ffffff',
    },
    // 카드·위젯·표의 실선 테두리. 이 값을 각자 hex로 복제하지 말고 'divider'로 참조한다.
    divider: '#e8eaed',
    /**
     * 대시보드 좌측 레일 — 화면에서 유일하게 어두운 영역.
     *
     * Slack의 자주색(#3F0E40)은 쓰지 않는다. 포털·키오스크가 인디고(#4f46e5) 계열이라
     * 자주색을 넣으면 앱마다 색이 따로 논다. 같은 색조의 짙은 슬레이트로 맞춘다.
     * 명단 패널은 어둡게 하지 않는다 — 60명 목록은 밝은 배경이 훨씬 읽기 쉽다.
     */
    rail: {
      bg: '#0f172a',
      border: '#1e293b',
      icon: '#94a3b8',
      iconActive: '#ffffff',
      activeBg: 'rgba(255,255,255,0.08)',
      hoverBg: 'rgba(255,255,255,0.04)',
    },
    success: { main: '#2e7d32' },
    warning: { main: '#f57c00' },
    error: { main: '#d32f2f' },
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: '"Noto Sans KR", Roboto, sans-serif',
    h5: { fontWeight: 700 },
    h6: { fontWeight: 700 },
    subtitle1: { fontWeight: 600 },
  },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 20, textTransform: 'none', fontWeight: 600 },
      },
    },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          borderRadius: 16,
          border: '1px solid #e8eaed',
          transition: 'box-shadow 0.2s ease, transform 0.2s ease',
          '&:hover': {
            boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
            transform: 'translateY(-2px)',
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: { root: { borderRadius: 8, fontWeight: 600 } },
    },
    MuiAppBar: {
      defaultProps: { elevation: 0 },
    },
    MuiTextField: {
      defaultProps: { variant: 'outlined', size: 'small' },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: { root: { borderRadius: 12 } },
    },
  },
})
