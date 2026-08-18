import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, query, where, orderBy, onSnapshot, getDocs, doc, getDoc } from 'firebase/firestore'
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
import { currentSchoolYear } from '@shared/lib/schema'
import Layout from '../../components/Layout'
import { ACCENT, ACCENT_BG } from './EvalPlanSection'
import { STATUS_LABELS, GRADE_OPTIONS } from './evalPlanUtils'

const fieldSx = { '& .MuiOutlinedInput-root': { borderRadius: '10px', bgcolor: '#fff' } }
const tableHeadSx = {
  '& th': { bgcolor: '#f8fafc', color: '#475569', fontWeight: 700, fontSize: '0.74rem', borderBottom: '1px solid #e2e8f0' },
}
const rowSx = { '& td': { borderBottom: '1px solid #f1f5f9', color: '#334155' }, '&:last-of-type td': { borderBottom: 0 } }

const YEAR_OPTIONS = [currentSchoolYear() - 1, currentSchoolYear(), currentSchoolYear() + 1]
const SEMESTER_FIELD = { 1: 'semester1Subjects', 2: 'semester2Subjects' }

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
      })
    })
  })
  return rows
}

// 교직원 관리 > 과목배정(teacherSubjects) 데이터를 "이 학기에 계획서를 내야 하는 교사×과목" 목록으로 편다.
function buildExpectedRows(teacherSubjectsDocs, semester) {
  const field = SEMESTER_FIELD[semester]
  const rows = []
  teacherSubjectsDocs.forEach((d) => {
    ;(d[field] || []).forEach((s, i) => {
      if (!s.subjectName) return
      rows.push({
        id: `${d.teacherUid}_${s.subjectName}_${s.grade}_${i}`,
        teacherUid: d.teacherUid,
        teacherName: d.teacherName || '',
        subjectName: s.subjectName,
        grade: s.grade || null,
        hoursPerWeek: s.hoursPerWeek || null,
      })
    })
  })
  return rows
}

// 과목배정 항목 하나가 실제 제출된 계획서(본인 제출 또는 공동 지도교사로 매칭)로 커버되는지 판정.
function findCoveringPlan(row, plans) {
  return plans.find((p) => (
    (p.subject || '').trim() === row.subjectName.trim() &&
    (p.uploaderUid === row.teacherUid || (p.matchedTeacherUids || []).includes(row.teacherUid))
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
    '과목': r.subjectName,
    '담당교사': r.teacherName,
    '학점(주당시수)': r.hoursPerWeek ?? '',
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

  const [year, setYear] = useState(currentSchoolYear())
  const [semester, setSemester] = useState(1)
  const [tab, setTab] = useState(0)
  const [onlyMissing, setOnlyMissing] = useState(false)

  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [teacherSubjectDocs, setTeacherSubjectDocs] = useState([])
  const [coverageLoading, setCoverageLoading] = useState(true)

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

  // 과목배정(교직원 관리)은 실시간 구독까지는 필요 없어 학년도 바뀔 때만 다시 읽는다.
  useEffect(() => {
    if (!allowed || !schoolId) return
    setCoverageLoading(true)
    getDocs(query(collection(db, 'schools', schoolId, 'teacherSubjects'), where('year', '==', year)))
      .then((snap) => setTeacherSubjectDocs(snap.docs.map((d) => d.data())))
      .catch((err) => console.error('[EvalPlanManagerDashboard] 과목배정 조회 실패:', err))
      .finally(() => setCoverageLoading(false))
  }, [allowed, schoolId, year])

  const rowsByGrade = useMemo(() => {
    const rows = buildRows(plans)
    const byGrade = {}
    GRADE_OPTIONS.forEach((g) => { byGrade[g] = [] })
    rows.forEach((r) => { if (byGrade[r.grade]) byGrade[r.grade].push(r) })
    return byGrade
  }, [plans])

  const coverageRows = useMemo(() => {
    const expected = buildExpectedRows(teacherSubjectDocs, semester)
    return expected
      .map((row) => {
        const plan = findCoveringPlan(row, plans)
        return { ...row, submitted: !!plan, plan }
      })
      .sort((a, b) => (a.grade || 0) - (b.grade || 0) || a.teacherName.localeCompare(b.teacherName, 'ko'))
  }, [teacherSubjectDocs, semester, plans])

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
            const rows = rowsByGrade[grade]
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
                      <TableCell rowSpan={2}>교과(군)</TableCell>
                      <TableCell rowSpan={2}>과목</TableCell>
                      <TableCell rowSpan={2} align="center">학점</TableCell>
                      <TableCell align="center" colSpan={2}>수행평가(%)</TableCell>
                      <TableCell align="center" colSpan={2}>정기시험-중간(%)</TableCell>
                      <TableCell align="center" colSpan={2}>정기시험-기말(%)</TableCell>
                      <TableCell rowSpan={2}>제출자</TableCell>
                      <TableCell rowSpan={2}>상태</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell align="center">서논술</TableCell>
                      <TableCell align="center">그외</TableCell>
                      <TableCell align="center">서논술</TableCell>
                      <TableCell align="center">그외</TableCell>
                      <TableCell align="center">서논술</TableCell>
                      <TableCell align="center">그외</TableCell>
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
              교직원 관리 &gt; 과목배정에 {year}학년도 {semester}학기 배정 데이터가 없습니다.
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
                    교직원 관리 &gt; 과목배정의 {semester}학기 배정 기준
                  </Typography>
                </Box>
              </Box>
              <FormControlLabel
                control={<Switch size="small" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />}
                label={<Typography sx={{ fontSize: '0.82rem' }}>미제출만 보기</Typography>}
              />
            </Box>

            {GRADE_OPTIONS.map((grade) => {
              const rows = coverageByGrade[grade]
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
                        <TableCell>과목</TableCell>
                        <TableCell>담당교사</TableCell>
                        <TableCell align="center">학점</TableCell>
                        <TableCell>제출여부</TableCell>
                        <TableCell>제출자</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {rows.map((r) => (
                        <TableRow
                          key={r.id} hover
                          onClick={() => r.plan && navigate(`/evalplan/${r.plan.id}`)}
                          sx={{ cursor: r.plan ? 'pointer' : 'default', ...rowSx }}
                        >
                          <TableCell sx={{ fontWeight: 600, color: '#1e293b' }}>{r.subjectName}</TableCell>
                          <TableCell>{r.teacherName || '-'}</TableCell>
                          <TableCell align="center">{r.hoursPerWeek ?? '-'}</TableCell>
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
