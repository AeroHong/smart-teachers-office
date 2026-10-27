import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { httpsCallable } from 'firebase/functions'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Tabs from '@mui/material/Tabs'
import Tab from '@mui/material/Tab'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Alert from '@mui/material/Alert'
import Snackbar from '@mui/material/Snackbar'
import CircularProgress from '@mui/material/CircularProgress'
import TextField from '@mui/material/TextField'
import HistoryIcon from '@mui/icons-material/History'
import PrintIcon from '@mui/icons-material/Print'
import EventAvailableIcon from '@mui/icons-material/EventAvailable'
import CompareArrowsIcon from '@mui/icons-material/CompareArrows'
import VerifiedIcon from '@mui/icons-material/Verified'
import CloudUploadIcon from '@mui/icons-material/CloudUpload'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import { useAuth } from '@shared/contexts/AuthContext'
import { functions } from '@shared/lib/firebase'
import { buildWeekRows, computeStats, rowsForSemester, shiftEvent, yearRange } from '@shared/lib/academicPlan'
import Layout from '../../components/Layout'
import PlanGrid from './PlanGrid'
import PlanStatsPanel from './PlanStatsPanel'
import EventDialog from './EventDialog'
import VersionDrawer from './VersionDrawer'
import useStaffDirectory from './useStaffDirectory'
import {
  confirmPlan, loadVersionData, renamePlan, savePlan, subscribePlan, subscribePlans, subscribeYear, unconfirmPlan,
} from './planRepo'
import { downloadPlanPdf, printPlan } from './academicPlanPrint'
import { ACCENT } from './planUi'

const SAVE_DELAY = 1200

