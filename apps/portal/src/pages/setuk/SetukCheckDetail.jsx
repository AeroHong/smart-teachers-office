import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Checkbox from '@mui/material/Checkbox'
import TextField from '@mui/material/TextField'
import FormControlLabel from '@mui/material/FormControlLabel'
import Paper from '@mui/material/Paper'
import CircularProgress from '@mui/material/CircularProgress'
import Alert from '@mui/material/Alert'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import Tooltip from '@mui/material/Tooltip'
import IconButton from '@mui/material/IconButton'
import Accordion from '@mui/material/Accordion'
import AccordionSummary from '@mui/material/AccordionSummary'
import AccordionDetails from '@mui/material/AccordionDetails'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import ToggleButton from '@mui/material/ToggleButton'
import DownloadIcon from '@mui/icons-material/Download'
import RefreshIcon from '@mui/icons-material/Refresh'
import TaskAltIcon from '@mui/icons-material/TaskAlt'
import VerifiedIcon from '@mui/icons-material/Verified'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import { useAuth } from '@shared/contexts/AuthContext'
import {
  subscribeCheck, subscribeItems, updateItemNote, updateItemResolved,
  getDictionary, subscribeDictionary, recheckCheck, loadRecords, isAssignedTeacher, assignedTeacherNames,
} from '@shared/lib/setukCheck'
import { AUTHORITY_LABELS, checkText, loadDictionary } from './setukUtils'
import { SEVERITY_COLORS, BADGE_STYLE, MultiHighlight } from './setukShared'
import { exportCheckResults } from './setukExport'
import SetukDictionaryDialog from './SetukDictionaryDialog'
import Layout from '../../components/Layout'

