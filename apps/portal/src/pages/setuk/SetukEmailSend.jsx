/**
 * 과목별 세특 → 학생 개별 메일 발송.
 *
 * 과목 담당 교사(또는 관리자)가 자기 과목의 세특 원문을 학생마다 그 학생 것만 담아
 * 이메일로 보낸다. 실제 발송은 일반 이메일 발송과 같은 경로다 — 이 화면은
 * schools/{schoolId}/emailJobs 문서를 kind:'setuk'으로 만들기만 하고, Firestore
 * 트리거(functions/emailSend.js)가 수신자마다 recipients[i].setukText로 본문을 따로
 * 만들어 보낸다. 진행률·예약 취소는 기존 발송 내역 화면(EmailJobDetail)을 그대로 쓴다.
 *
 * - 대상: 이 과목을 담당하는 학급(관리자는 전체)의 세특 원문(records) 전부. 점검 항목이
 *   0건인 학생도 포함한다(과목 상세 화면은 항목이 있는 학생만 보여주는 것과 다름).
 * - 수신 주소: 학생 명부(students)에서 학년·반·번호로 찾고, 이름까지 같아야 인정한다.
 * - 본문 수정: 이 화면에서 고친 내용은 이번 발송에만 쓰고 원문(records)은 바꾸지 않는다.
 */
