import { useState } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import { GRADES, MIN_WEEKDAY_DAYS, SCHOOL_WEEKDAYS, shortLabel } from '@shared/lib/academicPlan'

const DETAIL_ROWS = [
  { key: 'schoolDays', label: '수업' },
  { key: 'actual', label: '실', warn: true },
  { key: 'exams', label: '고사' },
  { key: 'fullDays', label: '전일' },
  { key: 'noProgress', label: '진도×' },
]
// 기본 표: 수업·실수업 / 시험 사이 표: 개학~중간·중간~기말(둘 다 실수업일 기준)
const MAIN_PAIR = [{ key: 'schoolDays', label: '수업', muted: true }, { key: 'actual', label: '실', warn: true, strong: true }]
const EXAM_PAIR = [{ key: 'beforeMid', label: '개학~중간' }, { key: 'between', label: '중간~기말' }]
const DETAIL_KEY = 'academicPlan.statsDetail'

const LINE = '#cbd5e1'
const th = { border: `1px solid ${LINE}`, bgcolor: '#e2e8f0', px: 0.5, py: 0.4, fontSize: '0.72rem', fontWeight: 800, textAlign: 'center', whiteSpace: 'nowrap', color: '#1e293b' }
const td = { border: `1px solid ${LINE}`, px: 0.5, py: 0.35, fontSize: '0.8rem', textAlign: 'center', bgcolor: '#fff' }
const LOW = { bgcolor: '#fee2e2', color: '#b91c1c', fontWeight: 800 }

const isLow = (sem, s, v) => sem !== 'year' && v < MIN_WEEKDAY_DAYS && s.total.schoolDays > 0

/** 요일 × 학년(두 값씩) — 좁은 왼쪽 패널용 세로 표. withActivities면 학년 머리글에 자율·동아리 시수 */
function CompactTable({ stats, sem, pair = MAIN_PAIR, withActivities = true }) {
  return (
    <Box component="table" sx={{ borderCollapse: 'collapse', width: '100%' }}>
      <thead>
        <tr>
          <Box component="th" sx={th} rowSpan={2}>요일</Box>
          {GRADES.map((g) => {
            const a = stats.grades[g][sem].activities
            return (
              <Box component="th" key={g} sx={th} colSpan={2}>
                {g}학년
                {withActivities && <Box sx={{ fontSize: '0.64rem', fontWeight: 600, color: '#475569' }}>자{a.자율}·동{a.동아리}</Box>}
              </Box>
            )
          })}
        </tr>
        <tr>
          {GRADES.map((g) => pair.map((c) => (
            <Box component="th" key={`${g}${c.key}`} sx={{ ...th, fontWeight: 700, whiteSpace: 'normal', fontSize: c.label.length > 2 ? '0.6rem' : th.fontSize, lineHeight: 1.15 }}>{c.label}</Box>
          )))}
        </tr>
      </thead>
      <tbody>
        {[...SCHOOL_WEEKDAYS, '계'].map((w, i) => {
          const total = i === SCHOOL_WEEKDAYS.length
          return (
            <tr key={w}>
              <Box component="th" sx={th}>{w}</Box>
              {GRADES.map((g) => {
                const s = stats.grades[g][sem]
                const t = total ? { fontWeight: 800, bgcolor: '#f1f5f9' } : {}
                return pair.map((c) => {
                  const v = total ? s.total[c.key] : s[c.key][i]
                  return (
                    <Box component="td" key={`${g}${c.key}`}
                      sx={{ ...td, ...t, ...(c.muted ? { color: '#475569' } : {}), ...(c.strong ? { fontWeight: 800 } : {}), ...(!total && c.warn && isLow(sem, s, v) ? LOW : {}) }}>
                      {v}
                    </Box>
                  )
                })
              })}
            </tr>
          )
        })}
      </tbody>
    </Box>
  )
}

/** 한 학년의 요일 × (수업·실·고사·전일·중간-기말) */
function DetailTable({ stats, sem, grade }) {
  const s = stats.grades[grade][sem]
  return (
    <Box component="table" sx={{ borderCollapse: 'collapse', width: '100%' }}>
      <thead>
        <tr>
          <Box component="th" sx={th}>요일</Box>
          {DETAIL_ROWS.map((r) => <Box component="th" key={r.key} sx={th}>{r.label}</Box>)}
        </tr>
      </thead>
      <tbody>
        {[...SCHOOL_WEEKDAYS, '계'].map((w, i) => {
          const total = i === SCHOOL_WEEKDAYS.length
          return (
            <tr key={w}>
              <Box component="th" sx={th}>{w}</Box>
              {DETAIL_ROWS.map((r) => {
                const v = total ? s.total[r.key] : s[r.key][i]
                return (
                  <Box component="td" key={r.key}
                    sx={{ ...td, ...(total ? { fontWeight: 800, bgcolor: '#f1f5f9' } : {}), ...(!total && r.warn && isLow(sem, s, v) ? LOW : {}) }}>
                    {v}
                  </Box>
                )
              })}
            </tr>
          )
        })}
      </tbody>
    </Box>
  )
}

