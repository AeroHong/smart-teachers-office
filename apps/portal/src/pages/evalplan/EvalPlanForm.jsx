import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Alert from '@mui/material/Alert'
import Table from '@mui/material/Table'
import TableHead from '@mui/material/TableHead'
import TableBody from '@mui/material/TableBody'
import TableRow from '@mui/material/TableRow'
import TableCell from '@mui/material/TableCell'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import AddIcon from '@mui/icons-material/Add'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import EvalPlanSection, { ACCENT, ACCENT_BG } from './EvalPlanSection'
import { GRADE_OPTIONS, GRADE_METHOD_FIELDS, SUBJECT_GROUPS, needsMinAchievementPlan, emptyGradeMethod, emptyMinAchievementPlan, checkExamRatio } from './evalPlanUtils'
import { currentSchoolYear } from '@shared/lib/schema'

const YEAR_OPTIONS = [currentSchoolYear() - 1, currentSchoolYear(), currentSchoolYear() + 1]

const fieldSx = {
  '& .MuiOutlinedInput-root': { borderRadius: '10px', bgcolor: '#f8fafc' },
}

// endAdornment("%"/"점")까지 합치면 좁은 박스에서 숫자가 잘리기 쉬워서, 입력 폰트/패딩을
// 줄이고 단위는 더 작은 회색 텍스트로 축소해 공간을 확보했다.
function NumField({ label, value, onChange, suffix, width = 110 }) {
  return (
    <TextField
      label={label}
      size="small"
      type="number"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      InputProps={{
        endAdornment: suffix ? (
          <Typography component="span" sx={{ fontSize: '0.68rem', color: '#94a3b8', ml: 0.25, whiteSpace: 'nowrap' }}>
            {suffix}
          </Typography>
        ) : undefined,
        sx: { fontSize: '0.82rem' },
      }}
      inputProps={{ style: { padding: '8.5px 6px' } }}
      sx={{ ...fieldSx, width }}
    />
  )
}

const tableHeadSx = {
  '& th': { bgcolor: '#f8fafc', color: '#475569', fontWeight: 700, fontSize: '0.78rem', borderBottom: '1px solid #e2e8f0' },
}
const tableRowSx = { '& td': { borderBottom: '1px solid #f1f5f9' }, '&:last-of-type td': { borderBottom: 0 } }

