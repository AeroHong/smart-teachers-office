import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Popover from '@mui/material/Popover'
import Typography from '@mui/material/Typography'
import FilterListIcon from '@mui/icons-material/FilterList'
import { GRADES, appliesTo } from '@shared/lib/academicPlan'
import { DEPT_PALETTE, KIND_STYLE } from './planUi'

/** 유형 묶음 — 화면에서 고르기 쉽게 비슷한 유형을 합쳤다. flag는 유형과 별개로 일정 속성으로 거른다 */
export const FILTER_GROUPS = [
  { key: '일반', label: '일반', kinds: ['일반'] },
  { key: '학사', label: '개학·방학·종업·졸업', kinds: ['개학', '방학식', '종업식', '졸업식'] },
  { key: '정기고사', label: '정기고사', kinds: ['정기고사'] },
  { key: '휴업', label: '재량휴업·공휴일', kinds: ['재량휴업', '공휴일'] },
  { key: '요일교체', label: '요일 교체', kinds: ['요일교체'] },
]
const FLAGS = [
  { key: 'fullDay', label: '전일행사', test: (ev) => Boolean(ev.fullDay) },
  { key: 'hours', label: '자율·동아리 시수', test: (ev) => (ev.activities || []).some((a) => Number(a.hours) > 0) },
]

export const EMPTY_FILTER = { groups: [], flags: [], depts: [], grades: [] }
export const filterActive = (f) => Boolean(f.groups.length || f.flags.length || f.depts.length || f.grades.length)

/**
 * 고른 조건의 일정만 남기는 함수. 같은 칸 안의 조건은 '또는', 칸끼리는 '그리고'.
 * 학년은 그 학년이 대상인 일정(전 학년 일정 포함).
 */
export function makeEventFilter(f) {
  if (!filterActive(f)) return null
  const kinds = new Set(FILTER_GROUPS.filter((g) => f.groups.includes(g.key)).flatMap((g) => g.kinds))
  const flags = FLAGS.filter((x) => f.flags.includes(x.key))
  return (ev) => (!kinds.size || kinds.has(ev.kind || '일반'))
    && (!flags.length || flags.some((x) => x.test(ev)))
    && (!f.depts.length || f.depts.includes(ev.dept || '(부서 없음)'))
    && (!f.grades.length || f.grades.some((g) => appliesTo(ev, g)))
}

function Toggle({ on, label, onClick, color }) {
  return (
    <Chip size="small" label={label} onClick={onClick} variant={on ? 'filled' : 'outlined'}
      sx={{
        fontWeight: 700,
        ...(on ? { bgcolor: color?.bg || '#ccfbf1', color: color?.fg || '#134e4a', border: `1px solid ${color?.bd || '#14b8a6'}` } : {}),
      }} />
  )
}

/** 탭 줄의 '보기' 필터 — 버튼을 누르면 조건 고르기, 켜진 조건은 버튼 옆에 요약 */
export default function PlanFilter({ value, onChange, departments, deptColors, hiddenCount }) {
  const [anchor, setAnchor] = useState(null)
  const toggle = (field, key) => onChange({
    ...value, [field]: value[field].includes(key) ? value[field].filter((x) => x !== key) : [...value[field], key],
  })
  const active = filterActive(value)
  const summary = [
    ...FILTER_GROUPS.filter((g) => value.groups.includes(g.key)).map((g) => g.label),
    ...FLAGS.filter((x) => value.flags.includes(x.key)).map((x) => x.label),
    ...value.depts,
    ...value.grades.map((g) => `${g}학년`),
  ]

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
      <Button size="small" startIcon={<FilterListIcon />} onClick={(e) => setAnchor(e.currentTarget)}
        variant={active ? 'contained' : 'text'} disableElevation sx={active ? { bgcolor: '#0f766e' } : undefined}>
        보기 필터
      </Button>
      {active && (
        <>
          <Typography variant="caption" sx={{ color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 360 }}>
            {summary.join(' · ')} — {hiddenCount}건 숨김
          </Typography>
          <Button size="small" onClick={() => onChange(EMPTY_FILTER)} sx={{ minWidth: 0 }}>모두 보기</Button>
        </>
      )}
      <Popover open={Boolean(anchor)} anchorEl={anchor} onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}>
        <Box sx={{ p: 1.5, width: 380, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
          <Box>
            <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary' }}>유형</Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
              {FILTER_GROUPS.map((g) => (
                <Toggle key={g.key} on={value.groups.includes(g.key)} label={g.label} color={KIND_STYLE[g.kinds[0]]} onClick={() => toggle('groups', g.key)} />
              ))}
              {FLAGS.map((x) => <Toggle key={x.key} on={value.flags.includes(x.key)} label={x.label} onClick={() => toggle('flags', x.key)} />)}
            </Box>
          </Box>
          <Box>
            <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary' }}>대상 학년</Typography>
            <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
              {GRADES.map((g) => <Toggle key={g} on={value.grades.includes(g)} label={`${g}학년`} onClick={() => toggle('grades', g)} />)}
            </Box>
          </Box>
          <Box>
            <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary' }}>관련 부서</Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5, maxHeight: 180, overflowY: 'auto' }}>
              {[...departments, '(부서 없음)'].map((d) => (
                <Toggle key={d} on={value.depts.includes(d)} label={d} color={DEPT_PALETTE[deptColors?.[d]]} onClick={() => toggle('depts', d)} />
              ))}
            </Box>
          </Box>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            같은 줄 안에서는 '또는', 줄끼리는 '그리고'로 거릅니다. 수업일수 계산은 필터와 상관없이 전체 일정 기준입니다.
          </Typography>
        </Box>
      </Popover>
    </Box>
  )
}
