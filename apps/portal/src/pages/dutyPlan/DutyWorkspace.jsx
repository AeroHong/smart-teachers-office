import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Alert from '@mui/material/Alert'
import Snackbar from '@mui/material/Snackbar'
import TextField from '@mui/material/TextField'
import InputAdornment from '@mui/material/InputAdornment'
import Tooltip from '@mui/material/Tooltip'
import Tabs from '@mui/material/Tabs'
import Tab from '@mui/material/Tab'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import AddIcon from '@mui/icons-material/Add'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import HistoryIcon from '@mui/icons-material/History'
import SearchIcon from '@mui/icons-material/Search'
import PrintIcon from '@mui/icons-material/Print'
import FullscreenIcon from '@mui/icons-material/Fullscreen'
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit'
import DragIndicatorIcon from '@mui/icons-material/DragIndicator'
import {
  PLAN_KINDS, addDepartment, addDuty, assignDuty, groupPlan, headRoster, linkPerson, mergeStaffPool, moveDuty, pickDepartments,
  planData, planStage, removeDepartment, removeSubjectHead, setHomeroom, setSubjectHead, splitDepartments,
  summarizeStaff, summaryLine, updateDepartment, updatePoolPerson, validatePlan, wishersOf,
} from '@shared/lib/dutyPlan'
import useStaffDirectory from '../academicPlan/useStaffDirectory'
import PresenceAvatars from '../academicPlan/PresenceAvatars'
import CommentsPanel from '../academicPlan/CommentsPanel'
import VersionDrawer from '../academicPlan/VersionDrawer'
import StaffPanel from './StaffPanel'
import DutySheet, { TaskCell } from './DutySheet'
import DutyDrawer from './DutyDrawer'
import InspectorPanel from './InspectorPanel'
import { HeadsEditor, HomeroomGrid, SubjectHeadsEditor } from './AssignTabs'
import { ClearNamesDialog, DeptDialog, StageDialog } from './DutyDialogs'
import { ExportDialog } from './DutyExportDialogs'
import { DUTY_DRAG, hasType } from './dutyDnd'
import { collabRepo, loadVersionData, recordHolders, savePlan, saveYear, setPlanStage, subscribeWishes } from './dutyPlanRepo'
import { ACCENT, STAGE_STYLE } from './dutyUi'

const SAVE_DELAY = 1200
const PAGE_BG = '#f1f5f9'
const PANE = { bgcolor: '#fff', border: '1px solid #e2e8f0', borderRadius: 1.5, minHeight: 0, minWidth: 0 }

/** 단계 이동 — 관리자만. key: 지금 단계에서 갈 수 있는 곳 */
const STAGE_MOVES = {
  draft: [{ to: 'review', title: '2차 공람 시작', action: '공람 시작', desc: '전 교직원이 이 안을 읽고 의견을 남길 수 있게 됩니다. 편집자는 계속 고칠 수 있습니다.', placeholder: '예: 11/20까지 의견 수렴' }],
  review: [
    { to: 'draft', title: '1차로 되돌리기', action: '되돌리기', desc: '다시 관리자·편집자만 보게 됩니다. 남긴 의견은 그대로 둡니다.', placeholder: '' },
    { to: 'confirmed', title: '3차 확정', action: '확정', desc: '인사자문위원회 결정을 기록하고 확정합니다. 확정본은 전 교직원에게 공개되고 읽기 전용이 됩니다.', placeholder: '예: 2027.2.10. 인사자문위원회 결정' },
  ],
}

