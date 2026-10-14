/**
 * 내 메일 발송 현황 — 어느 페이지에 있든 화면 위쪽 가운데에 떠 있는 한 줄.
 *
 * 고사 명렬표 보조 도구(exam-support-hck)의 RecentActivityPanel(TopTicker)과 같은 방식이다:
 * 평소엔 알약 모양 한 줄(최신 발송 1건)만 보이고, 마우스를 올리거나 새 발송·상태 변화가
 * 오면 잠깐 펼쳐 최근 발송 몇 건을 진행률과 함께 보여준다. 누르면 펼친 채로 고정된다.
 *
 * 메일은 Firestore 트리거가 비동기로 보내므로, 발송 버튼을 누른 뒤 다른 화면으로
 * 옮겨가도 진행·완료·실패를 놓치지 않게 하려는 것이다(세특 테스트 발송처럼 발송
 * 화면에 머무르는 경우에도 결과를 바로 볼 수 있음).
 *
 * 항상 떠 있으면 거슬리므로 "진행 중·예약 대기 중이거나, 최근 RECENT_MS 안에 끝난
 * 발송"이 있을 때만 보인다. ×로 닫으면 그 상태(최신 발송 id+status)가 바뀔 때까지 숨긴다.
 */
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import Collapse from '@mui/material/Collapse'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import LinearProgress from '@mui/material/LinearProgress'
import CircularProgress from '@mui/material/CircularProgress'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import CloseIcon from '@mui/icons-material/Close'
import { useAuth } from '@shared/contexts/AuthContext'
import { db } from '@shared/lib/firebase'

const COUNT = 4 // 최신 1건 + 이전 3건
const ALERT_MS = 3000 // 새 발송·상태 변화가 오면 펼쳐 보여주는 시간
const RECENT_MS = 6 * 60 * 60 * 1000 // 끝난 발송은 6시간 동안만 띄워 둔다
const DISMISS_KEY = 'emailTicker.dismissed'

// 이메일 발송(emailJobs 생성)이 가능한 교직원만 구독한다 — 학생·승인 대기 등은 읽기 권한도 없다.
const NON_STAFF_ROLES = new Set(['student', 'pending', 'rejected', 'guest'])

const HIDDEN_PATHS = ['/login', '/student']

const ACTIVE = new Set(['queued', 'sending', 'scheduled'])

const STATUS = {
  scheduled: { label: '예약됨', color: '#0284c7' },
  queued: { label: '대기 중', color: '#64748b' },
  sending: { label: '발송 중', color: '#2563eb' },
  done: { label: '발송 완료', color: '#16a34a' },
  done_with_errors: { label: '일부 실패', color: '#d97706' },
  failed: { label: '발송 실패', color: '#dc2626' },
  cancelled: { label: '예약 취소', color: '#94a3b8' },
}

const toDate = (ts) => (ts?.toDate ? ts.toDate() : ts ? new Date(ts) : null)

/** "방금", "3분 전", "2시간 전", "어제 14:05", "10/15 08:00" */
function relativeTime(d, now) {
  if (!d) return '방금'
  const diff = now - d.getTime()
  const hm = d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
  if (diff < 0) { // 예약 시각(미래)
    const sameDay = d.toDateString() === new Date(now).toDateString()
    return sameDay ? `오늘 ${hm}` : `${d.getMonth() + 1}/${d.getDate()} ${hm}`
  }
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return '방금'
  if (sec < 3600) return `${Math.floor(sec / 60)}분 전`
  if (sec < 6 * 3600) return `${Math.floor(sec / 3600)}시간 전`
  if (d.toDateString() === new Date(now - 86400000).toDateString()) return `어제 ${hm}`
  return `${d.getMonth() + 1}/${d.getDate()} ${hm}`
}

function jobTitle(job) {
  if (job.kind === 'setuk') return `${job.isTest ? '[테스트] ' : ''}${job.setuk?.subjectName || ''} 세특`
  return job.subject || '(제목 없음)'
}

