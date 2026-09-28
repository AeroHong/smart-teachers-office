/**
 * 이메일 발송 — 대상 선택 + 작성 + 미리보기 + 발송.
 *
 * 발송 버튼을 누르면 이 화면이 직접 Gmail을 호출하지 않는다. schools/{schoolId}/
 * emailJobs 문서를 status:'queued'로 만들기만 하고, 실제 발송은 Firestore 트리거
 * (functions/emailSend.js)가 비동기로 처리한다 — 수백 명에게 보낼 때 이 화면이
 * 멈춰있지 않게 하기 위해서다. 문서를 만든 뒤에는 진행률 화면(EmailJobDetail)으로
 * 넘어가 onSnapshot으로 결과를 지켜본다.
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Alert from '@mui/material/Alert'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import RadioGroup from '@mui/material/RadioGroup'
import Radio from '@mui/material/Radio'
import FormControlLabel from '@mui/material/FormControlLabel'
import SendIcon from '@mui/icons-material/Send'
import ScheduleIcon from '@mui/icons-material/Schedule'
import { useAuth } from '@shared/contexts/AuthContext'
import { db } from '@shared/lib/firebase'
import { isEmptyHtml, sanitizeHtml, htmlToText } from '@shared/lib/richText'
import { buildEmailHtml } from '@shared/lib/emailTemplate'
import EmailRichTextEditor from '@shared/components/EmailRichTextEditor'
import RecipientPicker from './components/RecipientPicker'
import Layout from '../../components/Layout'

// 대량 발송 실수를 한 번 더 막기 위한 강조 기준 (요구사항 7 "오발송 방지" 조언 반영)
const LARGE_SEND_THRESHOLD = 100

export default function EmailCompose() {
  const { schoolId, schoolName, user, userName } = useAuth()
  const navigate = useNavigate()

  const [checking, setChecking] = useState(true)
  const [workspaceEnabled, setWorkspaceEnabled] = useState(false)

  // 이 화면 진입 시 한 번만 만들어, 본문 이미지 업로드 경로와 최종 문서 ID를 일치시킨다.
  const [jobId] = useState(() => doc(collection(db, 'schools', schoolId, 'emailJobs')).id)

  const [subject, setSubject] = useState('')
  const [bodyHtml, setBodyHtml] = useState('')
  const [selected, setSelected] = useState([])
  const [sendMode, setSendMode] = useState('now') // 'now' | 'scheduled'
  const [scheduledAt, setScheduledAt] = useState('') // <input type="datetime-local"> 값
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!schoolId) return
    getDoc(doc(db, 'schools', schoolId)).then(snap => {
      setWorkspaceEnabled(!!snap.data()?.workspaceSync?.enabled)
      setChecking(false)
    })
  }, [schoolId])

  const previewSrcDoc = useMemo(() => {
    const safeHtml = sanitizeHtml(bodyHtml) || '<p style="color:#94a3b8">본문을 입력하면 여기에 미리보기가 표시됩니다.</p>'
    return buildEmailHtml(schoolName, safeHtml)
  }, [bodyHtml, schoolName])

  const scheduledDate = scheduledAt ? new Date(scheduledAt) : null
  const scheduledValid = sendMode === 'now' || (scheduledDate && scheduledDate.getTime() > Date.now())

  const canSend = subject.trim() && !isEmptyHtml(bodyHtml) && selected.length > 0 && scheduledValid

  const openConfirm = () => {
    setError('')
    if (subject.trim() && !isEmptyHtml(bodyHtml) && selected.length > 0 && sendMode === 'scheduled' && !scheduledDate) {
      setError('예약 발송 시각을 선택해주세요.')
      return
    }
    if (sendMode === 'scheduled' && scheduledDate && scheduledDate.getTime() <= Date.now()) {
      setError('예약 시각은 현재보다 이후여야 합니다.')
      return
    }
    if (!canSend) {
      setError('제목, 본문, 받는 사람을 모두 입력해주세요.')
      return
    }
    setConfirmOpen(true)
  }

  const handleSend = async () => {
    setSending(true)
    setError('')
    try {
      const cleanHtml = sanitizeHtml(bodyHtml)
      const recipients = selected.map(s => ({
        ...s,
        status: 'pending',
        sentAt: null,
        gmailMessageId: null,
        error: null,
      }))

      const isScheduled = sendMode === 'scheduled'

      await setDoc(doc(db, 'schools', schoolId, 'emailJobs', jobId), {
        senderUid: user.uid,
        senderEmail: user.email,
        senderName: userName,
        schoolId,
        schoolName,
        subject: subject.trim(),
        bodyHtml: cleanHtml,
        bodyText: htmlToText(cleanHtml),
        recipients,
        counts: { total: recipients.length, sent: 0, failed: 0 },
        status: isScheduled ? 'scheduled' : 'queued',
        scheduledAt: isScheduled ? scheduledDate : null,
        cancelledAt: null,
        failReason: null,
        targetFilter: { mode: 'manual' },
        createdAt: serverTimestamp(),
        startedAt: null,
        completedAt: null,
      })

      navigate(`/emails/${jobId}`)
    } catch (err) {
      setError('발송 요청 중 오류가 발생했습니다: ' + err.message)
      setSending(false)
      setConfirmOpen(false)
    }
  }

  if (checking) {
    return (
      <Layout>
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
          <CircularProgress />
        </Box>
      </Layout>
    )
  }

  if (!workspaceEnabled) {
    return (
      <Layout>
        <Typography variant="h5" sx={{ mb: 2 }}>이메일 발송</Typography>
        <Alert severity="warning">
          이 학교는 Google Workspace 연동이 설정되지 않아 이메일 발송 기능을 사용할 수 없습니다.
          관리자에게 문의해주세요.
        </Alert>
      </Layout>
    )
  }

  return (
    <Layout>
      <Typography variant="h5" sx={{ mb: 2 }}>새 메일 작성</Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 900 }}>
        <Box>
          <Typography variant="subtitle2" sx={{ mb: 0.75 }}>받는 사람</Typography>
          <RecipientPicker schoolId={schoolId} selected={selected} onChange={setSelected} />
        </Box>

        <TextField
          label="제목" value={subject} onChange={e => setSubject(e.target.value)}
          fullWidth size="small"
        />

        <Box>
          <Typography variant="subtitle2" sx={{ mb: 0.75 }}>본문</Typography>
          <EmailRichTextEditor
            schoolId={schoolId}
            docId={jobId}
            folder="emails"
            value={bodyHtml}
            onChange={setBodyHtml}
            onError={e => setError('이미지를 올리지 못했습니다: ' + e.message)}
            placeholder="학생들에게 보낼 내용을 입력하세요"
          />
        </Box>

        <Box>
          <Typography variant="subtitle2" sx={{ mb: 0.75 }}>미리보기 (실제 수신 화면)</Typography>
          <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
            <Box
              component="iframe"
              title="email-preview"
              srcDoc={previewSrcDoc}
              sx={{ display: 'block', width: '100%', height: 420, border: 0 }}
            />
          </Box>
        </Box>

        <Box>
          <Typography variant="subtitle2" sx={{ mb: 0.75 }}>발송 시점</Typography>
          <RadioGroup row value={sendMode} onChange={e => setSendMode(e.target.value)}>
            <FormControlLabel value="now" control={<Radio size="small" />} label="즉시 발송" />
            <FormControlLabel value="scheduled" control={<Radio size="small" />} label="예약 발송" />
          </RadioGroup>
          {sendMode === 'scheduled' && (
            <TextField
              type="datetime-local" size="small" value={scheduledAt}
              onChange={e => setScheduledAt(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ mt: 0.5 }}
            />
          )}
        </Box>

        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            variant="contained"
            startIcon={sendMode === 'scheduled' ? <ScheduleIcon /> : <SendIcon />}
            onClick={openConfirm}
            disabled={!canSend}
          >
            {sendMode === 'scheduled' ? '예약하기' : '발송하기'}
          </Button>
        </Box>
      </Box>

      <Dialog open={confirmOpen} onClose={() => !sending && setConfirmOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>
          {sendMode === 'scheduled' ? '이메일을 예약할까요?' : '이메일을 발송할까요?'}
        </DialogTitle>
        <DialogContent>
          {sendMode === 'scheduled' ? (
            <Typography sx={{ mb: 1 }}>
              <b>{scheduledDate?.toLocaleString('ko-KR')}</b>에 총 <b>{selected.length}명</b>에게 개별로 발송됩니다.
            </Typography>
          ) : (
            <Typography sx={{ mb: 1 }}>
              총 <b>{selected.length}명</b>에게 개별로 발송됩니다.
            </Typography>
          )}
          {selected.length >= LARGE_SEND_THRESHOLD && (
            <Alert severity="warning" sx={{ mb: 1 }}>
              대상 인원이 많습니다. 받는 사람 명단을 다시 한 번 확인해주세요.
            </Alert>
          )}
          <Typography variant="body2" color="text.secondary">
            학생 개인정보(이메일)가 포함되니 대상을 다시 확인해주세요.
            {sendMode === 'scheduled' ? ' 예약은 발송 전까지 발송 내역 화면에서 취소할 수 있습니다.' : ' 발송 후에는 취소할 수 없습니다.'}
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
