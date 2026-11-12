/**
 * 학교 규정집(Codex-Edu) 테마 — 남색 바탕의 차분한 문서 화면.
 * 타이포·간격은 ClassFlow·ExamCore와 같은 기준(Pretendard, 0.5rem 단위)을 쓴다.
 */
import { createTheme, ThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import './global.css'

export const BRAND = '#1e3a8a'

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: BRAND, light: '#3b5bb5', dark: '#14275e', contrastText: '#fff' },
    secondary: { main: '#b45309' },
    success: { main: '#15803d' },
    error: { main: '#b91c1c' },
    background: { default: '#f5f6f8', paper: '#ffffff' },
    divider: '#e2e5ea',
    text: { primary: '#1a1d23', secondary: '#5b6270' },
  },
  spacing: (f) => `${0.5 * f}rem`,
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: "'Pretendard Variable', Pretendard, 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif",
    h4: { fontWeight: 800, letterSpacing: '-0.02em' },
    h5: { fontWeight: 800, letterSpacing: '-0.015em' },
    h6: { fontWeight: 700 },
    button: { fontWeight: 600, textTransform: 'none' },
  },
  components: {
    MuiPaper: { defaultProps: { elevation: 0 }, styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiCard: { defaultProps: { variant: 'outlined' } },
    MuiButton: { defaultProps: { disableElevation: true } },
    MuiChip: { styleOverrides: { root: { fontWeight: 600 } } },
  },
})

export function AppThemeProvider({ children }) {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline enableColorScheme />
      {children}
    </ThemeProvider>
  )
}
