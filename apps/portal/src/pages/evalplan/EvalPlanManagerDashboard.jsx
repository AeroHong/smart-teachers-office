import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, query, where, orderBy, onSnapshot, doc, getDoc } from 'firebase/firestore'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import Button from '@mui/material/Button'
import Tabs from '@mui/material/Tabs'
import Tab from '@mui/material/Tab'
import FormControlLabel from '@mui/material/FormControlLabel'
import Switch from '@mui/material/Switch'
import Table from '@mui/material/Table'
import TableHead from '@mui/material/TableHead'
import TableBody from '@mui/material/TableBody'
import TableRow from '@mui/material/TableRow'
import TableCell from '@mui/material/TableCell'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Alert from '@mui/material/Alert'
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { currentSchoolYear, entryYearFor } from '@shared/lib/schema'
import { loadSubjects } from '@shared/lib/subjectData'
import { useTableSort } from '@shared/hooks/useTableSort'
import { useCurrentTerm } from '@shared/hooks/useCurrentTerm'
import Layout from '../../components/Layout'
import { ACCENT, ACCENT_BG } from './EvalPlanSection'
import { STATUS_LABELS, GRADE_OPTIONS, gradeMethodEntries } from './evalPlanUtils'

const fieldSx = { '& .MuiOutlinedInput-root': { borderRadius: '10px', bgcolor: '#fff' } }
const tableHeadSx = {
  '& th': { bgcolor: '#f8fafc', color: '#475569', fontWeight: 700, fontSize: '0.74rem', borderBottom: '1px solid #e2e8f0' },
}
const rowSx = { '& td': { borderBottom: '1px solid #f1f5f9', color: '#334155' }, '&:last-of-type td': { borderBottom: 0 } }
const thSortSx = { cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }

const YEAR_OPTIONS = [currentSchoolYear() - 1, currentSchoolYear(), currentSchoolYear() + 1]

// 교과군만으로 정렬하면 같은 교과군 안에서 순서가 뒤죽박죽이라, 과목명을 2차 정렬 기준으로 묶는다.
const PLAN_SORT_GETTERS = {
  subjectGroup: (r) => `${r.subjectGroup || ''}_${r.subject || ''}`,
  subject: (r) => r.subject || '',
  weeklyHours: (r) => Number(r.weeklyHours) || 0,
  perfEssay: (r) => Number(r.perfEssay) || 0,
  perfOther: (r) => Number(r.perfOther) || 0,
  midEssay: (r) => Number(r.midEssay) || 0,
  midOther: (r) => Number(r.midOther) || 0,
  finEssay: (r) => Number(r.finEssay) || 0,
  finOther: (r) => Number(r.finOther) || 0,
  gradeMethod: (r) => r.gradeMethodEntries.map((e) => e.label).join(', '),
  uploaderName: (r) => r.uploaderName || '',
  status: (r) => r.status || '',
}

const COVERAGE_SORT_GETTERS = {
  subjectGroup: (r) => `${r.subjectGroup || ''}_${r.subjectName || ''}`,
  subjectName: (r) => r.subjectName || '',
  credits: (r) => Number(r.credits) || 0,
  submitted: (r) => (r.submitted ? 1 : 0),
  uploaderName: (r) => r.plan?.uploaderName || '',
}

function pct(cell) { return cell?.ratio ?? null }

// plans → 학년별로 펼친 행(한 과목이 여러 학년에 걸치면 학년마다 행을 하나씩 만든다)
function buildRows(plans) {
  const rows = []
  plans.forEach((p) => {
    const grades = p.grades?.length ? p.grades : [null]
    grades.forEach((grade) => {
      const examRatio = p.data?.examRatio || {}
      rows.push({
        id: `${p.id}_${grade ?? 'x'}`,
        planId: p.id,
        grade,
        subjectGroup: p.subjectGroup || '',
        subject: p.subject || '',
        weeklyHours: p.weeklyHours ?? null,
        teacherNames: p.teacherNames || [],
        uploaderName: p.uploaderName || '',
        createdAt: p.createdAt,
        status: p.status,
        perfEssay: pct(examRatio.performance?.essayType),
        perfOther: pct(examRatio.performance?.otherType),
        midEssay: pct(examRatio.midterm?.essayType),
        midOther: pct(examRatio.midterm?.objectiveType),
        finEssay: pct(examRatio.final?.essayType),
        finOther: pct(examRatio.final?.objectiveType),
        gradeMethodEntries: gradeMethodEntries(p.data?.gradeMethod),
      })
    })
  })
  return rows
}

