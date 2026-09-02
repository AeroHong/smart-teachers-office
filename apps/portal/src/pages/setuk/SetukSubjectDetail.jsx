// 과목별 보기 상세 — "과목별 보기" 탭의 과목 목록에서 과목을 클릭하면 오는 별도 페이지.
// 그 과목을 여러 학급에 걸쳐 담당하는 교과 교사가, 학급마다 따로 들어가지 않고 자기
// 과목에 걸린 항목만 한 화면에서 훑을 수 있게 한다. "해당 과목 담당 교사 + 그 학급
// 담임(업로더) + 관리자"만 그 학급의 항목을 볼 수 있어(다른 학급은 안 보임) —
// 학급별 상세 화면(SetukCheckDetail)의 열람 권한과 같은 기준을 과목 축으로 다시 쓴 것.
import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Chip from '@mui/material/Chip'
import Checkbox from '@mui/material/Checkbox'
import TextField from '@mui/material/TextField'
import FormControlLabel from '@mui/material/FormControlLabel'
import Tooltip from '@mui/material/Tooltip'
import IconButton from '@mui/material/IconButton'
import Accordion from '@mui/material/Accordion'
import AccordionSummary from '@mui/material/AccordionSummary'
import AccordionDetails from '@mui/material/AccordionDetails'
import CircularProgress from '@mui/material/CircularProgress'
import Alert from '@mui/material/Alert'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import TaskAltIcon from '@mui/icons-material/TaskAlt'
import VerifiedIcon from '@mui/icons-material/Verified'
import { useAuth } from '@shared/contexts/AuthContext'
import {
  subscribeChecks, loadRecords, loadItemsBySubject, updateItemNote, updateItemResolved, isAssignedTeacher,
} from '@shared/lib/setukCheck'
import { AUTHORITY_LABELS } from './setukUtils'
import { SEVERITY_COLORS, BADGE_STYLE, MultiHighlight } from './setukShared'
import Layout from '../../components/Layout'

// 이 교사가 어떤 학급의 항목을 볼 자격이 있는지 — 관리자, 그 학급 담임(업로더),
// 그 과목의 담당 교사(여러 명 가능)만.
const canSeeCheckForSubject = (check, subjectName, isAdmin, user) => (
  isAdmin || check.uploadedByUid === user?.uid || isAssignedTeacher(check.subjectAssignments?.[subjectName], user?.uid)
)

