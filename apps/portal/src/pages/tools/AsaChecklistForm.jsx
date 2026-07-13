import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Radio from '@mui/material/Radio'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Alert from '@mui/material/Alert'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined'
import {
  collection, query, where, onSnapshot, getDocs, doc, getDoc, addDoc, updateDoc, serverTimestamp, FieldPath,
} from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useAuth } from '../../contexts/AuthContext'
import Layout from '../../components/Layout'
import SignaturePad from '../../components/SignaturePad'
import { PROCESS_CHECKLIST_GROUPS, ALL_PROCESS_QUESTION_IDS } from './asaChecklistData'
import { openProcessChecklistPrint } from './asaChecklistPrint'
import { cleanTeacherName } from '../../utils/nameUtils'

const STATUS_CONFIG = {
  draft:     { label: '작성중',   color: 'default' },
  submitted: { label: '제출완료', color: 'success' },
  locked:    { label: '잠금',     color: 'error' },
}

function todayString() {
  const d = new Date()
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`
}

export default function AsaChecklistForm() {
  const { subjectId } = useParams()
  const navigate = useNavigate()
  const { user, userName, schoolId, schoolName } = useAuth()

  const [subject, setSubject] = useState(null)
  const [submission, setSubmission] = useState(null)
  const [submissionId, setSubmissionId] = useState(null)
  const [loadingSubject, setLoadingSubject] = useState(true)
  const [loadingSubmission, setLoadingSubmission] = useState(true)
  const [error, setError] = useState(null)
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [checkDateInput, setCheckDateInput] = useState('')
  const checkDateRef = useRef('')
  const [teacherNameMap, setTeacherNameMap] = useState({}) // email → name

  // ── 교사 이름 맵 로드 (email → name) ───────────────────────
  useEffect(() => {
    if (!schoolId) return
    getDocs(query(collection(db, 'users'), where('schoolId', '==', schoolId)))
      .then((snap) => {
        const map = {}
        snap.docs.forEach((d) => {
          const { email, name } = d.data()
          if (email && name) map[email] = name
        })
        setTeacherNameMap(map)
      })
      .catch(() => {})
  }, [schoolId])

  // ── 과목 정보 로드 ─────────────────────────────────────────
  useEffect(() => {
    if (!schoolId || !subjectId) return
    getDoc(doc(db, 'schools', schoolId, 'asaSubjects', subjectId))
      .then((snap) => {
        if (!snap.exists()) setError('과목 정보를 찾을 수 없습니다.')
        else setSubject({ id: snap.id, ...snap.data() })
      })
      .catch((e) => setError(`과목 정보 로드 실패: ${e.message}`))
      .finally(() => setLoadingSubject(false))
  }, [schoolId, subjectId])

  // ── submission 실시간 구독 (없으면 신규 생성) ─────────────
  useEffect(() => {
    if (!schoolId || !subjectId || !subject || !user) return
    const q = query(
      collection(db, 'schools', schoolId, 'asaSubmissions'),
      where('subjectId', '==', subjectId),
      where('checklistType', '==', 'process'),
    )
    const unsub = onSnapshot(q, async (snap) => {
      if (!snap.empty) {
        const docSnap = snap.docs[0]
        const data = { id: docSnap.id, ...docSnap.data() }
        setSubmissionId(docSnap.id)
        setSubmission(data)
        if (data.checkDate && data.checkDate !== checkDateRef.current) {
          setCheckDateInput(data.checkDate)
          checkDateRef.current = data.checkDate
        }
        setLoadingSubmission(false)
      } else {
        try {
          const today = todayString()
          const initialAnswers = {}
          // 기본값: 모두 '예'
          ALL_PROCESS_QUESTION_IDS.forEach((id) => {
            initialAnswers[id] = { value: '예', evidenceChecks: [] }
          })
          const newDoc = {
            subjectId,
            subjectName: subject.name || '',
            checklistType: 'process',
            schoolName: schoolName || schoolId,
            status: 'draft',
            teacherEmails: subject.teacherEmails || [],
            answers: initialAnswers,
            signatures: {},
            principalSignature: null,
            checkDate: today,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }
          const ref = await addDoc(collection(db, 'schools', schoolId, 'asaSubmissions'), newDoc)
          setSubmissionId(ref.id)
          setCheckDateInput(today)
          checkDateRef.current = today
        } catch (e) {
          setError(`체크리스트 초기화 실패: ${e.message}`)
          setLoadingSubmission(false)
        }
      }
    }, (e) => {
      setError(`체크리스트 로드 실패: ${e.message}`)
      setLoadingSubmission(false)
    })
    return unsub
  }, [schoolId, subjectId, subject, user, schoolName])

  const getRef = () =>
    submissionId ? doc(db, 'schools', schoolId, 'asaSubmissions', submissionId) : null

  const handleAnswerChange = async (qId, val) => {
    const ref = getRef()
    if (!ref) return
    try {
      await updateDoc(ref, { [`answers.${qId}.value`]: val, updatedAt: serverTimestamp() })
    } catch (e) { console.error('답변 저장 실패:', e) }
  }

  const handleEvidenceChange = async (qId, evidenceLabel, checked) => {
    const ref = getRef()
    if (!ref || !submission) return
    const current = submission.answers?.[qId]?.evidenceChecks || []
    const next = checked ? [...current, evidenceLabel] : current.filter((e) => e !== evidenceLabel)
    try {
      await updateDoc(ref, { [`answers.${qId}.evidenceChecks`]: next, updatedAt: serverTimestamp() })
    } catch (e) { console.error('근거자료 저장 실패:', e) }
  }

  const handleCheckDateBlur = async () => {
    const ref = getRef()
    if (!ref) return
    try {
      await updateDoc(ref, { checkDate: checkDateInput, updatedAt: serverTimestamp() })
      checkDateRef.current = checkDateInput
    } catch (e) { console.error('점검일자 저장 실패:', e) }
  }

  const handleSignatureSave = async (dataUrl) => {
    const ref = getRef()
    if (!ref || !user) return
    try {
      await updateDoc(ref,
        new FieldPath('signatures', user.email, 'dataUrl'), dataUrl,
        new FieldPath('signatures', user.email, 'signedAt'), serverTimestamp(),
        new FieldPath('signatures', user.email, 'teacherName'), userName,
        'updatedAt', serverTimestamp(),
      )
    } catch (e) { console.error('서명 저장 실패:', e) }
  }

  const isAllAnswered = () => {
    if (!submission) return false
    return ALL_PROCESS_QUESTION_IDS.every((id) => submission.answers?.[id]?.value != null)
  }

  const isAllSigned = () => {
    if (!submission || !subject) return false
    return (subject.teacherEmails || []).every((email) => !!submission.signatures?.[email]?.dataUrl)
  }

  const canSubmit = isAllAnswered() && isAllSigned()

  const handleSubmitConfirm = async () => {
    const ref = getRef()
    if (!ref) return
    setSubmitting(true)
    try {
      await updateDoc(ref, { status: 'submitted', updatedAt: serverTimestamp() })
      setSubmitDialogOpen(false)
    } catch (e) {
      alert(`제출 실패: ${e.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  const isAssigned = subject?.teacherEmails?.includes(user?.email)
  const isLocked = submission?.status === 'locked'
  const isReadOnly = !isAssigned || isLocked

  if (loadingSubject || loadingSubmission) {
    return (
      <Layout>
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="40vh">
          <CircularProgress />
        </Box>
      </Layout>
    )
  }

  if (error) {
    return <Layout><Alert severity="error">{error}</Alert></Layout>
  }

  const statusCfg = STATUS_CONFIG[submission?.status] || STATUS_CONFIG.draft

  return (
    <Layout>
      {/* ── 헤더 ── */}
      <Box mb={2}>
        <Box display="flex" alignItems="center" gap={1} flexWrap="wrap" mb={0.5}>
          <Typography variant="h6" fontWeight={700}>
            붙임1 성취평가제 운영 과정 점검 체크리스트
          </Typography>
          <Chip label={statusCfg.label} color={statusCfg.color} size="small" />
          <Button
            size="small"
            variant="outlined"
            startIcon={<PrintOutlinedIcon />}
            onClick={() => openProcessChecklistPrint(submission, subject, teacherNameMap)}
            sx={{ ml: 'auto' }}
          >
            인쇄 / PDF 저장
          </Button>
        </Box>
        <Typography variant="body2" color="text.secondary">
          {subject?.name || subjectId}
          {subject?.grade ? ` · ${subject.grade}학년` : ''}
          {subject?.semester ? ` · ${subject.semester}학기` : ''}
        </Typography>

        {!isAssigned && (
          <Alert severity="info" sx={{ mt: 1 }}>배정된 담당 교사가 아닙니다. 읽기 전용으로 표시됩니다.</Alert>
        )}
        {isLocked && (
          <Alert severity="warning" sx={{ mt: 1 }}>잠긴 체크리스트입니다. 수정할 수 없습니다.</Alert>
        )}

        <Box display="flex" alignItems="center" gap={1} mt={1.5}>
          <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>점검일자</Typography>
          <input
            type="text"
            value={checkDateInput}
            disabled={isReadOnly}
            onChange={(e) => setCheckDateInput(e.target.value)}
            onBlur={handleCheckDateBlur}
            placeholder="YYYY.MM.DD"
            style={{
              border: '1px solid #ccc', borderRadius: 4, padding: '4px 8px',
              fontSize: 14, width: 120, background: isReadOnly ? '#f5f5f5' : '#fff',
            }}
          />
        </Box>
      </Box>

      {/* ── 체크리스트 표 ── */}
      <Paper variant="outlined" sx={{ mb: 3, overflow: 'auto' }}>
        <Table size="small" sx={{ minWidth: 700 }}>
          <TableHead>
            <TableRow sx={{ bgcolor: '#f8fafc' }}>
              <TableCell align="center" sx={{ fontWeight: 700, width: 80, borderRight: '1px solid #e2e8f0' }}>
                점검 단계
              </TableCell>
              <TableCell sx={{ fontWeight: 700 }}>점검 내용</TableCell>
              <TableCell align="center" sx={{ fontWeight: 700, width: 52 }}>예</TableCell>
              <TableCell align="center" sx={{ fontWeight: 700, width: 64 }}>아니오</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 220, fontSize: '0.75rem' }}>
                확인 근거자료
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {PROCESS_CHECKLIST_GROUPS.map((group) =>
              group.questions.map((q, idx) => {
                const ans = submission?.answers?.[q.id] || {}
                const checkedEvidence = ans.evidenceChecks || []
                return (
                  <TableRow key={q.id} hover sx={{ verticalAlign: 'top' }}>
                    {idx === 0 && (
                      <TableCell
                        rowSpan={group.questions.length}
                        align="center"
                        sx={{
                          fontWeight: 700,
                          fontSize: '0.8rem',
                          bgcolor: '#f8fafc',
                          borderRight: '1px solid #e2e8f0',
                          verticalAlign: 'middle',
                          wordBreak: 'keep-all',
                        }}
                      >
                        {group.groupName}
                      </TableCell>
                    )}
                    <TableCell sx={{ fontSize: '0.82rem', py: 1, lineHeight: 1.5 }}>
                      <Typography variant="body2" sx={{ fontSize: '0.82rem' }}>
                        {q.id.replace('p', '')}. {q.text}
                      </Typography>
                    </TableCell>
                    <TableCell align="center" sx={{ py: 0.5 }}>
                      <Radio
                        checked={ans.value === '예'}
                        onChange={() => { if (!isReadOnly) handleAnswerChange(q.id, '예') }}
                        disabled={isReadOnly}
                        size="small"
                        color="success"
                      />
                    </TableCell>
                    <TableCell align="center" sx={{ py: 0.5 }}>
                      <Radio
                        checked={ans.value === '아니오'}
                        onChange={() => { if (!isReadOnly) handleAnswerChange(q.id, '아니오') }}
                        disabled={isReadOnly}
                        size="small"
                        color="error"
                      />
                    </TableCell>
                    <TableCell sx={{ py: 0.5 }}>
                      {q.evidence.map((ev) => (
                        <FormControlLabel
                          key={ev}
                          control={
                            <Checkbox
                              size="small"
                              checked={checkedEvidence.includes(ev)}
                              disabled={isReadOnly}
                              onChange={(e) => handleEvidenceChange(q.id, ev, e.target.checked)}
                              sx={{ py: 0.25 }}
                            />
                          }
                          label={<Typography variant="caption" sx={{ fontSize: '0.72rem' }}>{ev}</Typography>}
                          sx={{ display: 'flex', ml: 0, mr: 0 }}
                        />
                      ))}
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </Paper>

      {/* ── 서명 섹션 ── */}
      <Paper variant="outlined" sx={{ p: 2.5, mb: 3 }}>
        <Typography variant="subtitle2" fontWeight={700} mb={2}>담당 교사 서명</Typography>
        {(subject?.teacherEmails || []).length === 0 ? (
          <Typography variant="body2" color="text.secondary">배정된 담당 교사 이메일이 없습니다.</Typography>
        ) : (
          <Box display="flex" flexWrap="wrap" gap={3}>
            {(subject.teacherEmails || []).map((email) => {
              const sig = submission?.signatures?.[email]
              const isSelf = user?.email === email
              const name = cleanTeacherName(teacherNameMap[email] || sig?.teacherName || email)
              return (
                <Box key={email} sx={{ minWidth: 200 }}>
                  <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
                    {name}
                  </Typography>
                  {isSelf && !isLocked ? (
                    <SignaturePad
                      existingDataUrl={sig?.dataUrl}
                      onSave={handleSignatureSave}
                    />
                  ) : sig?.dataUrl ? (
                    <Box>
                      <Box
                        component="img"
                        src={sig.dataUrl}
                        alt={`${email} 서명`}
                        sx={{ width: 240, height: 90, border: '1px solid', borderColor: 'success.light', borderRadius: 1, display: 'block', objectFit: 'contain', background: '#fff' }}
                      />
                      <Typography variant="caption" color="success.main">서명 완료</Typography>
                    </Box>
                  ) : (
                    <Box sx={{ width: 240, height: 90, border: '1px dashed', borderColor: 'divider', borderRadius: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fafafa' }}>
                      <Typography variant="caption" color="text.disabled">서명 대기 중</Typography>
                    </Box>
                  )}
                </Box>
              )
            })}
          </Box>
        )}
      </Paper>

      {/* ── 하단 버튼 ── */}
      {!isReadOnly && submission?.status !== 'submitted' && (
        <Box display="flex" gap={2} mb={4} alignItems="center">
          <Button
            variant="contained"
            disabled={!canSubmit}
            onClick={() => setSubmitDialogOpen(true)}
          >
            제출 완료
          </Button>
          {!canSubmit && (
            <Typography variant="caption" color="text.secondary">
              {!isAllAnswered()
                ? `미답변 ${ALL_PROCESS_QUESTION_IDS.filter((id) => !submission?.answers?.[id]?.value).length}문항 남음`
                : `미서명 ${(subject?.teacherEmails || []).filter((e) => !submission?.signatures?.[e]?.dataUrl).length}명 남음`}
            </Typography>
          )}
        </Box>
      )}

      {submission?.status === 'submitted' && (
        <Alert
          severity="success"
          sx={{ mb: 4 }}
          action={
            <Button
              color="inherit"
              size="small"
              onClick={() => navigate(`/tools/asa-checklist/${subjectId}/result`)}
            >
              붙임2 결과 체크리스트로 이동
            </Button>
          }
        >
          제출이 완료된 체크리스트입니다. 필요하면 제출 후에도 계속 수정할 수 있습니다.
        </Alert>
      )}

      <Dialog open={submitDialogOpen} onClose={() => setSubmitDialogOpen(false)}>
        <DialogTitle>체크리스트 제출</DialogTitle>
        <DialogContent>
          <Typography>제출하시겠습니까? 제출 후에도 필요하면 계속 수정할 수 있습니다.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSubmitDialogOpen(false)} disabled={submitting}>취소</Button>
          <Button variant="contained" onClick={handleSubmitConfirm} disabled={submitting}>
            {submitting ? '제출 중...' : '제출 완료'}
          </Button>
        </DialogActions>
      </Dialog>
    </Layout>
  )
}
