// 세특 점검 결과를 보여주는 화면들(학급별 목록 SetukUpload, 과목별 보기 SetukBySubject,
// 학급별 상세 SetukCheckDetail, 과목별 담당 교사 SetukTeacherAssignments)이 공통으로
// 쓰는 표시 조각 — 중복 구현을 피하려고 분리했다.
import { useState, useMemo, useEffect, useRef } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import Chip from '@mui/material/Chip'
import Tooltip from '@mui/material/Tooltip'
import IconButton from '@mui/material/IconButton'
import { currentSchoolYear, currentYearSemester } from '@shared/lib/schema'
import { backfillCheckTerm, subscribeDictionary } from '@shared/lib/setukCheck'

export const SEVERITY_COLORS = { ERROR: 'error', WARNING: 'warning', INFO: 'info' }

/**
 * 화면에 학생 이름을 보여줄 때 가운데 글자를 전부 ○로 가린다("홍길동" → "홍○동",
 * 4글자 이상이면 가운데 전부: "김민준서" → "김○○서"). 2글자 이름은 마지막 글자만
 * 가린다("이나" → "이○"). 세특 원문에서 학생 본인 이름 재언급을 찾는 checkText의
 * self_name_repeat 규칙 등 실제 이름 문자열이 필요한 처리 로직에는 쓰지 않는다 —
 * 화면 표시(SetukCheckDetail.jsx, SetukSubjectDetail.jsx)에서만 사용.
 */
/**
 * 처리완료·이상없음 버튼 — 눌렸는지 아닌지 한눈에 안 보인다는 피드백을 반영해,
 * 눌린 상태는 색이 꽉 찬 원(흰 아이콘)으로 확실히 도드라지게 하고, 안 눌렸지만
 * 누를 수 있는 상태는 옅은 테두리의 중간 톤 아이콘으로, 아예 누를 권한이 없는
 * 상태는 아주 옅게 처리해 세 상태가 뚜렷이 구분되게 한다.
 */
export function ResolutionButton({ active, allowed, colorKey, icon: Icon, tooltip, onClick }) {
  return (
    <Tooltip title={tooltip}>
      <span>
        <IconButton
          size="small" disabled={!allowed} onClick={onClick}
          sx={{
            border: '1.5px solid', borderColor: active ? `${colorKey}.main` : '#e2e8f0',
            bgcolor: active ? `${colorKey}.main` : '#fff',
            '&:hover': { bgcolor: active ? `${colorKey}.dark` : '#f1f5f9' },
            '&.Mui-disabled': { border: '1.5px solid #f1f5f9' },
          }}
        >
          <Icon fontSize="small" sx={{ color: active ? '#fff' : (allowed ? '#94a3b8' : '#cbd5e1') }} />
        </IconButton>
      </span>
    </Tooltip>
  )
}

export function maskName(name) {
  const s = String(name || '')
  if (s.length <= 1) return s
  if (s.length === 2) return `${s[0]}○`
  return `${s[0]}${'○'.repeat(s.length - 2)}${s[s.length - 1]}`
}

// 평가운영계획 제출 도구(EvalPlanManagerDashboard)에서 쓰던 것과 같은 학년도 선택 범위.
export const SETUK_YEAR_OPTIONS = [currentSchoolYear() - 1, currentSchoolYear(), currentSchoolYear() + 1]