export default function SetukSubjectDetail() {
  const { subjectName: subjectParam } = useParams()
  const subject = decodeURIComponent(subjectParam || '')
  const navigate = useNavigate()
  const { user, userName, schoolId, isAdmin } = useAuth()

  const [checks, setChecks] = useState([])
  const [loadingChecks, setLoadingChecks] = useState(true)
  const [groups, setGroups] = useState([])
  const [recordsById, setRecordsById] = useState({})
  const [loadingGroups, setLoadingGroups] = useState(false)
  const [error, setError] = useState('')
  const [unresolvedOnly, setUnresolvedOnly] = useState(true)
  const [savingNote, setSavingNote] = useState({})

  const goBack = () => navigate('/setuk', { state: { tab: 1 } })

  useEffect(() => {
    if (!schoolId) return
    return subscribeChecks(schoolId, (list) => { setChecks(list); setLoadingChecks(false) }, (err) => { setError(err.message); setLoadingChecks(false) })
  }, [schoolId])

  useEffect(() => {
    if (!subject || !schoolId || loadingChecks) return

    const relevantChecks = checks.filter((c) => (
      Object.prototype.hasOwnProperty.call(c.subjectAssignments || {}, subject) &&
      canSeeCheckForSubject(c, subject, isAdmin, user)
    ))

    let cancelled = false
    setLoadingGroups(true)
    setError('')

    Promise.all(relevantChecks.map(async (c) => {
      const [items, records] = await Promise.all([
        loadItemsBySubject(schoolId, c.id, subject),
        loadRecords(schoolId, c.id),
      ])
      return { check: c, items, records }
    }))
      .then((results) => {
        if (cancelled) return
        const nextRecordsById = {}
        const map = new Map()
        results.forEach(({ check, items, records }) => {
          records.forEach((r) => { nextRecordsById[r.id] = r })
          items.forEach((it) => {
            const key = `${check.id}__${it.studentNumber}`
            if (!map.has(key)) {
              map.set(key, {
                key, checkId: check.id, classLabel: check.classLabel,
                studentNumber: it.studentNumber, studentName: it.studentName,
                uploadedByUid: check.uploadedByUid, subjectAssignments: check.subjectAssignments,
                items: [],
              })
            }
            map.get(key).items.push({ ...it, checkId: check.id, subjectAssignments: check.subjectAssignments, uploadedByUid: check.uploadedByUid })
          })
        })
        const nextGroups = [...map.values()].sort((a, b) => (
          a.classLabel.localeCompare(b.classLabel, 'ko') || a.studentNumber - b.studentNumber
        ))
        setRecordsById(nextRecordsById)
        setGroups(nextGroups)
      })
      .catch((e) => !cancelled && setError(`과목별 항목 조회 실패: ${e.message}`))
      .finally(() => !cancelled && setLoadingGroups(false))

    return () => { cancelled = true }
  }, [subject, schoolId, checks, loadingChecks, isAdmin, user])

  const canResolveFixed = (item) => isAdmin || (!!user && isAssignedTeacher(item.subjectAssignments?.[item.subjectName], user.uid))
  const canResolveNoIssue = (item) => isAdmin || canResolveFixed(item) ||
    (!!user && item.uploadedByUid === user.uid && item.resolution !== 'fixed')

  const handleSetResolution = async (item, resolution) => {
    const allowed = resolution === 'fixed' ? canResolveFixed(item) : canResolveNoIssue(item)
    if (!allowed) return
    const turningOn = item.resolution !== resolution
    try {
      await updateItemResolved(schoolId, item.checkId, item.id, turningOn, turningOn ? resolution : null, user?.uid, userName)
      setGroups((prev) => prev.map((g) => ({
        ...g,
        items: g.items.map((it) => (it.id === item.id
          ? { ...it, resolved: turningOn, resolution: turningOn ? resolution : null }
          : it)),
      })))
    } catch (e) {
      setError(`처리 상태 변경 실패: ${e.message}`)
    }
  }

  const handleNoteBlur = async (item, value) => {
    if (value === (item.note || '')) return
    setSavingNote((prev) => ({ ...prev, [item.id]: true }))
    try {
      await updateItemNote(schoolId, item.checkId, item.id, value)
    } catch (e) {
      setError(`메모 저장 실패: ${e.message}`)
    } finally {
      setSavingNote((prev) => ({ ...prev, [item.id]: false }))
    }
  }

  const visibleGroups = useMemo(() => (
    groups
      .map((g) => ({ ...g, items: g.items.filter((it) => !unresolvedOnly || !it.resolved) }))
      .filter((g) => g.items.length > 0)
  ), [groups, unresolvedOnly])

  return (
    <Layout wide>
      <Button size="small" onClick={goBack} sx={{ mb: 1, textTransform: 'none', color: '#64748b' }}>
        ← 과목별 보기로
      </Button>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <Typography variant="h5" fontWeight={700}>{subject}</Typography>
        <FormControlLabel
          control={<Checkbox checked={unresolvedOnly} onChange={(e) => setUnresolvedOnly(e.target.checked)} />}
          label="미처리만 보기"
        />
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {loadingChecks || loadingGroups ? (
        <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box>
      ) : visibleGroups.length === 0 ? (
        <Paper variant="outlined" sx={{ py: 4, textAlign: 'center', color: '#94a3b8' }}>표시할 항목이 없습니다.</Paper>
      ) : visibleGroups.map((g) => {
        const unresolvedInGroup = g.items.filter((it) => !it.resolved).length
        const recordText = recordsById[g.items[0]?.recordId]?.text
        return (
          <Accordion key={g.key} defaultExpanded variant="outlined" sx={{ mb: 1, '&:before': { display: 'none' } }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}>
                <Typography sx={{ fontWeight: 700, fontSize: '1.05rem' }}>{g.classLabel}</Typography>
                <Typography sx={{ color: '#94a3b8', fontSize: '0.82rem' }}>{g.studentNumber}번 {g.studentName}</Typography>
                <Chip size="small" variant="outlined" label={`${g.items.length}건`} />
                {unresolvedInGroup > 0 && <Chip size="small" color="warning" label={`미처리 ${unresolvedInGroup}`} />}
              </Box>
            </AccordionSummary>
            <AccordionDetails sx={{ p: 0 }}>
              <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' } }}>
                <Box sx={{
                  flex: '1 1 50%', p: 2, fontSize: '0.85rem', lineHeight: 1.9, bgcolor: '#fafafa',
                  borderRight: { md: '1px solid #e5e7eb' }, borderBottom: { xs: '1px solid #e5e7eb', md: 'none' },
                }}
                >
                  <MultiHighlight text={recordText} groupItems={g.items} />
                </Box>
                <Box sx={{ flex: '1 1 50%' }}>
                  {g.items.map((it, idx) => {
                    const fixedAllowed = canResolveFixed(it)
                    const noIssueAllowed = canResolveNoIssue(it)
                    return (
                      <Box key={it.id} sx={{ p: 1.5, borderBottom: '1px solid #e5e7eb', opacity: it.resolved ? 0.55 : 1 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5, flexWrap: 'wrap' }}>
                          <span style={BADGE_STYLE}>{idx + 1}</span>
                          <Chip size="small" variant="outlined" label={AUTHORITY_LABELS[it.authority] || it.authority} sx={{ fontSize: '0.66rem' }} />
                          <Chip size="small" label={it.category} color={SEVERITY_COLORS[it.severity]} sx={{ fontWeight: 700 }} />
                          <Box sx={{ flex: 1 }} />
                          <Tooltip title={fixedAllowed ? '처리완료(나이스 수정 반영함)' : '담당 교사만 표시할 수 있습니다.'}>
                            <span>
                              <IconButton size="small" disabled={!fixedAllowed} onClick={() => handleSetResolution(it, 'fixed')}>
                                <TaskAltIcon fontSize="small" color={it.resolution === 'fixed' ? 'success' : 'disabled'} />
                              </IconButton>
                            </span>
                          </Tooltip>
                          <Tooltip title={noIssueAllowed ? '이상없음(고유명사·도서명 등 오탐 확인함)' : '담당 교사·담임·관리자만 표시할 수 있습니다.'}>
                            <span>
                              <IconButton size="small" disabled={!noIssueAllowed} onClick={() => handleSetResolution(it, 'no_issue')}>
                                <VerifiedIcon fontSize="small" color={it.resolution === 'no_issue' ? 'info' : 'disabled'} />
                              </IconButton>
                            </span>
                          </Tooltip>
                        </Box>
                        <Typography sx={{ fontSize: '0.82rem' }}>
                          <span style={{ color: '#94a3b8' }}>{it.before}</span>
                          <strong style={{ color: '#dc2626', margin: '0 2px' }}>{it.matched}</strong>
                          <span style={{ color: '#94a3b8' }}>{it.after}</span>
                        </Typography>
                        {it.message && <Typography sx={{ fontSize: '0.74rem', color: '#64748b', mt: 0.25 }}>→ {it.message}</Typography>}
                        <TextField
                          sx={{ mt: 1 }} size="small" fullWidth variant="standard" placeholder="메모"
                          defaultValue={it.note || ''}
                          disabled={!!savingNote[it.id]}
                          onBlur={(e) => handleNoteBlur(it, e.target.value)}
                        />
                      </Box>
                    )
                  })}
                </Box>
              </Box>
            </AccordionDetails>
          </Accordion>
        )
      })}

      <Button size="small" onClick={goBack} sx={{ mt: 2, textTransform: 'none', color: '#64748b' }}>
        ← 과목별 보기로
      </Button>
    </Layout>
  )
}
