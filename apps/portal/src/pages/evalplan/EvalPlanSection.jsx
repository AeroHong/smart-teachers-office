import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

// 이 기능(evalplan) 전용 브랜드 컬러 — Home.jsx SERVICES 카드의 색상과 통일.
export const ACCENT = '#7c3aed'
export const ACCENT_BG = '#f5f3ff'
export const ACCENT_BORDER = '#ddd6fe'

// 폼·상세 화면 전반에서 재사용하는 섹션 카드. 기존에는 각 페이지가 옅은 outlined Paper +
// bold 텍스트만 반복해서 밋밋했던 것을, 좌측 컬러 바 + 라운드 카드로 통일해 시각적 구획을
// 명확히 했다(Home.jsx 카드류가 쓰는 radius/그림자 톤에 맞춤).
export default function EvalPlanSection({ title, right, children }) {
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
