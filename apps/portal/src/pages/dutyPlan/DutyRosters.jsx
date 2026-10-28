import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { headRoster, homeroomSlots, nameWithSubject as withSubject } from '@shared/lib/dutyPlan'
import { ACCENT } from './dutyUi'

const th = { border: '1px solid #cbd5e1', bgcolor: '#f1f5f9', px: 1, py: 0.6, fontWeight: 800, fontSize: '0.85rem', textAlign: 'center' }
const td = { border: '1px solid #cbd5e1', px: 1, py: 0.6, fontSize: '0.85rem', textAlign: 'center' }

/**
 * 부장교사 · 담임/부담임 · 교과부장 명단(원본 hwpx 둘째 절과 같은 세 표).
 */
export default function DutyRosters({ data, classCounts, specialClasses }) {
  const heads = headRoster(data)
  const slots = homeroomSlots(data, classCounts || {}, specialClasses || {})
  const byGrade = [1, 2, 3].map((g) => slots.filter((s) => s.grade === g))
  const maxRows = Math.max(0, ...byGrade.map((l) => l.length))
  const Title = ({ children }) => <Typography sx={{ fontWeight: 800, color: ACCENT, mb: 0.75 }}>{children}</Typography>

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, overflowX: 'auto' }}>
      <Box>
        <Title>1. 부장교사</Title>
        <Box component="table" sx={{ borderCollapse: 'collapse', minWidth: 420 }}>
          <thead><tr><Box component="th" sx={th}>부서</Box><Box component="th" sx={th}>부장</Box><Box component="th" sx={th}>과목</Box><Box component="th" sx={th}>비고</Box></tr></thead>
          <tbody>
            {heads.map((h) => (
              <tr key={h.dept}><Box component="td" sx={td}>{h.dept}</Box><Box component="td" sx={{ ...td, fontWeight: 700 }}>{h.name}</Box><Box component="td" sx={td}>{h.subject}</Box><Box component="td" sx={{ ...td, textAlign: 'left' }}>{h.note}</Box></tr>
            ))}
          </tbody>
        </Box>
      </Box>

      <Box>
        <Title>2. 담임 · 부담임</Title>
        {maxRows === 0 ? <Typography variant="body2" sx={{ color: 'text.secondary' }}>담임 배치가 없습니다.</Typography> : (
          <Box component="table" sx={{ borderCollapse: 'collapse', minWidth: 720 }}>
            <thead>
              <tr>{[1, 2, 3].map((g) => <Box key={g} component="th" colSpan={3} sx={th}>{g}학년</Box>)}</tr>
              <tr>{[1, 2, 3].flatMap((g) => ['반', '담임(과목)', '부담임'].map((h) => <Box key={`${g}${h}`} component="th" sx={th}>{h}</Box>))}</tr>
            </thead>
            <tbody>
              {Array.from({ length: maxRows }, (_, i) => (
                <tr key={i}>
                  {byGrade.flatMap((list, gi) => {
                    const s = list[i]
                    if (!s) return [<Box key={`${gi}a`} component="td" sx={td} />, <Box key={`${gi}b`} component="td" sx={td} />, <Box key={`${gi}c`} component="td" sx={td} />]
                    if (s.classNo === '특수') {
                      return [
                        <Box key={`${gi}a`} component="td" sx={td}>특수</Box>,
                        <Box key={`${gi}b`} component="td" colSpan={2} sx={td}>{s.homeroomName || ''}</Box>,
                      ]
                    }
                    return [
                      <Box key={`${gi}a`} component="td" sx={td}>{s.classNo}</Box>,
                      <Box key={`${gi}b`} component="td" sx={{ ...td, fontWeight: 700 }}>{withSubject(data, s.homeroomUid, s.homeroomName)}</Box>,
                      <Box key={`${gi}c`} component="td" sx={td}>{withSubject(data, s.subHomeroomUid, s.subHomeroomName)}</Box>,
                    ]
                  })}
                </tr>
              ))}
            </tbody>
          </Box>
        )}
      </Box>

      <Box>
        <Title>3. 교과부장</Title>
        <Box component="table" sx={{ borderCollapse: 'collapse', minWidth: 420 }}>
          <thead><tr><Box component="th" sx={th}>교과</Box><Box component="th" sx={th}>부장</Box><Box component="th" sx={th}>비고</Box></tr></thead>
          <tbody>
            {(data.subjectHeads || []).map((s) => (
              <tr key={s.group}><Box component="td" sx={td}>{s.group}</Box><Box component="td" sx={{ ...td, fontWeight: 700 }}>{s.name}</Box><Box component="td" sx={{ ...td, textAlign: 'left' }}>{s.note}</Box></tr>
            ))}
            {!(data.subjectHeads || []).length && <tr><Box component="td" colSpan={3} sx={{ ...td, color: '#94a3b8' }}>없음</Box></tr>}
          </tbody>
        </Box>
      </Box>
    </Box>
  )
}
