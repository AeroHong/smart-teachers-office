import { useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardActionArea from '@mui/material/CardActionArea'
import CardContent from '@mui/material/CardContent'
import Grid from '@mui/material/Grid'
import Typography from '@mui/material/Typography'
import { useAuth } from '@shared/contexts/AuthContext'
import AdminFrame from '../components/AdminFrame'
import { getCurrentNodes, useBook } from '../lib/data'
import { downloadBookHwpx } from '../lib/hwpxExport'

const CARDS = [
  { to: '/admin/import', title: '규정집 가져오기', text: '한글(hwpx) 규정집을 읽어 규정·조문으로 나누고 적재합니다.' },
  { to: '/admin/settings', title: '목차 설정', text: '규정 이름·분류·순서와 학교 홈페이지 외부 공개 여부를 정합니다.' },
  { to: '/admin/structure', title: '체계 설정', text: '학칙 → 규정 → 세칙의 위계와 상위 규정·근거 조문·상위 법령을 정합니다. 본문의 근거 문구로 자동 제안합니다.' },
  { to: '/admin/laws', title: '상위 법령 점검', text: '규정이 기대는 법령·조례·교육청 지침을 모아 보고, 바뀌었는지 확인한 기록을 남깁니다.' },
  { to: '/admin/managers', title: '규정 담당자 지정', text: '개정안을 작성할 선생님을 지정합니다. 확정은 관리자·교감이 합니다.' },
  { to: '/amendments', title: '개정안', text: '작성 중·검토 중인 개정안과 확정 기록을 봅니다.' },
]

export default function AdminHome() {
  const { schoolId } = useAuth()
  const { book } = useBook(schoolId)
  const [progress, setProgress] = useState('')
  const [err, setErr] = useState('')
  const downloadAll = async () => {
    setErr('')
    try {
      await downloadBookHwpx({ book, loadNodes: (id) => getCurrentNodes(schoolId, book, id), onProgress: (i, n) => setProgress(`${i}/${n}`) })
    } catch (e) { setErr(`내려받기 실패: ${e.message}`) }
    setProgress('')
  }
  return (
    <AdminFrame title="규정집 관리" back="/">
      {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}
      <Grid container spacing={2}>
        {CARDS.map((c) => (
          <Grid item xs={12} sm={6} md={4} key={c.to}>
            <Card sx={{ height: '100%' }}>
              <CardActionArea component={RouterLink} to={c.to} sx={{ height: '100%' }}>
                <CardContent>
                  <Typography fontWeight={800} gutterBottom>{c.title}</Typography>
                  <Typography variant="body2" color="text.secondary">{c.text}</Typography>
                </CardContent>
              </CardActionArea>
            </Card>
          </Grid>
        ))}
      </Grid>
      {book && (
        <Button sx={{ mt: 3 }} variant="outlined" disabled={!!progress} onClick={downloadAll}>
          규정집 전체 한글(hwpx) 내려받기 {progress && `(${progress})`}
        </Button>
      )}
    </AdminFrame>
  )
}
