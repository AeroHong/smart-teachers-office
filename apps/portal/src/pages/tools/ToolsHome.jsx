import { useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardActionArea from '@mui/material/CardActionArea'
import Grid from '@mui/material/Grid'
import Layout from '../../components/Layout'

// 앞으로 소소한 유틸리티 도구가 늘어날 때 이 배열에 항목만 추가하면 된다.
const TOOLS = [
  {
    icon: '🎫',
    title: 'QR 안내문 생성기',
    description: '고교학점제 QR 그리드 PDF와 안내문 양식을 업로드하면 학생별 안내문을 자동으로 생성합니다.',
    path: '/tools/qr-notice',
    color: '#4f46e5',
    bgColor: '#eef2ff',
  },
]

export default function ToolsHome() {
  const navigate = useNavigate()

  return (
    <Layout>
      <Typography variant="h5" fontWeight={700} mb={0.5}>
        도구모음 🧰
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={4}>
        업무에 도움이 되는 소소한 유틸리티 도구 모음입니다.
      </Typography>

      <Grid container spacing={3}>
        {TOOLS.map((tool) => (
          <Grid item xs={12} sm={6} md={4} key={tool.title}>
            <Card sx={{ height: '100%', borderTop: `3px solid ${tool.color}` }}>
              <CardActionArea onClick={() => navigate(tool.path)} sx={{ height: '100%', alignItems: 'flex-start' }}>
                <CardContent sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                  <Box sx={{ bgcolor: tool.bgColor, p: 1.5, borderRadius: 3, fontSize: '1.5rem', lineHeight: 1, width: 'fit-content', mb: 2 }}>
                    {tool.icon}
                  </Box>
                  <Typography variant="h6" fontWeight={700} mb={0.75}>{tool.title}</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>{tool.description}</Typography>
                </CardContent>
              </CardActionArea>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Layout>
  )
}
