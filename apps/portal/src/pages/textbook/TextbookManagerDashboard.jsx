import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, query, where, getDocs } from 'firebase/firestore'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Table from '@mui/material/Table'
import TableHead from '@mui/material/TableHead'
import TableBody from '@mui/material/TableBody'
import TableRow from '@mui/material/TableRow'
import TableCell from '@mui/material/TableCell'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import LinearProgress from '@mui/material/LinearProgress'
import Alert from '@mui/material/Alert'
import TextField from '@mui/material/TextField'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined'
import RefreshIcon from '@mui/icons-material/Refresh'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import { useAuth } from '@shared/contexts/AuthContext'
import { useTableSort } from '@shared/hooks/useTableSort'
import { db } from '@shared/lib/firebase'
import { USERS, sanitizeSubjectGroup } from '@shared/lib/schema'
import { SUBJECT_GROUPS } from '@shared/lib/subjectData'
import {
  loadAdoptions, attachProgress, subscribeMyDeptHeadGroups, subscribeDeptHeads, getDeptHead, loadPrincipalName,
} from '@shared/lib/textbookAdoption'
import { openBulkRecommendationPrint } from './textbookPrint'
import Layout from '../../components/Layout'
import { ACCENT, ACCENT_BG } from './TextbookSection'

// ── 진행 단계 ────────────────────────────────────────────────────────────────
// 한 과목이 지금 어디서 멈춰 있는지를 한 단어로. 요약 카드·필터·표의 단계 칩이 모두 이 판정을 쓴다.
const STAGES = {
  noHead: { label: '대표교사 미지정', sx: { bgcolor: '#fee2e2', color: '#991b1b' } },
  noCommittee: { label: '위원 구성 필요', sx: { bgcolor: '#ffedd5', color: '#9a3412' } },
  scoring: { label: '채점 중', sx: { bgcolor: '#fef9c3', color: '#854d0e' } },
  ready: { label: '마감 대기', sx: { bgcolor: '#e0f2fe', color: '#075985' } },
  closed: { label: '마감', sx: { bgcolor: '#dcfce7', color: '#166534' } },
}
const STAGE_ORDER = ['noHead', 'noCommittee', 'scoring', 'ready', 'closed']
const MIN_COMMITTEE = 3 // 매뉴얼: 위원 3인 이상 권장

const memberCount = (r) => (r.committeeUids?.length || 0) + (r.externalMembers?.length || 0)

function stageOf(r) {
  if (r.status === 'closed') return 'closed'
  if (!r.subjectHeadUid) return 'noHead'
  const total = memberCount(r)
  if (total === 0) return 'noCommittee'
  if (r.submittedCount != null && r.submittedCount >= total) return 'ready'
  return 'scoring'
}

function fmtPrice(price) {
  const digits = String(price || '').replace(/[^\d]/g, '')
  return digits ? `${Number(digits).toLocaleString('ko-KR')}원` : ''
}

function opinionsWritten(r) {
  return (r.recommendation?.opinions || []).filter((o) => (o.text || '').trim()).length
}

/** 마감 건의 1순위 후보(동점이면 함께). aggregate가 없으면 null. */
function topCandidates(r) {
  if (!r.aggregate) return null
  const entries = Object.entries(r.aggregate)
  if (!entries.length) return null
  const best = Math.max(...entries.map(([, a]) => a.total ?? 0))
  const byId = Object.fromEntries((r.candidates || []).map((c) => [c.id, c]))
  return entries.filter(([, a]) => (a.total ?? 0) === best).map(([id]) => byId[id]).filter(Boolean)
}

// 요약 카드 = 필터. 카드를 누르면 그 조건에 맞는 과목만 표에 남는다.
const CARD_FILTERS = {
  all: { label: '전체 과목', test: () => true },
  noHead: { label: '대표교사 미지정', test: (r) => stageOf(r) === 'noHead' },
  noCommittee: { label: '위원 미구성', test: (r) => stageOf(r) === 'noCommittee' },
  scoring: { label: '채점 중', test: (r) => ['scoring', 'ready'].includes(stageOf(r)) },
  closed: { label: '마감', test: (r) => stageOf(r) === 'closed' },
}