// ── 기본정보 ─────────────────────────────────────────────────
function MetaSection({ meta, onMetaChange }) {
  return (
    <EvalPlanSection title="기본정보">
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 2.5 }}>
        <FormControl size="small" sx={{ ...fieldSx, width: 130 }}>
          <InputLabel>학년도</InputLabel>
          <Select label="학년도" value={meta.year} onChange={(e) => onMetaChange({ year: Number(e.target.value) })}>
            {YEAR_OPTIONS.map((y) => <MenuItem key={y} value={y}>{y}학년도</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ ...fieldSx, width: 110 }}>
          <InputLabel>학기</InputLabel>
          <Select label="학기" value={meta.semester} onChange={(e) => onMetaChange({ semester: Number(e.target.value) })}>
            <MenuItem value={1}>1학기</MenuItem>
            <MenuItem value={2}>2학기</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ ...fieldSx, width: 220 }}>
          <InputLabel>교과(군)</InputLabel>
          <Select label="교과(군)" value={meta.subjectGroup || ''} onChange={(e) => onMetaChange({ subjectGroup: e.target.value })}>
            {SUBJECT_GROUPS.map((g) => <MenuItem key={g} value={g}>{g}</MenuItem>)}
          </Select>
        </FormControl>
        <TextField
          label="과목명" size="small" value={meta.subject || ''}
          onChange={(e) => onMetaChange({ subject: e.target.value })}
          sx={{ ...fieldSx, width: 200 }}
        />
        <NumField
          label="학점(주당시수)" value={meta.weeklyHours}
          onChange={(v) => onMetaChange({ weeklyHours: v })}
          width={150}
        />
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2.5, flexWrap: 'wrap' }}>
        <Typography sx={{ fontSize: '0.82rem', color: '#64748b', fontWeight: 600, mr: 0.5 }}>학년</Typography>
        {GRADE_OPTIONS.map((g) => {
          const checked = meta.grades?.includes(g) || false
          return (
            <Box
              key={g}
              onClick={() => {
                const set = new Set(meta.grades || [])
                if (set.has(g)) set.delete(g); else set.add(g)
                onMetaChange({ grades: [...set].sort() })
              }}
              sx={{
                px: 1.5, py: 0.5, borderRadius: '999px', cursor: 'pointer', userSelect: 'none',
                fontSize: '0.82rem', fontWeight: 700,
                border: '1px solid', borderColor: checked ? ACCENT : '#e2e8f0',
                bgcolor: checked ? ACCENT_BG : '#fff',
                color: checked ? ACCENT : '#64748b',
                transition: 'all 0.12s',
              }}
            >
              {g}학년
            </Box>
          )
        })}
      </Box>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
        <TextField
          label="담당 학급" size="small" value={meta.classes || ''}
          onChange={(e) => onMetaChange({ classes: e.target.value })}
          placeholder="예: 1~7반" sx={{ ...fieldSx, width: 200 }}
        />
        <TextField
          label="담당교사 (쉼표로 구분)" size="small"
          value={(meta.teacherNames || []).join(', ')}
          onChange={(e) => onMetaChange({ teacherNames: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
          sx={{ ...fieldSx, width: 320 }}
        />
      </Box>
    </EvalPlanSection>
  )
}

// ── 정기시험·수행평가 반영비율 ───────────────────────────────
const RATIO_ROWS = [
  { key: 'midterm', label: '중간고사', cols: ['essayType', 'objectiveType', 'total'] },
  { key: 'final', label: '기말고사', cols: ['essayType', 'objectiveType', 'total'] },
  { key: 'performance', label: '수행평가', cols: ['essayType', 'otherType', 'total'] },
]

function ExamRatioSection({ examRatio, onChange }) {
  const setCell = (rowKey, colKey, field, value) => {
    onChange({
      ...examRatio,
      [rowKey]: {
        ...examRatio[rowKey],
        [colKey]: { ...examRatio[rowKey]?.[colKey], [field]: value },
      },
    })
  }

  const check = checkExamRatio(examRatio)

  return (
    <EvalPlanSection title="정기시험 · 수행평가 반영 비율">
      <Box sx={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '10px' }}>
        <Table size="small">
          <TableHead sx={tableHeadSx}>
            <TableRow>
              <TableCell>구분</TableCell>
              <TableCell align="center">서·논술형 (비율 / 만점)</TableCell>
              <TableCell align="center">그 외 유형 (비율 / 만점)</TableCell>
              <TableCell align="center">소계 (비율 / 만점)</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {RATIO_ROWS.map(({ key, label, cols }) => {
              const [essayCol, otherCol, totalCol] = cols
              const rowCheck = check.rows.find((r) => r.key === key)
              return (
                <TableRow key={key} sx={tableRowSx}>
                  <TableCell sx={{ fontWeight: 700, color: '#1e293b' }}>
                    {label}
                    {!rowCheck.ok && (
                      <Typography sx={{ fontSize: '0.66rem', color: '#dc2626', fontWeight: 700, mt: 0.25 }}>
                        {rowCheck.expected}% ≠ 소계
                      </Typography>
                    )}
                  </TableCell>
                  {[essayCol, otherCol, totalCol].map((colKey) => (
                    <TableCell key={colKey} align="center" sx={{ p: 1 }}>
                      <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                        <NumField
                          label="" value={examRatio[key]?.[colKey]?.ratio}
                          onChange={(v) => setCell(key, colKey, 'ratio', v)}
                          suffix="%" width={92}
                        />
                        <NumField
                          label="" value={examRatio[key]?.[colKey]?.maxScore}
                          onChange={(v) => setCell(key, colKey, 'maxScore', v)}
                          suffix="점" width={92}
                        />
                      </Box>
                    </TableCell>
                  ))}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Box>

      <Box sx={{
        mt: 1.5, p: 1.5, borderRadius: '10px', display: 'flex', alignItems: 'center', gap: 1,
        bgcolor: check.sum == null ? '#f8fafc' : check.sumOk ? '#f0fdf4' : '#fef2f2',
        border: '1px solid', borderColor: check.sum == null ? '#e2e8f0' : check.sumOk ? '#bbf7d0' : '#fecaca',
      }}>
        {check.sum == null ? (
          <Typography sx={{ fontSize: '0.8rem', color: '#94a3b8' }}>
            중간·기말·수행평가 소계를 모두 입력하면 합계 100% 여부를 확인합니다.
          </Typography>
        ) : check.sumOk ? (
          <>
            <CheckCircleIcon sx={{ fontSize: 18, color: '#16a34a' }} />
            <Typography sx={{ fontSize: '0.82rem', color: '#166534', fontWeight: 700 }}>
              합계 100% — 중간 {check.rows[0].total}% + 기말 {check.rows[1].total}% + 수행 {check.rows[2].total}%
            </Typography>
          </>
        ) : (
          <>
            <WarningAmberIcon sx={{ fontSize: 18, color: '#dc2626' }} />
            <Typography sx={{ fontSize: '0.82rem', color: '#991b1b', fontWeight: 700 }}>
              합계 {check.sum}% — 100%가 되어야 합니다 (중간 {check.rows[0].total}% + 기말 {check.rows[1].total}% + 수행 {check.rows[2].total}%)
            </Typography>
          </>
        )}
      </Box>
    </EvalPlanSection>
  )
}

// ── 수행평가 영역 요약 ───────────────────────────────────────
function PerformanceAreasSection({ areas, onChange }) {
  const update = (i, patch) => onChange(areas.map((a, idx) => (idx === i ? { ...a, ...patch } : a)))
  const remove = (i) => onChange(areas.filter((_, idx) => idx !== i))
  const add = () => onChange([...areas, { name: '', ratio: null, maxScore: null }])

  return (
    <EvalPlanSection title="수행평가 영역 요약">
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {areas.length === 0 && (
          <Typography sx={{ fontSize: '0.85rem', color: '#94a3b8', mb: 0.5 }}>등록된 영역이 없습니다.</Typography>
        )}
        {areas.map((area, i) => (
          <Box
            key={i}
            sx={{ display: 'flex', gap: 1, alignItems: 'center', p: 1, borderRadius: '10px', bgcolor: '#f8fafc' }}
          >
            <TextField
              size="small" label="영역명" value={area.name || ''}
              onChange={(e) => update(i, { name: e.target.value })}
              sx={{ ...fieldSx, flex: 1, minWidth: 160, '& .MuiOutlinedInput-root': { bgcolor: '#fff', borderRadius: '10px' } }}
            />
            <NumField label="비율" value={area.ratio} onChange={(v) => update(i, { ratio: v })} suffix="%" />
            <NumField label="만점" value={area.maxScore} onChange={(v) => update(i, { maxScore: v })} suffix="점" />
            <IconButton size="small" onClick={() => remove(i)} sx={{ color: '#94a3b8' }}>
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </Box>
        ))}
        <Button
          size="small" startIcon={<AddIcon />} onClick={add}
          sx={{ alignSelf: 'flex-start', mt: 0.5, color: ACCENT, fontWeight: 700, textTransform: 'none' }}
        >
          영역 추가
        </Button>
      </Box>
    </EvalPlanSection>
  )
}

// ── 성적산출방법 ─────────────────────────────────────────────
function GradeMethodSection({ gradeMethod, onChange }) {
  const method = gradeMethod || emptyGradeMethod()
  const toggle = (key, label) => () => onChange({ ...method, [key]: { label, enabled: !method[key]?.enabled } })

  return (
    <EvalPlanSection title="성적산출방법">
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        {GRADE_METHOD_FIELDS.map(([key, label]) => {
          const checked = method[key]?.enabled || false
          return (
            <Box
              key={key}
              onClick={toggle(key, label)}
              sx={{
                display: 'flex', alignItems: 'center', gap: 0.5,
                px: 1.5, py: 0.75, borderRadius: '10px', cursor: 'pointer', userSelect: 'none',
                border: '1px solid', borderColor: checked ? ACCENT : '#e2e8f0',
                bgcolor: checked ? ACCENT_BG : '#fff',
                transition: 'all 0.12s',
              }}
            >
              <Checkbox
                size="small" checked={checked} onChange={toggle(key, label)}
                onClick={(e) => e.stopPropagation()}
                sx={{ p: 0, color: '#cbd5e1', '&.Mui-checked': { color: ACCENT } }}
              />
              <Typography sx={{ fontSize: '0.85rem', fontWeight: checked ? 700 : 500, color: checked ? ACCENT : '#475569' }}>
                {label}
              </Typography>
            </Box>
          )
        })}
      </Box>
    </EvalPlanSection>
  )
}

// ── 최소성취수준 보장지도 · 추가학습 운영계획 ───────────────────
// 학교 서식상 이 절차의 이름 자체가 학년에 따라 다르다 — 1학년(공통교과)은 "최소성취수준
// 보장지도"가 정식 명칭이고, 2학년(공통·선택교과)은 "추가학습"이 정식 명칭이다(1학년 hwp
// 원본 파일명이 실제로 "...최소 성취수준보장지도 및 추가학습 계획서..."임을 확인). 표에서
// 추출되는 값(학점수/시수 등)은 동일한 구조라 하나로 두고, 라벨만 학년에 맞춰 바꾼다.
function MinAchievementPlanSection({ plan, onChange, grades }) {
  const value = plan || emptyMinAchievementPlan()
  const study = value.additionalStudy || emptyMinAchievementPlan().additionalStudy
  const patchStudy = (field) => (v) => onChange({ ...value, additionalStudy: { ...study, [field]: v } })
  const isGrade1 = (grades || []).includes(1)
  const overviewLabel = isGrade1 ? '최소 성취수준 보장지도 개요' : '추가학습 개요'

  return (
    <EvalPlanSection title={isGrade1 ? '최소성취수준 보장지도 운영계획' : '추가학습 운영계획'}>
      <Alert severity="info" variant="outlined" sx={{ mb: 2.5, borderRadius: '10px', fontSize: '0.82rem' }}>
        성취도/분할점수를 산출하는 과목이라 자동으로 표시됩니다. 값이 비어 있으면 원본 문서에 아직 기재되지 않은 것이니 직접 채워주세요.
      </Alert>

      <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: '#1e293b', mb: 1 }}>{overviewLabel}</Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
        <NumField label="학점수" value={study.credits} onChange={patchStudy('credits')} width={110} />
        <NumField label="추가학습 시수" value={study.extraStudyHours} onChange={patchStudy('extraStudyHours')} width={140} />
        <NumField label="예방지도 인정시수" value={study.preventionHoursRecognized} onChange={patchStudy('preventionHoursRecognized')} width={150} />
        <NumField label="학점 이수 인정 기준 시수" value={study.creditRecognitionHours} onChange={patchStudy('creditRecognitionHours')} width={190} />
      </Box>
    </EvalPlanSection>
  )
}

// ── 전체 폼 ──────────────────────────────────────────────────
export default function EvalPlanForm({ meta, onMetaChange, data, onDataChange }) {
  const patchMeta = (patch) => onMetaChange({ ...meta, ...patch })
  const patchData = (key) => (value) => onDataChange({ ...data, [key]: value })
  const showMinAchievement = needsMinAchievementPlan(data.gradeMethod)

  return (
    <Box>
      <MetaSection meta={meta} onMetaChange={patchMeta} />
      <ExamRatioSection examRatio={data.examRatio} onChange={patchData('examRatio')} />
      <PerformanceAreasSection areas={data.performanceAreas} onChange={patchData('performanceAreas')} />
      <GradeMethodSection gradeMethod={data.gradeMethod} onChange={patchData('gradeMethod')} />
      {showMinAchievement && (
        <MinAchievementPlanSection plan={data.minAchievementPlan} onChange={patchData('minAchievementPlan')} grades={meta.grades} />
      )}
    </Box>
  )
}
