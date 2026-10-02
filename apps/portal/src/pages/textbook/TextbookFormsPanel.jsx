import { useState, useMemo, useRef, useEffect } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Tabs from '@mui/material/Tabs'
import Tab from '@mui/material/Tab'
import Alert from '@mui/material/Alert'
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined'
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined'
import {
  buildScoreSheetHtml, buildSummaryHtml, buildRecommendationHtml,
  wrapFormsDocument, printForms, downloadFormsPdf,
} from './textbookPrint'
import { isCompleteSubmission } from '@shared/lib/textbookAdoption'
import TextbookSection, { ACCENT, ACCENT_BG } from './TextbookSection'

const SHEET_WIDTH_PX = 1123 // A4 가로 297mm @96dpi — 미리보기 축소 비율 계산용
export const PORTRAIT_WIDTH_PX = 794 // A4 세로 210mm
const PREVIEW_PAD = 16

/**
 * 서식 HTML을 실제 출력물과 같은 모양으로 보여준다(같은 빌더·같은 CSS). 종이 폭 기준으로
 * 그린 뒤 카드 폭에 맞춰 축소하고, 높이는 iframe 문서 높이를 재서 맞춘다.
 */
export function FormPreview({ sheetsHtml, paperWidth = SHEET_WIDTH_PX }) {
  const wrapRef = useRef(null)
  const iframeRef = useRef(null)
  const [scale, setScale] = useState(1)
  const [docHeight, setDocHeight] = useState(600)
  const frameWidth = paperWidth + PREVIEW_PAD * 2

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setScale(Math.min(1, entry.contentRect.width / frameWidth)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [frameWidth])

  const measure = () => {
    const doc = iframeRef.current?.contentDocument
    if (doc?.body) setDocHeight(doc.documentElement.scrollHeight)
  }

  const srcDoc = useMemo(() => wrapFormsDocument('미리보기', sheetsHtml, 'preview'), [sheetsHtml])

  return (
    <Box ref={wrapRef} sx={{ width: '100%', height: docHeight * scale, overflow: 'hidden', borderRadius: '10px', border: '1px solid #e2e8f0', bgcolor: '#d4d4d4' }}>
      <iframe
        ref={iframeRef}
        title="서식 미리보기"
        srcDoc={srcDoc}
        onLoad={measure}
        style={{ width: frameWidth, height: docHeight, border: 0, transform: `scale(${scale})`, transformOrigin: 'top left', display: 'block' }}
      />
    </Box>
  )
}

export function OutputButtons({ title, sheetsHtml, disabled, onError }) {
  const [busy, setBusy] = useState(false)
  const handlePdf = async () => {
    setBusy(true)
    try {
      await downloadFormsPdf(title, sheetsHtml)
    } catch (e) {
      onError?.(`PDF 생성 실패: ${e.message}`)
    } finally {
      setBusy(false)
    }
  }
  const handlePrint = () => {
    if (!printForms(title, sheetsHtml)) onError?.('팝업이 차단되어 인쇄 창을 열 수 없습니다. 브라우저에서 팝업을 허용해 주세요.')
  }
  return (
    <Box sx={{ display: 'flex', gap: 1 }}>
      <Button
        size="small" variant="outlined" startIcon={<PrintOutlinedIcon />} disabled={disabled} onClick={handlePrint}
        sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 700, borderColor: '#cbd5e1', color: '#334155' }}
      >
        인쇄
      </Button>
      <Button
        size="small" variant="contained" startIcon={<PictureAsPdfOutlinedIcon />} disabled={disabled || busy} onClick={handlePdf}
        sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 700, bgcolor: ACCENT, boxShadow: 'none', '&:hover': { bgcolor: '#0d5f59', boxShadow: 'none' } }}
      >
        {busy ? 'PDF 만드는 중...' : 'PDF 다운로드'}
      </Button>
    </Box>
  )
}

/**
 * <제출서류> — 마감 후 서식1(위원별 평가표)·서식2(총괄표)·서식3(추천의견서)을 탭으로 보여주고
 * 인쇄·PDF로 내보낸다. 서명은 모두 출력물에 직접 받는다(화면 서명 기능 없음).
 *
 * 서식1·2는 위원 개별 점수가 들어가므로 canManage(관리자·과목 대표교사·교과부장)만 전체를
 * 본다. 일반 위원은 서식1에서 본인 평가표만 본다.
 */