/** 보관함 — 어느 줄에도 없는 업무 내용 카드와, 표에서 뺀 업무 줄 */
function TrayPanel({ draft, onChange, selectedIds, dragIdsFor, onTaskClick, onDutyClick }) {
  const [over, setOver] = useState(false)
  const trayDuties = groupPlan(draft).tray
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, outline: over ? `2px dashed ${ACCENT}` : 'none', borderRadius: 1 }}
      onDragOver={(e) => { if (hasType(e, DUTY_DRAG)) { e.preventDefault(); setOver(true) } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(false) }}
      onDrop={(e) => {
        if (!hasType(e, DUTY_DRAG)) return
        e.preventDefault(); setOver(false)
        const id = e.dataTransfer.getData(DUTY_DRAG)
        if (id) onChange((d) => moveDuty(d, id, ''))
      }}>
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>여기 둔 것은 결재 파일·열람 화면에 나오지 않습니다.</Typography>
      <Box>
        <Typography sx={{ fontWeight: 800, fontSize: '0.88rem', mb: 0.5 }}>업무 내용 카드 {(draft.looseTasks || []).length}</Typography>
        <Box sx={{ border: '1px dashed #cbd5e1', borderRadius: 1, p: 0.75, bgcolor: '#f8fafc' }}>
          <TaskCell tasks={draft.looseTasks || []} dutyId="" editable onChange={onChange} minHeight={60} emptyText="표의 카드를 여기로 끌어 놓기"
            selectedIds={selectedIds} dragIdsFor={dragIdsFor} onTaskClick={onTaskClick} />
        </Box>
      </Box>
      <Box>
        <Typography sx={{ fontWeight: 800, fontSize: '0.88rem', mb: 0.5 }}>뺀 업무 줄 {trayDuties.length}</Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {trayDuties.map((d) => (
            <Box key={d.id} draggable onDragStart={(e) => { e.dataTransfer.setData(DUTY_DRAG, d.id); e.dataTransfer.effectAllowed = 'move' }}
              onClick={() => onDutyClick(d)}
              sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 0.75, py: 0.5, bgcolor: '#fff', border: '1px solid #e2e8f0', borderRadius: 1, cursor: 'grab' }}>
              <DragIndicatorIcon sx={{ fontSize: 15, color: '#cbd5e1' }} />
              <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, flex: 1 }}>{d.title || '(업무)'}</Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>{d.assigneeName} · 카드 {(d.tasks || []).length}</Typography>
            </Box>
          ))}
          {!trayDuties.length && <Typography variant="caption" sx={{ color: '#94a3b8' }}>표의 업무 칸 손잡이(⋮⋮)를 끌어 여기 놓으면 줄을 뺍니다. 다시 표로 끌어 넣을 수 있습니다.</Typography>}
        </Box>
      </Box>
    </Box>
  )
}

/**
 * 편성안 편집 화면(편집자) — 학사일정 편집기처럼 창 높이에 고정하고 영역마다 따로 스크롤한다(화면 전체는 움직이지 않는다).
 *   왼쪽: 업무분장표 두 쪽(이어 보기 = 부서 경계에서 반씩 / 따로 보기 = 두 쪽 모두 전체 — 멀리 떨어진 줄 사이로 카드 옮길 때)
 *   오른쪽: 편집(누른 카드·줄 고치기) · 보관함 · 교직원 · 점검 · 의견
 * 저장은 학사일정과 같다: 고치면 1.2초 뒤 자동 저장, 다른 사람이 먼저 저장했으면 줄 단위로 합친다.
 */