const UNASSIGNED = '__unassigned__'
const groupLabel = (key) => (key === UNASSIGNED ? '교과군 미지정' : SUBJECT_GROUPS.find((g) => sanitizeSubjectGroup(g) === key) || key.replace(/_/g, '/'))
const groupOrder = (key) => {
  if (key === UNASSIGNED) return SUBJECT_GROUPS.length + 1
  const idx = SUBJECT_GROUPS.findIndex((g) => sanitizeSubjectGroup(g) === key)
  return idx === -1 ? SUBJECT_GROUPS.length : idx
}

function SummaryCard({ label, value, sub, active, tone, onClick }) {
  return (
    <Box
      onClick={onClick}
      sx={{
        flex: '1 1 150px', p: 1.75, borderRadius: '12px', cursor: 'pointer', bgcolor: '#fff',
        border: '1px solid', borderColor: active ? ACCENT : '#e2e8f0',
        boxShadow: active ? `0 0 0 2px ${ACCENT_BG}` : 'none', transition: 'all 0.12s',
        '&:hover': { borderColor: ACCENT },
      }}
    >
      <Typography sx={{ fontSize: '0.76rem', fontWeight: 700, color: '#64748b' }}>{label}</Typography>
      <Typography sx={{ fontSize: '1.6rem', fontWeight: 800, color: tone && value > 0 ? tone : '#0f172a', lineHeight: 1.2 }}>{value}</Typography>
      {sub && <Typography sx={{ fontSize: '0.72rem', color: '#94a3b8', mt: 0.25 }}>{sub}</Typography>}
    </Box>
  )
}

const SORT_GETTERS = {
  subjectName: (r) => r.subjectName || '',
  stage: (r) => STAGE_ORDER.indexOf(stageOf(r)),
  head: (r) => r.headName || '',
  committee: (r) => memberCount(r),
  submitted: (r) => (memberCount(r) ? (r.submittedCount ?? 0) / memberCount(r) : -1),
}

