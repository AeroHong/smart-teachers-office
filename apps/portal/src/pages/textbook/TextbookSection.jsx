import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

// 검·인정도서 선정 전용 브랜드 컬러 — Home.jsx SERVICES 카드 색상과 통일.
export const ACCENT = '#0f766e'
export const ACCENT_BG = '#f0fdfa'
export const ACCENT_BORDER = '#99f6e4'

export default function TextbookSection({ title, right, children }) {
  return (
    <Box
      sx={{
        p: { xs: 2, sm: 3 },
        mb: 2.5,
        borderRadius: '14px',
        border: '1px solid #e2e8f0',
        bgcolor: '#fff',
        boxShadow: '0 1px 3px rgba(15,23,42,0.04)',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, gap: 1, flexWrap: 'wrap' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <Box sx={{ width: 4, height: 18, borderRadius: '3px', bgcolor: ACCENT }} />
          <Typography sx={{ fontSize: '0.98rem', fontWeight: 800, color: '#1e293b' }}>{title}</Typography>
        </Box>
        {right}
      </Box>
      {children}
    </Box>
  )
}
