// 세특 점검 결과를 보여주는 화면들(학급별 목록 SetukUpload, 과목별 보기 SetukBySubject,
// 학급별 상세 SetukCheckDetail, 과목별 담당 교사 SetukTeacherAssignments)이 공통으로
// 쓰는 표시 조각 — 중복 구현을 피하려고 분리했다.
import { useState, useEffect, useRef } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import { useCurrentTerm } from '@shared/hooks/useCurrentTerm'
import { currentSchoolYear } from '@shared/lib/schema'
import { backfillCheckTerm } from '@shared/lib/setukCheck'

export const SEVERITY_COLORS = { ERROR: 'error', WARNING: 'warning', INFO: 'info' }

// 평가운영계획 제출 도구(EvalPlanManagerDashboard)에서 쓰던 것과 같은 학년도 선택 범위.
export const SETUK_YEAR_OPTIONS = [currentSchoolYear() - 1, currentSchoolYear(), currentSchoolYear() + 1]

/**
 * "학급별 목록"·"과목별 보기"·"과목별 담당 교사" 세 화면이 함께 쓰는 학년도-학기 필터
 * 상태 — 관리자 페이지 > 홈에서 지정한 기준을 초기값으로 쓰고, 이후 사용자가 직접
 * 바꾸면 그 선택을 유지한다(평가운영계획 제출 도구와 같은 패턴).
 */
export function useSetukTermFilter(schoolId) {
  const currentTerm = useCurrentTerm(schoolId)
  const [year, setYear] = useState(currentTerm.year)
  const [semester, setSemester] = useState(currentTerm.semester)
  const [termApplied, setTermApplied] = useState(false)
  useEffect(() => {
    if (termApplied || !currentTerm.loaded) return
    setYear(currentTerm.year)
    setSemester(currentTerm.semester)
    setTermApplied(true)
  }, [currentTerm, termApplied])
  return { year, setYear, semester, setSemester }
}

/**
 * year/semester 필드가 생기기 전(2026-09-04 이전)에 업로드된 건은 이 필드가 없다 —
 * 실제로 어느 학기 것인지 알 방법이 없는 옛 데이터를 섣불리 추정해서 걸러내지 않고
 * 어떤 학년도·학기를 선택해도 계속 보이게 통과시킨다(값이 있는 건만 실제로 걸러짐).
 */
export function filterChecksByTerm(checks, year, semester) {
  return checks.filter((c) => (c.year == null || c.year === year) && (c.semester == null || c.semester === semester))
}

/**
 * year/semester가 없는 옛 업로드 건을 만나면 그 건의 records에서 학기를 한 번 읽어와
 * 채워 넣는 지연 마이그레이션(setukCheck.backfillCheckTerm). 관리자가 이 필터를 쓰는
 * 화면 중 아무 곳이나 열 때 한 번씩 시도한다 — onSnapshot이 갱신된 값을 다시 쏴주므로
 * 필터가 그 자리에서 바로 반영된다. 화면마다 각자 이 훅을 부르며, ref로 세션 내
 * 중복 시도만 막는다(전체 마이그레이션 이력을 서버에 두지 않아도 될 만큼 건수가
 * 적어 이 정도로 충분하다).
 */
export function useSetukTermBackfill(schoolId, checks, isAdmin) {
  const attempted = useRef(new Set())
  useEffect(() => {
    if (!schoolId || !isAdmin) return
    checks.forEach((c) => {
      if (c.semester != null || attempted.current.has(c.id)) return
      attempted.current.add(c.id)
      backfillCheckTerm(schoolId, c.id).catch((e) => console.error('[setukShared] 학기 정보 보정 실패:', e))
    })
  }, [schoolId, isAdmin, checks])
}

/** 학년도·학기 Select 한 쌍 — 여러 화면에서 똑같은 모양으로 재사용한다. */
export function SetukTermFilterControls({ year, semester, onYearChange, onSemesterChange }) {
  return (
    <Box sx={{ display: 'flex', gap: 1.5, mb: 1.5 }}>
      <FormControl size="small" sx={{ width: 130 }}>
        <InputLabel>학년도</InputLabel>
        <Select label="학년도" value={year} onChange={(e) => onYearChange(Number(e.target.value))}>
          {SETUK_YEAR_OPTIONS.map((y) => <MenuItem key={y} value={y}>{y}학년도</MenuItem>)}
        </Select>
      </FormControl>
      <FormControl size="small" sx={{ width: 110 }}>
        <InputLabel>학기</InputLabel>
        <Select label="학기" value={semester} onChange={(e) => onSemesterChange(Number(e.target.value))}>
          <MenuItem value={1}>1학기</MenuItem>
          <MenuItem value={2}>2학기</MenuItem>
        </Select>
      </FormControl>
    </Box>
  )
}

export const HIGHLIGHT_STYLE = { background: '#fecaca', color: '#7f1d1d', borderRadius: 3, padding: '0 2px', fontWeight: 700 }
export const BADGE_STYLE = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16,
  borderRadius: '50%', background: '#dc2626', color: '#fff', fontSize: 10, fontWeight: 700,
  marginRight: 3, verticalAlign: 'middle', flexShrink: 0,
}

/**
 * 학생-과목 하나의 전체 세특 문장 안에서, 그 과목에 걸린 항목 전부를 번호로 한 번에
 * 표시한다 - 항목 목록의 순번과 같은 번호를 달아 서로 대응시킨다. 원문/위치 정보가
 * 없는 옛 항목은 저장된 앞뒤 문맥만으로 항목별 줄을 나열해 대체한다.
 */
export function MultiHighlight({ text, groupItems }) {
  const withOrder = groupItems.map((it, i) => ({ ...it, order: i + 1 }))
  const positioned = text != null ? withOrder.filter((it) => it.index != null && it.length != null) : []

  if (positioned.length === 0) {
    return (
      <>
        {withOrder.map((it) => (
          <Typography key={it.id} sx={{ fontSize: '0.85rem', lineHeight: 1.8, mb: 1 }}>
            <span style={BADGE_STYLE}>{it.order}</span>
            <span style={{ color: '#94a3b8' }}>{it.before}</span>
            <mark style={HIGHLIGHT_STYLE}>{it.matched}</mark>
            <span style={{ color: '#94a3b8' }}>{it.after}</span>
          </Typography>
        ))}
      </>
    )
  }

  const sorted = [...positioned].sort((a, b) => a.index - b.index)
  const parts = []
  let cursor = 0
  sorted.forEach((sp) => {
    if (sp.index < cursor) return
    parts.push(text.slice(cursor, sp.index))
    parts.push(
      <mark key={sp.id} style={HIGHLIGHT_STYLE}>
        <span style={BADGE_STYLE}>{sp.order}</span>{text.slice(sp.index, sp.index + sp.length) || ' '}
      </mark>,
    )
    cursor = sp.index + sp.length
  })
  parts.push(text.slice(cursor))
  return <>{parts}</>
}
