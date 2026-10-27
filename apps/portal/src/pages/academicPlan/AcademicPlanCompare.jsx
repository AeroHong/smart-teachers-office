import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import Button from '@mui/material/Button'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import { useAuth } from '@shared/contexts/AuthContext'
import {
  GRADES, MIN_WEEKDAY_DAYS, SCHOOL_WEEKDAYS, computeStats, describeDiff, diffEvents,
} from '@shared/lib/academicPlan'
import { currentYearSemester } from '@shared/lib/schema'
import Layout from '../../components/Layout'
import { subscribePlans } from './planRepo'

const th = { border: '1px solid #e2e8f0', bgcolor: '#f8fafc', px: 0.75, py: 0.5, fontSize: '0.75rem', fontWeight: 700, textAlign: 'center' }
const td = { border: '1px solid #e2e8f0', px: 0.75, py: 0.5, fontSize: '0.8rem', textAlign: 'center', whiteSpace: 'nowrap' }

const ROWS = [['schoolDays', '수업일'], ['actual', '실수업일'], ['exams', '정기고사'], ['fullDays', '전일행사'], ['beforeMid', '개학-중간'], ['between', '중간-기말']]

/** A → B 값. 다르면 'a → b'로 강조 */
function Cell({ a, b, warn }) {
  const low = warn && b < MIN_WEEKDAY_DAYS
  if (a === b) return <Box component="td" sx={{ ...td, ...(low ? { color: '#b91c1c', fontWeight: 800 } : {}) }}>{b}</Box>
  return (
    <Box component="td" sx={{ ...td, bgcolor: '#fef9c3', fontWeight: 700, color: low ? '#b91c1c' : 'inherit' }}>
      {a}→{b}
    </Box>
  )
}

/**
 * 초안 비교 — 두 초안의 학년×요일 수업일수를 한 표에(다른 칸은 'A→B'로 노랗게), 그 아래 달라진 일정 목록.
 * 복제한 초안은 일정 id를 그대로 물려받아서 어느 일정을 옮겼는지까지 짚을 수 있다.
 */
export default function AcademicPlanCompare() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { schoolId } = useAuth()
  const year = Number(params.get('year')) || currentYearSemester().year
  const [plans, setPlans] = useState([])

  useEffect(() => {
    if (!schoolId) return
    return subscribePlans(schoolId, year, setPlans)
  }, [schoolId, year])

  const aId = params.get('a') || plans[0]?.id || ''
  const bId = params.get('b') || plans.find((p) => p.id !== aId)?.id || ''
  const A = plans.find((p) => p.id === aId)
  const B = plans.find((p) => p.id === bId)
  const sa = useMemo(() => (A ? computeStats(A) : null), [A])
  const sb = useMemo(() => (B ? computeStats(B) : null), [B])
  const lines = useMemo(() => (A && B ? describeDiff(diffEvents(A.events, B.events)) : []), [A, B])
  const pick = (key, id) => setParams({ year, a: aId, b: bId, [key]: id })

  return (
    <Layout wide>
      <Box sx={{ p: { xs: 1.5, md: 3 }, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <Button startIcon={<ArrowBackIcon />} size="small" onClick={() => navigate(`/academic-plan?year=${year}`)}>목록</Button>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>{year}학년도 초안 비교</Typography>
          <TextField select size="small" label="기준 (A)" value={aId} onChange={(e) => pick('a', e.target.value)} sx={{ minWidth: 160 }}>
            {plans.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}{p.status === 'confirmed' ? ' (확정)' : ''}</MenuItem>)}
          </TextField>
          <Typography>→</Typography>
          <TextField select size="small" label="비교 (B)" value={bId} onChange={(e) => pick('b', e.target.value)} sx={{ minWidth: 160 }}>
            {plans.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}{p.status === 'confirmed' ? ' (확정)' : ''}</MenuItem>)}
          </TextField>
        </Box>

        {!(A && B) ? (
          <Typography sx={{ color: 'text.secondary' }}>비교할 초안 두 개를 고르세요.</Typography>
        ) : (
          <>
            {[1, 2].map((sem) => (
              <Box key={sem} sx={{ overflowX: 'auto' }}>
                <Typography sx={{ fontWeight: 800, mb: 0.75 }}>{sem}학기 <Typography component="span" variant="caption" sx={{ color: 'text.secondary' }}>— 다른 칸은 A→B</Typography></Typography>
                <Box component="table" sx={{ borderCollapse: 'collapse', minWidth: 900 }}>
                  <thead>
                    <tr>
                      <Box component="th" sx={th} rowSpan={2}>구분</Box>
                      {GRADES.map((g) => <Box component="th" key={g} sx={th} colSpan={6}>{g}학년</Box>)}
                    </tr>
                    <tr>{GRADES.map((g) => [...SCHOOL_WEEKDAYS, '계'].map((w) => <Box component="th" key={`${g}${w}`} sx={th}>{w}</Box>))}</tr>
                  </thead>
                  <tbody>
                    {ROWS.map(([key, label]) => (
                      <tr key={key}>
                        <Box component="th" sx={{ ...th, textAlign: 'left' }}>{label}</Box>
                        {GRADES.map((g) => {
                          const x = sa.grades[g][sem]
                          const y = sb.grades[g][sem]
                          return [
                            ...x[key].map((v, i) => <Cell key={`${g}${i}`} a={v} b={y[key][i]} warn={key === 'actual' && y.total.schoolDays > 0} />),
                            <Cell key={`${g}t`} a={x.total[key]} b={y.total[key]} />,
                          ]
                        })}
                      </tr>
                    ))}
                  </tbody>
                </Box>
              </Box>
            ))}
            <Box>
              <Typography sx={{ fontWeight: 800, mb: 0.75 }}>달라진 일정 {lines.length}건</Typography>
              {lines.length === 0
                ? <Typography variant="body2" sx={{ color: 'text.secondary' }}>일정이 같습니다.</Typography>
                : <Box component="ul" sx={{ m: 0, pl: 2.5 }}>{lines.map((l, i) => <li key={i}><Typography variant="body2">{l}</Typography></li>)}</Box>}
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                복제로 만든 초안끼리는 같은 일정을 '이동'으로 짚고, 따로 입력한 일정은 '추가·삭제'로 보입니다.
              </Typography>
            </Box>
          </>
        )}
      </Box>
    </Layout>
  )
}
