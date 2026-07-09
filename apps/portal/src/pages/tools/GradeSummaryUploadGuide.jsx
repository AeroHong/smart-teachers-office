import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Accordion from '@mui/material/Accordion'
import AccordionSummary from '@mui/material/AccordionSummary'
import AccordionDetails from '@mui/material/AccordionDetails'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'

// 나이스 성적 일람표(환산점수)를 업로드하는 도구들(성취평가제 체크리스트,
// 내신등급 계산기 등)이 공통으로 사용하는 다운로드 방법 안내 + 다교사 분반
// 안내 아코디언
export default function GradeSummaryUploadGuide() {
  return (
    <>
      <Accordion variant="outlined" sx={{ mb: 3, '&:before': { display: 'none' } }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="subtitle2" fontWeight={700}>
            📥 나이스에서 성적 일람표(환산점수) 다운로드하는 방법
          </Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Box component="ol" sx={{ m: 0, pl: 2.5, fontSize: '0.85rem', color: 'text.secondary' }}>
            <li>나이스 <b>교과담임</b> 메뉴 → <b>성적조회/통계 → 학기말성적조회</b>로 이동해 <b>「정기시험/수행평가성적일람표」</b> 탭을 선택합니다.</li>
            <li>학년도·학기·학년·과목·강의실을 선택하고 <b>「환산점기준」</b>을 선택한 뒤 <b>「전반출력」</b>을 클릭합니다.</li>
            <li>미리보기 창에서 저장 아이콘을 누르고 <b>「XLS」</b>를 선택해 다운로드합니다.</li>
          </Box>
          <Box
            component="a"
            href="/tools/asa-neis-download-guide.png"
            target="_blank"
            rel="noopener noreferrer"
            sx={{ display: 'block', mt: 2 }}
          >
            <Box
              component="img"
              src="/tools/asa-neis-download-guide.png"
              alt="나이스 성적 일람표 다운로드 방법 안내 스크린샷"
              sx={{
                width: '100%',
                maxWidth: 640,
                borderRadius: '10px',
                border: '1px solid',
                borderColor: 'divider',
                display: 'block',
              }}
            />
          </Box>
          <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 1 }}>
            이미지를 클릭하면 원본 크기로 볼 수 있습니다.
          </Typography>
        </AccordionDetails>
      </Accordion>

      <Accordion variant="outlined" sx={{ mb: 3, '&:before': { display: 'none' } }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="subtitle2" fontWeight={700}>
            ⚠️ 동일 과목을 여러 선생님이 나누어 담당하는 경우
          </Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            나이스는 <b>본인이 담당하는 학급</b>의 성적 일람표만 다운로드할 수 있습니다. 같은 과목을 여러 선생님이 학급을 나누어 가르치는 경우, 파일 하나만 올리면 본인이 맡은 학급만 반영되어 <b>과목 전체 통계와는 다릅니다.</b>
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            과목 전체 기준으로 확인하려면 아래처럼 해주세요.
          </Typography>
          <Box component="ol" sx={{ m: 0, pl: 2.5, fontSize: '0.85rem', color: 'text.secondary' }}>
            <li>동일 과목을 담당하는 선생님들께 각자 나이스에서 받은 <b>성적 일람표(환산점수) xlsx 파일</b>을 받습니다(대표 선생님 한 분이 모아주세요).</li>
            <li>아래 「성적 일람표 xlsx 선택」에서 <b>모은 파일을 한 번에 여러 개 선택</b>합니다.</li>
            <li>같은 과목·학년의 학급이 자동으로 통합됩니다. 파일을 합치거나 편집할 필요가 없습니다.</li>
          </Box>
          <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 1.5 }}>
            * 같은 학급이 서로 다른 파일에 중복 포함되면 오류로 표시되니 확인 후 다시 올려주세요. 선생님별로 각자 업로드해도 자동으로 합산되는 기능은 추후 추가 예정입니다.
          </Typography>
        </AccordionDetails>
      </Accordion>
    </>
  )
}
