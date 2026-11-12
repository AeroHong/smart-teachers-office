import { useState } from 'react'
import Box from '@mui/material/Box'
import InputAdornment from '@mui/material/InputAdornment'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import SearchIcon from '@mui/icons-material/Search'
import AppBar from '../components/AppBar'

/**
 * 첫 화면 — 검색창 중심(법령정보센터 개편 방향과 같다).
 * 1단계(골격)에서는 규정집이 아직 없어 빈 상태만 보인다. 2단계에서 가져오기, 3단계에서 검색·목차가 붙는다.
 */
export default function Home() {
  const [q, setQ] = useState('')
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar />
      <Box sx={{ maxWidth: 760, mx: 'auto', px: 2, pt: { xs: 6, md: 12 }, pb: 6 }}>
        <Stack spacing={3} alignItems="center">
          <Typography variant="h4" textAlign="center">어떤 규정을 찾으세요?</Typography>
          <TextField
            fullWidth
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="규정 이름이나 내용으로 찾기 — 예: 벌점 20점, 체험학습 일수, 학업성적관리규정 제5조"
            InputProps={{
              startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment>,
              sx: { bgcolor: 'background.paper', borderRadius: 999, py: 0.5, px: 1, fontSize: '1.1rem' },
            }}
          />
          <Paper variant="outlined" sx={{ p: 3, width: '100%', textAlign: 'center' }}>
            <Typography fontWeight={700} gutterBottom>아직 규정집이 올라오지 않았습니다</Typography>
            <Typography variant="body2" color="text.secondary">
              관리자가 규정집 한글(hwpx) 파일을 가져오면 여기에서 규정을 검색하고 목차를 따라 읽을 수 있습니다.
            </Typography>
          </Paper>
        </Stack>
      </Box>
    </Box>
  )
}
