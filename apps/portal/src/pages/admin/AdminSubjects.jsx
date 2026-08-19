import { useEffect, useState, useRef } from 'react'
import { useAuth } from '@shared/contexts/AuthContext'
import { loadSubjects, saveSubject, deleteSubject, bulkSaveSubjectsByYear, loadStudents } from '@shared/lib/subjectData'
import { useTableSort } from '@shared/hooks/useTableSort'
import { entryYearFor, currentSchoolYear } from '@shared/lib/schema'
import { RowActions, EditAction, DeleteAction, filters, table } from './adminUi'
import * as XLSX from 'xlsx'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Alert from '@mui/material/Alert'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import TextField from '@mui/material/TextField'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Chip from '@mui/material/Chip'
import AddIcon from '@mui/icons-material/Add'
import UploadIcon from '@mui/icons-material/Upload'
import DownloadIcon from '@mui/icons-material/Download'

// 상수
const SUBJECT_GROUPS = [
  '국어', '수학', '영어', '사회(역사/도덕포함)', '과학',
  '체육', '예술', '교양', '기술가정/정보', '제2외국어/한문',
]

const COURSE_TYPES = ['공통', '일반', '융합', '진로']

const GRADE_TABS = [
  { key: 'all', label: '전체' },
  { key: 1, label: '1학년' },
  { key: 2, label: '2학년' },
  { key: 3, label: '3학년' },
]

// 학번 선택지. 다음 학년도 1학년(= 학년도 + 1 학번)을 미리 넣을 수 있어야 하므로 +1까지 연다.
// 달력 연도가 아니라 학년도 기준이라 1~2월에도 어긋나지 않는다.
const YEAR_OPTS = [-2, -1, 0, 1].map(d => currentSchoolYear() + d)

// Excel 파서 상수
const _BLOCK_PAT = /[\[\(]택\s*(\d+)\s*[\]\)]/
const _VALID_CT = new Set(['공통', '일반', '융합', '진로'])
const _GS_COLS = [[1, 1], [1, 2], [2, 1], [2, 2], [3, 1], [3, 2]]

// 유틸 함수
function calcCurrentGrade(entryYear) {
  const g = currentSchoolYear() - entryYear + 1
  return g >= 1 && g <= 3 ? g : null
}

// 1·2학기에 모두 배당된 과목은 semester === 'both' 로 저장된다
function semesterLabel(semester) {
  if (semester === 'both') return '양학기'
  return semester ? `${semester}학기` : '—'
}

function extractEntryYear(filename) {
  const m = filename.match(/20(\d{2})/)
  return m ? 2000 + parseInt(m[1]) : null
}

function _normSubjectGroup(raw) {
  if (!raw) return raw
  const strip = (s) => s.replace(/[\s\r\n··‧・()（）]/g, '')
  const cleaned = strip(raw)
  if (SUBJECT_GROUPS.includes(cleaned)) return cleaned
  const match = SUBJECT_GROUPS.find((g) => strip(g) === cleaned)
  if (match) return match
  const partial = SUBJECT_GROUPS.find((g) => {
    const gn = strip(g)
    return cleaned.includes(gn) || gn.includes(cleaned)
  })
  return partial ?? raw
}

// Excel 파서 (교육청 배당표)
function _buildMergedMap(ws) {
  const map = {}
  for (const merge of (ws['!merges'] || [])) {
    const addr = XLSX.utils.encode_cell({ r: merge.s.r, c: merge.s.c })
    const cell = ws[addr]
    if (cell?.v != null) {
      const val = String(cell.v).trim()
      for (let r = merge.s.r; r <= merge.e.r; r++)
        for (let c = merge.s.c; c <= merge.e.c; c++)
          map[`${r}:${c}`] = val
    }
  }
  return map
}

function _readAllRows(ws) {
  if (!ws['!ref']) return []
  const merged = _buildMergedMap(ws)
  const rng = XLSX.utils.decode_range(ws['!ref'])
  const rows = []
  for (let r = rng.s.r; r <= rng.e.r; r++) {
    const row = []
    for (let c = rng.s.c; c <= rng.e.c; c++) {
      const key = `${r}:${c}`
      if (merged[key] !== undefined) {
        row.push(merged[key])
      } else {
        const cell = ws[XLSX.utils.encode_cell({ r, c })]
        row.push(cell?.v != null ? String(cell.v).trim() : '')
      }
    }
    rows.push(row)
  }
  return rows
}

function _detectLayout(headerRow) {
  let sgCol = 1
  for (let i = 0; i < headerRow.length; i++) {
    const v = String(headerRow[i] || '').replace(/\n/g, ' ').trim()
    if (v.includes('교과') && v.includes('군')) { sgCol = i; break }
  }
  const gs = sgCol + 5
  return { sgCol, ctCol: sgCol + 1, nmCol: sgCol + 2, bcCol: sgCol + 3, crCol: sgCol + 4, gsCol: gs, descCol: gs + 6 }
}