// 관리자 페이지 > 과목 관리(subjects) 데이터를 "이 학년도·학기에 계획서를 내야 하는 과목" 목록으로 편다.
// subjects는 학년도가 아니라 입학년도(entryYear)로 스코프되므로, 선택한 학년도 기준으로
// 학년별 해당 입학년도를 역산해 걸러낸다(AdminSubjects.jsx의 "학년도 기준 보기"와 동일한 방식).
// 교직원 관리 > 과목배정(teacherSubjects)은 담당자가 학기별로 직접 입력해야 해 2학기 데이터가
// 비어 있는 경우가 많았다 — 과목 관리는 교육청 배당표 기준이라 학기 편성이 항상 채워져 있다.
function buildExpectedRows(subjects, year, semester) {
  return subjects
    .filter((s) => s.grade && s.entryYear === entryYearFor(year, s.grade))
    .filter((s) => s.semester === semester || s.semester === 'both')
    .map((s) => ({
      id: s.id,
      subjectId: s.id,
      subjectName: s.name || '',
      subjectGroup: s.subjectGroup || '',
      grade: s.grade,
      credits: s.credits ?? null,
    }))
}

// 과목 하나가 실제 제출된 계획서로 커버되는지 판정 — 과목명·학년으로 매칭한다.
// 한 계획서는 여러 명의 공동 지도교사를 포함할 수 있어 교사 단위가 아니라 과목 단위로 센다.
function findCoveringPlan(row, plans) {
  return plans.find((p) => (
    (p.subject || '').trim() === row.subjectName.trim() &&
    (p.grades || []).includes(row.grade)
  )) || null
}

async function downloadSubmittedXlsx(rowsByGrade, year, semester) {
  const XLSX = await import('xlsx')
  const sheetRows = []
  GRADE_OPTIONS.forEach((g) => {
    (rowsByGrade[g] || []).forEach((r) => {
      sheetRows.push({
        '학년': `${g}학년`,
        '교과(군)': r.subjectGroup,
        '과목': r.subject,
        '학점(주당시수)': r.weeklyHours ?? '',
        '수행평가-서논술형(%)': r.perfEssay ?? '',
        '수행평가-그외(%)': r.perfOther ?? '',
        '정기시험(중간)-서논술형(%)': r.midEssay ?? '',
        '정기시험(중간)-그외(%)': r.midOther ?? '',
        '정기시험(기말)-서논술형(%)': r.finEssay ?? '',
        '정기시험(기말)-그외(%)': r.finOther ?? '',
        '성적산출방법': r.gradeMethodEntries.map((e) => e.label).join(', '),
        '담당교사': r.teacherNames.join(', '),
        '제출자': r.uploaderName,
        '상태': STATUS_LABELS[r.status] || r.status,
      })
    })
  })
  const ws = XLSX.utils.json_to_sheet(sheetRows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '전체현황')
  XLSX.writeFile(wb, `평가운영계획_${year}학년도_${semester}학기.xlsx`)
}

async function downloadCoverageXlsx(coverageRows, year, semester) {
  const XLSX = await import('xlsx')
  const sheetRows = coverageRows.map((r) => ({
    '학년': r.grade ? `${r.grade}학년` : '-',
    '교과(군)': r.subjectGroup,
    '과목': r.subjectName,
    '학점': r.credits ?? '',
    '제출여부': r.submitted ? '제출완료' : '미제출',
    '제출자': r.plan?.uploaderName || '',
  }))
  const ws = XLSX.utils.json_to_sheet(sheetRows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '제출현황')
  XLSX.writeFile(wb, `평가운영계획_제출현황_${year}학년도_${semester}학기.xlsx`)
}