/** Firestore Timestamp/Date/숫자를 "YYYY.MM.DD HH:mm" 형식으로. */
export function fmtDateTime(ts) {
  if (!ts) return ''
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

/** 나이스 원본 파일의 "산출일자"처럼 시각 정보가 없는 날짜용 — "YYYY.MM.DD" 형식으로. */
export function fmtDate(ts) {
  if (!ts) return ''
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

/**
 * "학급별 목록"·"과목별 보기"·"과목별 담당 교사" 세 화면이 함께 쓰는 학년도-학기 필터
 * 상태 — 관리자 페이지 > 홈에서 지정한 기준(학교 전체 업무 기준)이 아니라, 현재
 * 등록된 데이터 중 가장 최근 것(checks는 uploadedAt 내림차순이라 맨 앞)의 학년도·학기를
 * 기본값으로 쓴다. 학교 기준과 실제 업로드된 데이터의 학기가 어긋나면 필터가 항상
 * 빈 화면을 보여주는 문제가 있었기 때문 — 실제 데이터를 우선한다. 사용자가 직접
 * Select를 바꾸면 그 선택으로 고정되고(override), checks가 계속 갱신돼도 되돌아가지
 * 않는다. 아직 학기 정보가 있는 건이 하나도 없으면(로딩 중이거나 옛 데이터의 지연
 * 보정이 안 끝난 경우, 또는 업로드가 전혀 없는 경우) 오늘 날짜 기준값으로 잠정 표시한다.
 */
export function useSetukTermFilter(checks) {
  const latest = useMemo(() => checks.find((c) => c.year != null && c.semester != null), [checks])
  const fallback = useMemo(() => currentYearSemester(), [])
  const autoYear = latest?.year ?? fallback.year
  const autoSemester = latest?.semester ?? fallback.semester

  const [override, setOverride] = useState(null)
  const year = override?.year ?? autoYear
  const semester = override?.semester ?? autoSemester
  const setYear = (y) => setOverride({ year: y, semester })
  const setSemester = (s) => setOverride({ year, semester: s })
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

/**
 * 현재 점검 기준(setukDictionary/default) 문서를 구독한다 — "학급별 목록"·"과목별
 * 보기"에서 각 건이 어느 버전으로 점검됐는지, 최신 기준인지 표시하는 데 쓴다
 * (SetukCheckDetail.jsx가 학급 상세 화면에서 쓰는 것과 같은 문서).
 */
export function useSetukDictionaryVersion(schoolId) {
  const [dictDoc, setDictDoc] = useState(null)
  useEffect(() => {
    if (!schoolId) return
    return subscribeDictionary(schoolId, setDictDoc, (e) => console.error('[setukShared] 점검 기준 조회 실패:', e))
  }, [schoolId])
  return dictDoc
}

/**
 * 점검 건 하나(또는 과목별 보기처럼 여러 건을 모은 경우 그중 가장 오래된 버전)가
 * 지금 몇 번 기준으로 점검됐는지 보여준다. 최신 기준보다 낮으면 다시 점검이
 * 필요하다는 뜻으로 경고색을 쓴다(SetukCheckDetail.jsx의 "다시 점검하라" 배너와
 * 같은 판단 기준: dictDoc.version > 이 건의 dictionaryVersion).
 */
export function DictionaryVersionChip({ version, dictDoc }) {
  const v = version || 0
  const currentVersion = dictDoc?.version || 0
  const isOutdated = !!dictDoc && currentVersion > v
  const label = isOutdated ? `기준 v${v} · 최신 아님` : `기준 v${v}`
  const chip = <Chip size="small" variant={isOutdated ? 'filled' : 'outlined'} color={isOutdated ? 'warning' : 'default'} label={label} sx={{ fontSize: '0.7rem' }} />
  if (!isOutdated) return chip
  return (
    <Tooltip title={`점검 기준이 최신(v${currentVersion})으로 바뀌었습니다. 재점검하면 새 기준이 반영됩니다.`}>
      {chip}
    </Tooltip>
  )
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

/** 학년 필터 드롭다운 — "학급별 목록"·"과목별 보기"에서 학년도-학기 필터 옆에 나란히 쓴다. */
export function SetukGradeFilterControl({ grade, onGradeChange, gradeOptions, counts, total }) {
  return (
    <FormControl size="small" sx={{ width: 140 }}>
      <InputLabel>학년 필터</InputLabel>
      <Select label="학년 필터" value={grade} onChange={(e) => onGradeChange(e.target.value)}>
        <MenuItem value="all">전체 학년 ({total})</MenuItem>
        {gradeOptions.map((g) => <MenuItem key={g} value={g}>{g}학년 ({counts[g] || 0})</MenuItem>)}
      </Select>
    </FormControl>
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
