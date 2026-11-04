import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import { PORTAL_URL } from '../lib/links'

const FILES = [
  { kind: 'neis', title: '수강신청 원본 양식', desc: '받은 수강신청 파일과 같은 형식(학번·이름 열 그대로), 과목 칸에 분반 기호(그룹 글자)를 넣습니다.', ext: '.xlsx' },
  { kind: 'roster', title: '분반별 명단', desc: '첫 시트는 전체 분반(열), 이어서 과목별 시트. 담당 교사 배포용.', ext: '.xlsx' },
  { kind: 'timetable', title: '그룹표 요약', desc: '그룹(A~E) × 분반 인원표와 과목별 편차. A4 가로 인쇄.', ext: '.xlsx' },
  { kind: 'backup', title: '작업 백업', desc: '작업 전체를 파일로 보관하거나 다른 계정에서 「백업 파일 불러오기」.', ext: '.json' },
]

/**
 * 4단계 — 내보내기·연동. 파일 내보내기 + StudentHub 연동 안내.
 * 학생 선택과목 반영과 나이스 업로드 파일은 StudentHub 「선택과목」에서 한다(진급 뒤 새 반·번호가 필요하므로).
 */
export default function ExportStep({ validation, onExport }) {
  return (
    <Box sx={{ height: '100%', overflowY: 'auto', bgcolor: '#f5f7fa', p: 3 }}>
      <Box sx={{ maxWidth: 1100, mx: 'auto' }}>
        <Typography variant="h6" fontWeight={800} sx={{ mb: 0.5 }}>내보내기 · 연동</Typography>
        <Typography color="text.secondary" sx={{ mb: 2 }}>배정을 마친 뒤 결과를 파일로 내보내거나, 스마트교무실 학생 정보로 보냅니다.</Typography>
        {!validation.ok && <Alert severity="warning" sx={{ mb: 2 }}>미배정·충돌이 남아 있습니다. 3단계에서 확인한 뒤 내보내세요.</Alert>}

        <Typography fontWeight={700} sx={{ mb: 1 }}>파일로 내보내기</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 2, mb: 4 }}>
          {FILES.map((f) => (
            <Paper key={f.kind} sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Typography fontWeight={800}>{f.title} <Typography component="span" color="text.secondary" fontSize={13}>{f.ext}</Typography></Typography>
              <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>{f.desc}</Typography>
              <Button variant={f.kind === 'backup' ? 'outlined' : 'contained'} onClick={() => onExport(f.kind)}>내려받기</Button>
            </Paper>
          ))}
        </Box>

        <Typography fontWeight={700} sx={{ mb: 1 }}>StudentHub 연동 — 학생 선택과목 반영 · 나이스 업로드 파일</Typography>
        <Paper sx={{ p: 2.5 }}>
          <Box component="ol" sx={{ m: 0, pl: 2.5, color: 'text.secondary', fontSize: 14, lineHeight: 1.9 }}>
            <li>이 작업을 <b>저장</b>합니다(StudentHub는 저장된 배정을 읽습니다).</li>
            <li>StudentHub <b>선택과목</b> 화면에서 학년도·학년을 고르고 <b>「분반 배정에서 가져오기」</b>로 이 작업을 고릅니다.
              학번은 배정 당시 학번이라 진급 전·후 모두 학생을 찾아 연결합니다.</li>
            <li>미리 채워진 과목·분반을 확인하고 <b>저장</b>하면 학생 정보의 선택과목에 반영됩니다(출결 그룹·명렬표가 이 값을 씁니다).</li>
            <li>2월 반편성(또는 진급)이 끝나면 같은 화면의 <b>「나이스 업로드 파일」</b>로 과목·분반별 엑셀을 한 번에 받아 나이스에 올립니다.</li>
          </Box>
          <Button sx={{ mt: 1.5 }} variant="outlined" endIcon={<OpenInNewIcon />}
            href={`${PORTAL_URL}/studenthub?next=${encodeURIComponent('/electives')}`} target="_blank" rel="noopener">
            StudentHub 선택과목 열기
          </Button>
        </Paper>
      </Box>
    </Box>
  )
}