export default function TextbookFormsPanel({
  adoption, scores, myScore, myName, canManage, isCommittee, members,
  deptHeadName, principalName, summaryControls, recommendationControls, recommendationForPreview, onError,
}) {
  const [tab, setTab] = useState(0)
  const [memberKey, setMemberKey] = useState('all')
  const subject = adoption.subjectName || ''

  // 서식1 대상: 관리자급은 제출한 위원 전원(내부+외부), 일반 위원은 본인만.
  const sheetEntries = useMemo(() => {
    if (canManage) {
      return members.map((m) => {
        const s = scores.find((sc) => sc.uid === m.key)
        return { ...m, score: isCompleteSubmission(s, adoption.candidates) ? { ...s, teacherName: s.teacherName || m.name } : null }
      })
    }
    if (isCommittee) {
      return [{ key: 'me', name: myName, score: isCompleteSubmission(myScore, adoption.candidates) ? { ...myScore, teacherName: myScore.teacherName || myName } : null }]
    }
    return []
  }, [canManage, isCommittee, members, scores, myScore, myName, adoption.candidates])

  const submittedEntries = sheetEntries.filter((e) => e.score)
  const selectedEntries = memberKey === 'all' ? submittedEntries : submittedEntries.filter((e) => e.key === memberKey)
  const form1Html = selectedEntries.map((e) => buildScoreSheetHtml(adoption, e.score)).join('')
  const form1Title = memberKey === 'all' || selectedEntries.length !== 1
    ? `서식1_${subject}_위원평가표${selectedEntries.length > 1 ? `_${selectedEntries.length}명` : ''}`
    : `서식1_${subject}_${selectedEntries[0].name}`

  const form2Html = canManage ? buildSummaryHtml(adoption, scores, deptHeadName, members) : ''
  const form3Html = buildRecommendationHtml(
    recommendationForPreview ? { ...adoption, recommendation: recommendationForPreview } : adoption,
    deptHeadName, principalName,
  )

  const tabSx = { textTransform: 'none', fontWeight: 700, fontSize: '0.86rem', minHeight: 40 }

  return (
    <TextbookSection title="제출서류">
      <Typography sx={{ fontSize: '0.8rem', color: '#64748b', mb: 1.5 }}>
        서명은 출력물에 직접 받습니다. 아래 미리보기와 인쇄물·PDF는 같은 모양으로 나옵니다.
      </Typography>
      <Tabs
        value={tab} onChange={(_, v) => setTab(v)}
        sx={{ mb: 2, minHeight: 40, borderBottom: '1px solid #e2e8f0', '& .MuiTabs-indicator': { bgcolor: ACCENT }, '& .Mui-selected': { color: `${ACCENT} !important` } }}
      >
        <Tab sx={tabSx} label="서식1 · 평가표" />
        <Tab sx={tabSx} label="서식2 · 평가 총괄표" />
        <Tab sx={tabSx} label="서식3 · 추천 의견서" />
      </Tabs>

      {tab === 0 && (
        sheetEntries.length === 0 ? (
          <Alert severity="info" sx={{ borderRadius: '10px' }}>위원 개별 평가표는 본인과 관리자·과목 대표교사·교과부장만 볼 수 있습니다.</Alert>
        ) : (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, flexWrap: 'wrap', mb: 1.5 }}>
              <Box sx={{ display: 'flex', gap: 0.6, flexWrap: 'wrap' }}>
                {canManage && (
                  <Chip
                    size="small" label={`전체 (${submittedEntries.length}명)`} onClick={() => setMemberKey('all')}
                    sx={memberKey === 'all' ? { bgcolor: ACCENT_BG, color: ACCENT, fontWeight: 800, border: `1px solid ${ACCENT}` } : { fontWeight: 600 }}
                  />
                )}
                {sheetEntries.map((e) => (
                  <Chip
                    key={e.key} size="small"
                    label={e.score ? e.name : `${e.name} · 미제출`}
                    disabled={!e.score}
                    onClick={() => setMemberKey(canManage ? e.key : 'all')}
                    sx={canManage && memberKey === e.key ? { bgcolor: ACCENT_BG, color: ACCENT, fontWeight: 800, border: `1px solid ${ACCENT}` } : { fontWeight: 600 }}
                  />
                ))}
              </Box>
              <OutputButtons title={form1Title} sheetsHtml={form1Html} disabled={!selectedEntries.length} onError={onError} />
            </Box>
            {selectedEntries.length
              ? <FormPreview sheetsHtml={form1Html} />
              : <Alert severity="info" sx={{ borderRadius: '10px' }}>제출된 평가표가 없습니다.</Alert>}
          </>
        )
      )}

      {tab === 1 && (
        canManage ? (
          <>
            <Box sx={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 1.5, flexWrap: 'wrap', mb: 1.5 }}>
              <Box sx={{ flex: 1, minWidth: 280 }}>{summaryControls}</Box>
              <OutputButtons title={`서식2_${subject}_평가총괄표`} sheetsHtml={form2Html} onError={onError} />
            </Box>
            <FormPreview sheetsHtml={form2Html} />
          </>
        ) : (
          <Alert severity="info" sx={{ borderRadius: '10px' }}>평가 총괄표에는 위원별 점수가 들어 있어 관리자·과목 대표교사·교과부장만 볼 수 있습니다.</Alert>
        )
      )}

      {tab === 2 && (
        <>
          {recommendationControls}
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1.5 }}>
            <OutputButtons title={`서식3_${subject}_추천의견서`} sheetsHtml={form3Html} onError={onError} />
          </Box>
          <Box sx={{ maxWidth: 760, mx: 'auto' }}>
            <FormPreview sheetsHtml={form3Html} paperWidth={PORTRAIT_WIDTH_PX} />
          </Box>
        </>
      )}
    </TextbookSection>
  )
}