function _normCat(raw) {
  const c = (raw || '').replace(/[\r\n]/g, '').trim()
  if (c.includes('지정')) return '학교지정'
  if (c.includes('선택')) return '학생선택'
  return null
}

function parseEducationExcel(arrayBuffer, targetGrade) {
  const wb = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' })

  // 구분 헤더가 있는 시트 탐색
  let ws = null
  outer: for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name]
    if (!sheet['!ref']) continue
    const rng = XLSX.utils.decode_range(sheet['!ref'])
    for (let r = rng.s.r; r <= Math.min(rng.s.r + 9, rng.e.r); r++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c: 0 })]
      if (cell && String(cell.v || '').trim() === '구분') { ws = sheet; break outer }
    }
  }
  ws = ws || wb.Sheets[wb.SheetNames[0]]

  const rows = _readAllRows(ws)
  const headerIdx = rows.findIndex(row => row[0] === '구분')
  if (headerIdx === -1) throw new Error('헤더 행(\'구분\')을 찾을 수 없습니다. 교육청 제출 형식(.xlsx)인지 확인하세요.')

  const { sgCol, ctCol, nmCol, bcCol, crCol, gsCol, descCol } = _detectLayout(rows[headerIdx])
  const g = (row, col) => col < row.length ? (row[col] || '') : ''

  const courses = [], errors = []
  let curCat = '', curSg = '', curSb = null
  const bt = {} // blockTracker

  for (let i = headerIdx + 2; i < rows.length; i++) {
    const c = rows[i]

    const newCat = _normCat(g(c, 0))
    if (newCat) curCat = newCat
    const rawSg = g(c, sgCol)
    if (rawSg && !_VALID_CT.has(rawSg)) curSg = _normSubjectGroup(rawSg)

    const name = g(c, nmCol)
    const ct = g(c, ctCol)

    if (!name || ['합계', '과목 수', '과목'].includes(name)) continue
    if (/^-*[\d.]+$/.test(name)) continue
    if (!_VALID_CT.has(ct) || !curCat || !curSg) continue

    // parseFloat는 예외를 던지지 않고 NaN을 반환하므로 직접 검사한다
    const rb = g(c, bcCol), rc = g(c, crCol)
    const bc = rb ? Math.round(parseFloat(rb)) : 0
    const cr = rc ? Math.round(parseFloat(rc)) : 0
    if (Number.isNaN(bc) || Number.isNaN(cr)) {
      errors.push(`행 ${i + 1} (${name}): 학점 값을 숫자로 읽을 수 없습니다 (기본 "${rb}", 운영 "${rc}")`)
      continue
    }
    if (!bc || !cr) continue

    // 학교지정·학생선택 과목 모두 학년-학기 칸에 적힌 배당을 모두 수집한다.
    // 첫 칸에서 멈추면 1·2학기에 걸친 과목의 2학기 배당(또는 택N 표시)이 유실된다.
    const schedules = []
    let selBlock = null
    const desc = g(c, descCol)
    const blockMatches = []

    for (let off = 0; off < _GS_COLS.length; off++) {
      const [grade, sem] = _GS_COLS[off]
      const val = g(c, gsCol + off)
      if (!val) continue
      const m = _BLOCK_PAT.exec(val)
      if (m) {
        const key = `${grade}:${sem}`
        if (!bt[key]) bt[key] = { val, num: 1 }
        else if (bt[key].val !== val) bt[key] = { val, num: bt[key].num + 1 }
        blockMatches.push({ grade, semester: sem, pickCount: parseInt(m[1]), blockNumber: bt[key].num })
        continue
      }
      if (curCat === '학교지정' && /^[\d.]+$/.test(val)) {
        schedules.push({ targetGrade: grade, semester: sem })
      }
    }

    // 학생선택 과목이 같은 학년의 1·2학기 칸에 모두 택N 표시가 있으면 '양학기' 과목으로 합친다.
    if (blockMatches.length) {
      const grade = blockMatches[0].grade
      const semesters = [...new Set(blockMatches.map((b) => b.semester))]
      selBlock = {
        grade,
        semester: semesters.length > 1 ? 'both' : semesters[0],
        pickCount: blockMatches[0].pickCount,
        blockNumber: blockMatches[0].blockNumber,
      }
      curSb = selBlock
    }

    const base = {
      name,
      subjectGroup: curSg,
      courseType: ct,
      category: curCat,
      credits: cr,
      baseCredits: bc,
      description: desc,
    }

    if (curCat === '학교지정') {
      if (!schedules.length) continue
      // 같은 학년의 1·2학기 배당은 하나의 '양학기' 과목으로 합친다
      const semsByGrade = new Map()
      for (const s of schedules) {
        semsByGrade.set(s.targetGrade, [...(semsByGrade.get(s.targetGrade) || []), s.semester])
      }
      for (const [grade, sems] of semsByGrade) {
        if (targetGrade != null && grade !== targetGrade) continue
        courses.push({
          ...base,
          grade,
          semester: sems.length > 1 ? 'both' : sems[0],
          selectionBlock: null,
        })
      }
      continue
    }

    // 학생선택 — 직전에 만난 선택 블록에 속한다
    selBlock = curSb
    if (!selBlock) continue
    if (targetGrade != null && selBlock.grade !== targetGrade) continue

    courses.push({
      ...base,
      grade: selBlock.grade,
      semester: selBlock.semester,
      selectionBlock: selBlock,
    })
  }

  return { courses, errors }
}

