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
import EditIcon from '@mui/icons-material/EditOutlined'
import { useAuth } from '@shared/contexts/AuthContext'
import {
  demandOf, sectionSizes, validateProject, toSolverInput, applySolverResult, resizeSections, updateSubject, spreadOf,
  normalizeProject, recalcSections, placementCheck, quickAssign, balanceScore, compareScore, resetAssignment, unassignedBySubject,
  makeSolveLog, pushSolveLog, setStudentPicks, SOLVE_LOG_LINES, hasFree, fillNames, studentLabel,
} from '@shared/lib/sectioning'
import { watchProject, saveProject, saveProjectInfo, saveVersion } from '../lib/projectStore'
import { callSolver } from '../lib/solverApi'
import { loadHubNames } from '../lib/hubStudents'
import { exportNeis, exportRoster, exportTimetable, exportBackup, exportMeeting } from '../lib/exporters'
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
import SolveLogPanel from '../components/SolveLogPanel'
import WorkInfoDialog from '../components/WorkInfoDialog'
import MergeInfoDialog from '../components/MergeInfoDialog'
import MeetingPrint from '../components/MeetingPrint'
import DescriptionIcon from '@mui/icons-material/DescriptionOutlined'
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
  const { user, userName, schoolId } = useAuth()
  const { canEdit } = useHubRoles()
  const [project, setProject] = useState(null)
  // 공동 작업: base = 내가 따라가고 있는 저장본(합치기 기준), live = 서버 최신 저장본
  const [base, setBase] = useState(null)       // { project, revision }
  const [live, setLive] = useState(null)       // { project, revision, updatedByName, updatedAt }
  const [dirty, setDirty] = useState(false)
  const [history, setHistory] = useState([])
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [mergeInfo, setMergeInfo] = useState(null)
  const [selectedSection, setSelectedSection] = useState(null)
  const limitIdx = 0
  const [solveMenu, setSolveMenu] = useState(null)
  const canEditRef = useRef(false)
  canEditRef.current = canEdit
  const [saveOpen, setSaveOpen] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)
  const [solving, setSolving] = useState(null)   // 계산 콘솔 상태(SolveConsole)
  const [alts, setAlts] = useState(null)
  const [infeasible, setInfeasible] = useState(null)
  const [versionsOpen, setVersionsOpen] = useState(false)
  const [isFull, setIsFull] = useState(!!document.fullscreenElement)
  const [step, setStep] = useState(0)
  const [logOpen, setLogOpen] = useState(true)
  const [printing, setPrinting] = useState(false)
  const [meetingMenu, setMeetingMenu] = useState(null)
  const abortRef = useRef(null)
  const forceRef = useRef(false)   // 버전을 불러온 뒤 저장 — 합치지 않고 그 상태 그대로
  const byName = userName || user?.displayName || user?.email || ''

  // 되돌리기 기록은 ref로 현재 값을 잡아 둔다(상태 갱신 함수 안에서 다른 상태를 바꾸지 않도록)
  const projectRef = useRef(null)
  projectRef.current = project
  const baseRef = useRef(null)
  baseRef.current = base
  const dirtyRef = useRef(false)
  dirtyRef.current = dirty

  // StudentHub에서 찾은 학생 이름 — 원본 파일에 이름이 없는 학생만. 서버 저장본에도 덧입혀 '수정함'으로 잡히지 않게 한다
  const hubNamesRef = useRef({})
  const [hubLoaded, setHubLoaded] = useState(false)

  // 작업 문서 실시간 구독 — 처음 한 번은 그대로 연다
  useEffect(() => {
    let first = true
    return watchProject(schoolId, projectId, (snap) => {
      if (!snap) { setLoadError('작업을 찾을 수 없습니다. 다른 선생님이 지웠을 수 있습니다.'); return }
      const np = fillNames(normalizeProject(snap.data), hubNamesRef.current)
      setLive({ project: np, revision: snap.revision, updatedByName: snap.updatedByName, updatedAt: snap.updatedAt })
      if (first) {
        first = false
        setProject(np)
        setBase({ project: np, revision: snap.revision })
        // 이미 배정한 작업이면 2단계부터
        setStep(Object.values(np.assignment || {}).some((a) => a.some((k) => k !== null)) ? 1 : 0)
      }
    }, (e) => { console.error(e); setLoadError('작업을 불러오지 못했습니다.') })
  }, [schoolId, projectId])

  // 저장 안 한 수정이 없으면(배정 계산 중이 아니면) 다른 사람이 저장한 최신본을 따라간다
  useEffect(() => {
    if (!live || !base || dirty || solving) return
    if (live.revision === base.revision) return
    setProject(live.project)
    setBase({ project: live.project, revision: live.revision })
    setHistory([])
    setToast({ severity: 'info', text: `${live.updatedByName || '다른 선생님'}이(가) 저장한 내용을 반영했습니다.` })
  }, [live, base, dirty, solving])

  // 처음 연 뒤 한 번 — 이름 없는 학생을 StudentHub 학적에서 찾아 함께 보인다(저장하면 작업에도 남는다)
  useEffect(() => {
    if (!project || hubLoaded) return
    setHubLoaded(true)
    loadHubNames(schoolId, project).then((names) => {
      const n = Object.keys(names).length
      if (!n) return
      hubNamesRef.current = names
      const add = (p) => (p ? fillNames(p, names) : p)
      projectRef.current = add(projectRef.current)
      setProject(add)
      setBase((b) => (b ? { ...b, project: add(b.project) } : b))
      setLive((l) => (l ? { ...l, project: add(l.project) } : l))
      setHistory((h) => h.map(add))
      setToast({ severity: 'info', text: `StudentHub에서 학생 이름 ${n}명을 불러왔습니다.` })
    }).catch((e) => console.warn('StudentHub 이름을 불러오지 못했습니다.', e))
  }, [project, hubLoaded, schoolId])

  useEffect(() => { if (project?.title) document.title = `${project.title} · 분반 배정` }, [project?.title])

  const commit = useCallback((next) => {
    const prev = projectRef.current
    if (prev) setHistory((h) => [...h.slice(-29), prev])
    projectRef.current = next
    setProject(next)
    setDirty(true)
  }, [])

  // 빠르게 여러 번 눌러도 한 단계씩 정확히 되돌리도록 기록을 ref로도 들고 있는다. 배정 기록(로그)은 되돌리지 않는다
  const historyRef = useRef([])
  historyRef.current = history
  const undo = useCallback(() => {
    const h = historyRef.current
    if (!h.length) return
    const last = { ...h[h.length - 1], solveLogs: projectRef.current?.solveLogs || [] }
    historyRef.current = h.slice(0, -1)
    setHistory(historyRef.current)
    projectRef.current = last
    setProject(last)
    setDirty(true)
  }, [])

  /** 저장 안 한 수정 버리고 최신 저장본으로 */
  const discard = useCallback(() => {
    if (!live) return
    setProject(live.project)
    setBase({ project: live.project, revision: live.revision })
    setHistory([])
    setDirty(false)
    forceRef.current = false
  }, [live])

  const labelOf = useCallback((sid) => studentLabel(projectRef.current, sid), [])

  /** 저장. 다른 사람이 먼저 저장했으면 합쳐서 저장한다. versionName이 오면 같은 상태를 버전으로도 남긴다 */
  const save = useCallback(async ({ versionName } = {}) => {
    if (!project || saving || !baseRef.current) return false
    setSaving(true)
    let ok = false
    try {
      const b = baseRef.current
      const r = await saveProject(schoolId, projectId, {
        base: b.project, mine: project, baseRevision: b.revision, user, labelOf, force: forceRef.current,
      })
      const saved = normalizeProject(r.project)
      // 저장하는 동안 더 고쳤으면 그 수정은 남긴다(다시 저장 필요)
      const changedMeanwhile = projectRef.current !== project
      if (!changedMeanwhile) { projectRef.current = saved; setProject(saved) }
      setBase({ project: saved, revision: r.revision })
      setDirty(changedMeanwhile)
      forceRef.current = false
      if (versionName) await saveVersion(schoolId, projectId, versionName, saved, user)
      logHub(schoolId, { action: 'sectioning_save', summary: `${workLabel(saved)} 분반 배정 저장${r.merged ? ' (다른 선생님 저장본과 합침)' : ''}${versionName ? ` · 버전 "${versionName}"` : ''}`, targetId: projectId })
      if (r.merged) {
        const v = validateProject(saved)
        setMergeInfo({ byName: r.byName, conflicts: r.conflicts, unassigned: v.unassigned.length, clashes: v.conflicts.length })
      } else {
        setToast({ severity: 'success', text: versionName ? `저장했습니다 · 버전 "${versionName}"` : '저장했습니다.' })
      }
      ok = true
    } catch (e) {
      console.error(e)
      setToast({ severity: 'error', text: e.message?.includes('삭제') ? e.message : '저장하지 못했습니다. 네트워크를 확인하세요.' })
    }
    setSaving(false)
    return ok
  }, [project, saving, schoolId, projectId, user, labelOf])

  /** 작업 정보(이름·학년도·묶음)만 바로 저장 — 다른 수정은 그대로 둔다 */
  const saveInfo = useCallback(async (patch) => {
    const rev = await saveProjectInfo(schoolId, projectId, patch, user)
    const apply = (p) => (p ? { ...p, ...patch } : p)
    projectRef.current = apply(projectRef.current)
    setProject(apply)
    // 그 사이 다른 사람 저장이 없었으면(rev = 내 기준 + 1) 기준 revision도 올린다 — 내 저장을 남의 저장으로 착각하지 않게
    setBase((b) => (b ? { project: apply(b.project), revision: b.revision === rev - 1 ? rev : b.revision } : b))
    setHistory((h) => h.map(apply))
    logHub(schoolId, { action: 'sectioning_save', summary: `${workLabel({ ...project, ...patch })} 작업 정보 변경 — ${patch.title}`, targetId: projectId })
    setToast({ severity: 'success', text: '작업 정보를 저장했습니다.' })
  }, [schoolId, projectId, user, project])

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
  // before: 실행할 때의 작업(배정 기록의 설정 요약에 쓴다)
  const startConsole = (title, limit, before = projectRef.current) => {
    const now = Date.now()
    setSolving({ title, startedAt: now, stepStartedAt: now, limit, logs: [], best: null, points: [], done: null, before })
  }
  const log = (type, text) => setSolving((c) => (c ? { ...c, logs: [...c.logs.slice(-SOLVE_LOG_LINES), { t: Date.now() - c.startedAt, type, text }] } : c))
  const onServerEvent = (ev) => setSolving((c) => {
    if (!c) return c
    const t = Date.now() - c.startedAt
    const next = { ...c, logs: [...c.logs.slice(-SOLVE_LOG_LINES), { t, type: ev.type, text: ev.text }] }
    if (ev.type === 'solution' && ev.worst !== undefined) {
      next.best = { n: (c.best?.n || 0) + 1, worst: ev.worst, sum: ev.sum }
      next.points = [...c.points, { t: t / 1000, sum: ev.sum, worst: ev.worst }]
    }
    return next
  })
  // done.close: 기록만 남기고 콘솔은 바로 닫는다(해 없음 → 대안 창, 여러 안 → 비교 창)
  // done.result: 실행 결과가 지금 작업에 반영됨(기록에 과목별 분반 인원을 남긴다)
  const finishConsole = (done) => setSolving((c) => (c ? { ...c, done: { at: Date.now(), ...done } } : c))

  // 실행이 끝나면 배정 기록(로그)을 작업에 붙인다 — 저장할 때 함께 저장되고, 되돌리기로 지워지지 않는다
  useEffect(() => {
    if (!solving?.done || solving.archived) return
    const cur = projectRef.current
    if (!cur) return
    const entry = makeSolveLog(solving.before || cur, solving, { byName, after: solving.done.result ? cur : null })
    const next = pushSolveLog(cur, entry)
    projectRef.current = next
    setProject(next)
    setDirty(true)
    setLogOpen(true)
    if (solving.done.close) setSolving(null)
    else setSolving((c) => (c ? { ...c, archived: true } : c))
  }, [solving, byName])

  /** 해가 없을 때 진단 결과 — 기록에 남기고 대안 창을 연다 */
  const finishDiagnose = (d) => {
    const nm = (id) => labelOf(String(id))
    if (d.unassigned?.length) log('warn', `조건을 그대로 두면 최소 ${d.unassigned.length}명이 남습니다: ${d.unassigned.map((u) => nm(u.id)).join(', ')}`)
    log('warn', `대안 ${d.suggestions?.length || 0}가지를 찾았습니다`)
    for (const s of d.suggestions || []) log('local', `대안: ${s.label} → 분반 편차 최대 ${s.worstSpread}명`)
    for (const s of d.studentSuggestions || []) {
      log('local', `학생 과목 조정 제안: ${nm(s.id)} ${s.from} → ${s.to}${s.verified ? ' (전체 배정 가능 확인)' : ' (빠른 판정만)'}`)
    }
    finishConsole({
      ok: false, close: true,
      summary: `해 없음 — 최소 미배정 ${d.minUnassigned ?? '?'}명 · 대안 ${d.suggestions?.length || 0}가지 · 학생 조정 제안 ${d.studentSuggestions?.length || 0}건`,
    })
    setInfeasible({ diagnose: d })
  }

  /** 배정 실행. keepPrevious: 지금 배정을 기준으로 바뀌는 학생을 줄인다(고정은 항상 유지) */
  const runSolve = useCallback(async ({ keepPrevious = true, startIdx = limitIdx, base = project, fresh = false, minChange = false } = {}) => {
    const p = base
    const missing = p.subjects.filter((s, i) => demand[i] > 0 && s.sections < 1).map((s) => s.name)
    if (missing.length) { setToast({ severity: 'error', text: `분반 수가 0인 과목: ${missing.join(', ')}` }); return }
    const ctrl = new AbortController()
    abortRef.current = ctrl
    const nStudents = Object.keys(p.requests).length
    const nSections = p.subjects.reduce((a, x) => a + x.sections, 0)
    startConsole(fresh ? '처음부터 새로 배정' : minChange ? '조건만 맞추기 — 바뀌는 학생 최소' : startIdx > 0 ? `배정 실행 — ${limitText(LIMITS[startIdx])} 동안 더 오래` : '배정 실행', LIMITS[startIdx], p)
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
              finishConsole({ ok: true, result: true, canImprove: true, nextIdx: Math.min(LIMITS.length - 1, i + 1), summary: `지금 배정 유지 · 분반 편차 최대 ${sCur.worst}명 · 편차 합계 ${sCur.sum}` })
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
            result: true,
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
          finishDiagnose(d)
          return
        }
        // UNKNOWN → 다음 제한 시간으로
      }
      setSolving((c) => ({ ...c, limit: null }))
      log('warn', '최대 시간 안에 해를 찾지 못했습니다 → 원인과 대안을 찾습니다')
      const d = await callSolver('diagnose', toSolverInput(p, { timeLimit: 60 }), ctrl.signal, onServerEvent)
      finishDiagnose(d)
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
      list.forEach((x) => log('local', `${x.label}: 분반 편차 최대 ${x.project.lastSolve?.worstSpread ?? '-'}명 · 편차 합계 ${x.project.lastSolve?.spreadSum ?? '-'}`))
      finishConsole({ ok: list.length > 0, close: true, summary: `여러 안 ${list.length}개` })
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
      if (rule && window.confirm(`분리 규칙(${rule.students.map(labelOf).join(', ')})을 지우고 다시 계산할까요? 저장 전에는 되돌리기로 복구할 수 있습니다.`)) {
        p = { ...p, separations: p.separations.filter((r) => r.id !== rule.id) }
      } else return
    }
    if (change.minMode) p = { ...p, minMode: change.minMode }
    if ('freeMax' in change) p = { ...p, freeMax: change.freeMax }
    if (change.subject) {
      const s = p.subjects.findIndex((x) => x.name === change.subject)
      if (change.sections) p = resizeSections(p, s, change.sections)
      if (change.distinctSlots === false) p = updateSubject(p, s, { distinctSlots: false })
    }
    commit(p)
    setInfeasible(null)
    runSolve({ base: p })
  }

  /** 학생 과목 조정 제안 적용 — 같은 칸막이의 다른 과목으로 바꾸고 다시 계산(학생 상담 뒤 확정) */
  const applyStudentChange = (sg) => {
    const p = project
    const sid = String(sg.id)
    const from = p.subjects.findIndex((x) => x.name === sg.from)
    const to = p.subjects.findIndex((x) => x.name === sg.to)
    const subs = p.requests[sid]
    if (!subs || from < 0 || to < 0 || !subs.includes(from)) { setToast({ severity: 'error', text: '제안을 적용할 수 없습니다(신청 데이터가 바뀜).' }); return }
    if (!window.confirm(`${labelOf(sid)} 학생의 과목을 바꿉니다.\n${sg.from} → ${sg.to}\n\n학생·학부모 상담으로 확정한 뒤 적용하세요. 저장 전에는 되돌리기(↶)로 돌아갈 수 있습니다.`)) return
    const next = setStudentPicks(p, sid, subs.map((s) => (s === from ? to : s)))
    commit(next)
    logHub(schoolId, { action: 'sectioning_student_change', targetId: projectId,
      summary: `${workLabel(p)} 학생 과목 조정(저장 전) — ${labelOf(sid)} ${sg.from} → ${sg.to}` })
    setInfeasible(null)
    runSolve({ base: next })
  }

  const doExport = async (kind) => {
    // 회의 자료는 진행 중인 배정을 보여 주는 용도라 미배정이 있어도 묻지 않는다
    if (!['backup', 'meeting', 'meetingPrint'].includes(kind) && !validation.ok && !window.confirm('미배정·충돌이 남아 있습니다. 그래도 내보낼까요?')) return
    try {
      if (kind === 'meeting') await exportMeeting(project)
      if (kind === 'meetingPrint') setPrinting(true)
      if (kind === 'neis') await exportNeis(project)
      if (kind === 'roster') await exportRoster(project)
      if (kind === 'timetable') await exportTimetable(project)
      if (kind === 'backup') exportBackup(project)
      const kindLabel = { neis: '나이스 일괄등록 양식', roster: '분반별 명단', timetable: '그룹표 요약', backup: '작업 백업', meeting: '회의 자료(엑셀)', meetingPrint: '회의 자료 인쇄(PDF)' }[kind]
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
  // 수정 중에 다른 사람이 저장함 — 저장하면 합쳐진다
  const behind = dirty && live && base && live.revision !== base.revision

  const stepBadge = [
    project.excluded?.length ? { badge: `제외 ${project.excluded.length}`, badgeColor: 'default' } : {},
    validation.separationViolations.length || validation.sizeIssues.length ? { badge: validation.separationViolations.length + validation.sizeIssues.length, badgeColor: 'warning' } : {},
    validation.unassigned.length + validation.conflicts.length ? { badge: validation.unassigned.length + validation.conflicts.length, badgeColor: 'error' } : {},
    {},
  ]
  const work = {
    title: project.title || workLabel(project),
    subtitle: workLabel(project),
    steps: STEPS.map((label, i) => ({ key: label, label, icon: STEP_ICONS[i], active: step === i, onClick: () => setStep(i), ...stepBadge[i] })),
  }
  const header = (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
      <Tooltip title={canEdit ? '작업명·학년도·학년·학기·묶음 고치기' : ''}>
        <Box onClick={canEdit ? () => setInfoOpen(true) : undefined}
          sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, cursor: canEdit ? 'pointer' : 'default', borderRadius: 1, px: 0.5, '&:hover': canEdit ? { bgcolor: 'action.hover' } : {} }}>
          <Typography fontWeight={800} noWrap sx={{ minWidth: 0, maxWidth: 380 }} title={project.title}>{project.title || workLabel(project)}</Typography>
          <Typography variant="body2" color="text.secondary" noWrap sx={{ flexShrink: 0 }}>{workLabel(project)}</Typography>
          {canEdit && <EditIcon sx={{ fontSize: 16, color: 'text.secondary', flexShrink: 0 }} />}
        </Box>
      </Tooltip>
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
        {hasFree(project) && (
          <Tooltip title="그룹마다 공강(수업 없는) 학생이 이 인원을 넘지 않게 배정합니다(꼭 지킴). 비우면 제한 없음. 자습 감독·공간에 맞춰 정하세요">
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, bgcolor: '#fff7e0', borderRadius: 2, px: 1, height: 36, flexShrink: 0 }}>
              <Typography variant="body2" noWrap>공강 최대</Typography>
              <input type="number" min={0} value={project.freeMax ?? ''} placeholder="—" className="cf-num"
                onChange={(e) => commit({ ...project, freeMax: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })}
                style={numStyle} />
              <Typography variant="body2">명</Typography>
            </Box>
          </Tooltip>
        )}
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
        <Tooltip title="저장하고 원하면 버전으로도 남깁니다(Ctrl+S는 바로 저장). 다른 선생님이 먼저 저장했으면 합쳐서 저장합니다">
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
    <AppShell work={work} header={header} toolbar={toolbar} fill autoCollapse={step === 1}>
      {/* ── 단계 제목 + 상태 ── */}
      <Box sx={{ height: 40, flexShrink: 0, display: 'flex', alignItems: 'center', px: 2, bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}>
        <Typography fontWeight={800} color="primary" sx={{ mr: 2 }}>{STEPS[step]}</Typography>
        {step === 1 && (
          <>
            <Tooltip title="배정표 전체(그룹 × 과목)와 과목·그룹 요약을 회의 자료로 내려받습니다">
              <Button size="small" variant="outlined" startIcon={<DescriptionIcon />} endIcon={<ArrowDropDownIcon />} sx={{ mr: 1.5, height: 28 }}
                onClick={(e) => setMeetingMenu(e.currentTarget)}>회의 자료</Button>
            </Tooltip>
            <Menu anchorEl={meetingMenu} open={!!meetingMenu} onClose={() => setMeetingMenu(null)}>
              <MenuItem onClick={() => { setMeetingMenu(null); doExport('meetingPrint') }}>PDF로 인쇄 (A4 가로) — 인쇄 창에서 「PDF로 저장」</MenuItem>
              <MenuItem onClick={() => { setMeetingMenu(null); doExport('meeting') }}>엑셀로 내려받기 — 배정표·요약·분반별 명단</MenuItem>
            </Menu>
          </>
        )}
        {!canEdit && <Chip size="small" variant="outlined" label="열람 전용 — 바꾼 내용은 저장되지 않습니다" />}
        {behind && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Chip size="small" color="info" label={`${live.updatedByName || '다른 선생님'}이(가) 저장함 — 저장하면 합쳐집니다`} />
            <Button size="small" onClick={() => { if (window.confirm('저장하지 않은 내 수정을 버리고 최신 저장본을 볼까요?')) discard() }}>내 수정 버리고 최신본 보기</Button>
          </Box>
        )}
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
            <Tooltip title={validation.separationViolations.map((v) => `${project.subjects[v.s].name}: ${v.students.map(labelOf).join('·')}`).join(', ')}>
              <Chip size="small" color="error" label={`분리 위반 ${validation.separationViolations.length}곳`} />
            </Tooltip>
          )}
          {validation.freeOver.length > 0 && (
            <Tooltip title={validation.freeOver.map((x) => `${project.slots[x.slot]}그룹 공강 ${x.free}명(최대 ${x.limit})`).join(', ')}>
              <Chip size="small" color="warning" label={`공강 초과 ${validation.freeOver.length}그룹`} />
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
          <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <Box sx={{ flex: 1, minHeight: 0 }}>
              <SlotGrid project={project} sizes={sizes} demand={demand} validation={validation}
                selectedSection={selectedSection} onSelectSection={setSelectedSection} onChange={commit} onQuick={runQuick} />
            </Box>
            <SolveLogPanel project={project} open={logOpen} onToggle={() => setLogOpen((v) => !v)}
              onExported={(how, entry) => logHub(schoolId, { action: 'sectioning_export', targetId: projectId, summary: `${workLabel(project)} 배정 기록 ${how} — ${entry.title}` })} />
          </Box>
        )}
        {step === 2 && (
          <StudentStep project={project} validation={validation} selectedSection={selectedSection}
            onSelectSection={setSelectedSection} onChange={commit} />
        )}
        {step === 3 && <ExportStep validation={validation} onExport={doExport} />}
      </Box>

      <SolveConsole console={solving} onCancel={() => abortRef.current?.abort()} onClose={() => setSolving(null)}
        onImprove={() => { const idx = solving?.done?.nextIdx ?? 1; setSolving(null); runSolve({ startIdx: idx }) }} />
      <InfeasibleDialog info={infeasible} project={project} onApply={applySuggestion} onApplyStudent={applyStudentChange}
        labelOf={labelOf} canEdit={canEdit} onClose={() => setInfeasible(null)} />
      <MergeInfoDialog info={mergeInfo} onClose={() => setMergeInfo(null)} />
      {printing && <MeetingPrint project={project} onDone={() => setPrinting(false)} />}
      {infoOpen && (
        <WorkInfoDialog project={project} onClose={() => setInfoOpen(false)}
          onSave={async (patch) => { await saveInfo(patch); setInfoOpen(false) }} />
      )}
      <AlternativesDialog items={alts} onClose={() => setAlts(null)}
        onApply={(r) => { commit(r.project); setAlts(null); setToast({ severity: 'success', text: `${r.label}을 적용했습니다. 저장하면 확정됩니다.` }) }}
        onSaveVersion={async (r) => {
          try { await saveVersion(schoolId, projectId, `${r.label} (여러 안)`, r.project, user); setToast({ severity: 'success', text: `${r.label}을 버전으로 저장했습니다.` }) } catch (e) { console.error(e); setToast({ severity: 'error', text: '버전을 저장하지 못했습니다.' }) }
        }} />
      {versionsOpen && (
        <VersionDialog projectId={projectId} onClose={() => setVersionsOpen(false)}
          onRestore={(data, name) => {
            // 작업 정보·배정 기록은 지금 것을 두고 배정 상태만 그 버전으로. 저장하면 합치지 않고 이 상태 그대로 저장한다
            const keep = { title: project.title, year: project.year, grade: project.grade, semester: project.semester,
              entryYear: project.entryYear, folder: project.folder, solveLogs: project.solveLogs }
            commit(normalizeProject({ ...project, ...data, ...keep }))
            forceRef.current = true
            setVersionsOpen(false)
            setToast({ severity: 'info', text: `"${name}"을 불러왔습니다. 저장하면 이 상태로 확정됩니다(다른 선생님의 저장 전 수정과 합치지 않음).` })
          }} />
      )}
      {saveOpen && (
        <SaveDialog behindBy={behind ? (live.updatedByName || '다른 선생님') : ''} onClose={() => setSaveOpen(false)} onSave={save}
          summary={`${new Date().toLocaleDateString('ko-KR')} · 분반 ${project.subjects.reduce((a2, x) => a2 + x.sections, 0)}개 · 편차 최대 ${worstSpread}명`} />
      )}
      <Snackbar open={!!toast} autoHideDuration={4000} onClose={() => setToast(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        {toast ? <Alert severity={toast.severity} onClose={() => setToast(null)} variant="filled">{toast.text}</Alert> : <span />}
      </Snackbar>
    </AppShell>
  )
}
