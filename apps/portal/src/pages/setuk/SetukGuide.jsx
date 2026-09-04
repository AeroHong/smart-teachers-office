// 생기부 세특 점검 도구 사용법 안내 — 담임·교과 선생님께 공유하는 페이지. docx 파일을
// 매번 다시 만들어 보내는 대신, 이 사이트 안의 한 페이지로 두고 SetukUpload.jsx의
// "사용법 안내" 버튼에서 링크만 공유하면 항상 최신 내용을 보여줄 수 있다.
//
// 로그인 없이도 열리는 공개 페이지다(App.jsx에서 ProtectedRoute로 감싸지 않음) —
// 로그인 전에도 링크만으로 바로 확인할 수 있어야 하므로. 그래서 로그인 상태를
// 가정하는 공용 Layout(사이드바에 다른 업무 메뉴가 잔뜩 있고 useAuth 상태에 기대는
// 컴포넌트라 비로그인 접근을 상정하고 만들지 않았다)을 쓰지 않고, 이 페이지만의
// 가벼운 헤더를 직접 둔다.
import { useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Paper from '@mui/material/Paper'
import Button from '@mui/material/Button'

const GUIDE_BASE = '/setuk/guide'

function GuideImage({ src, alt, caption, maxWidth }) {
  return (
    <Box sx={{ mb: 3 }}>
      <Box
        component="img" src={src} alt={alt}
        sx={{
          width: '100%', maxWidth: maxWidth || '100%', display: 'block', mx: 'auto',
          borderRadius: '10px', border: '1px solid', borderColor: 'divider',
        }}
      />
      {caption && (
        <Typography sx={{ fontSize: '0.8rem', color: '#94a3b8', fontStyle: 'italic', textAlign: 'center', mt: 1 }}>
          {caption}
        </Typography>
      )}
    </Box>
  )
}

export default function SetukGuide() {
  const navigate = useNavigate()

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f8fafc' }}>
      <Box sx={{ bgcolor: '#fff', borderBottom: '1px solid #e5e7eb' }}>
        <Box sx={{ maxWidth: 1100, mx: 'auto', px: { xs: 2, md: 4 }, py: 1.5 }}>
          <Typography sx={{ fontWeight: 800, fontSize: '1rem', color: '#1e293b' }}>선유고 스마트 교무실</Typography>
        </Box>
      </Box>

      <Box sx={{ maxWidth: 1100, mx: 'auto', px: { xs: 2, md: 4 }, py: 3 }}>
      <Button size="small" onClick={() => navigate('/setuk')} sx={{ mb: 2, textTransform: 'none', color: '#64748b' }}>
        ← 세특 점검으로
      </Button>

      <Typography variant="h5" fontWeight={700} mb={1}>세특 점검 도구 사용법</Typography>
      <Typography variant="body2" color="text.secondary" mb={4}>
        나이스에서 받은 세특 파일을 업로드하면 특수문자·띄어쓰기·중복 공백·영문 표현 등을 자동으로
        확인해주는 도구입니다. 처음 쓰시는 선생님을 위해 화면별로 정리했습니다.
      </Typography>

      <Typography variant="h6" fontWeight={700} sx={{ mt: 4, mb: 1 }}>1. 화면 소개</Typography>
      <Typography variant="body2" color="text.secondary" mb={2}>
        업로드한 세특은 학급별 목록 · 과목별 보기 · 과목별 담당 교사 세 화면으로 정리됩니다.
        과목별 보기에서 과목을 누르면 그 과목에 걸린 항목만 모아 볼 수 있습니다.
      </Typography>
      <GuideImage
        src={`${GUIDE_BASE}/screen-list.png`} alt="학급별 목록 화면"
        caption="학급별 목록 — 업로드한 학급의 전체·미처리 건수를 한눈에 확인합니다."
      />
      <GuideImage
        src={`${GUIDE_BASE}/screen-subject.png`} alt="과목별 보기 화면"
        caption="과목별 보기 — 내가 담당하는 과목만 모아 확인할 수 있습니다."
      />
      <GuideImage
        src={`${GUIDE_BASE}/screen-detail.png`} alt="점검 결과 상세 화면"
        caption="점검 결과 상세 — 걸린 부분과 이유를 함께 보여줍니다."
      />
      <GuideImage
        src={`${GUIDE_BASE}/screen-filter.png`} alt="유형 필터 화면"
        caption="유형 필터 — 원하는 유형(특수기호·외국어 표기 등)만 골라 볼 수 있습니다."
      />

      <Paper variant="outlined" sx={{ p: 3, my: 4, borderColor: '#f0c896', bgcolor: '#fffaf0' }}>
        <Typography variant="h6" fontWeight={700} sx={{ mb: 1.5 }}>2. 이 도구의 한계 — 꼭 알아두세요</Typography>
        <Box component="ul" sx={{ m: 0, pl: 2.5, color: 'text.secondary', fontSize: '0.9rem', display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <li>특수문자, 띄어쓰기, 중복 공백, 영문 표현 등을 체크하는 도구입니다.</li>
          <li>일부 맞춤법은 잡아내지만, 모든 맞춤법을 자동으로 잡아내지는 못합니다.</li>
          <li>문맥 파악은 이루어지지 않습니다.</li>
        </Box>
        <Typography sx={{ mt: 2, fontWeight: 700, fontSize: '0.9rem' }}>
          즉, 이 도구가 아무것도 걸지 않았다고 해서 문장이 완벽하다는 뜻은 아닙니다.
          최종 확인은 선생님께서 직접 해주셔야 합니다.
        </Typography>
      </Paper>

      <Typography variant="h6" fontWeight={700} sx={{ mt: 4, mb: 1 }}>3. 확인 후 처리 방법</Typography>
      <GuideImage src={`${GUIDE_BASE}/icon-legend.png`} alt="처리완료·이상없음 아이콘 범례" maxWidth={420} />
      <Box component="ol" sx={{ m: 0, pl: 2.5, fontSize: '0.92rem', display: 'flex', flexDirection: 'column', gap: 1 }}>
        <li><b>처리완료</b> — 나이스 수정 후 체크해주세요.</li>
        <li><b>메모</b> — 어떻게 수정했는지 적어주시면 됩니다.</li>
        <li><b>이상없음</b> — 확인했지만 실제로는 문제가 아니라면(고유명사·도서명 등) 표시해주세요.</li>
      </Box>

      <Typography variant="h6" fontWeight={700} sx={{ mt: 4, mb: 1 }}>4. 점검 기준 추가</Typography>
      <Typography variant="body2" color="text.secondary" mb={2}>
        학교 사정에 맞는 표현을 추가하거나, 기본 제공 항목의 사용 여부·주의 수준을 바꿀 수 있습니다.
        「점검 기준 보기」에서 확인해주세요.
      </Typography>
      <GuideImage
        src={`${GUIDE_BASE}/screen-rules.png`} alt="점검 기준 화면" maxWidth={420}
        caption="점검 기준 화면 — 항목별로 사용 여부와 표현 목록을 직접 관리할 수 있습니다."
      />

      <Button size="small" onClick={() => navigate('/setuk')} sx={{ mt: 2, textTransform: 'none', color: '#64748b' }}>
        ← 세특 점검으로
      </Button>
      </Box>
    </Box>
  )
}