import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { collection, doc, getDoc, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Alert from '@mui/material/Alert'
import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import Checkbox from '@mui/material/Checkbox'
import Collapse from '@mui/material/Collapse'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import CircularProgress from '@mui/material/CircularProgress'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import RadioGroup from '@mui/material/RadioGroup'
import Radio from '@mui/material/Radio'
import FormControlLabel from '@mui/material/FormControlLabel'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp'
import SendIcon from '@mui/icons-material/Send'
import ScheduleIcon from '@mui/icons-material/Schedule'
import ScienceIcon from '@mui/icons-material/Science'
import { useAuth } from '@shared/contexts/AuthContext'
import { db } from '@shared/lib/firebase'
import { buildEmailHtml, buildSetukEmailBody } from '@shared/lib/emailTemplate'
import { loadStudents } from '@shared/lib/subjectData'
import {
  subscribeChecks, loadRecordsBySubject, loadItemsBySubject, isAssignedTeacher, parseClassNo,
} from '@shared/lib/setukCheck'
import { useSetukTermFilter, filterChecksByTerm, SetukTermFilterControls, fmtDateTime } from './setukShared'
import Layout from '../../components/Layout'

// emailJobs 문서 하나는 1MiB를 넘을 수 없다. 세특 1건이 대략 1.5KB라 한 과목 300명
// 정도는 문서 하나로 충분하지만, 넘칠 경우를 대비해 이 크기를 넘으면 학급 단위로
// 나눠 여러 건으로 만든다(발송 진행 중 status·sentAt 등이 덧붙는 여유분을 남김).
const MAX_JOB_BYTES = 700_000
const LARGE_SEND_THRESHOLD = 100

const MATCH_LABEL = {
  no_student: '명부에 없음',
  name_mismatch: '명부 이름 불일치',
  no_email: '이메일 없음',
}

const byteSize = (obj) => new Blob([JSON.stringify(obj)]).size

/** 학급 단위를 깨지 않고, 한 덩어리가 MAX_JOB_BYTES를 넘지 않게 수신자를 나눈다. */
function chunkRecipients(recipients) {
  const byClass = new Map()
  recipients.forEach((r) => {
    if (!byClass.has(r.classLabel)) byClass.set(r.classLabel, [])
    byClass.get(r.classLabel).push(r)
  })
  const chunks = []
  let current = []
  let currentBytes = 0
  byClass.forEach((list) => {
    const bytes = byteSize(list)
    if (current.length > 0 && currentBytes + bytes > MAX_JOB_BYTES) {
      chunks.push(current)
      current = []
      currentBytes = 0
    }
    current.push(...list)
    currentBytes += bytes
  })
  if (current.length > 0) chunks.push(current)
  return chunks
}

export default function SetukEmailSend() {
  const { subjectName: subjectParam } = useParams()
  const subject = decodeURIComponent(subjectParam || '')
  const navigate = useNavigate()
  const { user, userName, schoolId, schoolName, isAdmin } = useAuth()

  const [workspaceEnabled, setWorkspaceEnabled] = useState(null)
  const [checks, setChecks] = useState([])
  const [loadingChecks, setLoadingChecks] = useState(true)
  const [rows, setRows] = useState([])
  const [loadingRows, setLoadingRows] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [mailSubject, setMailSubject] = useState(`[${subject}] 세특(세부능력 및 특기사항) 확인 안내`)
  const [commonNote, setCommonNote] = useState('')
  const [classFilter, setClassFilter] = useState('all')
  const [selected, setSelected] = useState(() => new Set())
  const [edits, setEdits] = useState({}) // { [rowKey]: 수정한 세특 텍스트 }
  const [expanded, setExpanded] = useState(null)

  const [sendMode, setSendMode] = useState('now')
  const [scheduledAt, setScheduledAt] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [testSending, setTestSending] = useState(false)

  useEffect(() => {
    if (!schoolId) return
    getDoc(doc(db, 'schools', schoolId))
      .then((snap) => setWorkspaceEnabled(!!snap.data()?.workspaceSync?.enabled))
      .catch(() => setWorkspaceEnabled(false))
  }, [schoolId])

  useEffect(() => {
    if (!schoolId) return
    return subscribeChecks(schoolId, (list) => { setChecks(list); setLoadingChecks(false) }, (err) => { setError(err.message); setLoadingChecks(false) })
  }, [schoolId])

  // 발송 권한은 과목 담당 교사 + 관리자만 — 담임(업로더)은 과목 상세에서 열람만 한다.
  const sendableChecks = useMemo(() => checks.filter((c) => (
    Object.prototype.hasOwnProperty.call(c.subjectAssignments || {}, subject) &&
    (isAdmin || isAssignedTeacher(c.subjectAssignments?.[subject], user?.uid))
  )), [checks, subject, isAdmin, user])

  const { year, setYear, semester, setSemester } = useSetukTermFilter(sendableChecks)
  const termChecks = useMemo(() => filterChecksByTerm(sendableChecks, year, semester), [sendableChecks, year, semester])
  const termChecksKey = termChecks.map((c) => c.id).join(',')

  useEffect(() => {
    if (!schoolId || loadingChecks) return
    let cancelled = false
    setLoadingRows(true)
    setError('')

    Promise.all([
      loadStudents(schoolId),
      Promise.all(termChecks.map(async (c) => {
        const [records, items] = await Promise.all([
          loadRecordsBySubject(schoolId, c.id, subject),
          loadItemsBySubject(schoolId, c.id, subject),
        ])
        return { check: c, records, items }
      })),
    ])
      .then(([students, perCheck]) => {
        if (cancelled) return
        const studentByKey = new Map()
        students.forEach((s) => studentByKey.set(`${Number(s.grade)}-${Number(s.classNo)}-${Number(s.number)}`, s))

        const nextRows = []
        perCheck.forEach(({ check, records, items }) => {
          const unresolvedByRecord = {}
          items.forEach((it) => {
            if (!it.resolved) unresolvedByRecord[it.recordId] = (unresolvedByRecord[it.recordId] || 0) + 1
          })
          const classNo = parseClassNo(check.classLabel)
          records.forEach((r) => {
            if (!r.text || !r.text.trim()) return
            const grade = Number(r.grade ?? check.grade)
            const number = Number(r.studentNumber)
            const student = studentByKey.get(`${grade}-${classNo}-${number}`)
            let match = 'ok'
            if (!student) match = 'no_student'
            else if ((student.name || '').replace(/\s/g, '') !== (r.studentName || '').replace(/\s/g, '')) match = 'name_mismatch'
            else if (!student.email) match = 'no_email'
            nextRows.push({
              key: `${check.id}__${r.id}`,
              checkId: check.id,
              recordId: r.id,
              classLabel: check.classLabel,
              grade, classNo, number,
              name: r.studentName,
              originalText: r.text,
              unresolved: unresolvedByRecord[r.id] || 0,
              emailSentCount: r.emailSentCount || 0,
              lastEmailSentAt: r.lastEmailSentAt || null,
              student, match,
            })
          })
        })
        nextRows.sort((a, b) => a.classLabel.localeCompare(b.classLabel, 'ko') || a.number - b.number)
        setRows(nextRows)
        // 기본 선택: 명부와 매칭돼 메일 주소가 있는 학생 전체(미처리 항목은 경고 배지로만 알림)
        setSelected(new Set(nextRows.filter((row) => row.match === 'ok').map((row) => row.key)))
        setEdits({})
      })
      .catch((e) => !cancelled && setError(`세특 불러오기 실패: ${e.message}`))
      .finally(() => !cancelled && setLoadingRows(false))

    return () => { cancelled = true }
    // termChecksKey로 대상 학급 구성이 바뀔 때만 다시 불러온다(checks 구독이 갱신될 때마다 수정 내용이 날아가지 않게).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, subject, loadingChecks, termChecksKey])

  // 고친 내용이 있는데 창을 닫으려 하면 한 번 묻는다.
  const hasEdits = Object.keys(edits).length > 0
  useEffect(() => {
    if (!hasEdits) return
    const handler = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [hasEdits])

  const termLabel = `${year}학년도 ${semester}학기`
  const textOf = (row) => edits[row.key] ?? row.originalText

  const classLabels = useMemo(() => [...new Set(rows.map((r) => r.classLabel))], [rows])
  const visibleRows = useMemo(() => rows.filter((r) => classFilter === 'all' || r.classLabel === classFilter), [rows, classFilter])
  const selectableVisible = visibleRows.filter((r) => r.match === 'ok')
  const allVisibleSelected = selectableVisible.length > 0 && selectableVisible.every((r) => selected.has(r.key))
  const selectedRows = rows.filter((r) => selected.has(r.key))

  const toggleRow = (key) => setSelected((prev) => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })
  const toggleAllVisible = () => setSelected((prev) => {
    const next = new Set(prev)
    selectableVisible.forEach((r) => (allVisibleSelected ? next.delete(r.key) : next.add(r.key)))
    return next
  })

  const setEditText = (row, value) => setEdits((prev) => {
    const next = { ...prev }
    if (value === row.originalText) delete next[row.key]
    else next[row.key] = value
    return next
  })

  const previewHtml = (row) => buildEmailHtml(schoolName, buildSetukEmailBody({
    subjectName: subject, termLabel, commonNote, studentName: row.name, text: textOf(row),
  }))

  const toRecipient = (row, overrides = {}) => ({
    workspaceUserId: row.student?.id || row.key,
    email: row.student?.email || '',
    name: row.name,
    grade: row.grade,
    class: row.classNo,
    number: row.number,
    classLabel: row.classLabel,
    checkId: row.checkId,
    recordId: row.recordId,
    setukText: textOf(row),
    setukEdited: edits[row.key] != null,
    status: 'pending',
    sentAt: null,
    gmailMessageId: null,
    error: null,
    ...overrides,
  })

  const buildJobData = ({ recipients, status, scheduledDate, isTest, subjectText }) => ({
    senderUid: user.uid,
    senderEmail: user.email,
    senderName: userName,
    schoolId,
    schoolName,
    subject: subjectText,
    // 목록·상세 화면 호환용 공통 내용 — 실제 본문은 수신자마다 setukText로 만든다.
    bodyHtml: '',
    bodyText: commonNote.trim(),
    kind: 'setuk',
    isTest: !!isTest,
    setuk: { subjectName: subject, commonNote: commonNote.trim(), termLabel, year, semester },
    recipients,
    counts: { total: recipients.length, sent: 0, failed: 0 },
    status,
    scheduledAt: status === 'scheduled' ? scheduledDate : null,
    cancelledAt: null,
    failReason: null,
    targetFilter: { mode: 'setuk' },
    createdAt: serverTimestamp(),
    startedAt: null,
    completedAt: null,
  })

  const handleTestSend = async () => {
    const row = selectedRows[0] || rows[0]
    if (!row) return
    setTestSending(true)
    setError('')
    setNotice('')
    try {
      await setDoc(doc(collection(db, 'schools', schoolId, 'emailJobs')), buildJobData({
        recipients: [toRecipient(row, { workspaceUserId: `test-${user.uid}`, email: user.email })],
        status: 'queued',
        isTest: true,
        subjectText: `[테스트] ${mailSubject.trim()}`,
      }))
      setNotice(`${row.classLabel} ${row.number}번 ${row.name} 학생의 내용으로 ${user.email}에 테스트 메일 발송을 요청했습니다. 진행 상황은 화면 위쪽 메일 표시에서 볼 수 있습니다.`)
    } catch (e) {
      setError('테스트 발송 요청 중 오류가 발생했습니다: ' + e.message)
    } finally {
      setTestSending(false)
    }
  }

  const scheduledDate = scheduledAt ? new Date(scheduledAt) : null
  const scheduledValid = sendMode === 'now' || (scheduledDate && scheduledDate.getTime() > Date.now())
  const emptyTextSelected = selectedRows.filter((r) => !textOf(r).trim()).length
  const canSend = mailSubject.trim() && selectedRows.length > 0 && scheduledValid && emptyTextSelected === 0

  const openConfirm = () => {
    setError('')
    if (sendMode === 'scheduled' && !scheduledValid) {
      setError(scheduledDate ? '예약 시각은 현재보다 이후여야 합니다.' : '예약 발송 시각을 선택해주세요.')
      return
    }
    if (emptyTextSelected > 0) {
      setError(`세특 내용이 비어 있는 학생이 ${emptyTextSelected}명 선택돼 있습니다.`)
      return
    }
    if (!canSend) {
      setError('제목과 받는 학생을 확인해주세요.')
      return
    }
    setConfirmOpen(true)
  }

  const handleSend = async () => {
    setSending(true)
    setError('')
    try {
      const recipients = selectedRows.map((row) => toRecipient(row))
      const chunks = chunkRecipients(recipients)
      const status = sendMode === 'scheduled' ? 'scheduled' : 'queued'
      const refs = chunks.map(() => doc(collection(db, 'schools', schoolId, 'emailJobs')))
      // 여러 건으로 나뉘는 경우에도 일부만 만들어지지 않도록 한 번에 커밋한다
      // (문서마다 MAX_JOB_BYTES 이하라 배치 요청 크기 한도(10MiB) 안에 든다).
      const batch = writeBatch(db)
      chunks.forEach((chunk, i) => {
        batch.set(refs[i], buildJobData({ recipients: chunk, status, scheduledDate, subjectText: mailSubject.trim() }))
      })
      await batch.commit()
      setEdits({}) // beforeunload 경고 해제
      navigate(chunks.length === 1 ? `/emails/${refs[0].id}` : '/emails')
    } catch (e) {
      setError('발송 요청 중 오류가 발생했습니다: ' + e.message)
      setSending(false)
      setConfirmOpen(false)
    }
  }

  if (workspaceEnabled === null || loadingChecks) {
    return <Layout><Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress /></Box></Layout>
  }

  const goBack = () => navigate(`/setuk/subject/${encodeURIComponent(subject)}`)

  if (!workspaceEnabled) {
    return (
      <Layout>
        <Button size="small" onClick={goBack} sx={{ mb: 1, textTransform: 'none', color: '#64748b' }}>← 과목 상세로</Button>
        <Alert severity="warning">
          이 학교는 Google Workspace 연동이 설정되지 않아 이메일 발송 기능을 사용할 수 없습니다. 관리자에게 문의해주세요.
        </Alert>
      </Layout>
    )
  }

  if (sendableChecks.length === 0) {
    return (
      <Layout>
        <Button size="small" onClick={goBack} sx={{ mb: 1, textTransform: 'none', color: '#64748b' }}>← 과목 상세로</Button>
        <Alert severity="info">이 과목의 담당 교사로 지정된 학급이 없어 세특 메일을 보낼 수 없습니다. (과목 담당 교사와 관리자만 발송할 수 있습니다)</Alert>
      </Layout>
    )
  }

  const alreadySentCount = selectedRows.filter((r) => r.emailSentCount > 0).length
  const unresolvedCount = selectedRows.filter((r) => r.unresolved > 0).length
  const editedCount = selectedRows.filter((r) => edits[r.key] != null).length
  const unmatched = rows.filter((r) => r.match !== 'ok')

  return (
    <Layout wide>
      <Button size="small" onClick={goBack} sx={{ mb: 1, textTransform: 'none', color: '#64748b' }}>← 과목 상세로</Button>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 0.5 }}>{subject} · 학생에게 세특 메일 보내기</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        학생마다 자기 세특만 담긴 메일이 선생님 계정({user?.email})으로 한 통씩 발송됩니다.
        아래에서 고친 내용은 이번 메일에만 쓰이고 업로드된 세특 원문은 바뀌지 않습니다.
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {notice && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setNotice('')}>{notice}</Alert>}

      <SetukTermFilterControls year={year} semester={semester} onYearChange={setYear} onSemesterChange={setSemester} />

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 2, maxWidth: 900 }}>
        <TextField label="메일 제목" size="small" fullWidth value={mailSubject} onChange={(e) => setMailSubject(e.target.value)} />
        <TextField
          label="공통 안내 (선택)" size="small" fullWidth multiline minRows={2}
          placeholder="예) 내용을 확인하고 수정이 필요한 부분이 있으면 ○월 ○일까지 알려주세요."
          value={commonNote} onChange={(e) => setCommonNote(e.target.value)}
        />
      </Box>

      {unmatched.length > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {unmatched.length}명은 학생 명부와 맞지 않아 발송할 수 없습니다
          ({Object.entries(MATCH_LABEL).map(([k, label]) => {
            const n = unmatched.filter((r) => r.match === k).length
            return n > 0 ? `${label} ${n}명` : null
          }).filter(Boolean).join(', ')}). 학년·반·번호와 이름이 명부와 같은지 확인해주세요.
        </Alert>
      )}

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1, flexWrap: 'wrap' }}>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>학급 필터</InputLabel>
          <Select label="학급 필터" value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
            <MenuItem value="all">전체 학급 ({rows.length})</MenuItem>
            {classLabels.map((c) => <MenuItem key={c} value={c}>{c} ({rows.filter((r) => r.classLabel === c).length})</MenuItem>)}
          </Select>
        </FormControl>
        <Typography variant="body2" color="text.secondary">선택 {selectedRows.length}명 / 전체 {rows.length}명</Typography>
      </Box>

      {loadingRows ? (
        <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box>
      ) : rows.length === 0 ? (
        <Paper variant="outlined" sx={{ py: 4, textAlign: 'center', color: '#94a3b8' }}>
          {termLabel}에 이 과목의 세특 원문이 없습니다.
        </Paper>
      ) : (
        <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'grey.100' }}>
                <TableCell padding="checkbox">
                  <Checkbox size="small" checked={allVisibleSelected} indeterminate={!allVisibleSelected && selectableVisible.some((r) => selected.has(r.key))} onChange={toggleAllVisible} />
                </TableCell>
                <TableCell>학급</TableCell>
                <TableCell>번호</TableCell>
                <TableCell>이름</TableCell>
                <TableCell>이메일</TableCell>
                <TableCell>상태</TableCell>
                <TableCell align="right">내용</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {visibleRows.map((row) => {
                const isOpen = expanded === row.key
                const edited = edits[row.key] != null
                return [
                  <TableRow key={row.key} hover sx={{ '& > td': { borderBottom: isOpen ? 'none' : undefined } }}>
                    <TableCell padding="checkbox">
                      <Checkbox size="small" checked={selected.has(row.key)} disabled={row.match !== 'ok'} onChange={() => toggleRow(row.key)} />
                    </TableCell>
                    <TableCell>{row.classLabel}</TableCell>
                    <TableCell>{row.number}</TableCell>
                    <TableCell>{row.name}</TableCell>
                    <TableCell sx={{ color: row.match === 'ok' ? 'inherit' : 'error.main' }}>
                      {row.match === 'ok' ? row.student.email : MATCH_LABEL[row.match]}
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        {row.unresolved > 0 && <Chip size="small" color="warning" label={`미처리 ${row.unresolved}`} />}
                        {edited && <Chip size="small" color="secondary" variant="outlined" label="수정됨" />}
                        {row.emailSentCount > 0 && (
                          <Chip size="small" variant="outlined" color="success"
                            label={`${row.emailSentCount}회 발송${row.lastEmailSentAt ? ` · 최근 ${fmtDateTime(row.lastEmailSentAt)}` : ''}`} />
                        )}
                      </Box>
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title={isOpen ? '접기' : '내용 확인·수정, 미리보기'}>
                        <IconButton size="small" onClick={() => setExpanded(isOpen ? null : row.key)}>
                          {isOpen ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>,
                  <TableRow key={`${row.key}__detail`}>
                    <TableCell colSpan={7} sx={{ py: 0, borderBottom: isOpen ? undefined : 'none' }}>
                      <Collapse in={isOpen} timeout="auto" unmountOnExit>
                        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, py: 2 }}>
                          <Box>
                            <TextField
                              label="세특 내용 (이번 메일에만 반영)" fullWidth multiline minRows={10}
                              value={textOf(row)} onChange={(e) => setEditText(row, e.target.value)}
                            />
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 0.5 }}>
                              <Typography variant="caption" color="text.secondary">{textOf(row).length.toLocaleString()}자</Typography>
                              <Button size="small" disabled={!edited} onClick={() => setEditText(row, row.originalText)}>원문으로 되돌리기</Button>
                            </Box>
                          </Box>
                          <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
                            <Box component="iframe" title={`preview-${row.key}`} sandbox="" srcDoc={previewHtml(row)}
                              sx={{ display: 'block', width: '100%', height: 420, border: 0 }} />
                          </Box>
                        </Box>
                      </Collapse>
                    </TableCell>
                  </TableRow>,
                ]
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 2, flexWrap: 'wrap', mb: 4 }}>
        <Box>
          <Typography variant="subtitle2" sx={{ mb: 0.5 }}>발송 시점</Typography>
          <RadioGroup row value={sendMode} onChange={(e) => setSendMode(e.target.value)}>
            <FormControlLabel value="now" control={<Radio size="small" />} label="즉시 발송" />
            <FormControlLabel value="scheduled" control={<Radio size="small" />} label="예약 발송" />
          </RadioGroup>
          {sendMode === 'scheduled' && (
            <TextField type="datetime-local" size="small" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)}
              InputLabelProps={{ shrink: true }} sx={{ mt: 0.5 }} />
          )}
        </Box>
        <Box sx={{ ml: 'auto', display: 'flex', gap: 1 }}>
          <Tooltip title="선택한 첫 번째 학생의 내용으로 내 메일함에 1통을 보냅니다">
            <span>
              <Button variant="outlined" startIcon={testSending ? <CircularProgress size={16} /> : <ScienceIcon />}
                onClick={handleTestSend} disabled={testSending || rows.length === 0 || !mailSubject.trim()}>
                나에게 테스트 발송
              </Button>
            </span>
          </Tooltip>
          <Button variant="contained" startIcon={sendMode === 'scheduled' ? <ScheduleIcon /> : <SendIcon />}
            onClick={openConfirm} disabled={!canSend}>
            {sendMode === 'scheduled' ? `${selectedRows.length}명 예약하기` : `${selectedRows.length}명에게 발송하기`}
          </Button>
        </Box>
      </Box>

      <Dialog open={confirmOpen} onClose={() => !sending && setConfirmOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>{sendMode === 'scheduled' ? '세특 메일을 예약할까요?' : '세특 메일을 발송할까요?'}</DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 1 }}>
            {sendMode === 'scheduled' && <><b>{scheduledDate?.toLocaleString('ko-KR')}</b>에 </>}
            총 <b>{selectedRows.length}명</b>에게 각자의 세특이 개별로 발송됩니다.
          </Typography>
          <Box component="ul" sx={{ m: 0, mb: 1, pl: 2.5, color: 'text.secondary', fontSize: '0.875rem' }}>
            {alreadySentCount > 0 && <li>이 중 <b>{alreadySentCount}명</b>은 이미 받은 적이 있습니다(재발송).</li>}
            {unresolvedCount > 0 && <li>이 중 <b>{unresolvedCount}명</b>은 점검 미처리 항목이 남아 있습니다.</li>}
            {editedCount > 0 && <li>이 중 <b>{editedCount}명</b>은 이 화면에서 고친 내용으로 발송됩니다.</li>}
          </Box>
          {selectedRows.length >= LARGE_SEND_THRESHOLD && (
            <Alert severity="warning" sx={{ mb: 1 }}>대상 인원이 많습니다. 받는 학생 명단을 다시 한 번 확인해주세요.</Alert>
          )}
          <Typography variant="body2" color="text.secondary">
            {sendMode === 'scheduled' ? '예약은 발송 전까지 발송 내역 화면에서 취소할 수 있습니다.' : '발송 후에는 취소할 수 없습니다.'}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setConfirmOpen(false)} disabled={sending}>취소</Button>
          <Button variant="contained" onClick={handleSend} disabled={sending}
            startIcon={sending ? <CircularProgress size={16} color="inherit" /> : <SendIcon />}>
            {sending ? '요청 중...' : (sendMode === 'scheduled' ? '예약' : '발송')}
          </Button>
        </DialogActions>
      </Dialog>
    </Layout>
  )
}
