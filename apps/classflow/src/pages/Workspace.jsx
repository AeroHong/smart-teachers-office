import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Snackbar from '@mui/material/Snackbar'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import FullscreenIcon from '@mui/icons-material/Fullscreen'
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit'
import UndoIcon from '@mui/icons-material/Undo'
import { useAuth } from '@shared/contexts/AuthContext'
import {
  demandOf, sectionSizes, validateProject, toSolverInput, applySolverResult, resizeSections, updateSubject, spreadOf,
  normalizeProject, recalcSections, placementCheck, quickAssign, balanceScore, compareScore, resetAssignment, unassignedBySubject,
} from '@shared/lib/sectioning'
import { loadProject, saveProject, saveVersion, SaveConflictError } from '../lib/projectStore'
import { callSolver } from '../lib/solverApi'
import { exportNeis, exportRoster, exportTimetable, exportBackup } from '../lib/exporters'
import SlotGrid from '../components/SlotGrid'
import DataStep from '../components/DataStep'
import StudentStep from '../components/StudentStep'
import ExportStep from '../components/ExportStep'
import SaveDialog from '../components/SaveDialog'
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown'
import VersionDialog from '../components/VersionDialog'
import { InfeasibleDialog } from '../components/SolveDialogs'
import SolveConsole from '../components/SolveConsole'
import AlternativesDialog from '../components/AlternativesDialog'
import AppShell from '../components/AppShell'
import { useHubRoles } from '../lib/useHubRoles'
import { logHub, workLabel } from '../lib/activity'
import StorageIcon from '@mui/icons-material/StorageOutlined'
import ViewModuleIcon from '@mui/icons-material/ViewModuleOutlined'
import PeopleIcon from '@mui/icons-material/PeopleOutline'
import IosShareIcon from '@mui/icons-material/IosShareOutlined'

// 해를 못 찾으면 이 순서로 제한 시간을 늘려 다시 시도한다(초)
const LIMITS = [30, 120, 300]
const limitText = (s) => (s >= 60 ? `${s / 60}분` : `${s}초`)

const numStyle = { width: 42, fontSize: 14, fontWeight: 700, textAlign: 'center', border: '1px solid #cfd6cf', borderRadius: 6, padding: '3px 2px', background: '#fff' }
const selStyle = { fontSize: 12.5, border: '1px solid #cfd6cf', borderRadius: 6, padding: '3px 2px', background: '#fff', color: '#14532d', fontWeight: 600 }

const STEPS = ['1. 데이터 확인', '2. 분반 배정', '3. 학생별 배정', '4. 내보내기·연동']
const STEP_ICONS = [StorageIcon, ViewModuleIcon, PeopleIcon, IosShareIcon]