// 간편 업로드 파서
function parseSimpleSubjectExcel(arrayBuffer) {
  const wb = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws)

  const courses = []
  const errors = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const name = (row['과목명'] || '').toString().trim()
    if (!name) continue

    try {
      const category = (row['구분'] || '').toString().trim()
      const grade = parseInt(row['학년']) || null
      const semesterRaw = (row['학기'] || '').toString().trim()
      const semester = semesterRaw === '양학기' ? 'both' : (parseInt(semesterRaw) || null)

      if (!['학교지정', '학생선택'].includes(category)) {
        errors.push(`행 ${i + 2}: 구분 값이 "학교지정" 또는 "학생선택"이어야 합니다.`)
        continue
      }
      if (!grade || grade < 1 || grade > 3) {
        errors.push(`행 ${i + 2} (${name}): 학년 값 오류`)
        continue
      }

      const parseClassList = (val) =>
        (val || '').toString().split(',').map(v => parseInt(v.trim())).filter(n => !isNaN(n))

      const semesterClassMap = semester === 'both' ? {
        1: parseClassList(row['1학기_학급']),
        2: parseClassList(row['2학기_학급']),
      } : null

      const course = {
        // 다운로드한 파일을 고쳐 올린 경우 — 기존 문서를 갱신하기 위해 id를 넘긴다
        id: (row['과목ID'] || '').toString().trim() || undefined,
        name,
        subjectCode: (row['과목코드'] || '').toString().trim(),
        subjectGroup: (row['교과군'] || '').toString().trim(),
        courseType: (row['과목구분'] || '').toString().trim(),
        category,
        grade,
        semester,
        semesterClassMap,
        credits: parseInt(row['운영학점']) || 3,
        baseCredits: parseInt(row['기본학점']) || 4,
        entryYear: parseInt(row['입학년도']) || currentSchoolYear(),
        description: (row['비고'] || '').toString().trim(),
      }

      // 학생선택: selectionBlock 파싱
      if (category === '학생선택') {
        const sbGrade = parseInt(row['선택블록_학년']) || grade
        const sbSemester = parseInt(row['선택블록_학기']) || semester
        const pickCount = parseInt(row['선택블록_택N']) || 5
        const blockNumber = parseInt(row['선택블록_번호']) || 1
        course.selectionBlock = { grade: sbGrade, semester: sbSemester, pickCount, blockNumber }
      }

      courses.push(course)
    } catch (e) {
      errors.push(`행 ${i + 2} (${name}): ${e.message}`)
    }
  }

  return { courses, errors }
}