export default function TextbookManagerDashboard() {
  const navigate = useNavigate()
  const { user, schoolId, isAdmin } = useAuth()

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [checkingAccess, setCheckingAccess] = useState(!isAdmin)
  const [myDeptGroups, setMyDeptGroups] = useState([])
  const [selected, setSelected] = useState(new Set())
  const [printing, setPrinting] = useState(false)
  const [staffByUid, setStaffByUid] = useState({})
  const [deptHeads, setDeptHeads] = useState({}) // subjectGroup → 교과부장 이름
  const [cardFilter, setCardFilter] = useState('all')
  const [groupFilter, setGroupFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState(new Set())
  const [reloadKey, setReloadKey] = useState(0)
  const { toggle, sortData, Ind } = useTableSort('subjectName')

  // 관리자는 전체, 아니면 내가 교과부장으로 지정된 교과군만 — 이 결과가 오기 전까지는
  // "접근 불가"를 성급히 보여주지 않는다.
  useEffect(() => {
    if (isAdmin) { setCheckingAccess(false); return }
    if (!schoolId || !user) return
    const unsub = subscribeMyDeptHeadGroups(schoolId, user.uid, (groups) => {
      setMyDeptGroups(groups)
      setCheckingAccess(false)
    }, () => setCheckingAccess(false))
    return unsub
  }, [schoolId, user, isAdmin])

  const allowed = isAdmin || myDeptGroups.length > 0

  useEffect(() => {
    if (!schoolId || checkingAccess || !allowed) return
    let cancelled = false
    setLoading(true)
    loadAdoptions(schoolId)
      .then((all) => {
        const scoped = isAdmin ? all : all.filter((a) => myDeptGroups.includes(a.subjectGroup))
        return attachProgress(schoolId, scoped)
      })
      .then((withCounts) => { if (!cancelled) setRows(withCounts) })
      .catch((e) => setError(e.message))
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [schoolId, checkingAccess, allowed, isAdmin, myDeptGroups, reloadKey])

  // 대표교사·위원 이름 표시용(TextbookHome·TextbookDetail과 같은 조회).
  useEffect(() => {
    if (!schoolId) return
    getDocs(query(collection(db, USERS), where('schoolId', '==', schoolId)))
      .then((snap) => setStaffByUid(Object.fromEntries(snap.docs.map((d) => [d.id, d.data().name || d.data().email]))))
      .catch((e) => console.error('[TextbookManagerDashboard] 구성원 이름 조회 실패:', e))
  }, [schoolId])

  useEffect(() => {
    if (!schoolId || !allowed) return
    const unsub = subscribeDeptHeads(schoolId, (list) => {
      setDeptHeads(Object.fromEntries(list.map((d) => [d.subjectGroup || d.id, d.name])))
    }, () => {})
    return unsub
  }, [schoolId, allowed])

  const nameOf = useCallback((id, r) => {
    const ext = (r.externalMembers || []).find((m) => m.id === id)
    if (ext) return `${ext.name}(외부)`
    return staffByUid[id] || '(알 수 없음)'
  }, [staffByUid])

  // 표·정렬에서 쓰는 파생값을 한 번에 붙인다.
  const enriched = useMemo(() => rows.map((r) => {
    const memberIds = [
      ...(r.committeeUids || []).filter((u) => u === r.subjectHeadUid),
      ...(r.committeeUids || []).filter((u) => u !== r.subjectHeadUid),
      ...(r.externalMembers || []).map((m) => m.id),
    ]
    const submitted = new Set(r.submittedIds || [])
    const drafts = new Set(r.draftIds || [])
    return {
      ...r,
      groupKey: r.subjectGroup || UNASSIGNED,
      headName: r.subjectHeadUid ? (staffByUid[r.subjectHeadUid] || '(알 수 없음)') : '',
      memberNames: memberIds.map((id) => nameOf(id, r)),
      pending: r.submittedIds ? memberIds.filter((id) => !submitted.has(id)).map((id) => ({ name: nameOf(id, r), draft: drafts.has(id) })) : null,
    }
  }), [rows, staffByUid, nameOf])

  const counts = useMemo(() => {
    const c = Object.fromEntries(Object.entries(CARD_FILTERS).map(([k, f]) => [k, enriched.filter(f.test).length]))
    c.ready = enriched.filter((r) => stageOf(r) === 'ready').length
    c.closedNoOpinion = enriched.filter((r) => stageOf(r) === 'closed' && opinionsWritten(r) < (r.recommendation?.opinions?.length || 0)).length
    return c
  }, [enriched])

  const groupCounts = useMemo(() => {
    const m = {}
    enriched.forEach((r) => { m[r.groupKey] = (m[r.groupKey] || 0) + 1 })
    return m
  }, [enriched])

  const filtered = useMemo(() => {
    const q = search.trim()
    return enriched.filter((r) => (
      CARD_FILTERS[cardFilter].test(r)
      && (groupFilter === 'all' || r.groupKey === groupFilter)
      && (!q || (r.subjectName || '').includes(q))
    ))
  }, [enriched, cardFilter, groupFilter, search])

  const groups = useMemo(() => {
    const m = {}
    filtered.forEach((r) => { (m[r.groupKey] ||= []).push(r) })
    return Object.keys(m).sort((a, b) => groupOrder(a) - groupOrder(b)).map((key) => ({ key, rows: sortData(m[key], SORT_GETTERS) }))
    // sortData는 정렬 상태가 바뀔 때마다 새로 만들어지는 함수라 의존성에 넣는다.
  }, [filtered, sortData])

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  const printable = filtered.filter((r) => r.recommendation)
  const toggleSelectAll = () => {
    setSelected((prev) => (printable.length && printable.every((r) => prev.has(r.id)) ? new Set() : new Set(printable.map((r) => r.id))))
  }
  const toggleGroup = (key) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  const handleBulkPrint = async () => {
    const targets = rows.filter((r) => selected.has(r.id) && r.recommendation)
    if (!targets.length) return
    setPrinting(true)
    try {
      const groupCache = {}
      const items = []
      for (const adoption of targets) {
        if (adoption.subjectGroup && !(adoption.subjectGroup in groupCache)) {
          groupCache[adoption.subjectGroup] = await getDeptHead(schoolId, adoption.subjectGroup)
        }
        items.push({ adoption, deptHeadName: groupCache[adoption.subjectGroup]?.name || '' })
      }
      openBulkRecommendationPrint(items, `추천의견서_일괄출력_${targets.length}건`, await loadPrincipalName(schoolId))
    } catch (e) {
      setError(`일괄 출력 실패: ${e.message}`)
    } finally {
      setPrinting(false)
    }
  }

  if (checkingAccess) {
    return <Layout><Box display="flex" justifyContent="center" py={6}><CircularProgress sx={{ color: ACCENT }} /></Box></Layout>
  }
  if (!allowed) {
    return <Layout><Alert severity="warning" sx={{ borderRadius: '10px' }}>관리자 또는 교과부장만 전체 현황을 볼 수 있습니다.</Alert></Layout>
  }

  const thSx = { cursor: 'pointer', whiteSpace: 'nowrap' }
  const smallSx = { fontSize: '0.74rem', color: '#64748b', lineHeight: 1.4 }

  return (
    <Layout wide>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5, flexWrap: 'wrap', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{ width: 40, height: 40, borderRadius: '10px', bgcolor: ACCENT_BG, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>📊</Box>
          <Typography sx={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a' }}>
            검·인정도서 선정 — {isAdmin ? '전체 현황' : `${myDeptGroups.map((g) => groupLabel(g)).join(', ')} 현황`}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Tooltip title="새로고침">
            <IconButton size="small" onClick={() => setReloadKey((k) => k + 1)} disabled={loading}><RefreshIcon fontSize="small" /></IconButton>
          </Tooltip>
          <Button
            variant="outlined" size="small" startIcon={<PrintOutlinedIcon />}
            disabled={selected.size === 0 || printing}
            onClick={handleBulkPrint}
            sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 700 }}
          >
            {printing ? '준비 중...' : `선택 ${selected.size}건 서식3 일괄출력`}
          </Button>
        </Box>
      </Box>
      <Typography sx={{ fontSize: '0.85rem', color: '#64748b', mb: 2.5 }}>
        {isAdmin
          ? '과목별 진행 단계와 막힌 곳을 확인합니다. 카드를 누르면 해당 과목만 걸러집니다. 선정 건 등록·수정은 관리자 페이지 > 교과서 선정에서 합니다.'
          : '교과부장으로 지정된 교과군의 선정 건만 보입니다. 카드를 누르면 해당 과목만 걸러집니다.'}
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2, borderRadius: '10px' }}>{error}</Alert>}

      {loading ? (
        <Box display="flex" justifyContent="center" py={6}><CircularProgress sx={{ color: ACCENT }} /></Box>
      ) : rows.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 6, borderRadius: '14px', border: '1px dashed #e2e8f0', bgcolor: '#f8fafc' }}>
          <Typography sx={{ fontSize: '2rem', mb: 1 }}>🧑‍🏫</Typography>
          <Typography sx={{ fontSize: '0.9rem', color: '#64748b' }}>등록된 선정 건이 없습니다.</Typography>
        </Box>
      ) : (
        <>
          {/* ── 요약 카드 ── */}
          <Box sx={{ display: 'flex', gap: 1.25, flexWrap: 'wrap', mb: 2 }}>
            <SummaryCard label="전체 과목" value={counts.all} active={cardFilter === 'all'} onClick={() => setCardFilter('all')} />
            <SummaryCard label="대표교사 미지정" value={counts.noHead} tone="#b91c1c" active={cardFilter === 'noHead'} onClick={() => setCardFilter((f) => (f === 'noHead' ? 'all' : 'noHead'))} />
            <SummaryCard label="위원 미구성" value={counts.noCommittee} tone="#c2410c" active={cardFilter === 'noCommittee'} onClick={() => setCardFilter((f) => (f === 'noCommittee' ? 'all' : 'noCommittee'))} />
            <SummaryCard label="채점 중" value={counts.scoring} sub={counts.ready ? `전원 제출(마감 대기) ${counts.ready}건` : null} active={cardFilter === 'scoring'} onClick={() => setCardFilter((f) => (f === 'scoring' ? 'all' : 'scoring'))} />
            <SummaryCard label="마감" value={counts.closed} sub={counts.closedNoOpinion ? `추천의견 미작성 ${counts.closedNoOpinion}건` : null} tone="#15803d" active={cardFilter === 'closed'} onClick={() => setCardFilter((f) => (f === 'closed' ? 'all' : 'closed'))} />
          </Box>

          {/* ── 필터 줄 ── */}
          <Box sx={{ display: 'flex', gap: 1.25, flexWrap: 'wrap', alignItems: 'center', mb: 2 }}>
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel>교과군</InputLabel>
              <Select label="교과군" value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}>
                <MenuItem value="all">전체 ({enriched.length})</MenuItem>
                {Object.keys(groupCounts).sort((a, b) => groupOrder(a) - groupOrder(b)).map((k) => (
                  <MenuItem key={k} value={k}>{groupLabel(k)} ({groupCounts[k]})</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField size="small" placeholder="과목명 검색" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ width: 200 }} />
            {cardFilter !== 'all' && (
              <Chip size="small" label={`${CARD_FILTERS[cardFilter].label}만 보기`} onDelete={() => setCardFilter('all')} sx={{ bgcolor: ACCENT_BG, color: ACCENT, fontWeight: 700 }} />
            )}
            <Box sx={{ flex: 1 }} />
            <Typography sx={{ fontSize: '0.8rem', color: '#64748b' }}>{filtered.length}개 과목</Typography>
          </Box>

          {groups.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 5, borderRadius: '14px', border: '1px dashed #e2e8f0', bgcolor: '#f8fafc' }}>
              <Typography sx={{ fontSize: '0.9rem', color: '#64748b' }}>조건에 맞는 과목이 없습니다.</Typography>
            </Box>
          ) : (
            <Box sx={{ overflowX: 'auto', borderRadius: '14px', border: '1px solid #e2e8f0', bgcolor: '#fff' }}>
              <Table size="small" sx={{ minWidth: 980 }}>
                <TableHead sx={{ '& th': { bgcolor: '#f8fafc', color: '#475569', fontWeight: 700, fontSize: '0.74rem', borderBottom: '1px solid #e2e8f0' } }}>
                  <TableRow>
                    <TableCell padding="checkbox">
                      <Checkbox
                        size="small"
                        checked={printable.length > 0 && printable.every((r) => selected.has(r.id))}
                        indeterminate={selected.size > 0 && !printable.every((r) => selected.has(r.id))}
                        onChange={toggleSelectAll} disabled={printable.length === 0}
                      />
                    </TableCell>
                    <TableCell sx={thSx} onClick={() => toggle('subjectName')}>과목{Ind('subjectName')}</TableCell>
                    <TableCell sx={thSx} onClick={() => toggle('stage')}>진행 단계{Ind('stage')}</TableCell>
                    <TableCell sx={thSx} onClick={() => toggle('head')}>대표교사{Ind('head')}</TableCell>
                    <TableCell sx={thSx} onClick={() => toggle('committee')}>위원{Ind('committee')}</TableCell>
                    <TableCell sx={thSx} onClick={() => toggle('submitted')}>제출{Ind('submitted')}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>1순위 도서</TableCell>
                    <TableCell align="center" sx={{ whiteSpace: 'nowrap' }}>추천의견</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {groups.map(({ key, rows: groupRows }) => {
                    const closedN = groupRows.filter((r) => stageOf(r) === 'closed').length
                    const isCollapsed = collapsed.has(key)
                    return [
                      <TableRow key={`g-${key}`} onClick={() => toggleGroup(key)} sx={{ cursor: 'pointer', '& td': { bgcolor: '#f1f5f9', borderBottom: '1px solid #e2e8f0', py: 0.9 } }}>
                        <TableCell colSpan={8}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}>
                            {isCollapsed ? <ChevronRightIcon sx={{ fontSize: 18, color: '#64748b' }} /> : <ExpandMoreIcon sx={{ fontSize: 18, color: '#64748b' }} />}
                            <Typography sx={{ fontWeight: 800, fontSize: '0.88rem', color: '#0f172a' }}>{groupLabel(key)}</Typography>
                            <Typography sx={{ fontSize: '0.76rem', color: '#64748b' }}>
                              {key !== UNASSIGNED && `교과부장 ${deptHeads[key] || '미지정'} · `}{groupRows.length}과목
                            </Typography>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 'auto', minWidth: 180 }}>
                              <LinearProgress
                                variant="determinate" value={groupRows.length ? (closedN / groupRows.length) * 100 : 0}
                                sx={{ flex: 1, height: 6, borderRadius: 3, bgcolor: '#e2e8f0', '& .MuiLinearProgress-bar': { bgcolor: ACCENT } }}
                              />
                              <Typography sx={{ fontSize: '0.74rem', fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>마감 {closedN}/{groupRows.length}</Typography>
                            </Box>
                          </Box>
                        </TableCell>
                      </TableRow>,
                      ...(isCollapsed ? [] : groupRows.map((r) => {
                        const stage = stageOf(r)
                        const total = memberCount(r)
                        const tops = topCandidates(r)
                        const opN = opinionsWritten(r)
                        const opTotal = r.recommendation?.opinions?.length || 0
                        return (
                          <TableRow key={r.id} hover sx={{ '& td': { borderBottom: '1px solid #f1f5f9', verticalAlign: 'top', py: 1 } }}>
                            <TableCell padding="checkbox">
                              <Checkbox size="small" checked={selected.has(r.id)} disabled={!r.recommendation} onChange={() => toggleSelect(r.id)} />
                            </TableCell>
                            <TableCell sx={{ fontWeight: 700, color: '#1e293b', cursor: 'pointer', whiteSpace: 'nowrap', '&:hover': { color: ACCENT } }} onClick={() => navigate(`/textbook/${r.id}`)}>
                              {r.subjectName}
                              <Typography sx={smallSx}>후보 {r.candidates?.length || 0}개</Typography>
                            </TableCell>
                            <TableCell>
                              <Chip size="small" label={STAGES[stage].label} sx={{ ...STAGES[stage].sx, fontWeight: 700 }} />
                            </TableCell>
                            <TableCell sx={{ whiteSpace: 'nowrap' }}>
                              {r.headName || <Typography component="span" sx={{ fontSize: '0.8rem', color: '#cbd5e1' }}>미지정</Typography>}
                            </TableCell>
                            <TableCell sx={{ maxWidth: 260 }}>
                              {total === 0 ? (
                                <Typography component="span" sx={{ fontSize: '0.8rem', color: '#cbd5e1' }}>없음</Typography>
                              ) : (
                                <>
                                  <Typography sx={{ fontSize: '0.8rem', color: '#334155', lineHeight: 1.45 }}>{r.memberNames.join(', ')}</Typography>
                                  {total < MIN_COMMITTEE && (
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4, mt: 0.25 }}>
                                      <WarningAmberIcon sx={{ fontSize: 13, color: '#c2410c' }} />
                                      <Typography sx={{ fontSize: '0.72rem', color: '#c2410c' }}>{total}명 — 3인 이상 권장</Typography>
                                    </Box>
                                  )}
                                </>
                              )}
                            </TableCell>
                            <TableCell sx={{ maxWidth: 220 }}>
                              {total === 0 ? '-' : (
                                <>
                                  <Typography sx={{ fontSize: '0.84rem', fontWeight: 700, color: r.submittedCount >= total ? '#15803d' : '#1e293b' }}>
                                    {r.submittedCount ?? '-'} / {total}
                                  </Typography>
                                  {stage !== 'closed' && r.pending?.length > 0 && (
                                    <Typography sx={smallSx}>
                                      미제출: {r.pending.map((p) => (p.draft ? `${p.name}(작성 중)` : p.name)).join(', ')}
                                    </Typography>
                                  )}
                                </>
                              )}
                            </TableCell>
                            <TableCell sx={{ maxWidth: 200 }}>
                              {tops?.length ? (
                                <>
                                  <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: '#1e293b' }}>
                                    {tops.map((c) => c.publisher).join(', ')}
                                  </Typography>
                                  <Typography sx={smallSx}>
                                    {tops.length > 1 ? '동점 — 협의 필요' : fmtPrice(tops[0].price)}
                                  </Typography>
                                </>
                              ) : <Typography component="span" sx={{ fontSize: '0.8rem', color: '#cbd5e1' }}>-</Typography>}
                            </TableCell>
                            <TableCell align="center">
                              {stage === 'closed' && opTotal ? (
                                <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: opN >= opTotal ? '#15803d' : '#b45309' }}>{opN}/{opTotal}</Typography>
                              ) : <Typography component="span" sx={{ fontSize: '0.8rem', color: '#cbd5e1' }}>-</Typography>}
                            </TableCell>
                          </TableRow>
                        )
                      })),
                    ]
                  })}
                </TableBody>
              </Table>
            </Box>
          )}
        </>
      )}
    </Layout>
  )
}
