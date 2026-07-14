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
  {
    icon: '📊',
    title: '성취평가제 체크리스트',
    description: '나이스 성적 일람표(환산점수)를 업로드하면 성취도 분포·교과평균 등 체크리스트 항목을 자동으로 계산합니다.',
    path: '/tools/asa-support',
    color: '#0ea5e9',
    bgColor: '#e0f2fe',
  },
  {
    icon: '🏆',
    title: '내신등급 계산기',
    description: '나이스 성적 일람표(환산점수)를 업로드하면 상대평가 내신등급(1·2학년 5등급제 / 3학년 9등급제)의 등급별 경계 점수를 계산합니다.',
    path: '/tools/grade-rank',
    color: '#16a34a',
    bgColor: '#dcfce7',
  },
  {
    icon: '🎯',
    title: '최소성취수준 보장지도',
    description: '1학년 성적일람표를 업로드하면 등록된 E/미도달 분할점수 기준으로 보장지도 대상 학생을 과목별로 추출하고 명단을 게시합니다.',
    path: '/tools/min-achievement',
    color: '#dc2626',
    bgColor: '#fef2f2',
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
