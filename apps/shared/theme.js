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
      // 카드와 배경 대비를 조금 키웠다. #f8fafc는 흰 카드와 거의 구분되지 않아
      // 위젯 경계가 테두리 한 줄에만 의존했다.
      default: '#f1f3f6',
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
  /**
   * 곡률 기준값. sx의 borderRadius: n 은 이 값 × n 이다 (1 → 8px, 1.25 → 10px).
   *
   * 12에서 8로 낮췄다. 카드가 24px, 버튼이 알약(20px)이라 화면 전체가 둥글둥글해
   * 정보를 담는 도구보다 소비형 앱처럼 보였다. Slack을 비롯한 업무 도구는 6~10px
   * 범위를 쓴다 — 모서리가 각질수록 표·목록의 정렬선이 또렷해진다.
   */
  shape: { borderRadius: 8 },
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
        // 알약(20px)은 이 밀도의 화면에서 버튼만 도드라져 보인다
        root: { borderRadius: 6, textTransform: 'none', fontWeight: 600 },
      },
    },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        // 마우스를 올릴 때 카드가 떠오르던 효과를 뺐다. 위젯이 여러 장 붙어 있는 화면에서는
        // 지나갈 때마다 판이 들썩여 시선을 뺏는다. 테두리 색만 살짝 바꾼다.
        root: {
          borderRadius: 10,
          border: '1px solid #e8eaed',
          transition: 'border-color 0.15s ease',
        },
      },
    },
    MuiChip: {
      styleOverrides: { root: { borderRadius: 5, fontWeight: 600 } },
    },
    MuiAppBar: {
      defaultProps: { elevation: 0 },
    },
    MuiTextField: {
      defaultProps: { variant: 'outlined', size: 'small' },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: { root: { borderRadius: 10 } },
    },
  },
})