/** 작업 창 — FHD(1920×1080) 전체화면 기준. 1단계 데이터 확인 → 2단계 분반 배정표 → 3단계 학생별 배정 */
export default function Workspace() {
  const { projectId } = useParams()
  const { user, schoolId } = useAuth()
  const { canEdit } = useHubRoles()
  const [project, setProject] = useState(null)
  const [revision, setRevision] = useState(0)
  const [dirty, setDirty] = useState(false)
  const [history, setHistory] = useState([])
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [selectedSection, setSelectedSection] = useState(null)
  const limitIdx = 0
  const [solveMenu, setSolveMenu] = useState(null)
  const canEditRef = useRef(false)
  canEditRef.current = canEdit
  const [saveOpen, setSaveOpen] = useState(false)
  const [solving, setSolving] = useState(null)   // 계산 콘솔 상태(SolveConsole)
  const [alts, setAlts] = useState(null)
  const [infeasible, setInfeasible] = useState(null)
  const [versionsOpen, setVersionsOpen] = useState(false)
  const [isFull, setIsFull] = useState(!!document.fullscreenElement)
  const [step, setStep] = useState(0)
  const abortRef = useRef(null)

  useEffect(() => {
    loadProject(schoolId, projectId)
      .then((p) => {
        if (!p) { setLoadError('작업을 찾을 수 없습니다.'); return }
        const np = normalizeProject(p)
        setProject(np)
        setRevision(p.revision || 0)
        // 이미 배정한 작업이면 2단계부터
        setStep(Object.values(np.assignment || {}).some((a) => a.some((k) => k !== null)) ? 1 : 0)
        document.title = `${p.title} · 분반 배정`
      })
      .catch((e) => { console.error(e); setLoadError('작업을 불러오지 못했습니다.') })
  }, [schoolId, projectId])

  // 되돌리기 기록은 ref로 현재 값을 잡아 둔다(상태 갱신 함수 안에서 다른 상태를 바꾸지 않도록)
  const projectRef = useRef(null)
  projectRef.current = project
  const commit = useCallback((next) => {
    const prev = projectRef.current
    if (prev) setHistory((h) => [...h.slice(-29), prev])
    projectRef.current = next
    setProject(next)
    setDirty(true)
  }, [])

  // 빠르게 여러 번 눌러도 한 단계씩 정확히 되돌리도록 기록을 ref로도 들고 있는다
  const historyRef = useRef([])
  historyRef.current = history
  const undo = useCallback(() => {
    const h = historyRef.current
    if (!h.length) return
    const last = h[h.length - 1]
    historyRef.current = h.slice(0, -1)
    setHistory(historyRef.current)
    projectRef.current = last
    setProject(last)
    setDirty(true)
  }, [])

  /** 저장. title이 오면 작업명도 바꾸고, versionName이 오면 같은 상태를 버전으로도 남긴다 */
  const save = useCallback(async ({ title, versionName } = {}) => {
    if (!project || saving) return false
    setSaving(true)
    let ok = false
    try {
      const p = title && title !== project.title ? { ...project, title } : project
      const rev = await saveProject(schoolId, projectId, p, revision, user)
      if (p !== project) { projectRef.current = p; setProject(p); document.title = `${p.title} · 분반 배정` }
      setRevision(rev)
      setDirty(false)
      if (versionName) await saveVersion(schoolId, projectId, versionName, p, user)
      logHub(schoolId, { action: 'sectioning_save', summary: `${workLabel(p)} 분반 배정 저장${versionName ? ` · 버전 "${versionName}"` : ''}`, targetId: projectId })
      setToast({ severity: 'success', text: versionName ? `저장했습니다 · 버전 "${versionName}"` : '저장했습니다.' })
      ok = true
    } catch (e) {
      console.error(e)
      setToast({ severity: 'error', text: e instanceof SaveConflictError ? e.message : '저장하지 못했습니다. 네트워크를 확인하세요.' })
    }
    setSaving(false)
    return ok
  }, [project, saving, schoolId, projectId, revision, user])

  // Ctrl+S 저장, Ctrl+Z 되돌리기, 저장 안 한 채 닫기 경고
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); if (canEditRef.current) save({}) }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !['INPUT', 'TEXTAREA'].includes(e.target.tagName)) { e.preventDefault(); undo() }
    }
    const onUnload = (e) => { if (dirty) { e.preventDefault(); e.returnValue = '' } }
    const onFs = () => setIsFull(!!document.fullscreenElement)
    window.addEventListener('keydown', onKey)
    window.addEventListener('beforeunload', onUnload)
    document.addEventListener('fullscreenchange', onFs)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('beforeunload', onUnload)
      document.removeEventListener('fullscreenchange', onFs)
    }
  }, [save, undo, dirty])

  const demand = useMemo(() => (project ? demandOf(project) : []), [project])
  const sizes = useMemo(() => (project ? sectionSizes(project) : []), [project])
  const validation = useMemo(() => (project ? validateProject(project) : null), [project])
  const worstSpread = useMemo(() => Math.max(0, ...sizes.filter((x) => x.length > 1).map(spreadOf)), [sizes])

  // ── 계산 콘솔: 실제 진행 로그를 쌓는다 ──
  const startConsole = (title, limit) => {
    const now = Date.now()
    setSolving({ title, startedAt: now, stepStartedAt: now, limit, logs: [], best: null, points: [], done: null })
  }
  const log = (type, text) => setSolving((c) => (c ? { ...c, logs: [...c.logs.slice(-400), { t: Date.now() - c.startedAt, type, text }] } : c))
  const onServerEvent = (ev) => setSolving((c) => {
    if (!c) return c
    const t = Date.now() - c.startedAt
    const next = { ...c, logs: [...c.logs.slice(-400), { t, type: ev.type, text: ev.text }] }
    if (ev.type === 'solution' && ev.worst !== undefined) {
      next.best = { n: (c.best?.n || 0) + 1, worst: ev.worst, sum: ev.sum }
      next.points = [...c.points, { t: t / 1000, sum: ev.sum, worst: ev.worst }]
    }
    return next
  })
  const finishConsole = (done) => setSolving((c) => (c ? { ...c, done: { at: Date.now(), ...done } } : c))

  /** 배정 실행. keepPrevious: 지금 배정을 기준으로 바뀌는 학생을 줄인다(고정은 항상 유지) */
  const runSolve = useCallback(async ({ keepPrevious = true, startIdx = limitIdx, base = project, fresh = false, minChange = false } = {}) => {
    const p = base
    const missing = p.subjects.filter((s, i) => demand[i] > 0 && s.sections < 1).map((s) => s.name)
    if (missing.length) { setToast({ severity: 'error', text: `분반 수가 0인 과목: ${missing.join(', ')}` }); return }
    const ctrl = new AbortController()
    abortRef.current = ctrl
    const nStudents = Object.keys(p.requests).length
    const nSections = p.subjects.reduce((a, x) => a + x.sections, 0)
    startConsole(fresh ? '처음부터 새로 배정' : minChange ? '조건만 맞추기 — 바뀌는 학생 최소' : startIdx > 0 ? `배정 실행 — ${limitText(LIMITS[startIdx])} 동안 더 오래` : '배정 실행', LIMITS[startIdx])
    log('local', `작업 "${p.title}" · 학생 ${nStudents}명 · 과목 ${p.subjects.length}개 · 분반 ${nSections}개 · 그룹 ${p.slots.join('')}`)
    const lockedSec = p.subjects.reduce((a, x) => a + (x.locked ? x.sections : x.lockedSections.filter(Boolean).length), 0)
    if (lockedSec || p.lockedStudents?.length) log('local', `고정 — 분반 ${lockedSec}개 · 학생 ${p.lockedStudents?.length || 0}명`)
    const pc = placementCheck(p)
    if (keepPrevious && pc.count) log('warn', `지금 그룹 배치로는 ${pc.count}명이 배정 불가 → 그룹 배치부터 다시 찾습니다`)
    try {
      for (let i = startIdx; i < LIMITS.length; i++) {
        const limit = LIMITS[i]
        setSolving((c) => ({ ...c, limit, stepStartedAt: Date.now() }))
        if (i > startIdx) log('warn', `해를 아직 못 찾음 → 제한 시간을 ${limitText(limit)}으로 늘려 다시 시도`)
        log('local', `서버 솔버(OR-Tools CP-SAT)에 계산 요청 · 제한 ${limitText(limit)}`)
        const input = { ...toSolverInput(p, { keepPrevious: keepPrevious && !fresh, timeLimit: limit, withHint: !fresh }), changeWeight: minChange ? 20000 : 1 }
        const r = await callSolver('solve', input, ctrl.signal, onServerEvent)
        if (r.status === 'OPTIMAL' || r.status === 'FEASIBLE') {
          let next = applySolverResult(p, r)
          // 브라우저 빠른 재배정으로 한 번 더 다듬기(그룹 배치는 그대로, 학생만)
          const polished = quickAssign(next).project
          const sNext = balanceScore(next)
          const sPol = balanceScore(polished)
          if (validateProject(polished).ok && compareScore(sPol, sNext) < 0 && sPol.hard === 0) {
            log('solution', `브라우저에서 한 번 더 다듬음 — 편차 합계 ${sNext.sum} → ${sPol.sum}`)
            next = polished
          }
          // 지금 배정이 더 좋으면 그대로 둔다(같은 설정일 때)
          if (!fresh && !minChange && validateProject(p).ok) {
            const sCur = balanceScore(p)
            const sNew = balanceScore(next)
            if (compareScore(sCur, sNew) < 0) {
              log('warn', `지금 배정(분반 편차 최대 ${sCur.worst}명 · 편차 합계 ${sCur.sum}${sCur.soft ? ` · 인원 초과 ${sCur.soft}` : ''})이 더 좋아서 그대로 둡니다`)
              finishConsole({ ok: true, canImprove: true, nextIdx: Math.min(LIMITS.length - 1, i + 1), summary: `지금 배정 유지 · 분반 편차 최대 ${sCur.worst}명 · 편차 합계 ${sCur.sum}` })
              return
            }
          }
          const v = validateProject(next)
          const fin = balanceScore(next)
          r.stats = { ...r.stats, worstSpread: fin.worst, spreadSum: fin.sum }
          next.lastSolve = { ...r.stats, status: r.status, ok: v.ok, limit, at: new Date().toISOString() }
          commit(next)
          logHub(schoolId, { action: 'sectioning_solve', targetId: projectId,
            summary: `${workLabel(p)} 분반 배정 실행 — ${v.ok ? '미배정 0명' : '검사 문제 있음'} · 분반 편차 최대 ${r.stats.worstSpread}명` })
          log(v.ok ? 'done' : 'error', v.ok ? `검사 통과 — 미배정 0명 · 시간 충돌 0건 · 교실 초과 0` : `검사에서 문제 발견 — 미배정 ${v.unassigned.length} · 충돌 ${v.conflicts.length}`)
          if (r.stats.changes) log('local', `이전 배정과 다른 학생-과목 ${r.stats.changes}건`)
          finishConsole({
            ok: v.ok,
            canImprove: r.status !== 'OPTIMAL',
            nextIdx: Math.min(LIMITS.length - 1, i + 1),
            summary: `${r.status === 'OPTIMAL' ? '최적해' : '제한 시간 안의 최선'} · 분반 편차 최대 ${r.stats.worstSpread}명 · 편차 합계 ${r.stats.spreadSum}`,
          })
          return
        }
        if (r.status === 'INVALID') {
          ;(r.problems || [r.message]).forEach((t) => log('error', t))
          finishConsole({ ok: false, summary: '입력을 고친 뒤 다시 실행하세요.' })
          return
        }
        if (r.status === 'INFEASIBLE') {
          setSolving((c) => ({ ...c, limit: null }))
          const d = await callSolver('diagnose', toSolverInput(p, { timeLimit: 30 }), ctrl.signal, onServerEvent)
          log('warn', `대안 ${d.suggestions?.length || 0}가지를 찾았습니다`)
          setSolving(null)
          setInfeasible({ diagnose: d })
          return
        }
        // UNKNOWN → 다음 제한 시간으로
      }
      setSolving((c) => ({ ...c, limit: null }))
      log('warn', '최대 시간 안에 해를 찾지 못했습니다 → 원인과 대안을 찾습니다')
      const d = await callSolver('diagnose', toSolverInput(p, { timeLimit: 60 }), ctrl.signal, onServerEvent)
      setSolving(null)
      setInfeasible({ diagnose: d })
    } catch (e) {
      if (e.name === 'AbortError') { setSolving(null) } else {
        console.error(e)
        log('error', e.message || '배정 계산에 실패했습니다.')
        finishConsole({ ok: false, summary: '계산에 실패했습니다.' })
      }
    } finally {
      abortRef.current = null
    }
  }, [project, demand, limitIdx, commit]) // eslint-disable-line react-hooks/exhaustive-deps

  /** 여러 안 만들기 — 같은 설정에서 그룹 배치가 서로 다른 안 3개 */
  const runAlternatives = useCallback(async () => {
    const p = project
    const ctrl = new AbortController()
    abortRef.current = ctrl
    const per = Math.max(30, LIMITS[limitIdx])
    startConsole('여러 안 만들기 — 그룹 배치가 서로 다른 3개 안', per)
    log('local', `안마다 제한 ${limitText(per)} · 앞 안들과 그룹 배치가 3곳 이상 다르게`)
    try {
      const r = await callSolver('alternatives', toSolverInput(p, { timeLimit: per }), ctrl.signal, (ev) => {
        onServerEvent(ev)
        if (ev.type === 'info' && ev.text.startsWith('── 안')) setSolving((c) => (c ? { ...c, stepStartedAt: Date.now() } : c))
      }, { count: 3 })
      const list = (r.alternatives || []).map((x, i) => {
        const proj = applySolverResult(p, x)
        proj.lastSolve = { ...x.stats, status: x.status, ok: validateProject(proj).ok, at: new Date().toISOString() }
        return { label: `안 ${i + 1}`, project: proj }
      })
      log('done', `${list.length}개 안을 만들었습니다`)
      setSolving(null)
      if (list.length) setAlts([{ label: '지금 작업', project: p }, ...list])
      else setToast({ severity: 'warning', text: '다른 안을 찾지 못했습니다. 먼저 배정 실행으로 해가 있는지 확인하세요.' })
    } catch (e) {
      if (e.name === 'AbortError') { setSolving(null) } else {
        console.error(e)
        log('error', e.message || '안을 만들지 못했습니다.')
        finishConsole({ ok: false, summary: '안을 만들지 못했습니다.' })
      }
    } finally {
      abortRef.current = null
    }
  }, [project, limitIdx]) // eslint-disable-line react-hooks/exhaustive-deps

  /** 브라우저 빠른 재배정(그룹 배치는 그대로, 학생만) */
  const runQuick = useCallback((base = project, reason = '') => {
    const r = quickAssign(base)
    commit(r.project)
    const sz = sectionSizes(r.project)
    const worst = Math.max(0, ...sz.filter((x) => x.length > 1).map(spreadOf))
    setToast({
      severity: r.unassigned.length ? 'warning' : 'success',
      text: `${reason}빠른 재배정 — 바뀐 학생 ${r.changed}명 · 분반 편차 최대 ${worst}명${r.unassigned.length ? ` · 배정 불가 ${r.unassigned.length}명` : ''}`,
    })
  }, [project, commit])

  const applySuggestion = (change) => {
    let p = project
    if (change.rooms) p = { ...p, rooms: change.rooms }
    if (change.maxMode) p = { ...p, maxMode: change.maxMode }
    if (change.dropSeparation !== undefined) {
      // 규칙을 지우지 않고 잠시 빼는 대신, 사용자가 확인한 뒤 지우도록 그 규칙만 제외해 다시 계산
      const rule = (p.separations || [])[change.dropSeparation]
      if (rule && window.confirm(`분리 규칙(${rule.students.join(', ')})을 지우고 다시 계산할까요? 저장 전에는 되돌리기로 복구할 수 있습니다.`)) {
        p = { ...p, separations: p.separations.filter((r) => r.id !== rule.id) }
      } else return
    }
    if (change.minMode) p = { ...p, minMode: change.minMode }
    if (change.subject) {
      const s = p.subjects.findIndex((x) => x.name === change.subject)
      if (change.sections) p = resizeSections(p, s, change.sections)
      if (change.distinctSlots === false) p = updateSubject(p, s, { distinctSlots: false })
    }
    commit(p)
    setInfeasible(null)
    runSolve({ base: p })
  }

  const doExport = async (kind) => {
    if (kind !== 'backup' && !validation.ok && !window.confirm('미배정·충돌이 남아 있습니다. 그래도 내보낼까요?')) return
    try {
      if (kind === 'neis') await exportNeis(project)
      if (kind === 'roster') await exportRoster(project)
      if (kind === 'timetable') await exportTimetable(project)
      if (kind === 'backup') exportBackup(project)
      const kindLabel = { neis: '나이스 일괄등록 양식', roster: '분반별 명단', timetable: '그룹표 요약', backup: '작업 백업' }[kind]
      logHub(schoolId, { action: 'sectioning_export', summary: `${workLabel(project)} ${kindLabel} 내려받기`, targetId: projectId })
    } catch (e) {
      console.error(e)
      setToast({ severity: 'error', text: '파일을 만들지 못했습니다.' })
    }
  }

  const toggleFull = () => {
    if (document.fullscreenElement) document.exitFullscreen()
    else document.documentElement.requestFullscreen?.().catch(() => {})
  }

  if (loadError) return <Box sx={{ p: 4 }}><Alert severity="error">{loadError}</Alert></Box>
  if (!project) return <Box sx={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.default' }}><CircularProgress /></Box>

  const totalStudents = Object.keys(project.requests).length
  const termText = project.grade && project.semester ? `${project.grade}학년 ${project.semester}학기` : project.termLabel

  const stepBadge = [
    project.excluded?.length ? { badge: `제외 ${project.excluded.length}`, badgeColor: 'default' } : {},
    validation.separationViolations.length || validation.sizeIssues.length ? { badge: validation.separationViolations.length + validation.sizeIssues.length, badgeColor: 'warning' } : {},
    validation.unassigned.length + validation.conflicts.length ? { badge: validation.unassigned.length + validation.conflicts.length, badgeColor: 'error' } : {},
    {},
  ]
  const work = {
    title: workLabel(project),
    subtitle: project.sourceFileName || project.title,
    steps: STEPS.map((label, i) => ({ key: label, label, icon: STEP_ICONS[i], active: step === i, onClick: () => setStep(i), ...stepBadge[i] })),
  }
  const header = (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
      <Typography fontWeight={800} noWrap sx={{ flexShrink: 0 }}>{workLabel(project)}</Typography>
      <Typography variant="body2" color="text.secondary" noWrap sx={{ minWidth: 0, maxWidth: 260 }} title={project.title}>{project.title}</Typography>
    </Box>
  )
  const toolbar = (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, '& .MuiButton-root': { whiteSpace: 'nowrap' } }}>
        <Tooltip placement="bottom" title={<Box sx={{ fontSize: 12.5, lineHeight: 1.7 }}>
          <b>분반 최대 인원</b> — 과목별 분반 수를 이 인원 기준(올림)으로 계산합니다. 과목마다 따로 정하려면 배정표 헤더의 '최대'.<br />
          <b>최소 인원</b> — 분반을 나눈 과목에만 적용(1분반 과목은 작아도 됨). 작은 과목을 잘게 쪼개는 대안을 막습니다.<br />
          <b>꼭 지킴</b> 절대 넘지(모자라지) 않게 · <b>가능하면</b> 넘으면 벌점 · <b>참고만</b> 계산에 쓰지 않음
        </Box>}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, bgcolor: 'action.hover', borderRadius: 2, pl: 1, pr: 0.25, height: 36, flexShrink: 0 }}>
            <Typography variant="body2" noWrap>분반 최대</Typography>
            <input type="number" min={1} value={project.maxSize}
              onChange={(e) => { const v = Math.max(1, Number(e.target.value) || 1); commit(recalcSections({ ...project, maxSize: v })) }}
              style={numStyle} />
            <Typography variant="body2">명</Typography>
            <select value={project.maxMode || 'hard'} onChange={(e) => commit({ ...project, maxMode: e.target.value })} style={selStyle}
              title="분반 최대 인원을 어떻게 다룰지">
              <option value="hard">꼭 지킴</option>
              <option value="soft">가능하면</option>
              <option value="off">참고만</option>
            </select>
            <Typography variant="body2" noWrap sx={{ ml: 0.75 }}>최소</Typography>
            <input type="number" min={0} value={project.minSize ?? ''} placeholder="—"
              onChange={(e) => commit({ ...project, minSize: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })}
              style={numStyle} />
            <Typography variant="body2">명</Typography>
            <select value={project.minMode || 'soft'} onChange={(e) => commit({ ...project, minMode: e.target.value })} style={selStyle}
              title="분반 최소 인원(분반을 나눈 과목에만 적용)을 어떻게 다룰지" disabled={!project.minSize}>
              <option value="hard">꼭 지킴</option>
              <option value="soft">가능하면</option>
              <option value="off">참고만</option>
            </select>
            <Button size="small" sx={{ fontSize: 12 }} onClick={() => commit(recalcSections(project, { force: true }))}>다시 계산</Button>
          </Box>
        </Tooltip>
        {/* 배정: 주 버튼 하나 + ▾ 메뉴(더 오래·처음부터·여러 안·초기화) */}
        <Box sx={{ display: 'flex', flexShrink: 0 }}>
          <Tooltip title="배정합니다 — 지금 배정을 출발점으로 더 좋은 해를 30초 동안 찾고, 나빠지면 지금 배정을 그대로 둡니다. 고정은 유지">
            <span><Button variant="contained" disabled={!canEdit} sx={{ borderRadius: '10px 0 0 10px' }} onClick={() => runSolve({})}>배정 실행</Button></span>
          </Tooltip>
          <Button variant="contained" disabled={!canEdit} sx={{ borderRadius: '0 10px 10px 0', px: '2px !important', minWidth: 0, borderLeft: '1px solid rgba(255,255,255,0.35)' }}
            onClick={(e) => setSolveMenu(e.currentTarget)}><ArrowDropDownIcon /></Button>
        </Box>
        <Menu anchorEl={solveMenu} open={!!solveMenu} onClose={() => setSolveMenu(null)}>
          <MenuItem onClick={() => { setSolveMenu(null); runSolve({ startIdx: 1 }) }}>더 오래 찾기 — 2분</MenuItem>
          <MenuItem onClick={() => { setSolveMenu(null); runSolve({ startIdx: 2 }) }}>더 오래 찾기 — 5분</MenuItem>
          <MenuItem onClick={() => { setSolveMenu(null); runSolve({ minChange: true }) }}>
            조건만 맞추기 — 지금 배정에서 바뀌는 학생 최소 (분리 규칙·인원 조건 추가 후)
          </MenuItem>
          <MenuItem onClick={() => { setSolveMenu(null); runSolve({ fresh: true }) }}>처음부터 새로 배정 (지금 배정 무시)</MenuItem>
          <Divider />
          <MenuItem onClick={() => { setSolveMenu(null); runAlternatives() }}>여러 안 만들어 비교 (3개)</MenuItem>
          <Divider />
          <MenuItem sx={{ color: 'error.main' }} onClick={() => {
            setSolveMenu(null)
            if (window.confirm('그룹 배치와 학생 배정, 고정을 모두 지웁니다. 신청 데이터와 과목 설정(최대 인원·분반 수)은 그대로입니다.\n저장 전까지는 되돌리기(↶)로 돌아갈 수 있습니다. 초기화할까요?')) {
              commit(resetAssignment(project))
              logHub(schoolId, { action: 'sectioning_reset', summary: `${workLabel(project)} 분반 배정 초기화(저장 전)`, targetId: projectId })
              setToast({ severity: 'info', text: '배정을 초기화했습니다. 배정 실행을 누르세요.' })
            }
          }}>배정 초기화</MenuItem>
        </Menu>
        <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />
        <Tooltip title="되돌리기 (Ctrl+Z)"><span><IconButton size="small" disabled={!history.length} onClick={undo}><UndoIcon /></IconButton></span></Tooltip>
        <Tooltip title="작업명을 고치고 저장, 버전으로도 남기기 (Ctrl+S는 바로 저장)">
          <span><Button variant={dirty ? 'outlined' : 'text'} color={dirty ? 'primary' : 'inherit'} disabled={saving || !canEdit} onClick={() => setSaveOpen(true)} sx={{ whiteSpace: 'nowrap' }}>
            {saving ? '저장 중…' : dirty ? '저장' : '저장됨'}
          </Button></span>
        </Tooltip>
        <Tooltip title="저장할 때 남긴 버전을 골라 불러옵니다">
          <Button color="inherit" onClick={() => setVersionsOpen(true)} sx={{ whiteSpace: 'nowrap' }}>불러오기</Button>
        </Tooltip>
        <Tooltip title={isFull ? '전체화면 끝내기' : '전체화면'}>
          <IconButton size="small" onClick={toggleFull}>{isFull ? <FullscreenExitIcon /> : <FullscreenIcon />}</IconButton>
        </Tooltip>
    </Box>
  )

  return (
    <AppShell work={work} header={header} toolbar={toolbar} fill>
      {/* ── 단계 제목 + 상태 ── */}
      <Box sx={{ height: 40, flexShrink: 0, display: 'flex', alignItems: 'center', px: 2, bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}>
        <Typography fontWeight={800} color="primary" sx={{ mr: 2 }}>{STEPS[step]}</Typography>
        {!canEdit && <Chip size="small" variant="outlined" label="열람 전용 — 바꾼 내용은 저장되지 않습니다" />}
        <Box sx={{ flex: 1 }} />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, pr: 1, '& .MuiChip-root': { height: 24 } }}>
          <Typography variant="body2" color="text.secondary" noWrap>학생 {totalStudents}명</Typography>
          <Tooltip title={validation.unassigned.length
            ? unassignedBySubject(project).map((u) => `${u.name} ${u.count}명`).join(' · ') + ' — 누르면 학생별 배정'
            : '미배정 학생이 없습니다'}>
            <Chip size="small" label={`미배정 ${validation.unassigned.length}`} color={validation.unassigned.length ? 'error' : 'success'}
              onClick={validation.unassigned.length ? () => setStep(2) : undefined} />
          </Tooltip>
          {validation.conflicts.length > 0 && <Chip size="small" color="error" label={`충돌 ${validation.conflicts.length}`} />}
          {validation.roomOverflow.length > 0 && <Chip size="small" color="warning" label={`교실 초과 ${validation.roomOverflow.map((x) => `${project.slots[x.slot]}(${x.used}/${x.rooms})`).join(' ')}`} />}
          {validation.sameSlot.length > 0 && <Chip size="small" color="warning" label={`같은 그룹 분반 ${validation.sameSlot.length}과목`} />}
          {validation.separationViolations.length > 0 && (
            <Tooltip title={validation.separationViolations.map((v) => `${project.subjects[v.s].name}: ${v.students.join('·')}`).join(', ')}>
              <Chip size="small" color="error" label={`분리 위반 ${validation.separationViolations.length}곳`} />
            </Tooltip>
          )}
          {validation.sizeIssues.length > 0 && (
            <Tooltip title={validation.sizeIssues.map((x) => `${project.subjects[x.s].name} ${project.slots[project.subjects[x.s].slotBySection[x.k]] ?? ''} ${x.size}명(${x.kind === 'over' ? '최대' : '최소'} ${x.limit})`).join(', ')}>
              <Chip size="small" color="warning" label={`인원 조건 밖 ${validation.sizeIssues.length}반`} />
            </Tooltip>
          )}
          <Tooltip title="분반 편차 = 한 과목 안에서 가장 큰 분반과 가장 작은 분반의 인원 차. 모든 과목 중 가장 큰 값">
            <Chip size="small" variant="outlined" label={`분반 편차 최대 ${worstSpread}명`}
              color={worstSpread <= 1 ? 'success' : worstSpread <= 2 ? 'warning' : 'error'} />
          </Tooltip>
        </Box>
      </Box>

      {/* ── 본문 ── */}
      <Box sx={{ flex: 1, minHeight: 0 }}>
        {step === 0 && <DataStep project={project} onChange={commit} onNext={() => setStep(1)} />}
        {step === 1 && (
          <SlotGrid project={project} sizes={sizes} demand={demand} validation={validation}
            selectedSection={selectedSection} onSelectSection={setSelectedSection} onChange={commit} onQuick={runQuick} />
        )}
        {step === 2 && (
          <StudentStep project={project} validation={validation} selectedSection={selectedSection}
            onSelectSection={setSelectedSection} onChange={commit} />
        )}
        {step === 3 && <ExportStep validation={validation} onExport={doExport} />}
      </Box>

      <SolveConsole console={solving} onCancel={() => abortRef.current?.abort()} onClose={() => setSolving(null)}
        onImprove={() => { const idx = solving?.done?.nextIdx ?? 1; setSolving(null); runSolve({ startIdx: idx }) }} />
      <InfeasibleDialog info={infeasible} project={project} onApply={applySuggestion} onClose={() => setInfeasible(null)} />
      <AlternativesDialog items={alts} onClose={() => setAlts(null)}
        onApply={(r) => { commit(r.project); setAlts(null); setToast({ severity: 'success', text: `${r.label}을 적용했습니다. 저장하면 확정됩니다.` }) }}
        onSaveVersion={async (r) => {
          try { await saveVersion(schoolId, projectId, `${r.label} (여러 안)`, r.project, user); setToast({ severity: 'success', text: `${r.label}을 버전으로 저장했습니다.` }) } catch (e) { console.error(e); setToast({ severity: 'error', text: '버전을 저장하지 못했습니다.' }) }
        }} />
      {versionsOpen && (
        <VersionDialog projectId={projectId} onClose={() => setVersionsOpen(false)}
          onRestore={(data, name) => { commit(normalizeProject({ ...project, ...data, title: project.title })); setVersionsOpen(false); setToast({ severity: 'info', text: `"${name}"을 불러왔습니다. 저장하면 확정됩니다.` }) }} />
      )}
      {saveOpen && (
        <SaveDialog project={project} onClose={() => setSaveOpen(false)} onSave={save}
          summary={`${new Date().toLocaleDateString('ko-KR')} · 분반 ${project.subjects.reduce((a2, x) => a2 + x.sections, 0)}개 · 편차 최대 ${worstSpread}명`} />
      )}
      <Snackbar open={!!toast} autoHideDuration={4000} onClose={() => setToast(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        {toast ? <Alert severity={toast.severity} onClose={() => setToast(null)} variant="filled">{toast.text}</Alert> : <span />}
      </Snackbar>
    </AppShell>
  )
}
