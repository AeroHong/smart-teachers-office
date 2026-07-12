import { useState, useEffect, useRef } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Paper from '@mui/material/Paper'
import Tabs from '@mui/material/Tabs'
import Tab from '@mui/material/Tab'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import TextField from '@mui/material/TextField'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Alert from '@mui/material/Alert'
import Snackbar from '@mui/material/Snackbar'
import CircularProgress from '@mui/material/CircularProgress'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined'
import {
  collection, onSnapshot, doc, addDoc, updateDoc, deleteDoc, serverTimestamp, orderBy, query,
} from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { openProcessChecklistPrint } from './asaChecklistPrint'
import { useAuth } from '../../contexts/AuthContext'
import Layout from '../../components/Layout'

// ── 상태 레이블 ──────────────────────────────────────────────
const STATUS_LABELS = {
  draft: '작성중',
  submitted: '제출완료',
  locked: '잠금',
}

const STATUS_COLORS = {
  draft: 'default',
  submitted: 'primary',
  locked: 'error',
}

// ── 날짜 포맷 ────────────────────────────────────────────────
function fmtDate(ts) {
  if (!ts) return '-'
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

// ── 이메일 유효성 ────────────────────────────────────────────
function isValidEmail(email) {
  return email.includes('@')
}

// ── 기본 빈 과목 폼 ──────────────────────────────────────────
const EMPTY_FORM = { name: '', grade: '', semester: '', teacherEmails: [] }

export default function AsaChecklistAdmin() {
  const { schoolId: authSchoolId, isAdmin, isPrincipal, isSuperAdmin } = useAuth()
  // 슈퍼어드민은 schoolId가 null이므로 직접 입력 가능
  const [superAdminSchoolId, setSuperAdminSchoolId] = useState('seonyoo-hs')
  const schoolId = isSuperAdmin ? superAdminSchoolId : authSchoolId
  const [tab, setTab] = useState(0)

  // 과목 관리
  const [subjects, setSubjects] = useState([])
  const [loadingSubjects, setLoadingSubjects] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [emailInput, setEmailInput] = useState('')
  const [saving, setSaving] = useState(false)

  // 엑셀 업로드
  const [xlsxDialogOpen, setXlsxDialogOpen] = useState(false)
  const [xlsxPreview, setXlsxPreview] = useState([]) // [{ grade, semester, name, teacherEmails }]
  const [xlsxParsing, setXlsxParsing] = useState(false)
  const [xlsxSaving, setXlsxSaving] = useState(false)
  const xlsxInputRef = useRef(null)

  // 체크리스트 현황
  const [submissions, setSubmissions] = useState([])
  const [loadingSubmissions, setLoadingSubmissions] = useState(true)
  const [filterGrade, setFilterGrade] = useState('all')
  const [filterSemester, setFilterSemester] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')


  const [snackbar, setSnackbar] = useState('')
  const [error, setError] = useState(null)

  // ── Firestore 구독: asaSubjects ──────────────────────────
  useEffect(() => {
    if (!schoolId) return
    const q = query(
      collection(db, 'schools', schoolId, 'asaSubjects'),
      orderBy('grade'),
    )
    const unsub = onSnapshot(q, (snap) => {
      setSubjects(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      setLoadingSubjects(false)
    }, (err) => {
      setError(`과목 목록 불러오기 실패: ${err.message}`)
      setLoadingSubjects(false)
    })
    return unsub
  }, [schoolId])

  // ── Firestore 구독: asaSubmissions ───────────────────────
  useEffect(() => {
    if (!schoolId) return
    const q = query(
      collection(db, 'schools', schoolId, 'asaSubmissions'),
      orderBy('updatedAt', 'desc'),
    )
    const unsub = onSnapshot(q, (snap) => {
      setSubmissions(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      setLoadingSubmissions(false)
    }, (err) => {
      setError(`제출 현황 불러오기 실패: ${err.message}`)
      setLoadingSubmissions(false)
    })
    return unsub
  }, [schoolId])

  // ── 과목 추가/수정 Dialog 열기 ──────────────────────────
  const handleOpenAdd = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setEmailInput('')
    setDialogOpen(true)
  }

  const handleOpenEdit = (subject) => {
    setEditingId(subject.id)
    setForm({
      name: subject.name || '',
      grade: subject.grade ?? '',
      semester: subject.semester ?? '',
      teacherEmails: subject.teacherEmails || [],
    })
    setEmailInput('')
    setDialogOpen(true)
  }

  const handleCloseDialog = () => {
    setDialogOpen(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
    setEmailInput('')
  }

  // 이메일 태그 추가
  const handleEmailKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addEmailTag()
    }
  }

  const addEmailTag = () => {
    const trimmed = emailInput.trim().replace(/,$/, '')
    if (!trimmed) return
    if (!isValidEmail(trimmed)) {
      setError('올바른 이메일 주소를 입력하세요 (@ 포함).')
      return
    }
    if (form.teacherEmails.includes(trimmed)) {
      setEmailInput('')
      return
    }
    setForm((prev) => ({ ...prev, teacherEmails: [...prev.teacherEmails, trimmed] }))
    setEmailInput('')
  }

  const removeEmailTag = (email) => {
    setForm((prev) => ({ ...prev, teacherEmails: prev.teacherEmails.filter((e) => e !== email) }))
  }

  // 과목 저장
  const handleSaveSubject = async () => {
    if (!form.name.trim()) { setError('과목명을 입력하세요.'); return }
    if (!form.grade) { setError('학년을 선택하세요.'); return }
    if (!form.semester) { setError('학기를 선택하세요.'); return }

    // 아직 입력 중인 이메일도 추가
    let finalEmails = [...form.teacherEmails]
    if (emailInput.trim()) {
      const trimmed = emailInput.trim().replace(/,$/, '')
      if (isValidEmail(trimmed) && !finalEmails.includes(trimmed)) {
        finalEmails.push(trimmed)
      }
    }

    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        grade: Number(form.grade),
        semester: Number(form.semester),
        teacherEmails: finalEmails,
        updatedAt: serverTimestamp(),
      }
      if (editingId) {
        await updateDoc(doc(db, 'schools', schoolId, 'asaSubjects', editingId), payload)
        setSnackbar('과목이 수정됐습니다.')
      } else {
        await addDoc(collection(db, 'schools', schoolId, 'asaSubjects'), {
          ...payload,
          createdAt: serverTimestamp(),
        })
        setSnackbar('과목이 추가됐습니다.')
      }
      handleCloseDialog()
    } catch (err) {
      setError(`저장 실패: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  // 과목 삭제 (관련 submission 도 함께 삭제)
  const handleDeleteSubject = async (subject) => {
    if (!window.confirm(`"${subject.name}" 과목을 삭제할까요?\n관련 체크리스트 데이터도 모두 삭제됩니다.`)) return
    try {
      const related = submissions.filter((s) => s.subjectId === subject.id)
      await Promise.all(related.map((s) => deleteDoc(doc(db, 'schools', schoolId, 'asaSubmissions', s.id))))
      await deleteDoc(doc(db, 'schools', schoolId, 'asaSubjects', subject.id))
      setSnackbar('과목 및 관련 데이터가 삭제됐습니다.')
    } catch (err) {
      setError(`삭제 실패: ${err.message}`)
    }
  }

  // ── 엑셀 업로드 ──────────────────────────────────────────
  const handleXlsxFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setXlsxParsing(true)
    setError(null)
    try {
      const XLSX = await import('xlsx')
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 })
      const parsed = []
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i]
        if (!row || row.length === 0) continue
        const grade = Number(row[0])
        const semester = Number(row[1])
        const name = String(row[2] || '').trim()
        const emailRaw = String(row[3] || '').trim()
        if (!name) continue
        const teacherEmails = emailRaw
          ? emailRaw.split(',').map((s) => s.trim()).filter((s) => s && isValidEmail(s))
          : []
        parsed.push({ grade, semester, name, teacherEmails })
      }
      if (!parsed.length) {
        setError('인식된 데이터가 없습니다. A=학년, B=학기, C=과목명, D=교사이메일 형식을 확인하세요.')
        setXlsxParsing(false)
        return
      }
      setXlsxPreview(parsed)
      setXlsxDialogOpen(true)
    } catch (err) {
      setError(`엑셀 파싱 실패: ${err.message}`)
    } finally {
      setXlsxParsing(false)
    }
  }

  const handleXlsxSave = async () => {
    setXlsxSaving(true)
    try {
      await Promise.all(xlsxPreview.map((row) =>
        addDoc(collection(db, 'schools', schoolId, 'asaSubjects'), {
          name: row.name,
          grade: row.grade,
          semester: row.semester,
          teacherEmails: row.teacherEmails,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
      ))
      setSnackbar(`${xlsxPreview.length}개 과목이 추가됐습니다.`)
      setXlsxDialogOpen(false)
      setXlsxPreview([])
    } catch (err) {
      setError(`일괄 저장 실패: ${err.message}`)
    } finally {
      setXlsxSaving(false)
    }
  }

  // ── 인쇄/PDF: 체크리스트 인쇄 창 열기 ───────────────────────────
  const openPrint = (submission) => {
    const subjectObj = subjects.find((s) => s.id === submission.subjectId)
    openProcessChecklistPrint(submission, subjectObj)
  }

  // ── 체크리스트 현황 필터링 (삭제된 과목의 submission 제외) ──────
  const filteredSubmissions = submissions.filter((s) => {
    if (!subjects.some((sub) => sub.id === s.subjectId)) return false  // 과목 삭제됨
    const subjectObj = subjects.find((sub) => sub.id === s.subjectId)
    if (filterGrade !== 'all' && String(subjectObj?.grade ?? '') !== filterGrade) return false
    if (filterSemester !== 'all' && String(subjectObj?.semester ?? '') !== filterSemester) return false
    if (filterStatus !== 'all' && s.status !== filterStatus) return false
    return true
  })

  // ── 접근 제한 ────────────────────────────────────────────
  if (!isAdmin && !isPrincipal && !isSuperAdmin) {
    return (
      <Layout>
        <Alert severity="error">관리자(admin/school_admin) 또는 교감 계정만 접근할 수 있습니다.</Alert>
      </Layout>
    )
  }

  return (
    <Layout wide>
      <Typography variant="h5" fontWeight={700} mb={0.5}>
        성취평가제 체크리스트 관리
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={isSuperAdmin ? 1 : 3}>
        과목·교사 배정을 관리하고 제출된 체크리스트 현황을 확인합니다.
      </Typography>

      {/* 슈퍼어드민 학교 선택 */}
      {isSuperAdmin && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3, p: 1.5, bgcolor: '#fff7ed', borderRadius: 2, border: '1px solid #fed7aa' }}>
          <Typography variant="caption" color="warning.dark" fontWeight={700}>슈퍼어드민 모드</Typography>
          <TextField
            label="schoolId"
            size="small"
            value={superAdminSchoolId}
            onChange={(e) => setSuperAdminSchoolId(e.target.value)}
            sx={{ width: 200 }}
          />
        </Box>
      )}

      <Paper variant="outlined">
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ borderBottom: '1px solid #e2e8f0', px: 2 }}>
          <Tab label="과목 관리" />
          <Tab label="체크리스트 현황" />
        </Tabs>

        {/* ══ 탭 1: 과목 관리 ══════════════════════════════════ */}
        {tab === 0 && (
          <Box sx={{ p: 3 }}>
            {/* 상단 액션 */}
            <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
              <Button variant="contained" size="small" onClick={handleOpenAdd}>
                + 과목 추가
              </Button>
              <Button
                variant="outlined"
                size="small"
                component="label"
                disabled={xlsxParsing}
              >
                {xlsxParsing ? '파싱 중...' : '엑셀 업로드'}
                <input
                  ref={xlsxInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  hidden
                  onChange={handleXlsxFile}
                />
              </Button>
            </Box>

            {/* 과목 목록 */}
            {loadingSubjects ? (
              <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box>
            ) : subjects.length === 0 ? (
              <Alert severity="info">
                과목이 없습니다. 과목을 추가하거나 엑셀로 업로드하세요.
              </Alert>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: '#f8fafc' }}>
                    <TableCell sx={{ fontWeight: 700 }}>학년</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>학기</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>과목명</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>배정 교사</TableCell>
                    <TableCell sx={{ fontWeight: 700, width: 100 }}>작업</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {subjects.map((subject) => (
                    <TableRow key={subject.id} hover>
                      <TableCell>{subject.grade}학년</TableCell>
                      <TableCell>{subject.semester}학기</TableCell>
                      <TableCell>{subject.name}</TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                          {(subject.teacherEmails || []).length === 0 ? (
                            <Typography variant="caption" color="text.disabled">미배정</Typography>
                          ) : (
                            (subject.teacherEmails || []).map((email) => (
                              <Chip key={email} label={email} size="small" variant="outlined" />
                            ))
                          )}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <IconButton size="small" onClick={() => handleOpenEdit(subject)} title="수정">
                          <EditOutlinedIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" color="error" onClick={() => handleDeleteSubject(subject)} title="삭제">
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Box>
        )}

        {/* ══ 탭 2: 체크리스트 현황 ══════════════════════════════ */}
        {tab === 1 && (
          <Box sx={{ p: 3 }}>
            {/* 필터 영역 */}
            <Box sx={{ display: 'flex', gap: 1.5, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
              <FormControl size="small" sx={{ minWidth: 100 }}>
                <InputLabel>학년</InputLabel>
                <Select value={filterGrade} label="학년" onChange={(e) => setFilterGrade(e.target.value)}>
                  <MenuItem value="all">전체</MenuItem>
                  <MenuItem value="1">1학년</MenuItem>
                  <MenuItem value="2">2학년</MenuItem>
                  <MenuItem value="3">3학년</MenuItem>
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 100 }}>
                <InputLabel>학기</InputLabel>
                <Select value={filterSemester} label="학기" onChange={(e) => setFilterSemester(e.target.value)}>
                  <MenuItem value="all">전체</MenuItem>
                  <MenuItem value="1">1학기</MenuItem>
                  <MenuItem value="2">2학기</MenuItem>
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 120 }}>
                <InputLabel>상태</InputLabel>
                <Select value={filterStatus} label="상태" onChange={(e) => setFilterStatus(e.target.value)}>
                  <MenuItem value="all">전체</MenuItem>
                  <MenuItem value="draft">작성중</MenuItem>
                  <MenuItem value="submitted">제출완료</MenuItem>
                  <MenuItem value="locked">잠금</MenuItem>
                </Select>
              </FormControl>
              <Box sx={{ ml: 'auto' }}>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<PrintOutlinedIcon />}
                  onClick={() => {
                    const targets = filteredSubmissions.filter((s) => s.status === 'submitted')
                    if (!targets.length) { setError('제출완료 상태의 항목이 없습니다.'); return }
                    targets.forEach((sub) => openPrint(sub))
                  }}
                >
                  제출완료 전체 인쇄
                </Button>
              </Box>
            </Box>

            {/* 현황 테이블 */}
            {loadingSubmissions ? (
              <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box>
            ) : filteredSubmissions.length === 0 ? (
              <Alert severity="info">해당 조건의 체크리스트 제출 내역이 없습니다.</Alert>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: '#f8fafc' }}>
                    <TableCell sx={{ fontWeight: 700 }}>과목명</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>학년</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>학기</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>유형</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>상태</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>교사 서명</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>교감 서명</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>마지막 수정</TableCell>
                    <TableCell sx={{ fontWeight: 700, width: 80 }}>PDF</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredSubmissions.map((sub) => {
                    const subjectObj = subjects.find((s) => s.id === sub.subjectId)
                    const subjectName = subjectObj?.name || sub.subjectName || '-'
                    const grade = subjectObj?.grade ?? sub.grade ?? '-'
                    const semester = subjectObj?.semester ?? sub.semester ?? '-'
                    const teacherSigs = sub.signatures || {}
                    const sigTotal = subjectObj?.teacherEmails?.length ?? 0
                    const sigDone = (subjectObj?.teacherEmails || []).filter((e) => !!teacherSigs[e]?.dataUrl).length
                    return (
                      <TableRow key={sub.id} hover>
                        <TableCell>{subjectName}</TableCell>
                        <TableCell>{grade !== '-' ? `${grade}학년` : '-'}</TableCell>
                        <TableCell>{semester !== '-' ? `${semester}학기` : '-'}</TableCell>
                        <TableCell>{sub.type || '-'}</TableCell>
                        <TableCell>
                          <Chip
                            label={STATUS_LABELS[sub.status] ?? sub.status ?? '-'}
                            color={STATUS_COLORS[sub.status] ?? 'default'}
                            size="small"
                          />
                        </TableCell>
                        <TableCell>
                          {sigTotal > 0 ? `${sigDone}/${sigTotal}명` : '-'}
                        </TableCell>
                        <TableCell>
                          {sub.principalSigned
                            ? <Chip label="완료" color="success" size="small" />
                            : <Chip label="미완" size="small" />}
                        </TableCell>
                        <TableCell>{fmtDate(sub.updatedAt)}</TableCell>
                        <TableCell>
                          <IconButton
                            size="small"
                            onClick={() => openPrint(sub)}
                            title="인쇄 / PDF 저장"
                          >
                            <PrintOutlinedIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </Box>
        )}
      </Paper>

      {/* ══ 과목 추가/수정 Dialog ══════════════════════════════ */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{editingId ? '과목 수정' : '과목 추가'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <FormControl size="small" sx={{ minWidth: 110 }}>
              <InputLabel>학년 *</InputLabel>
              <Select
                value={form.grade}
                label="학년 *"
                onChange={(e) => setForm((p) => ({ ...p, grade: e.target.value }))}
              >
                <MenuItem value={1}>1학년</MenuItem>
                <MenuItem value={2}>2학년</MenuItem>
                <MenuItem value={3}>3학년</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 110 }}>
              <InputLabel>학기 *</InputLabel>
              <Select
                value={form.semester}
                label="학기 *"
                onChange={(e) => setForm((p) => ({ ...p, semester: e.target.value }))}
              >
                <MenuItem value={1}>1학기</MenuItem>
                <MenuItem value={2}>2학기</MenuItem>
              </Select>
            </FormControl>
          </Box>
          <TextField
            label="과목명 *"
            size="small"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            fullWidth
          />
          {/* 이메일 태그 입력 */}
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
              배정 교사 이메일 (Enter 또는 쉼표로 추가)
            </Typography>
            <Box
              sx={{
                border: '1px solid #c4c4c4',
                borderRadius: 1,
                p: 1,
                display: 'flex',
                flexWrap: 'wrap',
                gap: 0.5,
                minHeight: 48,
                cursor: 'text',
                '&:focus-within': { borderColor: 'primary.main', borderWidth: 2 },
              }}
              onClick={() => document.getElementById('email-tag-input')?.focus()}
            >
              {form.teacherEmails.map((email) => (
                <Chip
                  key={email}
                  label={email}
                  size="small"
                  onDelete={() => removeEmailTag(email)}
                />
              ))}
              <input
                id="email-tag-input"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                onKeyDown={handleEmailKeyDown}
                onBlur={addEmailTag}
                placeholder={form.teacherEmails.length === 0 ? '이메일 입력 후 Enter' : ''}
                style={{
                  border: 'none',
                  outline: 'none',
                  flex: '1 0 140px',
                  fontSize: '0.875rem',
                  padding: '2px 4px',
                  minWidth: 0,
                  background: 'transparent',
                }}
              />
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleCloseDialog} disabled={saving}>취소</Button>
          <Button variant="contained" onClick={handleSaveSubject} disabled={saving}>
            {saving ? '저장 중...' : '저장'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ══ 엑셀 미리보기 Dialog ══════════════════════════════ */}
      <Dialog open={xlsxDialogOpen} onClose={() => { setXlsxDialogOpen(false); setXlsxPreview([]) }} maxWidth="md" fullWidth>
        <DialogTitle>엑셀 업로드 미리보기 ({xlsxPreview.length}개 과목)</DialogTitle>
        <DialogContent sx={{ pt: '12px !important' }}>
          <Alert severity="info" sx={{ mb: 2, fontSize: '0.82rem' }}>
            아래 내용을 확인 후 "저장" 버튼을 누르면 기존 과목에 추가됩니다. 중복 과목은 자동으로 체크되지 않습니다.
          </Alert>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: '#f8fafc' }}>
                <TableCell sx={{ fontWeight: 700 }}>학년</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>학기</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>과목명</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>배정 교사 이메일</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {xlsxPreview.map((row, i) => (
                <TableRow key={i}>
                  <TableCell>{row.grade}학년</TableCell>
                  <TableCell>{row.semester}학기</TableCell>
                  <TableCell>{row.name}</TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {row.teacherEmails.length === 0
                        ? <Typography variant="caption" color="text.disabled">없음</Typography>
                        : row.teacherEmails.map((e) => <Chip key={e} label={e} size="small" variant="outlined" />)}
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => { setXlsxDialogOpen(false); setXlsxPreview([]) }} disabled={xlsxSaving}>취소</Button>
          <Button variant="contained" onClick={handleXlsxSave} disabled={xlsxSaving}>
            {xlsxSaving ? '저장 중...' : `저장 (${xlsxPreview.length}개)`}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ══ 에러 / 스낵바 ═══════════════════════════════════════ */}
      <Snackbar
        open={!!error}
        autoHideDuration={5000}
        onClose={() => setError(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="error" onClose={() => setError(null)} sx={{ width: '100%' }}>
          {error}
        </Alert>
      </Snackbar>
      <Snackbar
        open={!!snackbar}
        autoHideDuration={3000}
        onClose={() => setSnackbar('')}
        message={snackbar}
      />
    </Layout>
  )
}
