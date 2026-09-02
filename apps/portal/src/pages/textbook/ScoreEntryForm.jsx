import { useState, useEffect, useMemo, useCallback } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Table from '@mui/material/Table'
import TableHead from '@mui/material/TableHead'
import TableBody from '@mui/material/TableBody'
import TableRow from '@mui/material/TableRow'
import TableCell from '@mui/material/TableCell'
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined'
import { distributeScore, sumCriteria, rubricMax } from '@shared/lib/textbookAdoption'
import TextbookSection, { ACCENT, ACCENT_BG } from './TextbookSection'

// byCandidate 문서 값 → 화면 편집용 로컬 상태(항목별 점수 맵)로 변환.
function toEditState(byCandidate, candidates) {
  const state = {}
  candidates.forEach((c) => {
    state[c.id] = { ...(byCandidate?.[c.id]?.byCriterion || {}) }
  })
  return state
}

/**
 * 서식1 채점 표(입력방식 토글 + 후보×배점기준 매트릭스 + 종합의견 + 저장/제출 버튼).
 *
 * TextbookEvaluate.jsx(위원 본인 채점)와 TextbookDetail.jsx의 외부 위원 대리채점 다이얼로그가
 * 공유한다 — 위원이 시스템 계정으로 직접 쓰든, 대표교사가 대리로 옮겨 적든 채점 UI 자체는
 * 동일하기 때문. ready가 true로 바뀌는 시점(최초 데이터 로드 완료)에만 로컬 상태를 초기화하고,
 * 이후 편집 중에는 다시 덮어쓰지 않는다.
 */
export default function ScoreEntryForm({
  adoption, ready, initialByCandidate, initialOpinion, canEdit, saving, onSave, onPrint,
}) {
  const [mode, setMode] = useState('quick')
  const [edits, setEdits] = useState({})
  const [opinion, setOpinion] = useState('')
  const [initialized, setInitialized] = useState(false)

  const candidates = adoption?.candidates || []
  const rubric = adoption?.rubric || []
  const maxSum = useMemo(() => rubricMax(rubric), [rubric])

  useEffect(() => {
    if (!ready || initialized) return
    setEdits(toEditState(initialByCandidate, candidates))
    setOpinion(initialOpinion || '')
    setInitialized(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])

  const totalFor = useCallback((candidateId) => sumCriteria(edits[candidateId]), [edits])

  const handleQuickTotalChange = (candidateId, value) => {
    const total = Math.max(0, Math.min(Number(value) || 0, maxSum))
    setEdits((prev) => ({ ...prev, [candidateId]: distributeScore(total, rubric) }))
  }

  const handleCriterionChange = (candidateId, criterionName, value, max) => {
    const v = Math.max(0, Math.min(Number(value) || 0, max))
    setEdits((prev) => ({ ...prev, [candidateId]: { ...prev[candidateId], [criterionName]: v } }))
  }

  const buildByCandidate = () => {
    const byCandidate = {}
    candidates.forEach((c) => {
      const byCriterion = edits[c.id] || {}
      byCandidate[c.id] = { byCriterion, total: sumCriteria(byCriterion) }
    })
    return byCandidate
  }

  const handleSave = (submit) => onSave(buildByCandidate(), opinion, submit)

  return (
    <Box>
      <TextbookSection
        title="입력 방식"
        right={
          <ToggleButtonGroup size="small" exclusive value={mode} onChange={(_, v) => v && setMode(v)} disabled={!canEdit}>
            <ToggleButton value="quick" sx={{ textTransform: 'none', fontSize: '0.78rem', px: 1.5 }}>총점만 입력</ToggleButton>
            <ToggleButton value="detail" sx={{ textTransform: 'none', fontSize: '0.78rem', px: 1.5 }}>항목별 입력</ToggleButton>
          </ToggleButtonGroup>
        }
      >
        <Typography sx={{ fontSize: '0.82rem', color: '#64748b' }}>
          {mode === 'quick'
            ? '후보별 총점만 입력하면 배점 비율대로 세부 항목에 자동 배분됩니다.'
            : '항목별로 직접 점수를 입력합니다. 합계는 자동으로 계산됩니다.'}
        </Typography>
      </TextbookSection>

      <Box sx={{ overflowX: 'auto', borderRadius: '14px', border: '1px solid #e2e8f0', bgcolor: '#fff' }}>
        <Table size="small">
          <TableHead sx={{ '& th': { bgcolor: '#f8fafc', color: '#475569', fontWeight: 700, fontSize: '0.74rem', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' } }}>
            <TableRow>
              <TableCell>출판사 / 저자</TableCell>
              {mode === 'detail'
                ? rubric.map((r) => <TableCell key={r.name} align="center">{r.name}<br />({r.maxScore}점)</TableCell>)
                : <TableCell align="center">총점 (~{maxSum}점)</TableCell>}
              <TableCell align="center">합계</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {candidates.map((c) => (
              <TableRow key={c.id} sx={{ '& td': { borderBottom: '1px solid #f1f5f9' } }}>
                <TableCell>
                  <Typography sx={{ fontWeight: 700, fontSize: '0.86rem', color: '#1e293b' }}>{c.publisher}</Typography>
                  {c.author && <Typography sx={{ fontSize: '0.76rem', color: '#94a3b8' }}>{c.author}</Typography>}
                </TableCell>
                {mode === 'detail' ? (
                  rubric.map((r) => (
                    <TableCell key={r.name} align="center">
                      <TextField
                        type="number" size="small" disabled={!canEdit}
                        value={edits[c.id]?.[r.name] ?? 0}
                        onChange={(e) => handleCriterionChange(c.id, r.name, e.target.value, r.maxScore)}
                        inputProps={{ min: 0, max: r.maxScore, style: { width: 56, textAlign: 'center' } }}
                      />
                    </TableCell>
                  ))
                ) : (
                  <TableCell align="center">
                    <TextField
                      type="number" size="small" disabled={!canEdit}
                      value={totalFor(c.id)}
                      onChange={(e) => handleQuickTotalChange(c.id, e.target.value)}
                      inputProps={{ min: 0, max: maxSum, style: { width: 72, textAlign: 'center' } }}
                    />
                  </TableCell>
                )}
                <TableCell align="center">
                  <Chip size="small" label={`${totalFor(c.id)}점`} sx={{ bgcolor: ACCENT_BG, color: ACCENT, fontWeight: 700 }} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>

      <TextbookSection title="종합의견 및 추천의견">
        <TextField
          fullWidth multiline minRows={3} disabled={!canEdit}
          placeholder="후보 교과서 전반에 대한 종합의견과 추천의견을 입력하세요."
          value={opinion}
          onChange={(e) => setOpinion(e.target.value)}
        />
      </TextbookSection>

      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mt: 2.5 }}>
        {onPrint && (
          <Button
            variant="outlined" startIcon={<PrintOutlinedIcon />} onClick={() => onPrint(buildByCandidate(), opinion)}
            sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 700, borderColor: '#e2e8f0', color: '#475569' }}
          >
            평가표 인쇄
          </Button>
        )}
        {canEdit && (
          <>
            <Button variant="outlined" disabled={saving} onClick={() => handleSave(false)} sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 700 }}>
              임시저장
            </Button>
            <Button
              variant="contained" disabled={saving} onClick={() => handleSave(true)}
              sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 700, bgcolor: ACCENT, boxShadow: 'none', '&:hover': { bgcolor: '#0d5f59', boxShadow: 'none' } }}
            >
              제출 확정
            </Button>
          </>
        )}
      </Box>
    </Box>
  )
}
