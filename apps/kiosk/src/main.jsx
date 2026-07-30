import React from 'react'
import ReactDOM from 'react-dom/client'
import { ThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import { theme } from '@shared/theme'
import { KioskProvider } from './contexts/KioskContext'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <KioskProvider>
        <App />
      </KioskProvider>
    </ThemeProvider>
  </React.StrictMode>
)