function rangeText(r) {
  if (!r) return '개학일 미등록'
  if (!r.end) return `${shortLabel(r.start)} ~ (끝 미등록)`
  return `${shortLabel(r.start)} ~ ${shortLabel(r.end)}`
}

/**
 * 학년별·요일별 수업일수 — 편집 화면 왼쪽 고정 패널. semester: 1 | 2 | null(전체 — 두 학기 + 연간)
 * 평소에는 수업·실수업일수만, '자세히'를 켜면 학년 하나를 골라 정기고사·전일행사·중간-기말까지.
 */
export default function PlanStatsPanel({ stats, semester }) {
  const sems = semester ? [semester] : [1, 2, 'year']
  const warns = stats.warnings.filter((w) => !semester || w.semester === semester)
  const ranges = GRADES.map((g) => stats.grades[g].ranges)
  const sameRanges = ranges.every((r) => JSON.stringify(r) === JSON.stringify(ranges[0]))
  // 자세히 펼친 상태는 이 브라우저에 기억
  const [detail, setDetail] = useState(() => { try { return localStorage.getItem(DETAIL_KEY) === '1' } catch { return false } })
  const [grade, setGrade] = useState(1)
  const toggleDetail = () => setDetail((d) => {
    try { localStorage.setItem(DETAIL_KEY, d ? '0' : '1') } catch { /* 저장 못 해도 화면은 그대로 */ }
    return !d
  })

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {warns.length > 0 && (
        <Alert severity="warning" sx={{ py: 0, px: 1, fontSize: '0.78rem', '& .MuiAlert-icon': { mr: 0.75 } }}>
          실수업일 {MIN_WEEKDAY_DAYS}회 미만 —{' '}
          {warns.map((w) => `${w.semester}학기 ${w.grade}학년 ${SCHOOL_WEEKDAYS[w.weekday]}(${w.actual})`).join(', ')}
        </Alert>
      )}
      {sems.map((sem) => (
        <Box key={sem}>
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 0.5, flexWrap: 'wrap' }}>
            <Typography sx={{ fontWeight: 800, fontSize: '0.92rem' }}>{sem === 'year' ? '연간 합계' : `${sem}학기`}</Typography>
            {sem !== 'year' && (
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {sameRanges
                  ? rangeText(ranges[0][sem])
                  : GRADES.map((g, i) => `${g}학년 ${rangeText(ranges[i][sem])}`).join(' / ')}
              </Typography>
            )}
          </Box>
          <CompactTable stats={stats} sem={sem} />
          {sem !== 'year' && (
            <Box sx={{ mt: 0.75 }}>
              <Typography sx={{ fontSize: '0.74rem', fontWeight: 800, color: '#334155', mb: 0.25 }}>시험 사이 진도 나가는 날</Typography>
              <CompactTable stats={stats} sem={sem} pair={EXAM_PAIR} withActivities={false} />
            </Box>
          )}
          {detail && (
            <Box sx={{ mt: 0.75 }}>
              <DetailTable stats={stats} sem={sem} grade={grade} />
            </Box>
          )}
        </Box>
      ))}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Button size="small" onClick={toggleDetail} sx={{ px: 0.5 }}>
          {detail ? '정기고사·전일행사·진도 없는 날 접기' : '정기고사·전일행사·진도 없는 날 보기'}
        </Button>
        {detail && (
          <ToggleButtonGroup size="small" exclusive value={grade} onChange={(_, v) => v && setGrade(v)}>
            {GRADES.map((g) => <ToggleButton key={g} value={g} sx={{ py: 0.1, px: 1 }}>{g}학년</ToggleButton>)}
          </ToggleButtonGroup>
        )}
      </Box>
      <Typography variant="caption" sx={{ color: 'text.secondary', lineHeight: 1.5 }}>
        실 = 실수업일수 = 수업일수 − (정기고사 + 전일행사). 개학~중간 = 개학 ~ 첫 중간고사 전날, 중간~기말 = 마지막 중간고사 다음 날 ~ 첫 기말고사 전날의
        실제로 진도 나가는 날(실수업일에서 학력평가·모의고사 등 진도× 일정이 있는 날을 뺌 — 출결상 수업일로는 인정).
        자·동 = 자율·동아리 시수(시간). 토·일요일 행사는 수업일에 넣지 않습니다.
      </Typography>
    </Box>
  )
}
