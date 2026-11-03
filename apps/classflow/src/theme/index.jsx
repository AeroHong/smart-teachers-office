/**
 * 분반 배정(ClassFlow) 테마 — StudentHub·ExamCore와 같은 디자인(진초록 + 밝은 회녹색 바탕).
 * ExamCore `src/theme/index.jsx`의 밝은 팔레트를 그대로 쓴다. 어두운 모드는 아직 없다(배정표 색을 직접 지정한 곳이 많아 추후).
 */
import { createTheme, ThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import './global.css'

export const BRAND = '#14532d'

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: BRAND, light: '#2f7a4f', dark: '#0b3a1f', contrastText: '#fff' },
    secondary: { main: '#c2410c' },
    info: { main: '#1d4ed8' },
    warning: { main: '#b45309' },
    background: { default: '#f4f5f2', paper: '#ffffff' },
    divider: '#e3e5df',
    text: { primary: '#1b1f1c', secondary: '#5d665f' },
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
    MuiTableCell: { styleOverrides: { head: { fontWeight: 700 } } },
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
