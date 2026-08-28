import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, query, where, getDocs, getDoc, doc, setDoc } from 'firebase/firestore'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { COL, USERS, SCHOOLS, schoolPath, officeLayoutId, currentSchoolYear } from '@shared/lib/schema'
import { useCurrentTerm } from '@shared/hooks/useCurrentTerm'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardActionArea from '@mui/material/CardActionArea'
import Grid from '@mui/material/Grid'
import Alert from '@mui/material/Alert'
import AlertTitle from '@mui/material/AlertTitle'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import WarningIcon from '@mui/icons-material/Warning'

const TERM_YEAR_OPTIONS = [currentSchoolYear() - 1, currentSchoolYear(), currentSchoolYear() + 1]

// 전체 학급 목록 (1-1 ~ 3-11)
const ALL_CLASSES = []
for (let grade = 1; grade <= 3; grade++) {
  for (let classNo = 1; classNo <= 11; classNo++) {
    ALL_CLASSES.push(`${grade}-${classNo}`)
  }
}

export default function AdminHome() {
  const navigate = useNavigate()
  const { schoolId } = useAuth()
  const [year, setYear] = useState(new Date().getFullYear())
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState({
    pending: 0,
    staffNoDept: 0,
    staffNoOffice: 0,
    missingHomerooms: [],
    officesNoLayout: [],
    studentOuOutdated: false,
  })

  // 학년도-학기 기준 — 평가 운영 계획 제출 현황처럼 "지금 학기" 기준으로 조회하는
  // 화면들이 매번 필터를 다시 고르지 않도록, 여기서 지정한 값을 기본값으로 쓴다.
  const currentTerm = useCurrentTerm(schoolId)
  const [termYear, setTermYear] = useState(currentTerm.year)
  const [termSemester, setTermSemester] = useState(currentTerm.semester)
  const [savingTerm, setSavingTerm] = useState(false)
  const [termSavedAt, setTermSavedAt] = useState(null)

  useEffect(() => {
    setTermYear(currentTerm.year)
    setTermSemester(currentTerm.semester)
  }, [currentTerm.year, currentTerm.semester])

  const termDirty = termYear !== currentTerm.year || termSemester !== currentTerm.semester

  const handleSaveTerm = async () => {
    if (!schoolId) return
    setSavingTerm(true)
    try {
      await setDoc(doc(db, SCHOOLS, schoolId), { currentTerm: { year: termYear, semester: termSemester } }, { merge: true })
      setTermSavedAt(Date.now())
    } catch (err) {
      console.error('학년도-학기 기준 저장 실패:', err)
    } finally {
      setSavingTerm(false)
    }
  }

  useEffect(() => {
    if (!schoolId) return
    fetchSummary()
  }, [schoolId, year])

  const fetchSummary = async () => {
    setLoading(true)
    try {
      // 1. 승인 대기 계정 수
      const pendingSnap = await getDocs(
        query(collection(db, USERS),
          where('schoolId', '==', schoolId),
          where('role', '==', 'pending'))
      )

      // 2. 교원 배정 데이터 (year = 학년도)
      const assignmentsSnap = await getDocs(
        query(
          collection(db, ...schoolPath(schoolId, COL.TEACHER_ASSIGNMENTS)),
          where('year', '==', year)
        )
      )

      const staffNoDept = assignmentsSnap.docs.filter(d => !d.data().department).length
      const staffNoOffice = assignmentsSnap.docs.filter(d => !d.data().office).length

      // 3. 담임 미배정 학급
      const assignedHomerooms = assignmentsSnap.docs
        .filter(d => d.data().homeroom)
        .map(d => {
          const hr = d.data().homeroom
          return `${hr.grade}-${hr.class}`
        })
      const missingHomerooms = ALL_CLASSES.filter(c => !assignedHomerooms.includes(c))

      // 4. 자리배치 미완료 사무실 (confirmed: true가 아닌 경우)
      const offices = [...new Set(assignmentsSnap.docs.map(d => d.data().office).filter(Boolean))]
      const layoutDocs = await Promise.all(offices.map(office =>
        getDoc(doc(db, ...schoolPath(schoolId, COL.OFFICE_LAYOUTS), officeLayoutId(year, office)))
      ))
      const officesNoLayout = offices.filter((_, i) =>
        !layoutDocs[i].exists() || !layoutDocs[i].data()?.confirmed
      )

      // 5. 학생 OU 갱신 필요 여부
      const schoolDoc = await getDoc(doc(db, SCHOOLS, schoolId))
      const ouPath = schoolDoc.data()?.workspaceSync?.studentOuPath || ''
      const studentOuOutdated = ouPath && !ouPath.includes(year.toString())

      setSummary({
        pending: pendingSnap.size,
        staffNoDept,
        staffNoOffice,
        missingHomerooms,
        officesNoLayout,
        studentOuOutdated,
      })
    } catch (err) {
      console.error('집계 실패:', err)
    } finally {
      setLoading(false)
    }
  }

  const totalIssues =
    summary.pending +
    summary.staffNoDept +
    summary.staffNoOffice +
    summary.missingHomerooms.length +
    summary.officesNoLayout.length +
    (summary.studentOuOutdated ? 1 : 0)

  const CHECKLIST_ITEMS = [
    {
      title: '승인 대기 계정',
      count: summary.pending,
      path: '/admin/accounts',
      severity: summary.pending > 0 ? 'warning' : 'success',
      icon: summary.pending > 0 ? WarningIcon : CheckCircleIcon,
      color: summary.pending > 0 ? '#ed6c02' : '#2e7d32',
      bgColor: summary.pending > 0 ? '#fff4e5' : '#edf7ed',
    },
    {
      title: '부서 미배정 교직원',
      count: summary.staffNoDept,
      path: '/admin/staff',
      severity: summary.staffNoDept > 0 ? 'warning' : 'success',
      icon: summary.staffNoDept > 0 ? WarningIcon : CheckCircleIcon,
      color: summary.staffNoDept > 0 ? '#ed6c02' : '#2e7d32',
      bgColor: summary.staffNoDept > 0 ? '#fff4e5' : '#edf7ed',
    },
    {
      title: '담임 미배정 학급',
      count: summary.missingHomerooms.length,
      path: '/admin/staff',
      severity: summary.missingHomerooms.length > 0 ? 'warning' : 'success',
      icon: summary.missingHomerooms.length > 0 ? WarningIcon : CheckCircleIcon,
      color: summary.missingHomerooms.length > 0 ? '#ed6c02' : '#2e7d32',
      bgColor: summary.missingHomerooms.length > 0 ? '#fff4e5' : '#edf7ed',
      details: summary.missingHomerooms.length > 0 ? summary.missingHomerooms.join(', ') : '',
    },
    {
      title: '사무실 미배정 교직원',
      count: summary.staffNoOffice,
      path: '/admin/staff',
      severity: summary.staffNoOffice > 0 ? 'warning' : 'success',
      icon: summary.staffNoOffice > 0 ? WarningIcon : CheckCircleIcon,
      color: summary.staffNoOffice > 0 ? '#ed6c02' : '#2e7d32',
      bgColor: summary.staffNoOffice > 0 ? '#fff4e5' : '#edf7ed',
    },
    {
      title: '자리배치 미완료 사무실',
      count: summary.officesNoLayout.length,
      path: '/admin/spaces',
      severity: summary.officesNoLayout.length > 0 ? 'warning' : 'success',
      icon: summary.officesNoLayout.length > 0 ? WarningIcon : CheckCircleIcon,
      color: summary.officesNoLayout.length > 0 ? '#ed6c02' : '#2e7d32',
      bgColor: summary.officesNoLayout.length > 0 ? '#fff4e5' : '#edf7ed',
      details: summary.officesNoLayout.length > 0 ? summary.officesNoLayout.join(', ') : '',
    },
    {
      title: '학생 OU 갱신 필요',
      count: summary.studentOuOutdated ? 1 : 0,
      path: '/admin/accounts',
      severity: summary.studentOuOutdated ? 'warning' : 'success',
      icon: summary.studentOuOutdated ? WarningIcon : CheckCircleIcon,
      color: summary.studentOuOutdated ? '#ed6c02' : '#2e7d32',
      bgColor: summary.studentOuOutdated ? '#fff4e5' : '#edf7ed',
      details: summary.studentOuOutdated ? 'Workspace 동기화 설정에서 학생 OU 경로를 확인하세요' : '',
    },
  ]

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4" fontWeight={700}>
          관리자 홈
        </Typography>
        <FormControl sx={{ minWidth: 120 }}>
          <InputLabel>학년도</InputLabel>
          <Select
            value={year}
            label="학년도"
            onChange={(e) => setYear(e.target.value)}
          >
            <MenuItem value={2027}>2027</MenuItem>
            <MenuItem value={2026}>2026</MenuItem>
          </Select>
        </FormControl>
      </Box>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="body1" fontWeight={700} mb={0.5}>
            학년도-학기 기준
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.85rem', mb: 2 }}>
            평가 운영 계획 제출 현황 등 학기 기준으로 조회하는 화면의 기본값입니다. 실제 날짜와 무관하게 학교가 지금 업무상 기준으로 삼는 학기를 지정하세요.
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>학년도</InputLabel>
              <Select label="학년도" value={termYear} onChange={(e) => setTermYear(Number(e.target.value))}>
                {TERM_YEAR_OPTIONS.map((y) => <MenuItem key={y} value={y}>{y}학년도</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 100 }}>
              <InputLabel>학기</InputLabel>
              <Select label="학기" value={termSemester} onChange={(e) => setTermSemester(Number(e.target.value))}>
                <MenuItem value={1}>1학기</MenuItem>
                <MenuItem value={2}>2학기</MenuItem>
              </Select>
            </FormControl>
            <Button
              variant="contained" size="small" disabled={!termDirty || savingTerm}
              onClick={handleSaveTerm}
            >
              {savingTerm ? '저장 중...' : '저장'}
            </Button>
            {!termDirty && termSavedAt && (
              <Typography sx={{ fontSize: '0.8rem', color: 'success.main' }}>저장되었습니다.</Typography>
            )}
          </Box>
        </CardContent>
      </Card>

      {loading ? (
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
          <CircularProgress />
        </Box>
      ) : (
        <>
          {/* 전체 상태 Alert */}
          {totalIssues === 0 ? (
            <Alert severity="success" sx={{ mb: 3 }}>
              <AlertTitle>신학기 준비 완료</AlertTitle>
              {year}학년도 신학기 준비가 모두 완료되었습니다.
            </Alert>
          ) : (
            <Alert severity="warning" sx={{ mb: 3 }}>
              <AlertTitle>신학기 준비 진행 중</AlertTitle>
              {totalIssues}개 항목이 미완료 상태입니다. 아래 체크리스트를 확인하세요.
            </Alert>
          )}

          {/* 체크리스트 카드 */}
          <Grid container spacing={3}>
            {CHECKLIST_ITEMS.map((item, index) => {
              const Icon = item.icon
              return (
                <Grid item xs={12} sm={6} md={4} key={index}>
                  <Card
                    sx={{
                      height: '100%',
                      borderLeft: `4px solid ${item.color}`,
                    }}
                  >
                    <CardActionArea onClick={() => navigate(item.path)} sx={{ height: '100%' }}>
                      <CardContent>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                          <Box
                            sx={{
                              bgcolor: item.bgColor,
                              p: 1,
                              borderRadius: 2,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <Icon sx={{ color: item.color, fontSize: '1.5rem' }} />
                          </Box>
                          <Typography variant="h6" fontWeight={700}>
                            {item.count}
                          </Typography>
                        </Box>
                        <Typography variant="body1" fontWeight={600} mb={0.5}>
                          {item.title}
                        </Typography>
                        {item.details && (
                          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.85rem' }}>
                            {item.details}
                          </Typography>
                        )}
                      </CardContent>
                    </CardActionArea>
                  </Card>
                </Grid>
              )
            })}
          </Grid>

          {/* 도구 바로가기 */}
          <Box sx={{ mt: 5 }}>
            <Typography variant="h6" fontWeight={700} mb={2}>
              관리 도구
            </Typography>
            <Grid container spacing={2}>
              {[
                { title: '분할점수 기준 관리', path: '/admin/asa-cutoffs', icon: '📊' },
                { title: '성취평가제 과목 관리', path: '/admin/asa-checklist', icon: '✅' },
                { title: '연수 명단 관리', path: '/admin/training-presets', icon: '✍️' },
              ].map((tool) => (
                <Grid item xs={12} sm={4} key={tool.path}>
                  <Card>
                    <CardActionArea onClick={() => navigate(tool.path)}>
                      <CardContent>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                          <Box sx={{ fontSize: '1.5rem' }}>{tool.icon}</Box>
                          <Typography variant="body1" fontWeight={600}>
                            {tool.title}
                          </Typography>
                        </Box>
                      </CardContent>
                    </CardActionArea>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Box>
        </>
      )}
    </Box>
  )
}
