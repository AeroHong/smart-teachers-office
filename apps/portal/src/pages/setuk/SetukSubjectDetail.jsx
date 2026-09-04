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
import TextField from '@mui/material/TextField'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
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
import { SEVERITY_COLORS, BADGE_STYLE, MultiHighlight, maskName, fmtDateTime, fmtDate, ResolutionButton } from './setukShared'
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
  // 기본은 전체 보기 — 예전엔 미처리만 기본으로 보여줘서 이미 처리완료한 항목을
  // 다시 확인하기 불편하다는 피드백을 반영해 상태 필터로 바꿨다(학급별 상세와
  // 같은 방식: 전체/미처리/처리완료/이상없음).
  const [statusFilter, setStatusFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [classFilter, setClassFilter] = useState('all')
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
                sourceFileCreatedAt: check.sourceFileCreatedAt,
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

  // 전입생 등으로 우리 학교에 개설되지 않아 담당 교사를 지정할 수 없다고 표시된 과목
  // (noAssignment)은 관리자만 처리 가능한 상태로 영원히 막히면 안 되니 담임(업로더)에게도 연다.
  const canResolveFixed = (item) => {
    const assign = item.subjectAssignments?.[item.subjectName]
    return isAdmin || (!!user && isAssignedTeacher(assign, user.uid)) ||
      (!!user && !!assign?.noAssignment && item.uploadedByUid === user.uid)
  }
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

  const categories = useMemo(() => (
    [...new Set(groups.flatMap((g) => g.items.map((it) => it.category)))].sort((a, b) => a.localeCompare(b, 'ko'))
  ), [groups])

  // 반별로 보기 — 이 과목을 담당하는 학급이 여러 반일 때 하나만 골라 볼 수 있게 한다.
  const classLabels = useMemo(() => (
    [...new Set(groups.map((g) => g.classLabel))].sort((a, b) => a.localeCompare(b, 'ko'))
  ), [groups])

  const matchesStatus = (it) => {
    if (statusFilter === 'unresolved') return !it.resolved
    if (statusFilter === 'fixed') return it.resolution === 'fixed'
    if (statusFilter === 'no_issue') return it.resolution === 'no_issue'
    return true
  }

  // 필터 드롭다운에 유형별·반별 건수를 같이 보여준다 — 처리 상태 필터는 그대로
  // 적용하고(지금 화면에 실제로 몇 건이 뜰지가 궁금한 것이므로), 유형·반 필터
  // 자체는 서로 무시한 채로 세어야 "전체" 대비 각 값이 몇 건인지 비교가 된다.
  const categoryCounts = useMemo(() => {
    const counts = {}
    let total = 0
    groups.forEach((g) => {
      if (classFilter !== 'all' && g.classLabel !== classFilter) return
      g.items.forEach((it) => {
        if (!matchesStatus(it)) return
        counts[it.category] = (counts[it.category] || 0) + 1
        total += 1
      })
    })
    return { counts, total }
  }, [groups, statusFilter, classFilter])

  // 처리 상태 필터 드롭다운에 건수를 같이 보여준다 — 유형·반 필터 카운트와 같은 방식으로,
  // 다른 필터(유형·반)는 그대로 적용하고 처리 상태 자체만 무시한 채 센다.
  const statusCounts = useMemo(() => {
    const base = []
    groups.forEach((g) => {
      if (classFilter !== 'all' && g.classLabel !== classFilter) return
      g.items.forEach((it) => {
        if (categoryFilter !== 'all' && it.category !== categoryFilter) return
        base.push(it)
      })
    })
    return {
      all: base.length,
      unresolved: base.filter((it) => !it.resolved).length,
      fixed: base.filter((it) => it.resolution === 'fixed').length,
      no_issue: base.filter((it) => it.resolution === 'no_issue').length,
    }
  }, [groups, classFilter, categoryFilter])

  const classCounts = useMemo(() => {
    const counts = {}
    let total = 0
    groups.forEach((g) => {
      const n = g.items.filter((it) => matchesStatus(it) && (categoryFilter === 'all' || it.category === categoryFilter)).length
      if (n === 0) return
      counts[g.classLabel] = (counts[g.classLabel] || 0) + n
      total += n
    })
    return { counts, total }
  }, [groups, statusFilter, categoryFilter])

  const visibleGroups = useMemo(() => (
    groups
      .filter((g) => classFilter === 'all' || g.classLabel === classFilter)
      .map((g) => ({
        ...g,
        items: g.items.filter((it) => matchesStatus(it) && (categoryFilter === 'all' || it.category === categoryFilter)),
      }))
      .filter((g) => g.items.length > 0)
  ), [groups, statusFilter, categoryFilter, classFilter])

  return (
    <Layout wide>
      <Button size="small" onClick={goBack} sx={{ mb: 1, textTransform: 'none', color: '#64748b' }}>
        ← 과목별 보기로
      </Button>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <Typography variant="h5" fontWeight={700}>{subject}</Typography>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>학급 필터</InputLabel>
          <Select label="학급 필터" value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
            <MenuItem value="all">전체 학급 ({classCounts.total})</MenuItem>
            {classLabels.map((c) => <MenuItem key={c} value={c}>{c} ({classCounts.counts[c] || 0})</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>유형 필터</InputLabel>
          <Select label="유형 필터" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <MenuItem value="all">전체 유형 ({categoryCounts.total})</MenuItem>
            {categories.map((c) => <MenuItem key={c} value={c}>{c} ({categoryCounts.counts[c] || 0})</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>처리 상태</InputLabel>
          <Select label="처리 상태" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <MenuItem value="all">전체 ({statusCounts.all})</MenuItem>
            <MenuItem value="unresolved">미처리만 ({statusCounts.unresolved})</MenuItem>
            <MenuItem value="fixed">처리완료만 ({statusCounts.fixed})</MenuItem>
            <MenuItem value="no_issue">이상없음만 ({statusCounts.no_issue})</MenuItem>
          </Select>
        </FormControl>
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
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap', width: '100%' }}>
                <Typography sx={{ fontWeight: 700, fontSize: '1.05rem' }}>{g.classLabel}</Typography>
                <Typography sx={{ color: '#94a3b8', fontSize: '0.82rem' }}>{g.studentNumber}번 {maskName(g.studentName)}</Typography>
                <Chip size="small" variant="outlined" label={`${g.items.length}건`} />
                {unresolvedInGroup > 0 && <Chip size="small" color="warning" label={`미처리 ${unresolvedInGroup}`} />}
                {g.sourceFileCreatedAt && (
                  <Typography sx={{ ml: 'auto', fontSize: '0.72rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                    나이스 원본 {fmtDate(g.sourceFileCreatedAt)}
                  </Typography>
                )}
              </Box>
            </AccordionSummary>
            <AccordionDetails sx={{ p: 0 }}>
              <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' } }}>
                <Box sx={{
                  flex: '1 1 50%', p: 2, fontSize: '0.85rem', lineHeight: 1.9, bgcolor: '#fafafa',
                  borderRight: { md: '1px solid #e5e7eb' }, borderBottom: { xs: '1px solid #e5e7eb', md: 'none' },
                  whiteSpace: 'pre-line',
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
                          <ResolutionButton
                            active={it.resolution === 'fixed'} allowed={fixedAllowed} colorKey="success" icon={TaskAltIcon}
                            onClick={() => handleSetResolution(it, 'fixed')}
                            tooltip={fixedAllowed ? '처리완료(나이스 수정 반영함)' : (it.subjectAssignments?.[it.subjectName]?.noAssignment ? '담당자 없음(전입 등) 과목은 담임·관리자만 표시할 수 있습니다.' : '담당 교사만 표시할 수 있습니다.')}
                          />
                          <ResolutionButton
                            active={it.resolution === 'no_issue'} allowed={noIssueAllowed} colorKey="info" icon={VerifiedIcon}
                            onClick={() => handleSetResolution(it, 'no_issue')}
                            tooltip={noIssueAllowed ? '이상없음(고유명사·도서명 등 오탐 확인함)' : '담당 교사·담임·관리자만 표시할 수 있습니다.'}
                          />
                        </Box>
                        <Typography sx={{ fontSize: '0.82rem' }}>
                          <span style={{ color: '#94a3b8' }}>{it.before}</span>
                          <strong style={{ color: '#dc2626', margin: '0 2px' }}>{it.matched}</strong>
                          <span style={{ color: '#94a3b8' }}>{it.after}</span>
                        </Typography>
                        {it.message && <Typography sx={{ fontSize: '0.74rem', color: '#64748b', mt: 0.25 }}>→ {it.message}</Typography>}
                        {it.resolved && (
                          <Typography sx={{ fontSize: '0.7rem', color: '#94a3b8', mt: 0.25 }}>
                            {it.resolution === 'fixed' ? '처리완료' : '이상없음'} · {it.resolvedByName || '이름 없음'} · {fmtDateTime(it.resolvedAt)}
                          </Typography>
                        )}
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