export default function EvalPlanManagerDashboard() {
  const navigate = useNavigate()
  const { user, schoolId, isAdmin } = useAuth()

  const [allowed, setAllowed] = useState(isAdmin)
  const [checkingAccess, setCheckingAccess] = useState(!isAdmin)

  // 관리자 페이지 > 홈에서 지정한 학년도-학기 기준을 초기 필터값으로 쓴다 — 이후 사용자가
  // 직접 바꾸면 그 선택을 유지하고, 기준값이 나중에 바뀌어도 되돌리지 않는다.
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

  const [tab, setTab] = useState(0)
  const [onlyMissing, setOnlyMissing] = useState(false)

  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [subjectCatalog, setSubjectCatalog] = useState([])
  const [coverageLoading, setCoverageLoading] = useState(true)

  const planSort = useTableSort()
  const coverageSort = useTableSort()

  useEffect(() => {
    if (isAdmin) { setAllowed(true); setCheckingAccess(false); return }
    if (!schoolId || !user) return
    getDoc(doc(db, 'schools', schoolId, 'evaluationPlanManagers', user.uid))
      .then((snap) => setAllowed(snap.exists()))
      .catch(() => setAllowed(false))
      .finally(() => setCheckingAccess(false))
  }, [schoolId, user, isAdmin])

  useEffect(() => {
    if (!allowed || !schoolId) return
    setLoading(true)
    const q = query(
      collection(db, 'schools', schoolId, 'evaluationPlans'),
      where('year', '==', year),
      where('semester', '==', semester),
      orderBy('createdAt', 'desc'),
    )
    const unsub = onSnapshot(q, (snap) => {
      setPlans(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      setLoading(false)
    }, (err) => {
      console.error('[EvalPlanManagerDashboard] 조회 실패:', err)
      setError(err.message)
      setLoading(false)
    })
    return unsub
  }, [allowed, schoolId, year, semester])

  // 과목 관리(subjects)는 entryYear 기준이라 학년도가 바뀌어도 다시 읽을 필요가 없다 —
  // 전체를 한 번만 읽고 학년도·학기 필터는 아래 useMemo에서 클라이언트로 처리한다.
  useEffect(() => {
    if (!allowed || !schoolId) return
    setCoverageLoading(true)
    loadSubjects(schoolId)
      .then(setSubjectCatalog)
      .catch((err) => console.error('[EvalPlanManagerDashboard] 과목 목록 조회 실패:', err))
      .finally(() => setCoverageLoading(false))
  }, [allowed, schoolId])

  const rowsByGrade = useMemo(() => {
    const rows = buildRows(plans)
    const byGrade = {}
    GRADE_OPTIONS.forEach((g) => { byGrade[g] = [] })
    rows.forEach((r) => { if (byGrade[r.grade]) byGrade[r.grade].push(r) })
    return byGrade
  }, [plans])

  const coverageRows = useMemo(() => {
    const expected = buildExpectedRows(subjectCatalog, year, semester)
    return expected
      .map((row) => {
        const plan = findCoveringPlan(row, plans)
        return { ...row, submitted: !!plan, plan }
      })
      .sort((a, b) => (a.grade || 0) - (b.grade || 0) || a.subjectName.localeCompare(b.subjectName, 'ko'))
  }, [subjectCatalog, year, semester, plans])

  const coverageByGrade = useMemo(() => {
    const byGrade = {}
    GRADE_OPTIONS.forEach((g) => { byGrade[g] = [] })
    coverageRows.forEach((r) => {
      if (!byGrade[r.grade]) return
      if (onlyMissing && r.submitted) return
      byGrade[r.grade].push(r)
    })
    return byGrade
  }, [coverageRows, onlyMissing])

  const submittedCount = coverageRows.filter((r) => r.submitted).length
  const totalCount = coverageRows.length
  const coveragePct = totalCount > 0 ? Math.round((submittedCount / totalCount) * 100) : null

  if (checkingAccess) {
    return <Layout><Box display="flex" justifyContent="center" py={6}><CircularProgress sx={{ color: ACCENT }} /></Box></Layout>
  }
  if (!allowed) {
    return (
      <Layout>
        <Alert severity="warning" sx={{ borderRadius: '10px' }}>
          업무 담당자로 지정된 계정만 전체 현황을 볼 수 있습니다. 담당자 지정이 필요하면 관리자에게 문의해주세요.
        </Alert>
      </Layout>
    )
  }

  return (
    <Layout wide>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5, flexWrap: 'wrap', gap: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{
            width: 40, height: 40, borderRadius: '10px', bgcolor: ACCENT_BG,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem',
          }}>
            📊
          </Box>
          <Typography sx={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a' }}>평가 운영 계획 — 전체 현황</Typography>
        </Box>
        <Button
          variant="outlined" size="small" startIcon={<DownloadOutlinedIcon />}
          onClick={() => (tab === 0 ? downloadSubmittedXlsx(rowsByGrade, year, semester) : downloadCoverageXlsx(coverageRows, year, semester))}
          sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 700, borderColor: '#e2e8f0', color: '#475569' }}
        >
          xlsx 다운로드
        </Button>
      </Box>
      <Typography sx={{ fontSize: '0.85rem', color: '#64748b', mb: 3 }}>
        학교 전체 교과의 제출 현황을 학년-학기 기준으로 조회합니다.
      </Typography>

      <Box sx={{ p: 2, mb: 1.5, display: 'flex', gap: 2, flexWrap: 'wrap', borderRadius: '14px', border: '1px solid #e2e8f0', bgcolor: '#f8fafc' }}>
        <FormControl size="small" sx={{ ...fieldSx, width: 130 }}>
          <InputLabel>학년도</InputLabel>
          <Select label="학년도" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {YEAR_OPTIONS.map((y) => <MenuItem key={y} value={y}>{y}학년도</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ ...fieldSx, width: 110 }}>
          <InputLabel>학기</InputLabel>
          <Select label="학기" value={semester} onChange={(e) => setSemester(Number(e.target.value))}>
            <MenuItem value={1}>1학기</MenuItem>
            <MenuItem value={2}>2학기</MenuItem>
          </Select>
        </FormControl>
      </Box>

      <Tabs
        value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2, minHeight: 36, '& .MuiTab-root': { minHeight: 36, textTransform: 'none', fontWeight: 700 } }}
      >
        <Tab label="제출된 계획" />
        <Tab
          label={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              제출 현황
              {coveragePct != null && (
                <Chip
                  size="small"
                  label={`${submittedCount}/${totalCount}`}
                  sx={{
                    height: 18, fontSize: '0.68rem', fontWeight: 700,
                    bgcolor: coveragePct === 100 ? '#dcfce7' : '#fef2f2',
                    color: coveragePct === 100 ? '#166534' : '#991b1b',
                  }}
                />
              )}
            </Box>
          }
        />
      </Tabs>

      {error && <Alert severity="error" sx={{ mb: 2, borderRadius: '10px' }}>{error}</Alert>}

      {tab === 0 && (
        loading ? (
          <Box display="flex" justifyContent="center" py={6}><CircularProgress sx={{ color: ACCENT }} /></Box>
        ) : plans.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 6, borderRadius: '14px', border: '1px dashed #e2e8f0', bgcolor: '#f8fafc' }}>
            <Typography sx={{ fontSize: '2rem', mb: 1 }}>📭</Typography>
            <Typography sx={{ fontSize: '0.9rem', color: '#64748b' }}>해당 학년도·학기의 제출물이 없습니다.</Typography>
          </Box>
        ) : (
          GRADE_OPTIONS.map((grade) => {
            const rows = planSort.sortData(rowsByGrade[grade], PLAN_SORT_GETTERS)
            if (!rows.length) return null
            return (
              <Box key={grade} sx={{ mb: 2.5, overflowX: 'auto', borderRadius: '14px', border: '1px solid #e2e8f0', bgcolor: '#fff' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.75, borderBottom: '1px solid #e2e8f0' }}>
                  <Box sx={{ width: 4, height: 16, borderRadius: '3px', bgcolor: ACCENT }} />
                  <Typography sx={{ fontSize: '0.92rem', fontWeight: 800, color: '#1e293b' }}>{grade}학년</Typography>
                  <Chip size="small" label={`${rows.length}건`} sx={{ bgcolor: ACCENT_BG, color: ACCENT, fontWeight: 700, height: 20, fontSize: '0.7rem' }} />
                </Box>
                <Table size="small">
                  <TableHead sx={tableHeadSx}>
                    <TableRow>
                      <TableCell rowSpan={2} sx={thSortSx} onClick={() => planSort.toggle('subjectGroup')}>교과(군){planSort.Ind('subjectGroup')}</TableCell>
                      <TableCell rowSpan={2} sx={thSortSx} onClick={() => planSort.toggle('subject')}>과목{planSort.Ind('subject')}</TableCell>
                      <TableCell rowSpan={2} align="center" sx={thSortSx} onClick={() => planSort.toggle('weeklyHours')}>학점{planSort.Ind('weeklyHours')}</TableCell>
                      <TableCell align="center" colSpan={2}>수행평가(%)</TableCell>
                      <TableCell align="center" colSpan={2}>정기시험-중간(%)</TableCell>
                      <TableCell align="center" colSpan={2}>정기시험-기말(%)</TableCell>
                      <TableCell rowSpan={2} sx={thSortSx} onClick={() => planSort.toggle('gradeMethod')}>성적산출방법{planSort.Ind('gradeMethod')}</TableCell>
                      <TableCell rowSpan={2} sx={thSortSx} onClick={() => planSort.toggle('uploaderName')}>제출자{planSort.Ind('uploaderName')}</TableCell>
                      <TableCell rowSpan={2} sx={thSortSx} onClick={() => planSort.toggle('status')}>상태{planSort.Ind('status')}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell align="center" sx={thSortSx} onClick={() => planSort.toggle('perfEssay')}>서논술{planSort.Ind('perfEssay')}</TableCell>
                      <TableCell align="center" sx={thSortSx} onClick={() => planSort.toggle('perfOther')}>그외{planSort.Ind('perfOther')}</TableCell>
                      <TableCell align="center" sx={thSortSx} onClick={() => planSort.toggle('midEssay')}>서논술{planSort.Ind('midEssay')}</TableCell>
                      <TableCell align="center" sx={thSortSx} onClick={() => planSort.toggle('midOther')}>그외{planSort.Ind('midOther')}</TableCell>
                      <TableCell align="center" sx={thSortSx} onClick={() => planSort.toggle('finEssay')}>서논술{planSort.Ind('finEssay')}</TableCell>
                      <TableCell align="center" sx={thSortSx} onClick={() => planSort.toggle('finOther')}>그외{planSort.Ind('finOther')}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.id} hover onClick={() => navigate(`/evalplan/${r.planId}`)} sx={{ cursor: 'pointer', ...rowSx }}>
                        <TableCell sx={{ fontWeight: 600 }}>{r.subjectGroup || '-'}</TableCell>
                        <TableCell sx={{ fontWeight: 600, color: '#1e293b' }}>{r.subject || '-'}</TableCell>
                        <TableCell align="center">{r.weeklyHours ?? '-'}</TableCell>
                        <TableCell align="center">{r.perfEssay ?? '-'}</TableCell>
                        <TableCell align="center">{r.perfOther ?? '-'}</TableCell>
                        <TableCell align="center">{r.midEssay ?? '-'}</TableCell>
                        <TableCell align="center">{r.midOther ?? '-'}</TableCell>
                        <TableCell align="center">{r.finEssay ?? '-'}</TableCell>
                        <TableCell align="center">{r.finOther ?? '-'}</TableCell>
                        <TableCell>
                          {r.gradeMethodEntries.length ? (
                            <Box sx={{ display: 'flex', gap: 0.4, flexWrap: 'wrap' }}>
                              {r.gradeMethodEntries.map((e) => (
                                <Chip key={e.key} size="small" label={e.label} sx={{ bgcolor: e.bg, color: e.color, fontWeight: 700, height: 20, fontSize: '0.68rem' }} />
                              ))}
                            </Box>
                          ) : '-'}
                        </TableCell>
                        <TableCell>{r.uploaderName || '-'}</TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={STATUS_LABELS[r.status] || r.status}
                            sx={r.status === 'confirmed'
                              ? { bgcolor: '#dcfce7', color: '#166534', fontWeight: 700 }
                              : { bgcolor: '#fef9c3', color: '#854d0e', fontWeight: 700 }}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            )
          })
        )
      )}

      {tab === 1 && (
        coverageLoading || loading ? (
          <Box display="flex" justifyContent="center" py={6}><CircularProgress sx={{ color: ACCENT }} /></Box>
        ) : totalCount === 0 ? (
          <Box sx={{ textAlign: 'center', py: 6, borderRadius: '14px', border: '1px dashed #e2e8f0', bgcolor: '#f8fafc' }}>
            <Typography sx={{ fontSize: '2rem', mb: 1 }}>🧑‍🏫</Typography>
            <Typography sx={{ fontSize: '0.9rem', color: '#64748b' }}>
              관리자 페이지 &gt; 과목 관리에 {year}학년도 {semester}학기 개설된 과목이 없습니다.
            </Typography>
          </Box>
        ) : (
          <>
            <Box sx={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1.5,
              p: 2, mb: 2, borderRadius: '14px', border: '1px solid #e2e8f0', bgcolor: '#fff',
            }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Typography sx={{ fontSize: '1.6rem', fontWeight: 800, color: coveragePct === 100 ? '#16a34a' : ACCENT }}>
                  {coveragePct}%
                </Typography>
                <Box>
                  <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: '#1e293b' }}>
                    {submittedCount} / {totalCount}건 제출
                  </Typography>
                  <Typography sx={{ fontSize: '0.76rem', color: '#94a3b8' }}>
                    관리자 페이지 &gt; 과목 관리의 {semester}학기 개설 과목 기준
                  </Typography>
                </Box>
              </Box>
              <FormControlLabel
                control={<Switch size="small" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />}
                label={<Typography sx={{ fontSize: '0.82rem' }}>미제출만 보기</Typography>}
              />
            </Box>

            {GRADE_OPTIONS.map((grade) => {
              const rows = coverageSort.sortData(coverageByGrade[grade], COVERAGE_SORT_GETTERS)
              if (!rows.length) return null
              return (
                <Box key={grade} sx={{ mb: 2.5, overflowX: 'auto', borderRadius: '14px', border: '1px solid #e2e8f0', bgcolor: '#fff' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.75, borderBottom: '1px solid #e2e8f0' }}>
                    <Box sx={{ width: 4, height: 16, borderRadius: '3px', bgcolor: ACCENT }} />
                    <Typography sx={{ fontSize: '0.92rem', fontWeight: 800, color: '#1e293b' }}>{grade}학년</Typography>
                    <Chip size="small" label={`${rows.length}건`} sx={{ bgcolor: ACCENT_BG, color: ACCENT, fontWeight: 700, height: 20, fontSize: '0.7rem' }} />
                  </Box>
                  <Table size="small">
                    <TableHead sx={tableHeadSx}>
                      <TableRow>
                        <TableCell sx={thSortSx} onClick={() => coverageSort.toggle('subjectGroup')}>교과(군){coverageSort.Ind('subjectGroup')}</TableCell>
                        <TableCell sx={thSortSx} onClick={() => coverageSort.toggle('subjectName')}>과목{coverageSort.Ind('subjectName')}</TableCell>
                        <TableCell align="center" sx={thSortSx} onClick={() => coverageSort.toggle('credits')}>학점{coverageSort.Ind('credits')}</TableCell>
                        <TableCell sx={thSortSx} onClick={() => coverageSort.toggle('submitted')}>제출여부{coverageSort.Ind('submitted')}</TableCell>
                        <TableCell sx={thSortSx} onClick={() => coverageSort.toggle('uploaderName')}>제출자{coverageSort.Ind('uploaderName')}</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {rows.map((r) => (
                        <TableRow
                          key={r.id} hover
                          onClick={() => r.plan && navigate(`/evalplan/${r.plan.id}`)}
                          sx={{ cursor: r.plan ? 'pointer' : 'default', ...rowSx }}
                        >
                          <TableCell sx={{ fontWeight: 600 }}>{r.subjectGroup || '-'}</TableCell>
                          <TableCell sx={{ fontWeight: 600, color: '#1e293b' }}>{r.subjectName}</TableCell>
                          <TableCell align="center">{r.credits ?? '-'}</TableCell>
                          <TableCell>
                            <Chip
                              size="small"
                              label={r.submitted ? '제출완료' : '미제출'}
                              sx={r.submitted
                                ? { bgcolor: '#dcfce7', color: '#166534', fontWeight: 700 }
                                : { bgcolor: '#fef2f2', color: '#991b1b', fontWeight: 700 }}
                            />
                          </TableCell>
                          <TableCell>{r.plan?.uploaderName || '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Box>
              )
            })}
          </>
        )
      )}
    </Layout>
  )
}