function jobTime(job) {
  if (job.status === 'scheduled') return toDate(job.scheduledAt)
  return toDate(job.completedAt) || toDate(job.startedAt) || toDate(job.createdAt)
}

function StatusDot({ job }) {
  if (job.status === 'sending' || job.status === 'queued') return <CircularProgress size={10} thickness={6} sx={{ flexShrink: 0 }} />
  return <Box component="span" sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: STATUS[job.status]?.color || '#94a3b8', flexShrink: 0 }} />
}

function countsText(job) {
  const { total = 0, sent = 0, failed = 0 } = job.counts || {}
  if (job.status === 'scheduled' || job.status === 'cancelled') return `${total}명`
  return `${sent + failed}/${total}${failed > 0 ? ` · 실패 ${failed}` : ''}`
}

function Item({ job, now, onOpen }) {
  const { total = 0, sent = 0, failed = 0 } = job.counts || {}
  const pct = total > 0 ? Math.round(((sent + failed) / total) * 100) : 0
  const st = STATUS[job.status] || { label: job.status, color: '#94a3b8' }
  return (
    <Box onClick={onOpen} sx={{ p: 0.75, borderRadius: 1, border: '1px solid', borderColor: 'divider', cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 0.75, minWidth: 0 }}>
        <StatusDot job={job} />
        <Typography sx={{ fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
          {jobTitle(job)}
        </Typography>
        <Typography sx={{ fontSize: 11.5, color: st.color, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>{st.label}</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto', pl: 0.5, whiteSpace: 'nowrap', flexShrink: 0 }}>
          {countsText(job)} · {relativeTime(jobTime(job), now)}
        </Typography>
      </Stack>
      {(job.status === 'sending' || job.status === 'queued') && (
        <LinearProgress variant={job.status === 'queued' ? 'indeterminate' : 'determinate'} value={pct} sx={{ mt: 0.5, height: 4, borderRadius: 2 }} />
      )}
      {job.status === 'failed' && job.failReason && (
        <Typography variant="caption" color="error" sx={{ display: 'block', mt: 0.25, lineHeight: 1.4 }}>{job.failReason}</Typography>
      )}
    </Box>
  )
}

const readDismissed = () => { try { return sessionStorage.getItem(DISMISS_KEY) } catch { return null } }
const writeDismissed = (v) => { try { sessionStorage.setItem(DISMISS_KEY, v) } catch { /* 저장 불가(사생활 보호 모드 등) — 이번 화면에서만 닫힘 */ } }

export default function EmailJobTicker() {
  const { user, role, schoolId } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [jobs, setJobs] = useState([])
  const [now, setNow] = useState(Date.now())
  const [pinned, setPinned] = useState(false)
  const [alerting, setAlerting] = useState(false)
  const [hover, setHover] = useState(false)
  const [dismissed, setDismissed] = useState(readDismissed)
  const lastSig = useRef(null)
  const alertTimer = useRef()

  const enabled = !!user && !!schoolId && !!role && !NON_STAFF_ROLES.has(role)

  useEffect(() => {
    if (!enabled) { setJobs([]); return }
    const q = query(
      collection(db, 'schools', schoolId, 'emailJobs'),
      where('senderUid', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(COUNT),
    )
    // 권한 오류 등은 조용히 숨긴다 — 보조 표시라 화면에 에러를 띄울 이유가 없다.
    return onSnapshot(q, (snap) => setJobs(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setJobs([]))
  }, [enabled, schoolId, user])

  // "3분 전" 같은 상대 시각을 30초마다 갱신
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])

  const latest = jobs[0]
  const sig = latest ? `${latest.id}:${latest.status}` : null

  // 처음 불러온 것은 알리지 않고, 그 뒤 새 발송이 생기거나 최신 발송의 상태가 바뀌면(발송 시작·완료·실패) 잠깐 펼친다.
  // 진행률(counts)만 바뀔 때는 펼치지 않는다 — 10명마다 들썩이면 거슬린다.
  useEffect(() => {
    if (!sig) return
    if (lastSig.current !== null && lastSig.current !== sig) {
      setAlerting(true)
      clearTimeout(alertTimer.current)
      alertTimer.current = setTimeout(() => setAlerting(false), ALERT_MS)
    }
    lastSig.current = sig
  }, [sig])

  useEffect(() => () => clearTimeout(alertTimer.current), [])

  // 로그인·학생 포털처럼 교직원 레이아웃이 아닌 화면에서는 띄우지 않는다.
  if (!latest || HIDDEN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null
  const latestTime = toDate(latest.completedAt) || toDate(latest.createdAt)
  const isRelevant = ACTIVE.has(latest.status) || (latestTime && now - latestTime.getTime() < RECENT_MS) || !latestTime
  if (!isRelevant || dismissed === sig) return null

  const expanded = pinned || alerting || hover

  const toggle = () => {
    if (pinned || alerting || hover) {
      setPinned(false)
      setAlerting(false)
      clearTimeout(alertTimer.current)
      setHover(false)
    } else {
      setPinned(true)
    }
  }

  const dismiss = (e) => {
    e.stopPropagation()
    writeDismissed(sig)
    setDismissed(sig)
    setPinned(false)
    setHover(false)
  }

  const open = (jobId) => {
    setPinned(false)
    setHover(false)
    navigate(`/emails/${jobId}`)
  }

  const st = STATUS[latest.status] || { label: latest.status, color: '#94a3b8' }

  return (
    <Box
      sx={{
        position: 'fixed',
        top: 64,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1200,
        width: expanded ? 'min(460px, calc(100vw - 24px))' : 'auto',
        maxWidth: 'calc(100vw - 24px)',
        '@media print': { display: 'none' },
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => {
        setHover(false)
        setPinned(false)
        setAlerting(false)
        clearTimeout(alertTimer.current)
      }}
    >
      <Paper
        elevation={0}
        sx={{
          borderRadius: expanded ? 2 : 99,
          border: '1px solid',
          borderColor: alerting ? st.color : 'divider',
          bgcolor: 'rgba(255,255,255,0.95)',
          backdropFilter: 'blur(6px)',
          boxShadow: alerting ? '0 6px 24px rgba(37,99,235,0.28)' : '0 4px 16px rgba(0,0,0,0.14)',
          overflow: 'hidden',
          transition: 'box-shadow .3s, border-color .3s, border-radius .2s',
        }}
      >
        {/* 한 줄: ● 메일 · 제목 · 상태 · 진행 · 시각 */}
        <Stack direction="row" onClick={toggle} title="눌러서 최근 발송 펼치기/접기"
          sx={{ alignItems: 'center', gap: 1, pl: 1.5, pr: 0.5, py: 0.5, cursor: 'pointer', minWidth: 0 }}>
          <StatusDot job={latest} />
          <Typography variant="body2" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>✉️ 메일</Typography>
          <Typography variant="body2" color="text.secondary" noWrap sx={{ minWidth: 0, maxWidth: expanded ? 'none' : 'min(36vw, 320px)', flex: expanded ? 1 : 'none' }}>
            {jobTitle(latest)}
          </Typography>
          <Typography variant="body2" sx={{ color: st.color, fontWeight: 700, whiteSpace: 'nowrap' }}>{st.label}</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
            {countsText(latest)} · {relativeTime(jobTime(latest), now)}
          </Typography>
          {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
          {!ACTIVE.has(latest.status) && (
            <IconButton size="small" onClick={dismiss} title="닫기 (새 발송이 생기면 다시 표시)" sx={{ p: 0.25 }}>
              <CloseIcon sx={{ fontSize: 16 }} />
            </IconButton>
          )}
        </Stack>

        <Collapse in={expanded} unmountOnExit>
          <Stack spacing={0.75} sx={{ px: 1.25, pb: 1.25 }}>
            {jobs.map((job) => <Item key={job.id} job={job} now={now} onOpen={() => open(job.id)} />)}
            <Button size="small" onClick={() => { setPinned(false); navigate('/emails') }}>발송 내역 전체 보기</Button>
          </Stack>
        </Collapse>
      </Paper>
    </Box>
  )
}