export default function AcademicPlanEditor() {
  const { planId } = useParams()
  const navigate = useNavigate()
  const { user, userName, schoolId, schoolName, isAdmin, isSuperAdmin } = useAuth()
  const by = useMemo(() => ({ uid: user?.uid, name: userName || user?.email || '' }), [user, userName])

  const [plan, setPlan] = useState(undefined) // 서버 문서
  const [yearDoc, setYearDoc] = useState(null)
  const [plans, setPlans] = useState([])
  const [draft, setDraft] = useState(null) // { events, holidays } — 화면 상태
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [semester, setSemester] = useState(1)
  const [dialog, setDialog] = useState(null) // { event } | null
  const [historyOpen, setHistoryOpen] = useState(false)
  const [printAnchor, setPrintAnchor] = useState(null)
  const [busy, setBusy] = useState('')
  const [nameEdit, setNameEdit] = useState(null)

  // 저장 기준점 — 연 때의 저장본과 revision. 다른 사람이 먼저 저장했으면 savePlan이 이 위에 합친다
  const baseRef = useRef(null)
  const baseRevRef = useRef(0)
  const draftRef = useRef(null)
  const dirtyRef = useRef(false)
  const timerRef = useRef(null)
  const savingRef = useRef(false)
  draftRef.current = draft
  dirtyRef.current = dirty

  const { departments } = useStaffDirectory(schoolId, plan?.year)
  const canAdmin = isAdmin || isSuperAdmin
  const canEdit = Boolean(plan) && (canAdmin || (yearDoc?.editorUids || []).includes(user?.uid))

  useEffect(() => {
    if (!schoolId || !planId) return
    return subscribePlan(schoolId, planId, (p) => {
      setPlan(p)
      // 고치던 것이 없으면 최신본을 따라간다
      if (p && !dirtyRef.current && !savingRef.current) {
        const data = { events: p.events || [], holidays: p.holidays || [] }
        baseRef.current = data
        baseRevRef.current = p.revision ?? 0
        setDraft(data)
      }
    }, (e) => setError(e.message))
  }, [schoolId, planId])

  useEffect(() => {
    if (!schoolId || !plan?.year) return
    const u1 = subscribeYear(schoolId, plan.year, setYearDoc)
    const u2 = subscribePlans(schoolId, plan.year, setPlans)
    return () => { u1(); u2() }
  }, [schoolId, plan?.year])

  const runSave = useCallback(async (opts = {}) => {
    if (savingRef.current) { timerRef.current = setTimeout(() => runSave(opts), 400); return }
    const mine = opts.mine || draftRef.current
    if (!mine) return
    savingRef.current = true
    setSaving(true)
    try {
      const r = await savePlan({
        schoolId, planId, by, base: baseRef.current, mine, baseRevision: baseRevRef.current,
        action: opts.action, summary: opts.summary,
      })
      baseRef.current = r.data
      baseRevRef.current = r.revision
      // 저장하는 동안 더 고친 것이 없으면 저장본(병합 결과)을 화면에 반영
      if (opts.mine || draftRef.current === mine) {
        setDraft(r.data)
        setDirty(false)
      } else {
        timerRef.current = setTimeout(() => runSave(), SAVE_DELAY)
      }
      if (r.merged) setToast(r.conflicts.length ? `다른 선생님 수정과 합쳤습니다 — ${r.conflicts.join(' ')}` : '다른 선생님 수정과 합쳐 저장했습니다.')
    } catch (e) {
      setError(`저장하지 못했습니다: ${e.message}`)
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }, [schoolId, planId, by])

  useEffect(() => () => clearTimeout(timerRef.current), [])

  const change = (fn) => {
    if (!canEdit) return
    setDraft((d) => fn(d))
    setDirty(true)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => runSave(), SAVE_DELAY)
  }

  const view = useMemo(() => (plan && draft ? { ...plan, ...draft } : null), [plan, draft])
  const stats = useMemo(() => (view ? computeStats(view) : null), [view])
  const rows = useMemo(() => (view ? rowsForSemester(buildWeekRows(view), semester) : []), [view, semester])

  const saveEvent = (ev) => {
    change((d) => ({ ...d, events: d.events.some((e) => e.id === ev.id) ? d.events.map((e) => (e.id === ev.id ? ev : e)) : [...d.events, ev] }))
    setDialog(null)
  }
  const deleteEvent = (id) => {
    change((d) => ({ ...d, events: d.events.filter((e) => e.id !== id) }))
    setDialog(null)
  }
  const moveEvent = (id, toDate) => {
    const { start, end } = yearRange(plan.year)
    if (toDate < start || toDate > end) return
    change((d) => ({ ...d, events: d.events.map((e) => (e.id === id && e.date !== toDate ? shiftEvent(e, toDate) : e)) }))
  }

  const loadHolidays = async () => {
    setBusy('holidays')
    try {
      const { start, end } = yearRange(plan.year)
      const { data } = await httpsCallable(functions, 'fetchKoreanHolidays')({ schoolId, from: start, to: end })
      const holidays = data.holidays || []
      change((d) => ({ ...d, holidays }))
      setToast(`공휴일 ${holidays.length}일을 불러왔습니다.`)
    } catch (e) {
      setError(`공휴일을 불러오지 못했습니다: ${e.message}`)
    } finally { setBusy('') }
  }

  const restore = async (v) => {
    clearTimeout(timerRef.current)
    const data = await loadVersionData(schoolId, planId, v.id)
    await runSave({ mine: { events: data.events || [], holidays: data.holidays || [] }, action: 'restore', summary: `v${v.versionNo}로 복구` })
    setHistoryOpen(false)
  }

  const doConfirm = async () => {
    if (!window.confirm(`'${plan.name}'을(를) ${plan.year}학년도 확정 학사일정으로 지정할까요? 같은 학년도의 다른 확정본은 초안으로 돌아갑니다.`)) return
    setBusy('confirm')
    try { await confirmPlan({ schoolId, plan, plans, by }); setToast('확정했습니다.') } catch (e) { setError(e.message) } finally { setBusy('') }
  }

  const doPublish = async () => {
    if (dirty || saving) { setError('저장이 끝난 뒤에 반영하세요.'); return }
    if (!window.confirm('확정된 학사일정을 학교 구글 캘린더에 반영합니다. 이 도구가 넣은 일정만 추가·수정·삭제하고, 손으로 넣은 다른 일정은 건드리지 않습니다. 진행할까요?')) return
    setBusy('publish')
    try {
      const { data } = await httpsCallable(functions, 'publishAcademicPlan')({ schoolId, planId })
      setToast(`구글 캘린더 반영 — 추가 ${data.created} · 수정 ${data.updated} · 삭제 ${data.deleted}`)
    } catch (e) {
      setError(`구글 캘린더에 반영하지 못했습니다: ${e.message}`)
    } finally { setBusy('') }
  }

  const print = (sems, pdf) => {
    setPrintAnchor(null)
    if (pdf) downloadPlanPdf(view, schoolName, sems).catch((e) => setError(e.message))
    else if (!printPlan(view, schoolName, sems)) setError('팝업이 차단되어 인쇄 창을 열지 못했습니다.')
  }

  if (plan === undefined) return <Layout wide><Box sx={{ p: 6, textAlign: 'center' }}><CircularProgress /></Box></Layout>
  if (plan === null) return <Layout wide><Alert severity="error" sx={{ m: 3 }}>학사일정 초안을 찾을 수 없습니다.</Alert></Layout>

  const status = saving ? '저장 중…' : dirty ? '저장 대기' : '저장됨'

  return (
    <Layout wide>
      <Box sx={{ p: { xs: 1.5, md: 3 }, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(`/academic-plan?year=${plan.year}`)} size="small">목록</Button>
          {nameEdit !== null ? (
            <TextField size="small" autoFocus value={nameEdit} onChange={(e) => setNameEdit(e.target.value)}
              onBlur={async () => { if (nameEdit.trim() && nameEdit !== plan.name) await renamePlan(schoolId, planId, nameEdit.trim()); setNameEdit(null) }}
              onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setNameEdit(null) }} />
          ) : (
            <Typography variant="h5" sx={{ fontWeight: 800, cursor: canEdit ? 'text' : 'default' }}
              onClick={() => canEdit && setNameEdit(plan.name)}>
              {plan.year}학년도 · {plan.name}
            </Typography>
          )}
          {plan.status === 'confirmed'
            ? <Chip icon={<VerifiedIcon />} label="확정" color="success" size="small" />
            : <Chip label="초안" size="small" />}
          {canEdit
            ? <Typography variant="caption" sx={{ color: dirty || saving ? '#b45309' : 'text.secondary' }}>{status}</Typography>
            : <Chip label="읽기 전용" size="small" variant="outlined" />}
          <Box sx={{ flex: 1 }} />
          {canEdit && (
            <Button size="small" startIcon={<EventAvailableIcon />} onClick={loadHolidays} disabled={busy === 'holidays'}>
              공휴일 불러오기
            </Button>
          )}
          <Button size="small" startIcon={<HistoryIcon />} onClick={() => setHistoryOpen(true)}>수정 기록</Button>
          <Button size="small" startIcon={<CompareArrowsIcon />} onClick={() => navigate(`/academic-plan/compare?year=${plan.year}&a=${planId}`)}>비교</Button>
          <Button size="small" startIcon={<PrintIcon />} onClick={(e) => setPrintAnchor(e.currentTarget)}>인쇄</Button>
          <Menu anchorEl={printAnchor} open={Boolean(printAnchor)} onClose={() => setPrintAnchor(null)}>
            <MenuItem onClick={() => print([1])}>1학기 인쇄 (A4 1장)</MenuItem>
            <MenuItem onClick={() => print([2])}>2학기 인쇄 (A4 1장)</MenuItem>
            <MenuItem onClick={() => print([1, 2])}>두 학기 모두 인쇄</MenuItem>
            <MenuItem onClick={() => print([1, 2], true)}>PDF로 저장</MenuItem>
          </Menu>
          {canAdmin && (plan.status === 'confirmed' ? (
            <>
              <Button size="small" variant="contained" disableElevation startIcon={<CloudUploadIcon />} onClick={doPublish} disabled={busy === 'publish'} sx={{ bgcolor: ACCENT }}>
                구글 캘린더 반영
              </Button>
              <Button size="small" onClick={() => unconfirmPlan({ schoolId, plan })}>확정 해제</Button>
            </>
          ) : (
            <Button size="small" variant="outlined" startIcon={<VerifiedIcon />} onClick={doConfirm} disabled={busy === 'confirm'}>확정</Button>
          ))}
        </Box>

        {!canEdit && (
          <Alert severity="info">이 학년도 학사일정은 부장교사(편집자)와 관리자가 고칠 수 있습니다. 지금은 보기만 할 수 있습니다.</Alert>
        )}
        {canEdit && !(view.holidays || []).length && (
          <Alert severity="warning" action={<Button color="inherit" size="small" onClick={loadHolidays}>공휴일 불러오기</Button>}>
            공휴일이 아직 없습니다. 먼저 불러와야 수업일수가 맞게 계산됩니다.
          </Alert>
        )}
        {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}

        <Tabs value={semester ?? 0} onChange={(_, v) => setSemester(v || null)} sx={{ minHeight: 36, '& .MuiTab-root': { minHeight: 36 } }}>
          <Tab value={1} label="1학기 (3~7월)" />
          <Tab value={2} label="2학기 (8~2월)" />
          <Tab value={0} label="전체" />
        </Tabs>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: 'minmax(0, 1.5fr) minmax(0, 1fr)' }, gap: 2, alignItems: 'start' }}>
          <Box sx={{ overflowX: 'auto' }}>
            <Box sx={{ minWidth: 760 }}>
              <PlanGrid plan={view} rows={rows} canEdit={canEdit}
                onCellClick={(date) => setDialog({ event: { date } })}
                onEventClick={(ev) => setDialog({ event: ev })}
                onMove={moveEvent} />
            </Box>
            {canEdit && (
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1 }}>
                빈 곳을 누르면 그날 일정을 등록하고, 일정을 끌어서 다른 날로 옮길 수 있습니다. 고친 내용은 자동 저장되고 수정 기록에 남습니다.
              </Typography>
            )}
          </Box>
          <Box sx={{ position: { xl: 'sticky' }, top: { xl: 16 } }}>
            <PlanStatsPanel stats={stats} semester={semester} />
          </Box>
        </Box>
      </Box>

      <EventDialog open={Boolean(dialog)} event={dialog?.event} departments={departments} readOnly={!canEdit}
        onClose={() => setDialog(null)} onSave={saveEvent} onDelete={deleteEvent} />
      <VersionDrawer open={historyOpen} onClose={() => setHistoryOpen(false)} schoolId={schoolId} plan={plan} canEdit={canEdit} onRestore={restore} />
      <Snackbar open={Boolean(toast)} autoHideDuration={5000} onClose={() => setToast('')} message={toast} />
    </Layout>
  )
}
