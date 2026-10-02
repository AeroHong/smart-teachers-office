/**
 * 학교운영위원회 제출 자료 — 모든 과목의 선정 결과(1~3순위)를 한 문서로 수합한다(2026-10-02).
 *
 * 업무 담당자(관리자)가 전체 현황에서 연다. 모든 선정 건이 마감(1책 1도서는 확정)된 뒤에만 만들 수
 * 있다 — 일부만 마감된 상태로 학운위에 올라가는 일을 막기 위해서다(버튼에서 막는다).
 * 출력은 서식과 같은 흑백 문서(미리보기·인쇄·PDF)와 엑셀 두 가지.
 */
import { useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Typography from '@mui/material/Typography'
import TableChartOutlinedIcon from '@mui/icons-material/TableChartOutlined'
import { rankedCandidates } from '@shared/lib/textbookAdoption'
import { buildCommitteeReportHtml, fmtPrice } from './textbookPrint'
import { FormPreview, OutputButtons } from './TextbookFormsPanel'

export const SINGLE_BOOK_NOTE = '1책 1도서로 해당 도서를 선정함'

/** 선정 건 목록(이미 교과군·과목 순으로 정렬된 것) → 보고서 행. */
export function buildReportRows(adoptions, groupLabel) {
  return adoptions.map((a) => {
    const ranked = rankedCandidates(a).slice(0, 3)
    const ranks = [0, 1, 2].map((k) => {
      const r = ranked[k]
      return r ? { publisher: r.candidate.publisher, author: r.candidate.author, price: r.candidate.price, rank: r.rank, tied: r.tied } : null
    })
    let note = ''
    if (a.singleBook) note = SINGLE_BOOK_NOTE
    else if (ranked.filter((r) => r.rank === 1).length > 1) note = '1순위 동점'
    return { group: groupLabel(a.subjectGroup || '__unassigned__'), subject: a.subjectName, ranks, note }
  })
}

async function downloadXlsx(rows, title) {
  const XLSX = await import('xlsx')
  const sheetRows = rows.map((r, i) => {
    const row = { 연번: i + 1, 교과군: r.group, 과목: r.subject }
    r.ranks.forEach((k, idx) => {
      const n = idx + 1
      row[`${n}순위 출판사`] = k ? `${k.publisher}${k.tied ? '(공동)' : ''}` : ''
      row[`${n}순위 저자`] = k?.author || ''
      row[`${n}순위 가격`] = k ? fmtPrice(k.price) : ''
    })
    row.비고 = r.note
    return row
  })
  const ws = XLSX.utils.json_to_sheet(sheetRows)
  ws['!cols'] = [{ wch: 5 }, { wch: 14 }, { wch: 22 }, ...Array(3).fill([{ wch: 16 }, { wch: 16 }, { wch: 10 }]).flat(), { wch: 26 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '선정결과')
  XLSX.writeFile(wb, `${title.replace(/[\\/:*?"<>|]/g, '_')}.xlsx`)
}

export default function TextbookCommitteeReport({ open, onClose, adoptions, groupLabel, onError }) {
  const [xlsxBusy, setXlsxBusy] = useState(false)
  const year = Math.max(...adoptions.map((a) => Number(a.cycleYear) || 0), 0)
  const title = `${year ? `${year}학년도 ` : ''}검·인정 교과용도서 선정 결과`
  const rows = useMemo(() => buildReportRows(adoptions, groupLabel), [adoptions, groupLabel])
  const singleN = rows.filter((r) => r.note === SINGLE_BOOK_NOTE).length
  const summary = `총 ${rows.length}과목 (교원 의견수렴 ${rows.length - singleN}과목 · 1책 1도서 ${singleN}과목)`
  const html = useMemo(() => buildCommitteeReportHtml({ title, summary, rows }), [title, summary, rows])

  const handleXlsx = async () => {
    setXlsxBusy(true)
    try {
      await downloadXlsx(rows, title)
    } catch (e) {
      onError?.(`엑셀 생성 실패: ${e.message}`)
    } finally {
      setXlsxBusy(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        학교운영위원회 제출 자료
        <Typography fontSize="0.8rem" color="text.secondary">{summary}</Typography>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
          <Button
            size="small" variant="outlined" startIcon={<TableChartOutlinedIcon />} disabled={xlsxBusy} onClick={handleXlsx}
            sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 700, borderColor: '#cbd5e1', color: '#334155' }}
          >
            {xlsxBusy ? '엑셀 만드는 중...' : '엑셀 다운로드'}
          </Button>
          <OutputButtons title={title} sheetsHtml={html} onError={onError} />
        </Box>
        <FormPreview sheetsHtml={html} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>닫기</Button>
      </DialogActions>
    </Dialog>
  )
}