export default function DutyWorkspace({ plan, yearDoc, schoolId, me, dutyAdmin }) {
  const navigate = useNavigate()
  const year = plan.year
  const repo = useMemo(() => collabRepo(year), [year])
  const [draft, setDraft] = useState(() => planData(plan))
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [q, setQ] = useState('')
  const [tab, setTab] = useState('sheet')
  const [view, setView] = useState('split') // split 이어 보기 | free 따로 보기 | single 한 쪽
  const [side, setSide] = useState('edit')
  const [sel, setSel] = useState(null) // { type: 'task' | 'duty', id }
  const [multi, setMulti] = useState(() => new Set()) // 여러 장 고른 업무 내용 카드 id
  const [record, setRecord] = useState(null) // { dutyId, taskId } — 기록 서랍
  const [editDept, setEditDept] = useState(null) // { dept } | { dept: null } 새 부서
  const [stageMove, setStageMove] = useState(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [clearOpen, setClearOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement))
  const [picked, setPicked] = useState(null) // 교직원 패널에서 고른 사람 { key, person }
  const [wishes, setWishes] = useState([])
  const { staff } = useStaffDirectory(schoolId, year)
  useEffect(() => {
    if (!schoolId) return undefined
    return subscribeWishes(schoolId, year, setWishes, () => setWishes([]))
  }, [schoolId, year])
  const wishByUid = useMemo(() => new Map(wishes.map((w) => [w.uid, w])), [wishes])

  const baseRef = useRef(planData(plan))
  const baseRevRef = useRef(plan.revision ?? 0)
  const draftRef = useRef(draft)
  const dirtyRef = useRef(false)
  const savingRef = useRef(false)
  const timerRef = useRef(null)
  draftRef.current = draft
  dirtyRef.current = dirty

  // 고치던 것이 없으면 최신본을 따라간다
  useEffect(() => {
    if (dirtyRef.current || savingRef.current) return
    const data = planData(plan)
    baseRef.current = data
    baseRevRef.current = plan.revision ?? 0
    setDraft(data)
  }, [plan])

  const runSave = useCallback(async (opts = {}) => {
    if (savingRef.current) { timerRef.current = setTimeout(() => runSave(opts), 400); return null }
    const mine = opts.mine || draftRef.current
    savingRef.current = true
    setSaving(true)
    try {
      const r = await savePlan({
        schoolId, year, planId: plan.id, by: me, base: baseRef.current, mine, baseRevision: baseRevRef.current,
        action: opts.action, summary: opts.summary,
      })
      baseRef.current = r.data
      baseRevRef.current = r.revision
      if (opts.mine || draftRef.current === mine) { setDraft(r.data); setDirty(false) } else timerRef.current = setTimeout(() => runSave(), SAVE_DELAY)
      if (r.merged) setToast(r.conflicts.length ? `다른 선생님 수정과 합쳤습니다 — ${r.conflicts.join(' ')}` : '다른 선생님 수정과 합쳐 저장했습니다.')
      return r
    } catch (e) {
      setError(`저장하지 못했습니다: ${e.message}`)
      return null
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }, [schoolId, year, plan.id, me])

  useEffect(() => () => clearTimeout(timerRef.current), [])
  // 저장 전에 창을 닫으려 하면 묻는다
  useEffect(() => {
    const warn = (e) => { if (dirtyRef.current || savingRef.current) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [])
  // 전체 화면 — Esc로 나가도 버튼 모양이 따라오게
  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen?.()
    else document.documentElement.requestFullscreen?.().catch(() => setToast('이 브라우저에서는 전체 화면을 쓸 수 없습니다.'))
  }
  // Esc — 고른 카드·줄 풀기(입력 중이면 그대로 둔다)
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape' || /INPUT|TEXTAREA/.test(document.activeElement?.tagName || '')) return
      setMulti(new Set()); setSel(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => {
    const prev = document.title
    document.title = `${plan.year} ${plan.name} · 업무분장`
    return () => { document.title = prev }
  }, [plan.year, plan.name])

  const change = useCallback((fn) => {
    setDraft((d) => fn(d))
    setDirty(true)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => runSave(), SAVE_DELAY)
  }, [runSave])

  const stage = planStage(plan)
  const st = STAGE_STYLE[stage]
  const sum = useMemo(() => summarizeStaff(draft), [draft])
  const warnings = useMemo(() => validatePlan(draft), [draft])
  const heads = useMemo(() => headRoster(draft), [draft])
  const pages = useMemo(() => {
    if (view === 'single') return [draft]
    if (view === 'free') return [draft, draft]
    const [a, b] = splitDepartments(draft)
    return [pickDepartments(draft, a), pickDepartments(draft, b)]
  }, [draft, view])

  const select = (s) => { setSel(s); setMulti(new Set(s?.type === 'task' ? [s.id] : [])); if (s) setSide('edit') }
  const clickTask = (t, _duty, e) => {
    if (e && (e.ctrlKey || e.metaKey || e.shiftKey)) {
      setMulti((m) => { const n = new Set(m); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); return n })
      setSel({ type: 'task', id: t.id }); setSide('edit')
    } else select({ type: 'task', id: t.id })
  }
  // 표 순서대로 — 여러 장을 옮겨도 원래 순서가 유지되게
  const orderedIds = () => [
    ...groupPlan(draft).categories.flatMap((c) => c.departments).flatMap((dept) => dept.duties).flatMap((d) => d.tasks.map((t) => t.id)),
    ...(draft.looseTasks || []).map((t) => t.id),
  ]
  const dragIdsFor = (t) => (multi.has(t.id) && multi.size > 1 ? orderedIds().filter((id) => multi.has(id)) : [t.id])
  const newDuty = (deptId) => {
    const { data, duty } = addDuty(draftRef.current, deptId)
    change(() => data)
    select({ type: 'duty', id: duty.id })
  }
  const restore = async (v) => {
    clearTimeout(timerRef.current)
    const data = await loadVersionData(schoolId, year, plan.id, v.id)
    await runSave({ mine: planData(data), action: 'restore', summary: `v${v.versionNo}로 복구` })
    setHistoryOpen(false)
  }
  const doStage = async (note) => {
    const move = stageMove
    setStageMove(null)
    if (dirty || saving) { setError('저장이 끝난 뒤에 다시 눌러 주세요.'); return }
    setBusy(true)
    try {
      await setPlanStage({ schoolId, plan, stage: move.to, note, by: me })
      // 최종 확정(인원 배치안)이면 업무 내용 카드마다 그 해 담당자를 남긴다 — 다음 해 인수인계가 여기서 이어진다
      if (move.to === 'confirmed' && plan.kind === 'assign') await recordHolders(schoolId, { ...draft, year })
      setToast(`${move.title} — 기록했습니다.`)
    } catch (e) { setError(`바꾸지 못했습니다: ${e.message}`) } finally { setBusy(false) }
  }

  // 명단에 없는 사람을 고르면 배치 대상 명단에도 넣는다(과목이 명단표에 나오게)
  const withPool = (d, p) => (p?.name ? mergeStaffPool(d, [p]) : d)
  const poolChange = (kind, arg) => {
    if (kind === 'flag') change((d) => updatePoolPerson(mergeStaffPool(d, [arg]), arg.uid, { flag: arg.flag || undefined }))
    else if (kind === 'link') change((d) => mergeStaffPool(linkPerson(d, arg.name, arg.uid, arg.newName), [{ uid: arg.uid, name: arg.newName, subject: arg.subject }]))
    else if (kind === 'unassign') change((d) => assignDuty(d, arg.dutyId, null))
  }
  const pickedMatch = (d) => {
    if (!picked) return false
    const p = picked.person
    return p.uid ? d.assigneeUid === p.uid : !d.assigneeUid && d.assigneeName === p.name
  }
  // 희망 배지 — 이 줄을 지망한 사람(1지망 굵게)
  const wishBadge = (d) => {
    const ws = wishersOf(d, wishes)
    if (!ws.length) return null
    return (
      <Tooltip title={ws.map((w) => `${w.rank}지망 ${w.name}`).join(' · ')}>
        <Box sx={{ fontSize: '0.68rem', color: '#2563eb' }}>
          희망 {ws.map((w, i) => <Box key={i} component="span" sx={{ fontWeight: w.rank === 1 ? 800 : 400 }}>{i ? ', ' : ''}{w.name}{w.rank > 1 ? `(${w.rank})` : ''}</Box>)}
        </Box>
      </Tooltip>
    )
  }
  const status = saving ? '저장 중…' : dirty ? '저장 대기' : '저장됨'
  const pageLabel = (p) => {
    const names = groupPlan(p).categories.flatMap((c) => c.departments).map((d) => d.name)
    return names.length ? `${names[0]}${names.length > 1 ? ` ~ ${names[names.length - 1]}` : ''}` : ''
  }
  const sheetProps = {
    editable: true, assign: true, q, onChange: change,
    selectedIds: multi, dragIdsFor, selectedDutyId: sel?.type === 'duty' ? sel.id : null,
    highlight: picked ? pickedMatch : undefined, rowExtra: wishes.length ? wishBadge : undefined,
    onTaskClick: clickTask,
    onEditDuty: (d) => select({ type: 'duty', id: d.id }),
    onEditDept: (dept) => setEditDept({ dept }), onAddDuty: newDuty,
    onDropPerson: (dutyId, p) => change((d) => withPool(assignDuty(d, dutyId, p), p)),
  }

  return (
    <Box sx={{ height: '100vh', overflow: 'hidden', bgcolor: PAGE_BG, display: 'flex', flexDirection: 'column' }}>
      {/* 머리 줄 */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.75, bgcolor: '#fff', borderBottom: '1px solid #e2e8f0', flexWrap: 'wrap', flexShrink: 0 }}>
        <Button size="small" startIcon={<ArrowBackIcon />} onClick={() => navigate('/duty-plan')}>목록</Button>
        <Typography sx={{ fontWeight: 800, fontSize: '1.05rem' }}>{year}학년도 {plan.name}</Typography>
        <Chip size="small" label={PLAN_KINDS[plan.kind] || '편성안'} variant="outlined" />
        <Chip size="small" label={st.label} color={st.color} variant={st.variant} />
        <ToggleButtonGroup size="small" exclusive value={tab} onChange={(_, v) => v && setTab(v)} sx={{ ml: 1 }}>
          <ToggleButton value="sheet" sx={{ fontWeight: 700, px: 1.25, py: 0.25 }}>업무분장표</ToggleButton>
          <ToggleButton value="rosters" sx={{ fontWeight: 700, px: 1.25, py: 0.25 }}>부장 · 담임 · 교과부장</ToggleButton>
        </ToggleButtonGroup>
        {tab === 'sheet' && (
          <>
            <ToggleButtonGroup size="small" exclusive value={view} onChange={(_, v) => v && setView(v)}>
              <Tooltip title="부서 경계에서 반씩 — 한글 파일 두 쪽처럼"><ToggleButton value="split" sx={{ px: 1, py: 0.25 }}>이어 보기</ToggleButton></Tooltip>
              <Tooltip title="두 쪽 모두 전체 표 — 멀리 떨어진 줄 사이로 카드를 옮길 때"><ToggleButton value="free" sx={{ px: 1, py: 0.25 }}>따로 보기</ToggleButton></Tooltip>
              <ToggleButton value="single" sx={{ px: 1, py: 0.25 }}>한 쪽</ToggleButton>
            </ToggleButtonGroup>
            <TextField size="small" value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름·업무·업무 내용 찾기"
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>, sx: { height: 32 } }} sx={{ width: 210 }} />
            <Button size="small" startIcon={<AddIcon />} onClick={() => setEditDept({ dept: null })}>부서</Button>
            <Button size="small" color="warning" onClick={() => setClearOpen(true)}>이름 빼기</Button>
          </>
        )}
        <Box sx={{ flex: 1 }} />
        <Typography variant="caption" sx={{ color: dirty || saving ? '#b45309' : 'text.secondary' }}>{status}</Typography>
        <PresenceAvatars schoolId={schoolId} planId={plan.id} me={me} repo={repo} />
        <Button size="small" startIcon={<HistoryIcon />} onClick={() => setHistoryOpen(true)}>기록</Button>
        <Button size="small" startIcon={<PrintIcon />} onClick={() => setExportOpen(true)}>결재 첨부</Button>
        {dutyAdmin && (STAGE_MOVES[stage] || []).map((m) => (
          <Button key={m.to} size="small" variant={m.to === 'draft' ? 'text' : 'contained'} disableElevation disabled={busy}
            onClick={() => setStageMove(m)} sx={m.to === 'draft' ? {} : { bgcolor: m.to === 'confirmed' ? '#15803d' : ACCENT }}>{m.title}</Button>
        ))}
        <Button size="small" startIcon={fullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />} onClick={toggleFullscreen}>
          {fullscreen ? '전체 화면 끄기' : '전체 화면'}
        </Button>
      </Box>
      {error && <Alert severity="error" onClose={() => setError('')} sx={{ borderRadius: 0, py: 0 }}>{error}</Alert>}

      {/* 본문 — 왼쪽(표) · 오른쪽(패널), 영역마다 따로 스크롤 */}
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', gap: 1, p: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', gap: 1 }}>
          {tab === 'sheet' ? pages.map((p, i) => (
            <Box key={`${view}-${i}`} sx={{ ...PANE, flex: 1, display: 'flex', flexDirection: 'column' }}>
              {pages.length > 1 && (
                <Box sx={{ px: 1, py: 0.4, borderBottom: '1px solid #e2e8f0', display: 'flex', gap: 1, alignItems: 'baseline', flexShrink: 0 }}>
                  <Typography sx={{ fontWeight: 800, fontSize: '0.8rem', color: ACCENT }}>{i + 1}쪽</Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>{view === 'free' ? '전체' : pageLabel(p)}</Typography>
                </Box>
              )}
              <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', overscrollBehavior: 'contain' }}>
                <DutySheet data={p} {...sheetProps} />
              </Box>
            </Box>
          )) : (
            <Box sx={{ ...PANE, flex: 1, overflow: 'auto', overscrollBehavior: 'contain', p: 2, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <Box>
                <Typography sx={{ fontWeight: 800, color: ACCENT, mb: 1 }}>1. 부장교사</Typography>
                <HeadsEditor rows={heads} onNote={(deptId, note) => change((d) => ({ ...d, headNotes: { ...(d.headNotes || {}), [deptId]: note } }))} />
              </Box>
              <Box>
                <Typography sx={{ fontWeight: 800, color: ACCENT, mb: 1 }}>2. 담임 · 부담임</Typography>
                <HomeroomGrid data={draft} staff={staff} classCounts={yearDoc?.classCounts} specialClasses={yearDoc?.specialClasses}
                  onSet={(g, c, role, p) => change((d) => withPool(setHomeroom(d, g, c, role, p), p))}
                  onLayout={(layout) => saveYear(schoolId, year, layout).catch((e) => setError(e.message))} />
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.75 }}>칸을 눌러 고르거나, 오른쪽 교직원 탭에서 끌어다 놓습니다.</Typography>
              </Box>
              <Box>
                <Typography sx={{ fontWeight: 800, color: ACCENT, mb: 1 }}>3. 교과부장</Typography>
                <SubjectHeadsEditor data={draft} staff={staff}
                  onSet={(group, patch, p) => change((d) => withPool(setSubjectHead(d, group, patch), p))}
                  onRemove={(group) => change((d) => removeSubjectHead(d, group))}
                  onAdd={(group) => change((d) => setSubjectHead(d, group, {}))} />
              </Box>
            </Box>
          )}
        </Box>

        {/* 오른쪽 패널 */}
        <Box sx={{ ...PANE, width: { xs: 340, xl: 400 }, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
          <Tabs value={side} onChange={(_, v) => setSide(v)} variant="fullWidth"
            sx={{ minHeight: 38, borderBottom: '1px solid #e2e8f0', flexShrink: 0, '& .MuiTab-root': { minHeight: 38, minWidth: 0, px: 0.5, fontWeight: 700, fontSize: '0.8rem' } }}>
            <Tab value="edit" label="편집" />
            <Tab value="tray" label={`보관함 ${(draft.looseTasks || []).length + groupPlan(draft).tray.length}`} />
            <Tab value="staff" label="교직원" />
            <Tab value="check" label={`점검${warnings.some((w) => w.level === 'warn') ? ' ⚠' : ''}`} />
            <Tab value="comments" label="의견" />
          </Tabs>
          <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', overscrollBehavior: 'contain', p: 1.5 }}>
            {side === 'edit' && (
              <InspectorPanel draft={draft} sel={sel} change={change} staff={staff} onSelect={select}
                multiIds={multi.size > 1 ? orderedIds().filter((id) => multi.has(id)) : []} onClearMulti={() => setMulti(new Set())}
                onRecord={(dutyId, taskId) => setRecord({ dutyId, taskId })} />
            )}
            {side === 'tray' && (
              <TrayPanel draft={draft} onChange={change} selectedIds={multi} dragIdsFor={dragIdsFor}
                onTaskClick={(t, e) => clickTask(t, null, e)} onDutyClick={(d) => select({ type: 'duty', id: d.id })} />
            )}
            {side === 'staff' && (
              <StaffPanel data={draft} staff={staff} wishByUid={wishByUid} onChange={poolChange}
                picked={picked?.key} onPick={(key, person) => setPicked(key ? { key, person } : null)} />
            )}
            {side === 'check' && (
              <Box>
                <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
                  부서 {draft.departments.length} · 업무 줄 {sum.duties} · 업무 내용 {draft.duties.filter((d) => d.deptId).reduce((n, d) => n + d.tasks.length, 0)}
                </Typography>
                {sum.teachers > 0 && <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 0.25 }}>{summaryLine(sum)}</Typography>}
                <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  {warnings.map((w, i) => (
                    <Typography key={i} variant="body2" sx={{ fontSize: '0.8rem', color: w.level === 'warn' ? '#b45309' : '#475569' }}>{w.level === 'warn' ? '⚠ ' : '· '}{w.text}</Typography>
                  ))}
                  {!warnings.length && <Typography variant="body2" sx={{ color: '#15803d' }}>걸리는 것이 없습니다.</Typography>}
                </Box>
              </Box>
            )}
            {side === 'comments' && (
              <CommentsPanel schoolId={schoolId} planId={plan.id} me={me} canAdmin={dutyAdmin} repo={repo} accent={ACCENT}
                placeholder="이 편성안에 대한 의견 (Ctrl+Enter로 등록)" />
            )}
          </Box>
        </Box>
      </Box>

      <DutyDrawer plan={{ ...plan, ...draft }} duty={record ? draft.duties.find((d) => d.id === record.dutyId) : null} taskId={record?.taskId}
        onClose={() => setRecord(null)} />
      <DeptDialog open={Boolean(editDept)} dept={editDept?.dept} onClose={() => setEditDept(null)}
        onSave={(f) => {
          if (editDept.dept) change((d) => updateDepartment(d, editDept.dept.id, f))
          else change((d) => addDepartment(d, f).data)
          setEditDept(null)
        }}
        onDelete={() => {
          const n = draft.duties.filter((x) => x.deptId === editDept.dept.id).length
          if (!window.confirm(`'${editDept.dept.name}'을(를) 지울까요?${n ? ` 업무 줄 ${n}개는 보관함으로 옮깁니다.` : ''}`)) return
          change((d) => removeDepartment(d, editDept.dept.id))
          setEditDept(null)
        }} />
      <ClearNamesDialog open={clearOpen} data={draft} onClose={() => setClearOpen(false)}
        onApply={(fn) => { change(fn); setToast('이름을 비웠습니다. 잘못 뺐으면 기록에서 되돌릴 수 있습니다.') }} />
      <StageDialog open={Boolean(stageMove)} target={stageMove} onClose={() => setStageMove(null)} onConfirm={doStage} />
      <VersionDrawer open={historyOpen} onClose={() => setHistoryOpen(false)} schoolId={schoolId} plan={plan} canEdit
        onRestore={restore} listVersions={repo.listVersions} filterPlaceholder="이름·업무로 찾기" />
      {exportOpen && <ExportDialog open onClose={() => setExportOpen(false)} schoolId={schoolId} plan={{ ...plan, ...draft }} yearDoc={yearDoc} />}
      <Snackbar open={Boolean(toast)} autoHideDuration={5000} onClose={() => setToast('')} message={toast} />
    </Box>
  )
}
