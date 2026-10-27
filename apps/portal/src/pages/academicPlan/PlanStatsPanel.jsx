import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Alert from '@mui/material/Alert'
import { GRADES, MIN_WEEKDAY_DAYS, SCHOOL_WEEKDAYS, shortLabel } from '@shared/lib/academicPlan'

const ROWS = [
  { key: 'schoolDays', label: '수업일수' },
  { key: 'actual', label: '실수업일수', warn: true },
  { key: 'exams', label: '정기고사일수' },
  { key: 'fullDays', label: '전일행사일수' },
  { key: 'between', label: '중간-기말 사이' },
]

const th = { border: '1px solid #e2e8f0', bgcolor: '#f8fafc', px: 0.75, py: 0.5, fontSize: '0.75rem', fontWeight: 700, textAlign: 'center', whiteSpace: 'nowrap' }
const td = { border: '1px solid #e2e8f0', px: 0.75, py: 0.5, fontSize: '0.8rem', textAlign: 'center' }

/** 한 학기(또는 연간) 학년 × 요일 표. sem: 1 | 2 | 'year' */
function SemesterTable({ stats, sem }) {
  return (
    <Box component="table" sx={{ borderCollapse: 'collapse', width: '100%' }}>
      <thead>
        <tr>
          <Box component="th" sx={th} rowSpan={2}>구분</Box>
          {GRADES.map((g) => <Box component="th" key={g} sx={th} colSpan={6}>{g}학년</Box>)}
        </tr>
        <tr>
          {GRADES.map((g) => [...SCHOOL_WEEKDAYS, '계'].map((w) => <Box component="th" key={`${g}${w}`} sx={{ ...th, fontWeight: 600 }}>{w}</Box>))}
        </tr>
      </thead>
      <tbody>
        {ROWS.map((r) => (
          <tr key={r.key}>
            <Box component="th" sx={{ ...th, textAlign: 'left' }}>{r.label}</Box>
            {GRADES.map((g) => {
              const s = stats.grades[g][sem]
              return [...s[r.key].map((v, i) => {
                const low = r.warn && sem !== 'year' && v < MIN_WEEKDAY_DAYS && s.total.schoolDays > 0
                return (
                  <Box component="td" key={`${g}${i}`} sx={{ ...td, ...(low ? { bgcolor: '#fee2e2', color: '#b91c1c', fontWeight: 800 } : {}) }}>
                    {v}
                  </Box>
                )
              }), <Box component="td" key={`${g}t`} sx={{ ...td, fontWeight: 700, bgcolor: '#f8fafc' }}>{s.total[r.key]}</Box>]
            })}
          </tr>
        ))}
        <tr>
          <Box component="th" sx={{ ...th, textAlign: 'left' }}>자율 / 동아리</Box>
          {GRADES.map((g) => {
            const a = stats.grades[g][sem].activities
            return (
              <Box component="td" key={g} sx={td} colSpan={6}>
                자율 {a.자율}h · 동아리 {a.동아리}h · <b>계 {a.자율 + a.동아리}h</b>
              </Box>
            )
          })}
        </tr>
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
 * 학년별·요일별 수업일수 표. semester: 1 | 2 | null(전체 — 두 학기 + 연간)
 */
export default function PlanStatsPanel({ stats, semester }) {
  const sems = semester ? [semester] : [1, 2, 'year']
  const warns = stats.warnings.filter((w) => !semester || w.semester === semester)
  const ranges = GRADES.map((g) => stats.grades[g].ranges)
  const sameRanges = ranges.every((r) => JSON.stringify(r) === JSON.stringify(ranges[0]))
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {warns.length > 0 && (
        <Alert severity="warning">
          요일별 실수업일이 {MIN_WEEKDAY_DAYS}회 미만입니다 —{' '}
          {warns.map((w) => `${w.semester}학기 ${w.grade}학년 ${SCHOOL_WEEKDAYS[w.weekday]}(${w.actual})`).join(', ')}
        </Alert>
      )}
      {sems.map((sem) => (
        <Box key={sem}>
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5, mb: 0.75, flexWrap: 'wrap' }}>
            <Typography sx={{ fontWeight: 800 }}>{sem === 'year' ? '연간 합계' : `${sem}학기`}</Typography>
            {sem !== 'year' && (
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {sameRanges
                  ? rangeText(ranges[0][sem])
                  : GRADES.map((g, i) => `${g}학년 ${rangeText(ranges[i][sem])}`).join(' / ')}
              </Typography>
            )}
          </Box>
          <Box sx={{ overflowX: 'auto' }}><SemesterTable stats={stats} sem={sem} /></Box>
        </Box>
      ))}
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        실수업일수 = 수업일수 − (정기고사일수 + 전일행사일수). 중간-기말 사이는 마지막 중간고사 다음 날부터 첫 기말고사 전날까지의 실수업일수입니다.
        토·일요일 행사는 수업일에 넣지 않습니다.
      </Typography>
    </Box>
  )
}