function fmtDate(ts) {
  if (!ts) return ''
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function SetukCheckDetail() {
  const { checkId } = useParams()
  const navigate = useNavigate()
  const { user, userName, schoolId, isAdmin } = useAuth()
  const [dictOpen, setDictOpen] = useState(false)

  const [check, setCheck] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [subjectFilter, setSubjectFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [myOnly, setMyOnly] = useState(false)
  const [myOnlyInitialized, setMyOnlyInitialized] = useState(false)
  const [groupOrder, setGroupOrder] = useState('student')
  const [savingNote, setSavingNote] = useState({})
  const [rechecking, setRechecking] = useState(false)
  const [recordsById, setRecordsById] = useState({})
  const [dictDoc, setDictDoc] = useState(null)

  useEffect(() => {
    if (!schoolId || !checkId) return
    const unsub = subscribeCheck(schoolId, checkId, (data) => { setCheck(data); setLoading(false) }, (err) => { setError(err.message); setLoading(false) })
    return unsub
  }, [schoolId, checkId])

  useEffect(() => {
    if (!schoolId || !checkId) return
    return subscribeItems(schoolId, checkId, setItems, (err) => console.error('[SetukCheckDetail] 항목 조회 실패:', err))
  }, [schoolId, checkId])

  // 점검 기준이 이 건을 마지막으로 (재)점검한 뒤 바뀌었는지 보려고 실시간 구독한다 —
  // 관리자가 지금 이 화면을 보는 동안 기준을 저장해도 경고가 바로 뜬다.
  useEffect(() => {
    if (!schoolId) return
    return subscribeDictionary(schoolId, setDictDoc, (err) => console.error('[SetukCheckDetail] 사전 조회 실패:', err))
  }, [schoolId])

  // 세특 원문(records)은 업로드 후 바뀌지 않으므로 실시간 구독 없이 한 번만 불러와,
  // "수정 요청 내용" 위에 마우스를 올렸을 때 과목 전체 문장을 보여주는 데 쓴다.
  useEffect(() => {
    if (!schoolId || !checkId) return
    loadRecords(schoolId, checkId)
      .then((records) => setRecordsById(Object.fromEntries(records.map((r) => [r.id, r]))))
      .catch((e) => console.error('[SetukCheckDetail] 원문 조회 실패:', e))
  }, [schoolId, checkId])

  const subjects = useMemo(() => [...new Set(items.map((it) => it.subjectName))].sort((a, b) => a.localeCompare(b, 'ko')), [items])
  const categories = useMemo(() => [...new Set(items.map((it) => it.category))].sort((a, b) => a.localeCompare(b, 'ko')), [items])

  // 이 교사가 담당으로 배정된 과목들 — "내 담당 과목만 보기"에 쓴다.
  const myAssignedSubjects = useMemo(() => {
    if (!check || !user) return []
    return Object.entries(check.subjectAssignments || {})
      .filter(([, a]) => isAssignedTeacher(a, user.uid))
      .map(([subjectName]) => subjectName)
  }, [check, user])

  // 담임(업로더)·관리자는 학급 전체를 봐야 하니 그대로 두고, 그 외 담당 배정된 과목이
  // 있는 교사가 처음 들어오면 "내 담당 과목만 보기"를 자동으로 켜준다(직접 끌 수 있음).
  useEffect(() => {
    if (myOnlyInitialized || !check || !user) return
    if (!isAdmin && check.uploadedByUid !== user.uid && myAssignedSubjects.length > 0) {
      setMyOnly(true)
    }
    setMyOnlyInitialized(true)
  }, [check, user, isAdmin, myAssignedSubjects, myOnlyInitialized])

  const filteredItems = useMemo(() => {
    return items
      .filter((it) => subjectFilter === 'all' || it.subjectName === subjectFilter)
      .filter((it) => categoryFilter === 'all' || it.category === categoryFilter)
      .filter((it) => {
        if (statusFilter === 'unresolved') return !it.resolved
        if (statusFilter === 'fixed') return it.resolution === 'fixed'
        if (statusFilter === 'no_issue') return it.resolution === 'no_issue'
        return true
      })
      .filter((it) => !myOnly || myAssignedSubjects.includes(it.subjectName))
      .sort((a, b) => a.studentNumber - b.studentNumber || a.subjectName.localeCompare(b.subjectName, 'ko'))
  }, [items, subjectFilter, categoryFilter, statusFilter, myOnly, myAssignedSubjects])

  const resolvedCount = items.filter((it) => it.resolved).length
  const fixedCount = items.filter((it) => it.resolution === 'fixed').length
  const noIssueCount = items.filter((it) => it.resolution === 'no_issue').length

  // 학생×과목 단위로 걸린 항목이 여러 개(오타 여러 곳, 같은 반복 표현 여러 자리 등)일 때
  // 한 줄씩 흩어져 나오면 같은 학생을 훑기 힘들다 — 학생-과목으로 묶어서 보여준다.
  const groupedItems = useMemo(() => {
    const map = new Map()
    filteredItems.forEach((it) => {
      const key = `${it.studentNumber}__${it.subjectName}`
      if (!map.has(key)) {
        map.set(key, { key, studentNumber: it.studentNumber, studentName: it.studentName, subjectName: it.subjectName, items: [] })
      }
      map.get(key).items.push(it)
    })
    const groups = [...map.values()]
    if (groupOrder === 'subject') {
      groups.sort((a, b) => a.subjectName.localeCompare(b.subjectName, 'ko') || a.studentNumber - b.studentNumber)
    } else {
      groups.sort((a, b) => a.studentNumber - b.studentNumber || a.subjectName.localeCompare(b.subjectName, 'ko'))
    }
    return groups
  }, [filteredItems, groupOrder])

  // 실제 세특 수정은 그 과목 담당 교사만 나이스에서 할 수 있으므로, "처리완료"는 그
  // 과목에 배정된 담당 교사 본인(또는 관리자)만 누를 수 있다(firestore.rules로도 서버에서
  // 강제). 담당 교사가 아직 지정되지 않은 과목은 관리자만 처리할 수 있다.
  const canResolveFixed = (item) => isAdmin || (!!user && isAssignedTeacher(check.subjectAssignments?.[item.subjectName], user.uid))
  // "이상없음"(도서명 속 영문·고유명사 등 오탐 확인)은 실제 나이스 수정이 필요 없는
  // 판단이라, 담당 교사뿐 아니라 그 학급을 업로드한 담임도 표시할 수 있다. 단 이미
  // "처리완료"로 확정된 항목은 담임이 손댈 수 없다(firestore.rules로도 강제).
  const canResolveNoIssue = (item) => isAdmin || canResolveFixed(item) ||
    (!!user && check.uploadedByUid === user.uid && item.resolution !== 'fixed')

  const handleSetResolution = async (item, resolution) => {
    const allowed = resolution === 'fixed' ? canResolveFixed(item) : canResolveNoIssue(item)
    if (!allowed) return
    const turningOn = item.resolution !== resolution
    try {
      await updateItemResolved(schoolId, checkId, item.id, turningOn, turningOn ? resolution : null, user?.uid, userName)
    } catch (e) {
      setError(`처리 상태 변경 실패: ${e.message}`)
    }
  }

  const handleNoteBlur = async (item, value) => {
    if (value === (item.note || '')) return
    setSavingNote((prev) => ({ ...prev, [item.id]: true }))
    try {
      await updateItemNote(schoolId, checkId, item.id, value)
    } catch (e) {
      setError(`메모 저장 실패: ${e.message}`)
    } finally {
      setSavingNote((prev) => ({ ...prev, [item.id]: false }))
    }
  }

  const handleExport = () => exportCheckResults(check, items)

  // items 삭제 권한(firestore.rules)이 업로더 본인·관리자로 제한돼 있어, 재점검도
  // 같은 대상만 실행할 수 있다(그 외 교사가 실행하면 기존 항목 삭제 단계에서 실패함).
  const canRecheck = isAdmin || check?.uploadedByUid === user?.uid

  // 이 건을 마지막으로 (재)점검한 뒤 점검 기준이 바뀌었으면 다시 훑어보라고 알려준다.
  const isOutdated = !!dictDoc && (dictDoc.version || 0) > (check?.dictionaryVersion || 0)

  const handleRecheck = async () => {
    if (!canRecheck || rechecking) return
    if (!window.confirm('최신 점검 기준으로 다시 훑습니다. 더 이상 걸리지 않는 항목은 삭제되고, 같은 항목의 처리완료·메모는 그대로 유지됩니다. 계속할까요?')) return
    setRechecking(true)
    setError('')
    try {
      let customDict = null
      try {
        customDict = await getDictionary(schoolId)
      } catch (e) {
        console.error('[SetukCheckDetail] 학교 추가 사전 조회 실패(기본 목록만 사용):', e)
      }
      const dictionary = loadDictionary(customDict)
      const count = await recheckCheck(schoolId, checkId, (text, studentName) => checkText(text, dictionary, studentName), userName, customDict?.version || 0)
      window.alert(`재점검 완료 — 새로 검출된 항목 ${count}건`)
    } catch (e) {
      setError(`재점검 실패: ${e.message}`)
    } finally {
      setRechecking(false)
    }
  }

  if (loading) return <Layout wide><Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box></Layout>
  if (error && !check) return <Layout wide><Alert severity="error">{error}</Alert></Layout>
  if (!check) return <Layout wide><Alert severity="warning">점검 결과를 찾을 수 없습니다.</Alert></Layout>

  return (
    <Layout wide>
      <Button size="small" onClick={() => navigate('/setuk')} sx={{ mb: 1, textTransform: 'none', color: '#64748b' }}>
        ← 목록으로
      </Button>

      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1.5 }}>
        <Box>
          <Typography variant="h5" fontWeight={700} mb={0.5}>{check.classLabel}</Typography>
          <Typography variant="body2" color="text.secondary" mb={0.75}>
            {check.uploadedByName} 업로드
            {check.lastRecheckAt && ` · ${check.lastRecheckByName} 재점검`}
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.6 }}>
            <Chip size="small" variant="outlined" label={`전체 ${items.length}건`} />
            <Chip size="small" color="warning" label={`미처리 ${items.length - resolvedCount}건`} />
            <Chip size="small" color="success" icon={<TaskAltIcon />} label={`처리완료 ${fixedCount}건`} />
            <Chip size="small" color="info" icon={<VerifiedIcon />} label={`이상없음 ${noIssueCount}건`} />
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button size="small" onClick={() => setDictOpen(true)} sx={{ textTransform: 'none', fontWeight: 700 }}>
            점검 기준 보기
          </Button>
          {canRecheck && (
            <Tooltip title="저장된 원문에 최신 점검 기준을 다시 적용합니다. 처리완료·메모는 유지됩니다.">
              <span>
                <Button
                  variant="outlined" startIcon={rechecking ? <CircularProgress size={16} /> : <RefreshIcon />}
                  onClick={handleRecheck} disabled={rechecking}
                  sx={{ textTransform: 'none', fontWeight: 700 }}
                >
                  최신 기준으로 재점검
                </Button>
              </span>
            </Tooltip>
          )}
          <Button variant="outlined" startIcon={<DownloadIcon />} onClick={handleExport} sx={{ textTransform: 'none', fontWeight: 700 }}>
            결과 파일 다운로드
          </Button>
        </Box>
      </Box>

      <SetukDictionaryDialog
        open={dictOpen} onClose={() => setDictOpen(false)}
        schoolId={schoolId} isAdmin={isAdmin} uid={user?.uid} userName={userName}
      />

      {error && <Alert severity="error" sx={{ mt: 2, mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {isOutdated && (
        <Alert
          severity="warning" sx={{ mt: 2 }}
          action={canRecheck && (
            <Button color="inherit" size="small" onClick={handleRecheck} disabled={rechecking} sx={{ textTransform: 'none', fontWeight: 700 }}>
              지금 재점검
            </Button>
          )}
        >
          점검 기준이 {fmtDate(dictDoc.updatedAt)}에 업데이트됐습니다({dictDoc.updatedByName} 수정, 버전 {check.dictionaryVersion || 0} → {dictDoc.version}).
          이 건은 이전 기준으로 점검된 상태이니 최신 기준으로 다시 점검해보세요.
        </Alert>
      )}

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, flexWrap: 'wrap', mt: 2 }}>
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>과목 필터</InputLabel>
          <Select label="과목 필터" value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)}>
            <MenuItem value="all">전체 과목</MenuItem>
            {subjects.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>유형 필터</InputLabel>
          <Select label="유형 필터" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <MenuItem value="all">전체 유형</MenuItem>
            {categories.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>처리 상태</InputLabel>
          <Select label="처리 상태" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <MenuItem value="all">전체</MenuItem>
            <MenuItem value="unresolved">미처리만</MenuItem>
            <MenuItem value="fixed">처리완료만</MenuItem>
            <MenuItem value="no_issue">이상없음만</MenuItem>
          </Select>
        </FormControl>
        {myAssignedSubjects.length > 0 && (
          <FormControlLabel
            control={<Checkbox checked={myOnly} onChange={(e) => setMyOnly(e.target.checked)} />}
            label="내 담당 과목만 보기"
          />
        )}
        <ToggleButtonGroup
          size="small" exclusive value={groupOrder}
          onChange={(_, v) => v && setGroupOrder(v)}
        >
          <ToggleButton value="student" sx={{ textTransform: 'none', px: 1.5 }}>학생순</ToggleButton>
          <ToggleButton value="subject" sx={{ textTransform: 'none', px: 1.5 }}>과목순</ToggleButton>
        </ToggleButtonGroup>
        <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 2, fontSize: '0.78rem', color: '#64748b' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <TaskAltIcon fontSize="small" color="success" />
            <span>처리완료 — 담당 교사가 나이스 수정 반영함</span>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <VerifiedIcon fontSize="small" color="info" />
            <span>이상없음 — 확인했지만 실제 문제 아님(고유명사·도서명 등)</span>
          </Box>
        </Box>
      </Box>

      {groupedItems.length === 0 ? (
        <Paper variant="outlined" sx={{ py: 4, textAlign: 'center', color: '#94a3b8' }}>표시할 항목이 없습니다.</Paper>
      ) : groupedItems.map((g) => {
        const unresolvedInGroup = g.items.filter((it) => !it.resolved).length
        const recordText = recordsById[g.items[0]?.recordId]?.text
        return (
          <Accordion key={g.key} defaultExpanded variant="outlined" sx={{ mb: 1, '&:before': { display: 'none' } }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}>
                <Typography sx={{ color: '#94a3b8', fontSize: '0.82rem' }}>{g.studentNumber}번 {g.studentName}</Typography>
                <Typography sx={{ fontWeight: 700, fontSize: '1.05rem' }}>{g.subjectName}</Typography>
                <Chip size="small" variant="outlined" label={`${g.items.length}건`} />
                {unresolvedInGroup > 0 && <Chip size="small" color="warning" label={`미처리 ${unresolvedInGroup}`} />}
              </Box>
            </AccordionSummary>
            <AccordionDetails sx={{ p: 0 }}>
              <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' } }}>
                {/* 왼쪽: 전체 문장 — 이 과목에 걸린 항목 전부를 번호로 한 번에 강조 표시 */}
                <Box sx={{
                  flex: '1 1 50%', p: 2, fontSize: '0.85rem', lineHeight: 1.9, bgcolor: '#fafafa',
                  borderRight: { md: '1px solid #e5e7eb' }, borderBottom: { xs: '1px solid #e5e7eb', md: 'none' },
                }}
                >
                  <MultiHighlight text={recordText} groupItems={g.items} />
                </Box>

                {/* 오른쪽: 항목별 상세 — 처리 여부·유형·제안·메모 */}
                <Box sx={{ flex: '1 1 50%' }}>
                  {g.items.map((it, idx) => {
                    const assignedName = assignedTeacherNames(check.subjectAssignments?.[it.subjectName]).join(', ')
                    const fixedAllowed = canResolveFixed(it)
                    const noIssueAllowed = canResolveNoIssue(it)
                    return (
                      <Box key={it.id} sx={{ p: 1.5, borderBottom: '1px solid #e5e7eb', opacity: it.resolved ? 0.55 : 1 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5, flexWrap: 'wrap' }}>
                          <span style={BADGE_STYLE}>{idx + 1}</span>
                          <Chip size="small" variant="outlined" label={AUTHORITY_LABELS[it.authority] || it.authority} sx={{ fontSize: '0.66rem' }} />
                          <Chip size="small" label={it.category} color={SEVERITY_COLORS[it.severity]} sx={{ fontWeight: 700 }} />
                          <Box sx={{ flex: 1 }} />
                          <Tooltip title={fixedAllowed ? '처리완료(나이스 수정 반영함)' : `담당 교사${assignedName ? `(${assignedName})` : ''}만 표시할 수 있습니다.`}>
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

      <Button size="small" onClick={() => navigate('/setuk')} sx={{ mt: 2, textTransform: 'none', color: '#64748b' }}>
        ← 목록으로
      </Button>
    </Layout>
  )
}
