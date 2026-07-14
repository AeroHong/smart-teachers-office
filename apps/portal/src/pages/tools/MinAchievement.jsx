import { useState, useEffect, useRef, useCallback, Fragment, useMemo } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Paper from '@mui/material/Paper'
import Button from '@mui/material/Button'
import Alert from '@mui/material/Alert'
import CircularProgress from '@mui/material/CircularProgress'
import Tabs from '@mui/material/Tabs'
import Tab from '@mui/material/Tab'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import Chip from '@mui/material/Chip'
import Snackbar from '@mui/material/Snackbar'
import Collapse from '@mui/material/Collapse'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import EditIcon from '@mui/icons-material/Edit'
import CheckIcon from '@mui/icons-material/Check'
import CloseIcon from '@mui/icons-material/Close'
import CloudUploadIcon from '@mui/icons-material/CloudUpload'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import {
  collection, doc, setDoc, updateDoc, query, orderBy, onSnapshot, getDoc, serverTimestamp,
} from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useAuth } from '../../contexts/AuthContext'
import Layout from '../../components/Layout'
import { parseGradeSummaryFile, groupBlocksBySubject } from './asaUtils'

// 현재 학년도·학기 계산
function currentYearSemester() {
  const now = new Date()
  const month = now.getMonth() + 1
  const calYear = now.getFullYear()
  return {
    year: month <= 2 ? calYear - 1 : calYear,
    semester: (month >= 3 && month <= 8) ? 1 : 2,
  }
}

function noteKey(subjectName, classNumber) {
  return `${subjectName}__${classNumber}`
}

// 학생별 집계: 전체 결과에서 학번 기준으로 묶기
function buildStudentMap(results) {
  const map = {}
  results.forEach(r => {
    ;(r.belowCutoffStudents || []).forEach(s => {
      if (!map[s.classNumber]) map[s.classNumber] = []
      map[s.classNumber].push({
        subjectName: r.subjectName,
        total: s.total,
        cutoffValue: r.cutoffValue,
        note: s.note || '',
        resultId: r.id,
        uploadedBy: r.uploadedBy,
      })
    })
  })
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([classNumber, subjects]) => ({
      classNumber,
      subjects,
      excluded: subjects.some(s => s.note),  // 비고 있으면 대상 제외 표시
    }))
}

