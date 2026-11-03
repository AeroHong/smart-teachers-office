import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'

const FILES = [
  { kind: 'neis', title: '나이스 일괄등록 양식', desc: '받은 수강신청 파일과 같은 형식, 과목 칸에 분반 기호(그룹 글자)를 넣습니다.', ext: '.xlsx' },
  { kind: 'roster', title: '분반별 명단', desc: '첫 시트는 전체 분반(열), 이어서 과목별 시트. 담당 교사 배포용.', ext: '.xlsx' },
  { kind: 'timetable', title: '그룹표 요약', desc: '그룹(A~E) × 분반 인원표와 과목별 편차. A4 가로 인쇄.', ext: '.xlsx' },
  { kind: 'backup', title: '작업 백업', desc: '작업 전체를 파일로 보관하거나 다른 계정에서 「백업 파일 불러오기」.', ext: '.json' },
]

/**
 * 4단계 — 내보내기·연동. 지금은 파일 내보내기만.
 * StudentHub 연동(진급 뒤 학생 선택과목·분반 반영)은 docs/CLASSFLOW_STEP4_PLAN.md 계획대로 추후 개발.
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

        <Typography fontWeight={700} sx={{ mb: 1 }}>스마트교무실 연동 <Chip size="small" label="준비 중" sx={{ ml: 0.5 }} /></Typography>
        <Paper sx={{ p: 2.5, opacity: 0.85 }}>
          <Typography fontWeight={700} sx={{ mb: 1 }}>StudentHub 학생 선택과목·분반 반영</Typography>
          <Box component="ol" sx={{ m: 0, pl: 2.5, color: 'text.secondary', fontSize: 14, lineHeight: 1.9 }}>
            <li>StudentHub에서 학년도 전환·<b>진급</b>(새 학번 부여)이 끝났는지 확인</li>
            <li>이 작업의 학번(진급 전)을 진급 후 학생과 연결 — 학번 이력으로 자동 매칭, 못 찾은 학생은 직접 지정</li>
            <li>미리보기: 학생별로 반영될 과목·분반(그룹)·학기, 바뀌는 학생 수</li>
            <li>반영: 학생 정보의 선택과목(<code>electiveSubjects</code>)에 학년도·학기 단위로 기록 → 출결 그룹·명렬표가 이 분반을 씀</li>
          </Box>
        </Paper>
      </Box>
    </Box>
  )
}