// ImportModal 컴포넌트
function ImportModal({ schoolId, onClose, onDone }) {
  const fileRef = useRef(null)
  const [file, setFile] = useState(null)
  const [entryYear, setEntryYear] = useState(currentSchoolYear())
  const [targetGrade, setTargetGrade] = useState(() => calcCurrentGrade(currentSchoolYear()))
  const [parsed, setParsed] = useState(null)
  const [step, setStep] = useState('select') // select | preview | saving
  const [err, setErr] = useState('')
  const [uploadMode, setUploadMode] = useState('education') // education | simple

  function handleFileChange(e) {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setParsed(null)
    setStep('select')
    setErr('')
    const detected = extractEntryYear(f.name)
    if (detected && YEAR_OPTS.includes(detected)) {
      setEntryYear(detected)
      setTargetGrade(calcCurrentGrade(detected))
    }
    e.target.value = ''
  }

  function handleYearChange(y) {
    setEntryYear(y)
    setTargetGrade(calcCurrentGrade(y))
    setParsed(null)
    setStep('select')
  }

  function handleGradeChange(val) {
    setTargetGrade(val === 'all' ? null : Number(val))
    setParsed(null)
    setStep('select')
  }

  function handleParse() {
    if (!file) return
    setErr('')
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        let result
        if (uploadMode === 'simple') {
          result = parseSimpleSubjectExcel(ev.target.result)
        } else {
          result = parseEducationExcel(ev.target.result, targetGrade)
        }

        if (!result.courses.length) {
          setErr('파싱된 과목이 없습니다. 파일 형식 및 학년 선택을 확인하세요.')
          return
        }
        setParsed(result)
        setStep('preview')
      } catch (e) {
        setErr('파싱 오류: ' + e.message)
      }
    }
    reader.readAsArrayBuffer(file)
  }

  async function handleSave() {
    if (!parsed?.courses?.length) return
    setStep('saving')
    try {
      const total = { updated: 0, created: 0, deleted: 0 }
      const add = (s) => { total.updated += s.updated; total.created += s.created; total.deleted += s.deleted }

      if (uploadMode === 'simple') {
        const years = [...new Set(parsed.courses.map(c => c.entryYear).filter(Boolean))]
        for (const year of years) {
          const yearCourses = parsed.courses.filter(c => c.entryYear === year)
          add(await bulkSaveSubjectsByYear(schoolId, yearCourses, year))
        }
        onDone(parsed.courses.length, years.length > 1 ? '여러 년도' : years[0], total)
      } else {
        const withYear = parsed.courses.map(c => ({ ...c, entryYear }))
        add(await bulkSaveSubjectsByYear(schoolId, withYear, entryYear))
        onDone(parsed.courses.length, entryYear, total)
      }
    } catch (e) {
      setErr('저장 실패: ' + e.message)
      setStep('preview')
    }
  }

  const currentGrade = calcCurrentGrade(entryYear)
  const gradeSelectVal = targetGrade != null ? String(targetGrade) : 'all'

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>과목 엑셀 가져오기</DialogTitle>
      <DialogContent>
        {/* 업로드 모드 선택 */}
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>업로드 방식</Typography>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button
              variant={uploadMode === 'education' ? 'contained' : 'outlined'}
              onClick={() => { setUploadMode('education'); setParsed(null); setStep('select') }}
            >
              교육청 배당표
            </Button>
            <Button
              variant={uploadMode === 'simple' ? 'contained' : 'outlined'}
              onClick={() => { setUploadMode('simple'); setParsed(null); setStep('select') }}
            >
              간편 업로드 (다운로드 형식)
            </Button>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            {uploadMode === 'education'
              ? '교육청 제출용 교육과정 학점 배당표(.xlsx)를 업로드하면 과목이 자동 등록됩니다.'
              : 'Excel 다운로드로 받은 파일에 과목코드를 추가한 후 다시 업로드하면 일괄 등록됩니다.'}
          </Typography>
        </Box>

        {err && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErr('')}>
            {err}
          </Alert>
        )}

        {/* 파일 선택 */}
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>파일 선택 (.xlsx)</Typography>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <Button variant="outlined" onClick={() => fileRef.current?.click()}>
              파일 선택
            </Button>
            <input ref={fileRef} type="file" accept=".xlsx" style={{ display: 'none' }} onChange={handleFileChange} />
            <Typography variant="body2" color={file ? 'text.primary' : 'text.secondary'} sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {file ? file.name : 'xlsx 파일을 선택하세요'}
            </Typography>
          </Box>
        </Box>

        {/* 교육청 배당표 모드일 때만 입학년도/학년 선택 표시 */}
        {uploadMode === 'education' && (
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 2 }}>
            <FormControl fullWidth>
              <InputLabel>입학년도 (신입생 기준)</InputLabel>
              <Select
                value={entryYear}
                label="입학년도 (신입생 기준)"
                onChange={(e) => handleYearChange(Number(e.target.value))}
              >
                {YEAR_OPTS.map(y => <MenuItem key={y} value={y}>{y}년</MenuItem>)}
              </Select>
            </FormControl>

            <FormControl fullWidth>
              <InputLabel>불러올 학년</InputLabel>
              <Select
                value={gradeSelectVal}
                label="불러올 학년"
                onChange={(e) => handleGradeChange(e.target.value)}
              >
                {currentGrade != null && (
                  <MenuItem value={String(currentGrade)}>현재 {currentGrade}학년만 (권장)</MenuItem>
                )}
                <MenuItem value="all">전체 (1·2·3학년)</MenuItem>
                {[1, 2, 3].filter(g => g !== currentGrade).map(g => (
                  <MenuItem key={g} value={String(g)}>{g}학년만</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        )}

        {uploadMode === 'education' && (
          <Alert severity="info" sx={{ mb: 2 }}>
            {currentGrade != null && (
              <>{entryYear}학번 → {currentSchoolYear()}학년도 현재 <strong>{currentGrade}학년</strong><br /></>
            )}
            다음 학년도({currentSchoolYear() + 1}) 과목을 미리 채우려면 학년별로 학번이 다릅니다 —{' '}
            {[1, 2, 3].map(g => `${g}학년 ${entryYearFor(currentSchoolYear() + 1, g)}학번`).join(' · ')}.
            학번마다 해당 배당표를 각각 올리세요.
          </Alert>
        )}

        {/* Step: select */}
        {step === 'select' && (
          <Button variant="contained" fullWidth disabled={!file} onClick={handleParse}>
            분석하기
          </Button>
        )}

        {/* Step: preview */}
        {step === 'preview' && parsed && (
          <>
            <Box sx={{ bgcolor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 1, p: 2, mb: 2 }}>
              <Typography variant="body1" fontWeight={700} sx={{ mb: 1 }}>
                분석 완료: 총 {parsed.courses.length}개 과목
              </Typography>
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                {[1, 2, 3].map(g => {
                  const cnt = parsed.courses.filter(c => c.grade === g).length
                  return cnt > 0 ? <Typography key={g} variant="body2" color="text.secondary">{g}학년 {cnt}개</Typography> : null
                })}
                {['학교지정', '학생선택'].map(cat => {
                  const cnt = parsed.courses.filter(c => c.category === cat).length
                  return cnt > 0 ? <Typography key={cat} variant="body2" color="text.secondary">{cat} {cnt}개</Typography> : null
                })}
              </Box>
              {parsed.errors.length > 0 && (
                <Box sx={{ mt: 1, pt: 1, borderTop: '1px solid #e5e7eb' }}>
                  {parsed.errors.slice(0, 5).map((e, i) => (
                    <Typography key={i} variant="caption" color="error" sx={{ display: 'block' }}>• {e}</Typography>
                  ))}
                </Box>
              )}
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {uploadMode === 'education'
                ? `기존 ${entryYear}년 입학 과목 데이터는 삭제되고 새 데이터로 교체됩니다.`
                : '파일에 포함된 입학년도별로 기존 데이터가 삭제되고 새 데이터로 교체됩니다.'}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button variant="outlined" fullWidth onClick={() => { setStep('select'); setParsed(null) }}>
                다시 선택
              </Button>
              <Button variant="contained" fullWidth onClick={handleSave}>
                저장 ({parsed.courses.length}개)
              </Button>
            </Box>
          </>
        )}

        {step === 'saving' && (
          <Box sx={{ textAlign: 'center', py: 3 }}>
            <CircularProgress />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>저장 중...</Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={step === 'saving'}>
          닫기
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// 메인 컴포넌트
export default function AdminSubjects() {
  const { schoolId } = useAuth()
  const [loading, setLoading] = useState(true)
  const [subjects, setSubjects] = useState([])
  const [gradeFilter, setGradeFilter] = useState('all')
  const [catFilter, setCatFilter] = useState('전체')
  // 'all' = 학번 그대로 보기, 숫자 = 그 학년도 기준으로 보기
  const [yearView, setYearView] = useState(currentSchoolYear())
  const [notice, setNotice] = useState(null)
  const { toggle: sortToggle, sortData, Ind, thSort } = useTableSort()

  // 모달 상태
  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [importOpen, setImportOpen] = useState(false)

  useEffect(() => {
    if (schoolId) fetchSubjects()
  }, [schoolId])

  const fetchSubjects = async () => {
    setLoading(true)
    try {
      const data = await loadSubjects(schoolId)
      setSubjects(sortSubjects(data))
    } catch (err) {
      console.error('과목 로드 실패:', err)
    } finally {
      setLoading(false)
    }
  }

  const sortSubjects = (list) => {
    return [...list].sort((a, b) => {
      if (a.grade !== b.grade) return (a.grade || 0) - (b.grade || 0)
      if (a.category !== b.category) return a.category === '학교지정' ? -1 : 1
      const sgA = a.subjectGroup || ''
      const sgB = b.subjectGroup || ''
      if (sgA !== sgB) return sgA.localeCompare(sgB, 'ko')
      return (a.name || '').localeCompare(b.name || '', 'ko')
    })
  }

  const openAddModal = () => {
    setEditTarget(null)
    setForm({
      name: '',
      subjectCode: '',
      subjectGroup: '국어',
      courseType: '일반',
      category: '학교지정',
      grade: 1,
      semester: 1,
      credits: 3,
      baseCredits: 4,
      entryYear: currentSchoolYear(),
      description: '',
    })
    setError('')
    setModalOpen(true)
  }

  const openEditModal = (subject) => {
    setEditTarget(subject)
    setForm({
      name: subject.name || '',
      subjectCode: subject.subjectCode || '',
      subjectGroup: subject.subjectGroup || '국어',
      courseType: subject.courseType || '일반',
      category: subject.category || '학교지정',
      grade: subject.grade || 1,
      semester: subject.semester || 1,
      credits: subject.credits || 3,
      baseCredits: subject.baseCredits || 4,
      entryYear: subject.entryYear || currentSchoolYear(),
      description: subject.description || '',
    })
    setError('')
    setModalOpen(true)
  }

  const handleSave = async () => {
    if (!form.name?.trim()) {
      setError('과목명을 입력하세요.')
      return
    }
    setSaving(true)
    try {
      await saveSubject(schoolId, {
        ...(editTarget && { id: editTarget.id }),
        ...form,
        name: form.name.trim(),
        grade: Number(form.grade),
        semester: form.semester === 'both' ? 'both' : Number(form.semester),
        credits: Number(form.credits),
        baseCredits: Number(form.baseCredits),
        entryYear: Number(form.entryYear),
      })
      await fetchSubjects()
      setModalOpen(false)
    } catch (err) {
      setError('저장 실패: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (subject) => {
    if (!window.confirm(`"${subject.name}" 과목을 삭제하시겠습니까?`)) return
    try {
      await deleteSubject(schoolId, subject.id)
      setSubjects(prev => prev.filter(s => s.id !== subject.id))
    } catch (err) {
      alert('삭제 실패: ' + err.message)
    }
  }

  const handleDownloadExcel = () => {
    if (!subjects.length) {
      alert('다운로드할 과목이 없습니다.')
      return
    }

    const data = subjects.map(s => ({
      // 이 열을 지우지 않고 그대로 다시 올리면 같은 문서가 갱신된다.
      // (지우면 새 과목으로 등록되어 교직원 과목 배정의 연결이 끊긴다)
      '과목ID': s.id || '',
      '구분': s.category || '',
      '교과군': s.subjectGroup || '',
      '과목구분': s.courseType || '',
      '과목명': s.name || '',
      '과목코드': s.subjectCode || '',
      '학년': s.grade || '',
      '학기': s.semester === 'both' ? '양학기' : (s.semester || ''),
      '1학기_학급': s.semester === 'both' ? (s.semesterClassMap?.[1] || []).join(',') : '',
      '2학기_학급': s.semester === 'both' ? (s.semesterClassMap?.[2] || []).join(',') : '',
      '기본학점': s.baseCredits || '',
      '운영학점': s.credits || '',
      '입학년도': s.entryYear || '',
      '선택블록_학년': s.selectionBlock?.grade || '',
      '선택블록_학기': s.selectionBlock?.semester || '',
      '선택블록_택N': s.selectionBlock?.pickCount || '',
      '선택블록_번호': s.selectionBlock?.blockNumber || '',
      '비고': s.description || '',
    }))

    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '과목목록')

    const now = new Date()
    const fileName = `과목목록_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}.xlsx`
    XLSX.writeFile(wb, fileName)

    setNotice({ type: 'success', msg: `${subjects.length}개 과목을 다운로드했습니다.` })
  }

  // 학년도 기준 보기 — 그 학년도에 각 학년이 배우는 과목만 남긴다.
  // 2027학년도 1학년은 2027학번, 3학년은 2025학번 과목이라 학번으로만 보면 헷갈린다.
  const inSchoolYear = (s) =>
    yearView === 'all' || s.entryYear === entryYearFor(yearView, s.grade)

  // 필터링
  const filtered = sortData(
    subjects.filter(s => {
      if (!inSchoolYear(s)) return false
      if (gradeFilter !== 'all' && s.grade !== gradeFilter) return false
      if (catFilter !== '전체' && s.category !== catFilter) return false
      return true
    }),
    {
      category: (s) => s.category || '',
      // 교과군만으로 정렬하면 같은 교과군 안에서 순서가 뒤죽박죽이라, 과목명을 2차 정렬 기준으로 묶는다.
      subjectGroup: (s) => `${s.subjectGroup || ''}_${s.name || ''}`,
      courseType: (s) => s.courseType || '',
      name: (s) => s.name || '',
      semester: (s) => (s.semester === 'both' ? 3 : Number(s.semester) || 0),
      credits: (s) => Number(s.credits) || 0,
      entryYear: (s) => s.entryYear || '',
    }
  )

  const inView = subjects.filter(inSchoolYear)
  const countByGrade = {
    all: inView.length,
    1: inView.filter(s => s.grade === 1).length,
    2: inView.filter(s => s.grade === 2).length,
    3: inView.filter(s => s.grade === 3).length,
  }

  const entryYears = [...new Set(subjects.map(s => s.entryYear).filter(Boolean))].sort()

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight={700}>
            과목 관리
          </Typography>
          {entryYears.length > 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
              등록 입학년도: {entryYears.map(y => `${y}년 (${y}학번)`).join(', ')}
            </Typography>
          )}
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          {subjects.length > 0 && (
            <Button
              variant="outlined"
              startIcon={<DownloadIcon />}
              onClick={handleDownloadExcel}
            >
              Excel 다운로드
            </Button>
          )}
          <Button
            variant="outlined"
            startIcon={<UploadIcon />}
            onClick={() => setImportOpen(true)}
          >
            엑셀 가져오기
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={openAddModal}
          >
            과목 추가
          </Button>
        </Box>
      </Box>

      {/* 알림 */}
      {notice && (
        <Alert severity={notice.type} sx={{ mb: 2 }} onClose={() => setNotice(null)}>
          {notice.msg}
        </Alert>
      )}

      {/* 필터 */}
      <div style={filters.row}>
        {GRADE_TABS.map(tab => (
          <button
            key={tab.key}
            style={gradeFilter === tab.key ? filters.tabActive : filters.tab}
            onClick={() => setGradeFilter(tab.key)}
          >
            {tab.label}
            <span style={gradeFilter === tab.key ? filters.badgeActive : filters.badge}>
              {countByGrade[tab.key]}
            </span>
          </button>
        ))}
        <div style={{ width: '1px', height: '20px', backgroundColor: '#e5e7eb', margin: '0 0.2rem' }} />
        {['전체', '학교지정', '학생선택'].map(cat => (
          <button
            key={cat}
            style={catFilter === cat ? filters.tabActive : filters.tab}
            onClick={() => setCatFilter(cat)}
          >
            {cat}
          </button>
        ))}

        <Box sx={{ flex: 1 }} />

        {/* 학년도 기준 보기 — 그 해 1·2·3학년이 배우는 과목을 한눈에 확인한다.
            다음 학년도를 고르면 미리 채워야 할 학년이 0으로 드러난다. */}
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel>보기 기준</InputLabel>
          <Select value={yearView} label="보기 기준" onChange={e => setYearView(e.target.value)}>
            {[currentSchoolYear() - 1, currentSchoolYear(), currentSchoolYear() + 1].map(y => (
              <MenuItem key={y} value={y}>{y}학년도 기준</MenuItem>
            ))}
            <MenuItem value="all">전체 (학번별)</MenuItem>
          </Select>
        </FormControl>
      </div>

      {yearView !== 'all' && (
        <Alert severity={countByGrade.all === 0 ? 'warning' : 'info'} sx={{ mb: 2 }}>
          <strong>{yearView}학년도 기준</strong> — {[1, 2, 3].map(g =>
            `${g}학년 ${entryYearFor(yearView, g)}학번 ${countByGrade[g]}과목`
          ).join(' · ')}
          {countByGrade.all === 0 && ' — 등록된 과목이 없습니다. 해당 학번의 교육청 배당표를 올리세요.'}
        </Alert>
      )}

      {loading ? (
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
          <CircularProgress />
        </Box>
      ) : subjects.length === 0 ? (
        <Alert severity="info">등록된 과목이 없습니다. "엑셀 가져오기" 또는 "과목 추가"를 이용하세요.</Alert>
      ) : filtered.length === 0 ? (
        <Typography color="text.secondary">조건에 맞는 과목이 없습니다.</Typography>
      ) : (
        <>
          <table style={table.table}>
            <thead style={table.thead}>
              <tr>
                <th style={{ ...table.th, ...thSort }} onClick={() => sortToggle('category')}>구분{Ind('category')}</th>
                <th style={{ ...table.th, ...thSort }} onClick={() => sortToggle('subjectGroup')}>교과군{Ind('subjectGroup')}</th>
                <th style={{ ...table.th, ...thSort }} onClick={() => sortToggle('courseType')}>과목구분{Ind('courseType')}</th>
                <th style={{ ...table.th, ...thSort }} onClick={() => sortToggle('name')}>과목명{Ind('name')}</th>
                <th style={{ ...table.th, ...thSort }} onClick={() => sortToggle('grade')}>학년{Ind('grade')}</th>
                <th style={{ ...table.th, ...thSort }} onClick={() => sortToggle('semester')}>학기{Ind('semester')}</th>
                <th style={{ ...table.th, ...thSort }} onClick={() => sortToggle('credits')}>학점{Ind('credits')}</th>
                <th style={{ ...table.th, ...thSort }} onClick={() => sortToggle('entryYear')}>입학년도{Ind('entryYear')}</th>
                <th style={table.th}>작업</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(subject => (
                <tr key={subject.id} style={table.tr}>
                  <td style={table.td}>
                    <Chip
                      label={subject.category === '학교지정' ? '지정' : '선택'}
                      size="small"
                      color={subject.category === '학교지정' ? 'primary' : 'success'}
                      variant="outlined"
                    />
                  </td>
                  <td style={table.tdMuted}>{subject.subjectGroup || '—'}</td>
                  <td style={table.tdMuted}>{subject.courseType || '—'}</td>
                  <td style={{ ...table.td, fontWeight: 600 }}>{subject.name}</td>
                  <td style={table.tdMuted}>{subject.grade}학년</td>
                  <td style={table.tdMuted}>{semesterLabel(subject.semester)}</td>
                  <td style={table.tdMuted}>{subject.credits}</td>
                  <td style={table.tdMuted}>{subject.entryYear || '—'}</td>
                  <td style={table.td}>
                    <RowActions>
                      <EditAction onClick={() => openEditModal(subject)} />
                      <DeleteAction onClick={() => handleDelete(subject)} />
                    </RowActions>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            총 {subjects.length}개 과목
            {(gradeFilter !== 'all' || catFilter !== '전체') && ` · 필터 결과 ${filtered.length}개`}
          </Typography>
        </>
      )}

      {/* 과목 추가/수정 모달 */}
      <Dialog open={modalOpen} onClose={() => !saving && setModalOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editTarget ? '과목 수정' : '과목 추가'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <FormControl fullWidth>
              <InputLabel>구분</InputLabel>
              <Select
                value={form.category || '학교지정'}
                label="구분"
                onChange={(e) => setForm(prev => ({ ...prev, category: e.target.value }))}
              >
                <MenuItem value="학교지정">학교지정</MenuItem>
                <MenuItem value="학생선택">학생선택</MenuItem>
              </Select>
            </FormControl>

            <TextField
              label="과목명"
              value={form.name || ''}
              onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
              required
              fullWidth
            />

            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <TextField
                label="과목코드"
                value={form.subjectCode || ''}
                onChange={(e) => setForm(prev => ({ ...prev, subjectCode: e.target.value }))}
              />
              <FormControl fullWidth>
                <InputLabel>교과군</InputLabel>
                <Select
                  value={form.subjectGroup || '국어'}
                  label="교과군"
                  onChange={(e) => setForm(prev => ({ ...prev, subjectGroup: e.target.value }))}
                >
                  {SUBJECT_GROUPS.map(g => <MenuItem key={g} value={g}>{g}</MenuItem>)}
                </Select>
              </FormControl>
            </Box>

            <FormControl fullWidth>
              <InputLabel>과목구분</InputLabel>
              <Select
                value={form.courseType || '일반'}
                label="과목구분"
                onChange={(e) => setForm(prev => ({ ...prev, courseType: e.target.value }))}
              >
                {COURSE_TYPES.map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}
              </Select>
            </FormControl>

            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <FormControl fullWidth>
                <InputLabel>학년</InputLabel>
                <Select
                  value={form.grade || 1}
                  label="학년"
                  onChange={(e) => setForm(prev => ({ ...prev, grade: e.target.value }))}
                >
                  <MenuItem value={1}>1학년</MenuItem>
                  <MenuItem value={2}>2학년</MenuItem>
                  <MenuItem value={3}>3학년</MenuItem>
                </Select>
              </FormControl>

              <FormControl fullWidth>
                <InputLabel>학기</InputLabel>
                <Select
                  value={form.semester || 1}
                  label="학기"
                  onChange={(e) => setForm(prev => ({ ...prev, semester: e.target.value }))}
                >
                  <MenuItem value={1}>1학기</MenuItem>
                  <MenuItem value={2}>2학기</MenuItem>
                  <MenuItem value="both">양학기</MenuItem>
                </Select>
              </FormControl>
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2 }}>
              <TextField
                label="입학년도"
                type="number"
                value={form.entryYear || currentSchoolYear()}
                onChange={(e) => setForm(prev => ({ ...prev, entryYear: e.target.value }))}
              />
              <TextField
                label="기본학점"
                type="number"
                value={form.baseCredits || 4}
                onChange={(e) => setForm(prev => ({ ...prev, baseCredits: e.target.value }))}
              />
              <TextField
                label="운영학점"
                type="number"
                value={form.credits || 3}
                onChange={(e) => setForm(prev => ({ ...prev, credits: e.target.value }))}
              />
            </Box>

            <TextField
              label="비고"
              value={form.description || ''}
              onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
              multiline
              rows={2}
            />

            {error && (
              <Alert severity="error">{error}</Alert>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setModalOpen(false)} disabled={saving}>
            취소
          </Button>
          <Button variant="contained" onClick={handleSave} disabled={saving}>
            {saving ? '저장 중...' : editTarget ? '수정' : '추가'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 엑셀 가져오기 모달 */}
      {importOpen && (
        <ImportModal
          schoolId={schoolId}
          onClose={() => setImportOpen(false)}
          onDone={(count, year, stats) => {
            setImportOpen(false)
            const detail = stats
              ? ` (기존 갱신 ${stats.updated} · 신규 ${stats.created} · 삭제 ${stats.deleted})`
              : ''
            setNotice({ type: 'success', msg: `${year}년 입학 과목 ${count}개 저장 완료${detail}` })
            fetchSubjects()
          }}
        />
      )}
    </Box>
  )
}