export default function MinAchievement() {
  const { schoolId, user, role } = useAuth()

  // ── 학년도·학기 ──
  const { year: defaultYear, semester: defaultSemester } = useMemo(currentYearSemester, [])
  const [cutoffYear, setCutoffYear] = useState(defaultYear)
  const [cutoffSemester, setCutoffSemester] = useState(defaultSemester)

  // ── 안내 패널 ──
  const [showGuide, setShowGuide] = useState(true)

  // ── 메인 탭 ──
  const [mainTab, setMainTab] = useState(0)

  // ── 업로드·파싱 ──
  const [subjectGroups, setSubjectGroups] = useState([])
  const [activeSubjectIdx, setActiveSubjectIdx] = useState(0)
  const [parseErrors, setParseErrors] = useState([])
  const [skippedGrades, setSkippedGrades] = useState([])
  const [parsing, setParsing] = useState(false)
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef()

  // ── 분할점수 ──
  const [cutoffMap, setCutoffMap] = useState({})
  const [manualInputs, setManualInputs] = useState({})

  // ── 비고 (등록 탭) ──
  const [notes, setNotes] = useState({})

  // ── 저장 ──
  const [saving, setSaving] = useState({})
  const [savedSubjects, setSavedSubjects] = useState(new Set())
  const [snackbar, setSnackbar] = useState('')

  // ── 조회 탭 공통 ──
  const [results, setResults] = useState([])
  const [resultsLoading, setResultsLoading] = useState(false)
  const [expandedId, setExpandedId] = useState(null)

  // ── 비고 인라인 편집 (과목별 조회) ──
  const [editingNote, setEditingNote] = useState(null) // { resultId, classNumber }
  const [editNoteValue, setEditNoteValue] = useState('')
  const [savingNote, setSavingNote] = useState(false)

  // 비고 편집 권한: 업로드 본인 또는 학교 관리자
  const canEdit = (result) =>
    result.uploadedBy === user?.uid ||
    role === 'admin' || role === 'school_admin'

  // 조회 탭(1, 2) 실시간 구독
  useEffect(() => {
    if (!schoolId || mainTab === 0) return
    setResultsLoading(true)
    const q = query(
      collection(db, 'schools', schoolId, 'minAchievementResults'),
      orderBy('uploadedAt', 'desc'),
    )
    const unsub = onSnapshot(q, (snap) => {
      setResults(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setResultsLoading(false)
    }, () => setResultsLoading(false))
    return unsub
  }, [schoolId, mainTab])

  // Firestore에서 과목 분할점수 조회 (선택된 학년도·학기 기준)
  const fetchCutoffs = useCallback(async (subjectNames) => {
    if (!schoolId) return
    const entries = await Promise.all(
      subjectNames.map(async (name) => {
        try {
          const snap = await getDoc(doc(db, 'schools', schoolId, 'asaCutoffs', `${cutoffYear}_${cutoffSemester}_1_${name}`))
          if (!snap.exists()) return [name, null]
          const eMido = (snap.data().boundaries || []).find(b => b.label === 'E/미도달')
          if (!eMido) return [name, null]
          return [name, { value: eMido.value, source: 'firestore' }]
        } catch {
          return [name, null]
        }
      })
    )
    const newMap = {}
    entries.forEach(([name, val]) => { if (val) newMap[name] = val })
    setCutoffMap(prev => ({ ...prev, ...newMap }))
  }, [schoolId, cutoffYear, cutoffSemester])

  // 파일 처리
  const handleFiles = async (fileList) => {
    const files = Array.from(fileList)
    if (!files.length) return
    setParsing(true)
    setParseErrors([])
    setSkippedGrades([])

    const allBlocks = []
    const errors = []
    const skipped = []

    for (const file of files) {
      try {
        const blocks = await parseGradeSummaryFile(file)
        const grade1 = blocks.filter(b => b.grade === 1)
        const others = blocks.filter(b => b.grade !== 1)
        others.forEach(b => skipped.push(`${b.subjectName} (${file.name})`))
        grade1.forEach(b => { b.sourceFileName = file.name })
        allBlocks.push(...grade1)
      } catch (e) {
        errors.push({ fileName: file.name, message: e.message })
      }
    }

    setParseErrors(errors)
    setSkippedGrades([...new Set(skipped)])

    if (allBlocks.length > 0) {
      const groups = groupBlocksBySubject(allBlocks)
      setSubjectGroups(prev => {
        const prevMap = new Map(prev.map(g => [g.subjectName, g]))
        groups.forEach(g => prevMap.set(g.subjectName, g))
        return [...prevMap.values()]
      })
      setActiveSubjectIdx(0)
      await fetchCutoffs(groups.map(g => g.subjectName))
    }
    setParsing(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    handleFiles(e.dataTransfer.files)
  }

  // 미도달 학생 추출
  const getBelowCutoff = (group) => {
    const cutoff = cutoffMap[group.subjectName]
    if (!cutoff) return null
    return group.students.filter(s =>
      !s.withdrawn && Number.isFinite(s.total) && s.total < cutoff.value
    )
  }

  // 수동 분할점수 적용
  const applyManual = (subjectName) => {
    const val = Number(manualInputs[subjectName])
    if (!Number.isFinite(val) || val <= 0 || val > 100) return
    setCutoffMap(prev => ({ ...prev, [subjectName]: { value: val, source: 'manual' } }))
  }

  // Firestore 저장 (등록 탭)
  const handleSave = async (group) => {
    const cutoff = cutoffMap[group.subjectName]
    if (!cutoff) return
    const belowStudents = getBelowCutoff(group) || []
    const validTotal = group.students.filter(s => !s.withdrawn && Number.isFinite(s.total)).length

    setSaving(prev => ({ ...prev, [group.subjectName]: true }))
    try {
      const docId = `${user.uid}_1_${group.subjectName}`
      await setDoc(doc(db, 'schools', schoolId, 'minAchievementResults', docId), {
        subjectName: group.subjectName,
        grade: 1,
        uploadedBy: user.uid,
        uploadedByName: user.displayName || '',
        uploadedAt: serverTimestamp(),
        cutoffValue: cutoff.value,
        cutoffSource: cutoff.source,
        totalStudents: validTotal,
        belowCutoffStudents: belowStudents.map(s => ({
          classNumber: s.classNumber,
          total: s.total,
          note: notes[noteKey(group.subjectName, s.classNumber)] || '',
        })),
      })
      setSavedSubjects(prev => new Set(prev).add(group.subjectName))
      setSnackbar(`${group.subjectName} 명단이 저장됐습니다.`)
    } catch (e) {
      setSnackbar('저장 중 오류: ' + e.message)
    } finally {
      setSaving(prev => ({ ...prev, [group.subjectName]: false }))
    }
  }

  // 비고 인라인 저장 (과목별 조회)
  const handleSaveNote = async () => {
    if (!editingNote) return
    setSavingNote(true)
    try {
      const result = results.find(r => r.id === editingNote.resultId)
      if (!result) return
      const updatedStudents = (result.belowCutoffStudents || []).map(s =>
        s.classNumber === editingNote.classNumber ? { ...s, note: editNoteValue } : s
      )
      await updateDoc(doc(db, 'schools', schoolId, 'minAchievementResults', editingNote.resultId), {
        belowCutoffStudents: updatedStudents,
      })
      setEditingNote(null)
      setSnackbar('비고가 수정됐습니다.')
    } catch {
      setSnackbar('수정 권한이 없습니다.')
    } finally {
      setSavingNote(false)
    }
  }

  const activeGroup = subjectGroups[activeSubjectIdx] || null
  const activeCutoff = activeGroup ? cutoffMap[activeGroup.subjectName] : null
  const activeBelowStudents = activeGroup ? (getBelowCutoff(activeGroup) || []) : []
  const studentList = buildStudentMap(results)

  // ── 렌더 ──────────────────────────────────────────────────────
  return (
    <Layout>
      <Typography variant="h5" fontWeight={700} mb={0.5}>
        최소성취수준 보장지도 점검 🎯
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={3}>
        1학년 성적일람표를 업로드하면 E/미도달 기준으로 보장지도 대상 학생을 과목별로 추출합니다.
      </Typography>

      {/* ── 보장지도 안내 패널 ── */}
      <Paper variant="outlined" sx={{ mb: 3, borderRadius: 2, overflow: 'hidden' }}>
        <Box
          onClick={() => setShowGuide(p => !p)}
          sx={{
            px: 2.5, py: 1.5,
            display: 'flex', alignItems: 'center', gap: 1,
            cursor: 'pointer', bgcolor: '#f8fafc',
            borderBottom: showGuide ? '1px solid #e2e8f0' : 'none',
            '&:hover': { bgcolor: '#f1f5f9' },
          }}
        >
          <Typography fontWeight={700} fontSize="0.88rem" sx={{ flex: 1 }}>
            📋 최소성취수준 보장지도 유형 안내
          </Typography>
          {showGuide ? <ExpandLessIcon fontSize="small" sx={{ color: '#94a3b8' }} /> : <ExpandMoreIcon fontSize="small" sx={{ color: '#94a3b8' }} />}
        </Box>
        <Collapse in={showGuide}>
          <Box sx={{ p: 2.5 }}>
            {/* 두 유형 카드 */}
            <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
              {/* ① 보충지도 */}
              <Paper sx={{
                flex: 1, minWidth: 260, p: 2,
                borderLeft: '4px solid #dc2626', bgcolor: '#fef2f2',
                boxShadow: 'none',
              }}>
                <Typography fontWeight={700} color="#dc2626" mb={0.75} fontSize="0.95rem">
                  ① 보충지도
                </Typography>
                <Typography variant="body2" mb={1} lineHeight={1.7}>
                  <strong>1학년 공통교과</strong> 과목에서 E/미도달 기준 성적에 미달한 학생을 대상으로 실시합니다.
                </Typography>
                <Box sx={{
                  px: 1.5, py: 0.75, borderRadius: 1.5,
                  bgcolor: '#dcfce7', color: '#15803d',
                  fontSize: '0.8rem', fontWeight: 600,
                }}>
                  ✅ 이 도구의 「성적일람표 등록」 탭으로 확인 가능
                </Box>
              </Paper>

              {/* ② 추가학습 */}
              <Paper sx={{
                flex: 1, minWidth: 260, p: 2,
                borderLeft: '4px solid #d97706', bgcolor: '#fffbeb',
                boxShadow: 'none',
              }}>
                <Typography fontWeight={700} color="#d97706" mb={0.75} fontSize="0.95rem">
                  ② 추가학습
                </Typography>
                <Typography variant="body2" mb={1} lineHeight={1.7}>
                  <strong>1·2학년 공통교과 및 선택교과</strong>에서 1학점당 16차시 기준,{' '}
                  <strong>출석률 2/3 미만</strong> 학생을 대상으로 실시합니다.
                </Typography>
                <Box sx={{
                  px: 1.5, py: 0.75, borderRadius: 1.5,
                  bgcolor: '#fef3c7', color: '#92400e',
                  fontSize: '0.8rem', fontWeight: 600,
                }}>
                  ⚠️ 전체 과목별 출결현황 조회 불가<br />
                  → 각 담당 교사가 나이스에서 직접 확인 필요
                </Box>
              </Paper>
            </Box>

            {/* 추가학습 확인 방법 */}
            <Typography fontWeight={700} fontSize="0.88rem" mb={1}>
              추가학습 대상 확인 방법 — 나이스 과목별출결현황
            </Typography>
            <Typography variant="body2" color="text.secondary" mb={1.5} lineHeight={1.8}>
              나이스 로그인 → 상단 메뉴 <strong>「교과담임」</strong> 탭 →{' '}
              좌측 출결현황및통계 →{' '}
              <strong>「과목별출결현황」</strong><br />
              학년도·학기·담당 과목을 선택 후 조회 →{' '}
              <strong>「총 수업시수(학점당수시)」</strong> 기준으로
              출석시수가 2/3 이상인지 학생별로 확인
            </Typography>
            <Box
              component="img"
              src="/images/neis-subject-attendance.png"
              alt="나이스 과목별출결현황 화면 예시"
              sx={{
                width: '100%',
                maxWidth: 840,
                border: '1px solid #e2e8f0',
                borderRadius: 2,
                display: 'block',
              }}
            />
            <Typography variant="caption" color="text.disabled" mt={1} display="block">
              ※ 위 화면에서 총 수업시수(학점당수시) 기준으로 출석시수가 2/3 미만인 학생이 추가학습 대상입니다.
            </Typography>
          </Box>
        </Collapse>
      </Paper>

      <Tabs value={mainTab} onChange={(_, v) => setMainTab(v)} sx={{ mb: 3, borderBottom: '1px solid #e2e8f0' }}>
        <Tab label="성적일람표 등록" />
        <Tab label="과목별 명단 조회" />
        <Tab label="학생별 미이수 과목 조회" />
      </Tabs>

      {/* ══ 탭 0: 성적일람표 등록 ══════════════════════════════ */}
      {mainTab === 0 && (
        <Box>
          {/* 학년도·학기 선택 */}
          <Box sx={{ display: 'flex', gap: 2, mb: 2.5, alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography variant="body2" color="text.secondary" sx={{ mr: 0.5 }}>
              분할점수 기준 조회 학기:
            </Typography>
            <TextField
              label="학년도" select size="small" value={cutoffYear}
              onChange={e => {
                setCutoffYear(Number(e.target.value))
                setCutoffMap({})  // 학기 바뀌면 분할점수 초기화
              }}
              sx={{ minWidth: 100 }}
            >
              {[defaultYear - 1, defaultYear, defaultYear + 1].map(y => (
                <MenuItem key={y} value={y}>{y}년</MenuItem>
              ))}
            </TextField>
            <TextField
              label="학기" select size="small" value={cutoffSemester}
              onChange={e => {
                setCutoffSemester(Number(e.target.value))
                setCutoffMap({})
              }}
              sx={{ minWidth: 82 }}
            >
              <MenuItem value={1}>1학기</MenuItem>
              <MenuItem value={2}>2학기</MenuItem>
            </TextField>
            <Typography variant="caption" color="text.disabled">
              분할점수 기준 관리에 등록된 {cutoffYear}년 {cutoffSemester}학기 기준으로 E/미도달 점수를 불러옵니다.
            </Typography>
          </Box>

          <Paper
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            sx={{
              border: `2px dashed ${dragging ? '#dc2626' : '#e2e8f0'}`,
              borderRadius: 3, p: 4, textAlign: 'center', cursor: 'pointer',
              bgcolor: dragging ? '#fef2f2' : '#f8fafc', transition: 'all 0.15s', mb: 3,
              '&:hover': { borderColor: '#dc2626', bgcolor: '#fef2f2' },
            }}
          >
            <input
              ref={fileInputRef} type="file" accept=".xlsx,.xls" multiple
              style={{ display: 'none' }}
              onChange={e => { handleFiles(e.target.files); e.target.value = '' }}
            />
            <CloudUploadIcon sx={{ fontSize: 40, color: '#94a3b8', mb: 1 }} />
            <Typography fontWeight={600} color="#475569">
              성적일람표 파일을 드래그하거나 클릭해서 선택하세요
            </Typography>
            <Typography variant="body2" color="text.secondary" mt={0.5}>
              나이스 성적일람표(xlsx) · 여러 파일 동시 업로드 가능 · <strong>1학년 데이터만</strong> 분석됩니다
            </Typography>
            {parsing && <CircularProgress size={20} sx={{ mt: 1.5 }} />}
          </Paper>

          {parseErrors.map((e, i) => (
            <Alert key={i} severity="error" sx={{ mb: 1 }}>{e.fileName}: {e.message}</Alert>
          ))}
          {skippedGrades.length > 0 && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              1학년이 아닌 데이터는 건너뜁니다: {skippedGrades.join(', ')}
            </Alert>
          )}

          {subjectGroups.length > 0 && (
            <>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2, alignItems: 'center' }}>
                <Typography variant="body2" color="text.secondary" sx={{ mr: 0.5 }}>과목 선택:</Typography>
                {subjectGroups.map((g, i) => {
                  const cutoff = cutoffMap[g.subjectName]
                  const below = cutoff ? (getBelowCutoff(g) || []) : null
                  const isSaved = savedSubjects.has(g.subjectName)
                  return (
                    <Chip
                      key={g.subjectName}
                      label={
                        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                          {g.subjectName}
                          {isSaved && <CheckCircleOutlineIcon sx={{ fontSize: 13, color: '#16a34a', ml: 0.25 }} />}
                          {below !== null && (
                            <Box component="span" sx={{
                              ml: 0.25, px: 0.6, borderRadius: '10px', fontSize: '0.66rem', fontWeight: 700,
                              bgcolor: below.length > 0 ? '#fef2f2' : '#f0fdf4',
                              color: below.length > 0 ? '#dc2626' : '#16a34a',
                            }}>
                              {below.length}명
                            </Box>
                          )}
                        </Box>
                      }
                      onClick={() => setActiveSubjectIdx(i)}
                      variant={activeSubjectIdx === i ? 'filled' : 'outlined'}
                      color={activeSubjectIdx === i ? 'error' : 'default'}
                      sx={{ cursor: 'pointer', height: 30 }}
                    />
                  )
                })}
              </Box>

              {activeGroup && (
                <Paper sx={{ p: 3, borderRadius: 3 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, flexWrap: 'wrap' }}>
                    <Typography variant="h6" fontWeight={700}>{activeGroup.subjectName}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      1학년 · 전체 {activeGroup.students.filter(s => !s.withdrawn && Number.isFinite(s.total)).length}명
                      {activeGroup.classLabels.length > 0 && ` (${activeGroup.classLabels.filter(Boolean).join(', ')})`}
                    </Typography>
                    {activeGroup.duplicates?.length > 0 && (
                      <Alert severity="warning" sx={{ py: 0, px: 1 }}>중복 학급: {activeGroup.duplicates.join(', ')}</Alert>
                    )}
                  </Box>

                  {activeCutoff ? (
                    <Alert severity={activeCutoff.source === 'manual' ? 'warning' : 'info'} icon={false} sx={{ mb: 2, py: 0.75 }}>
                      E/미도달 기준점수: <strong>{activeCutoff.value}점</strong>
                      <Box component="span" sx={{ ml: 1, fontSize: '0.78rem', opacity: 0.7 }}>
                        ({activeCutoff.source === 'firestore' ? '분할점수 기준 관리에서 조회' : '직접 입력값'})
                      </Box>
                      <Button size="small" sx={{ ml: 1.5, py: 0, minWidth: 0, fontSize: '0.72rem' }}
                        onClick={() => setCutoffMap(prev => { const n = { ...prev }; delete n[activeGroup.subjectName]; return n })}>
                        변경
                      </Button>
                    </Alert>
                  ) : (
                    <Box sx={{ mb: 2 }}>
                      <Alert severity="warning" icon={false} sx={{ mb: 1.5, py: 0.75 }}>
                        이 과목의 E/미도달 분할점수가 등록되어 있지 않습니다. 직접 입력하거나 관리자에게 등록을 요청하세요.
                      </Alert>
                      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                        <TextField
                          size="small" label="E/미도달 기준점수" type="number"
                          inputProps={{ min: 1, max: 100 }}
                          value={manualInputs[activeGroup.subjectName] || ''}
                          onChange={e => setManualInputs(prev => ({ ...prev, [activeGroup.subjectName]: e.target.value }))}
                          onKeyDown={e => e.key === 'Enter' && applyManual(activeGroup.subjectName)}
                          sx={{ width: 180 }}
                        />
                        <Button variant="outlined" size="small" onClick={() => applyManual(activeGroup.subjectName)}>
                          적용
                        </Button>
                      </Box>
                    </Box>
                  )}

                  {activeCutoff && (
                    <>
                      <Typography fontWeight={600} mb={1.5}
                        color={activeBelowStudents.length > 0 ? 'error.main' : 'success.main'}>
                        미도달 학생: {activeBelowStudents.length}명
                      </Typography>
                      {activeBelowStudents.length > 0 ? (
                        <Table size="small" sx={{ mb: 2 }}>
                          <TableHead>
                            <TableRow sx={{ bgcolor: '#f8fafc' }}>
                              <TableCell sx={{ fontWeight: 600, width: 80 }}>학번</TableCell>
                              <TableCell sx={{ fontWeight: 600, width: 90 }} align="center">기준점수</TableCell>
                              <TableCell sx={{ fontWeight: 600, width: 90 }} align="center">취득점수</TableCell>
                              <TableCell sx={{ fontWeight: 600 }}>비고</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {activeBelowStudents.map(s => (
                              <TableRow key={s.classNumber} hover>
                                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{s.classNumber}</TableCell>
                                <TableCell align="center">{activeCutoff.value}</TableCell>
                                <TableCell align="center" sx={{ color: '#dc2626', fontWeight: 700 }}>{s.total}</TableCell>
                                <TableCell>
                                  <TextField
                                    size="small" variant="standard"
                                    placeholder="전출, 자퇴, 유급, 특수학급 등"
                                    value={notes[noteKey(activeGroup.subjectName, s.classNumber)] || ''}
                                    onChange={e => setNotes(prev => ({
                                      ...prev,
                                      [noteKey(activeGroup.subjectName, s.classNumber)]: e.target.value,
                                    }))}
                                    sx={{ width: '100%', minWidth: 180 }}
                                  />
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      ) : (
                        <Alert severity="success" icon={<CheckCircleOutlineIcon />} sx={{ mb: 2 }}>
                          E/미도달 기준({activeCutoff.value}점) 미만 학생이 없습니다.
                        </Alert>
                      )}
                      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <Button variant="contained" color="error"
                          onClick={() => handleSave(activeGroup)}
                          disabled={!!saving[activeGroup.subjectName]}
                          startIcon={saving[activeGroup.subjectName] ? <CircularProgress size={16} color="inherit" /> : null}>
                          {savedSubjects.has(activeGroup.subjectName) ? '다시 저장' : '저장하기'}
                        </Button>
                      </Box>
                    </>
                  )}
                </Paper>
              )}
            </>
          )}
        </Box>
      )}

      {/* ══ 탭 1: 과목별 명단 조회 ═════════════════════════════ */}
      {mainTab === 1 && (
        <Box>
          <Typography variant="body2" color="text.secondary" mb={2}>
            저장된 과목별 명단을 확인합니다. 이름은 표시되지 않습니다. 담당 교사 또는 관리자는 비고를 수정할 수 있습니다.
          </Typography>
          {resultsLoading ? (
            <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box>
          ) : results.length === 0 ? (
            <Alert severity="info">등록된 명단이 없습니다.</Alert>
          ) : (
            <Paper sx={{ borderRadius: 3, overflow: 'hidden' }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: '#f8fafc' }}>
                    <TableCell sx={{ fontWeight: 600 }}>과목명</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>담당교사</TableCell>
                    <TableCell sx={{ fontWeight: 600 }} align="center">전체</TableCell>
                    <TableCell sx={{ fontWeight: 600 }} align="center">미도달</TableCell>
                    <TableCell sx={{ fontWeight: 600 }} align="center">기준점수</TableCell>
                    <TableCell sx={{ fontWeight: 600 }} align="center">등록일</TableCell>
                    <TableCell sx={{ width: 40 }} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {results.map(r => (
                    <Fragment key={r.id}>
                      <TableRow hover onClick={() => setExpandedId(expandedId === r.id ? null : r.id)} sx={{ cursor: 'pointer' }}>
                        <TableCell sx={{ fontWeight: 600 }}>{r.subjectName}</TableCell>
                        <TableCell>{r.uploadedByName}</TableCell>
                        <TableCell align="center">{r.totalStudents ?? '-'}</TableCell>
                        <TableCell align="center">
                          <Box sx={{
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            minWidth: 28, height: 22, px: 0.75, borderRadius: '11px', fontWeight: 700, fontSize: '0.8rem',
                            bgcolor: (r.belowCutoffStudents?.length ?? 0) > 0 ? '#fef2f2' : '#f0fdf4',
                            color: (r.belowCutoffStudents?.length ?? 0) > 0 ? '#dc2626' : '#16a34a',
                          }}>
                            {r.belowCutoffStudents?.length ?? 0}
                          </Box>
                        </TableCell>
                        <TableCell align="center">{r.cutoffValue}점</TableCell>
                        <TableCell align="center" sx={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                          {r.uploadedAt?.toDate
                            ? r.uploadedAt.toDate().toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })
                            : '-'}
                        </TableCell>
                        <TableCell align="center">
                          <Tooltip title={expandedId === r.id ? '접기' : '학생 명단 보기'}>
                            <IconButton size="small">
                              {expandedId === r.id ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>

                      <TableRow>
                        <TableCell colSpan={7} sx={{ p: 0, border: expandedId === r.id ? undefined : 'none' }}>
                          <Collapse in={expandedId === r.id} unmountOnExit>
                            <Box sx={{ p: 2, bgcolor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                              {!r.belowCutoffStudents?.length ? (
                                <Typography variant="body2" color="text.secondary">미도달 학생 없음</Typography>
                              ) : (
                                <Table size="small">
                                  <TableHead>
                                    <TableRow>
                                      <TableCell sx={{ fontWeight: 600, fontSize: '0.78rem', width: 80 }}>학번</TableCell>
                                      <TableCell sx={{ fontWeight: 600, fontSize: '0.78rem', width: 90 }} align="center">기준점수</TableCell>
                                      <TableCell sx={{ fontWeight: 600, fontSize: '0.78rem', width: 90 }} align="center">취득점수</TableCell>
                                      <TableCell sx={{ fontWeight: 600, fontSize: '0.78rem' }}>비고</TableCell>
                                    </TableRow>
                                  </TableHead>
                                  <TableBody>
                                    {r.belowCutoffStudents.map(s => {
                                      const isEditing = editingNote?.resultId === r.id && editingNote?.classNumber === s.classNumber
                                      return (
                                        <TableRow key={s.classNumber}>
                                          <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{s.classNumber}</TableCell>
                                          <TableCell align="center" sx={{ fontSize: '0.82rem' }}>{r.cutoffValue}</TableCell>
                                          <TableCell align="center" sx={{ color: '#dc2626', fontWeight: 700, fontSize: '0.82rem' }}>{s.total}</TableCell>
                                          <TableCell sx={{ fontSize: '0.82rem' }}>
                                            {isEditing ? (
                                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                <TextField
                                                  size="small" variant="standard" autoFocus
                                                  placeholder="전출, 자퇴, 유급, 특수학급 등"
                                                  value={editNoteValue}
                                                  onChange={e => setEditNoteValue(e.target.value)}
                                                  onKeyDown={e => {
                                                    if (e.key === 'Enter') handleSaveNote()
                                                    if (e.key === 'Escape') setEditingNote(null)
                                                  }}
                                                  sx={{ flex: 1, minWidth: 140 }}
                                                />
                                                <Tooltip title="저장">
                                                  <IconButton size="small" onClick={handleSaveNote} disabled={savingNote}>
                                                    {savingNote ? <CircularProgress size={14} /> : <CheckIcon fontSize="small" sx={{ color: '#16a34a' }} />}
                                                  </IconButton>
                                                </Tooltip>
                                                <Tooltip title="취소">
                                                  <IconButton size="small" onClick={() => setEditingNote(null)}>
                                                    <CloseIcon fontSize="small" sx={{ color: '#94a3b8' }} />
                                                  </IconButton>
                                                </Tooltip>
                                              </Box>
                                            ) : (
                                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                <Box component="span" sx={{
                                                  color: s.note ? '#475569' : '#cbd5e1',
                                                  fontStyle: s.note ? 'normal' : 'italic',
                                                  flex: 1,
                                                }}>
                                                  {s.note || '—'}
                                                </Box>
                                                {canEdit(r) && (
                                                  <Tooltip title="비고 수정">
                                                    <IconButton size="small"
                                                      onClick={() => {
                                                        setEditingNote({ resultId: r.id, classNumber: s.classNumber })
                                                        setEditNoteValue(s.note || '')
                                                      }}>
                                                      <EditIcon sx={{ fontSize: 13, color: '#94a3b8' }} />
                                                    </IconButton>
                                                  </Tooltip>
                                                )}
                                              </Box>
                                            )}
                                          </TableCell>
                                        </TableRow>
                                      )
                                    })}
                                  </TableBody>
                                </Table>
                              )}
                            </Box>
                          </Collapse>
                        </TableCell>
                      </TableRow>
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            </Paper>
          )}
        </Box>
      )}

      {/* ══ 탭 2: 학생별 미이수 과목 조회 ═════════════════════ */}
      {mainTab === 2 && (
        <Box>
          <Typography variant="body2" color="text.secondary" mb={2}>
            학번 기준으로 미이수 과목을 묶어 표시합니다. 비고가 입력된 학생은 <strong>대상 제외</strong>로 표시됩니다.
          </Typography>
          {resultsLoading ? (
            <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box>
          ) : studentList.length === 0 ? (
            <Alert severity="info">등록된 명단이 없습니다.</Alert>
          ) : (
            <Paper sx={{ borderRadius: 3, overflow: 'hidden' }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: '#f8fafc' }}>
                    <TableCell sx={{ fontWeight: 600, width: 90 }}>학번</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>미이수 과목</TableCell>
                    <TableCell sx={{ fontWeight: 600 }} align="center">과목 수</TableCell>
                    <TableCell sx={{ fontWeight: 600, width: 100 }} align="center">상태</TableCell>
                    <TableCell sx={{ width: 40 }} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {studentList.map(student => (
                    <Fragment key={student.classNumber}>
                      <TableRow
                        hover
                        onClick={() => setExpandedId(expandedId === student.classNumber ? null : student.classNumber)}
                        sx={{ cursor: 'pointer', opacity: student.excluded ? 0.75 : 1 }}
                      >
                        <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                          {student.classNumber}
                        </TableCell>
                        <TableCell sx={{ color: '#64748b', fontSize: '0.82rem' }}>
                          {student.subjects.map(s => s.subjectName).join(', ')}
                        </TableCell>
                        <TableCell align="center">
                          <Box sx={{
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            minWidth: 28, height: 22, px: 0.75, borderRadius: '11px', fontWeight: 700, fontSize: '0.8rem',
                            bgcolor: '#fef2f2', color: '#dc2626',
                          }}>
                            {student.subjects.length}
                          </Box>
                        </TableCell>
                        <TableCell align="center">
                          {student.excluded ? (
                            <Box sx={{
                              display: 'inline-flex', alignItems: 'center', gap: 0.4,
                              px: 1, py: 0.25, borderRadius: '10px',
                              bgcolor: '#fef9c3', color: '#92400e',
                              fontSize: '0.72rem', fontWeight: 700,
                            }}>
                              대상 제외
                            </Box>
                          ) : (
                            <Box sx={{
                              display: 'inline-flex', alignItems: 'center', gap: 0.4,
                              px: 1, py: 0.25, borderRadius: '10px',
                              bgcolor: '#fef2f2', color: '#dc2626',
                              fontSize: '0.72rem', fontWeight: 700,
                            }}>
                              보장지도 대상
                            </Box>
                          )}
                        </TableCell>
                        <TableCell align="center">
                          <IconButton size="small">
                            {expandedId === student.classNumber ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                          </IconButton>
                        </TableCell>
                      </TableRow>

                      <TableRow>
                        <TableCell colSpan={5} sx={{ p: 0, border: expandedId === student.classNumber ? undefined : 'none' }}>
                          <Collapse in={expandedId === student.classNumber} unmountOnExit>
                            <Box sx={{ p: 2, bgcolor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                              <Table size="small">
                                <TableHead>
                                  <TableRow>
                                    <TableCell sx={{ fontWeight: 600, fontSize: '0.78rem' }}>과목명</TableCell>
                                    <TableCell sx={{ fontWeight: 600, fontSize: '0.78rem', width: 90 }} align="center">기준점수</TableCell>
                                    <TableCell sx={{ fontWeight: 600, fontSize: '0.78rem', width: 90 }} align="center">취득점수</TableCell>
                                    <TableCell sx={{ fontWeight: 600, fontSize: '0.78rem' }}>비고</TableCell>
                                  </TableRow>
                                </TableHead>
                                <TableBody>
                                  {student.subjects.map((s, i) => (
                                    <TableRow key={i} sx={{ opacity: s.note ? 0.7 : 1 }}>
                                      <TableCell sx={{ fontSize: '0.82rem' }}>{s.subjectName}</TableCell>
                                      <TableCell align="center" sx={{ fontSize: '0.82rem' }}>{s.cutoffValue}</TableCell>
                                      <TableCell align="center" sx={{ color: '#dc2626', fontWeight: 700, fontSize: '0.82rem' }}>{s.total}</TableCell>
                                      <TableCell sx={{ fontSize: '0.82rem' }}>
                                        {s.note ? (
                                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                            <Box sx={{
                                              px: 0.75, py: 0.15, borderRadius: '8px',
                                              bgcolor: '#fef9c3', color: '#92400e',
                                              fontSize: '0.72rem', fontWeight: 700,
                                            }}>
                                              대상 제외
                                            </Box>
                                            <Box component="span" sx={{ color: '#64748b' }}>{s.note}</Box>
                                          </Box>
                                        ) : (
                                          <Box component="span" sx={{ color: '#cbd5e1', fontStyle: 'italic' }}>—</Box>
                                        )}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </Box>
                          </Collapse>
                        </TableCell>
                      </TableRow>
                    </Fragment>
                  ))}
            </TableBody>
          </Table>
          {/* 요약 */}
          <Box sx={{ px: 2, py: 1.5, borderTop: '1px solid #e2e8f0', bgcolor: '#f8fafc', display: 'flex', gap: 3 }}>
            <Typography variant="body2" color="text.secondary">
              전체 미도달 학생: <strong>{studentList.length}명</strong>
            </Typography>
            <Typography variant="body2" color="text.secondary">
              보장지도 대상: <strong style={{ color: '#dc2626' }}>{studentList.filter(s => !s.excluded).length}명</strong>
            </Typography>
            <Typography variant="body2" color="text.secondary">
              대상 제외: <strong style={{ color: '#92400e' }}>{studentList.filter(s => s.excluded).length}명</strong>
            </Typography>
          </Box>
        </Paper>
          )}
        </Box>
      )}

      <Snackbar
        open={Boolean(snackbar)}
        autoHideDuration={3500}
        onClose={() => setSnackbar('')}
        message={snackbar}
      />
    </Layout>
  )
}
