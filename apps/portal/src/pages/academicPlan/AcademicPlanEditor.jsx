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
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import FullscreenIcon from '@mui/icons-material/Fullscreen'
import ShareIcon from '@mui/icons-material/Share'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import Popover from '@mui/material/Popover'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import SaveAsIcon from '@mui/icons-material/SaveAs'
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit'
import HistoryIcon from '@mui/icons-material/History'
import PrintIcon from '@mui/icons-material/Print'
import EventAvailableIcon from '@mui/icons-material/EventAvailable'
import CompareArrowsIcon from '@mui/icons-material/CompareArrows'
import CloudUploadIcon from '@mui/icons-material/CloudUpload'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import { useAuth } from '@shared/contexts/AuthContext'
import { functions } from '@shared/lib/firebase'
import {
  GRADES, SCHOOL_WEEKDAYS, addConfirmation, addDays, buildWeekRows, diffEvents, mondayIndex, computeStats, importPrevCards, isEventLocked, mergeDeptColors,
  isTrayEvent, markFrameEvents, placeTrayEvent, planStage, relockEvents, rowsForSemester, sameWeekdayNextYear, shiftEvent, splitExamEvent, unscheduleEvent,
  yearRange,
} from '@shared/lib/academicPlan'
import PlanGrid from './PlanGrid'
import PlanStatsPanel from './PlanStatsPanel'
import EventDialog from './EventDialog'
import VersionDrawer from './VersionDrawer'
import TrayPanel from './TrayPanel'
import DeptColorDialog from './DeptColorDialog'
import useStaffDirectory from './useStaffDirectory'
import {
  confirmPlan, createPlan, loadChangesSince, loadPrevYear, loadVersionData, renamePlan, saveDeptColors, savePlan, setActivePlan, subscribePlan, subscribePlans, subscribeYear,
  unconfirmPlan,
} from './planRepo'
import { downloadPlanPdf, printPlan } from './academicPlanPrint'
import { downloadPlanXlsx } from './academicPlanXlsx'
import { ACCENT } from './planUi'
import StageBar from './StageBar'
import ChangesSinceBanner from './ChangesSinceBanner'
import PresenceAvatars from './PresenceAvatars'
import CommentsPanel from './CommentsPanel'
import PlanFilter, { EMPTY_FILTER, makeEventFilter } from './PlanFilter'

/** 세부·확정 단계에서 전일행사를 넣거나 옮기면 줄어드는 실수업일 칸 — [{sem, grade, weekday, from, to}] */
function actualDrops(before, after) {
  const out = []
  for (const sem of [1, 2]) for (const g of GRADES) {
    const a = before.grades[g][sem].actual
    const b = after.grades[g][sem].actual
    a.forEach((v, i) => { if (b[i] < v) out.push({ sem, grade: g, weekday: i, from: v, to: b[i] }) })
  }
  return out
}

const SAVE_DELAY = 1200
const PAGE_BG = '#eef2f6'
const PANEL = { bgcolor: '#fff', border: '1px solid #cbd5e1', borderRadius: 2, p: 1.25 }

/** 이 브라우저에만 기억하는 화면 설정(일요일 보기·패널 접기) */
function useLocalFlag(key, initial) {
  const [v, setV] = useState(() => {
    try { const x = localStorage.getItem(key); return x === null ? initial : x === '1' } catch { return initial }
  })
  const set = (next) => {
    setV(next)
    try { localStorage.setItem(key, next ? '1' : '0') } catch { /* 저장 못 해도 화면은 그대로 */ }
  }
  return [v, set]
}

export default function AcademicPlanEditor() {
  const { planId } = useParams()
  const navigate = useNavigate()
  const { user, userName, photoURL, schoolId, schoolName, isAdmin, isSuperAdmin } = useAuth()
  const by = useMemo(() => ({ uid: user?.uid, name: userName || user?.email || '' }), [user, userName])
  const me = useMemo(() => ({ ...by, photoURL: photoURL || user?.photoURL || null }), [by, photoURL, user])

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
  const [colorOpen, setColorOpen] = useState(false)
  const [filter, setFilter] = useState(EMPTY_FILTER)
  const [hintDate, setHintDate] = useState(null)
  const [shareAnchor, setShareAnchor] = useState(null)
  const [saveAs, setSaveAs] = useState(null) // { name } — 새 안으로 저장
  const [sinceChanges, setSinceChanges] = useState(null) // 마지막으로 본 뒤 남이 바꾼 것
  const [copied, setCopied] = useState(false) // 작년 날짜가 있는 카드를 끄는 동안 '작년 이맘때' 칸
  const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement))
  const [showSunday, setShowSunday] = useLocalFlag('academicPlan.showSunday', false)
  const [statsOpen, setStatsOpen] = useLocalFlag('academicPlan.statsOpen', true)

  // 저장 기준점 — 연 때의 저장본과 revision. 다른 사람이 먼저 저장했으면 savePlan이 이 위에 합친다
  const rootRef = useRef(null)
  const scrollRef = useRef(null) // 표 스크롤 상자 — 화면에서 움직이는 건 이것뿐
  const baseRef = useRef(null)
  const baseRevRef = useRef(0)
  const draftRef = useRef(null)
  const dirtyRef = useRef(false)
  const timerRef = useRef(null)
  const savingRef = useRef(false)
  draftRef.current = draft
  dirtyRef.current = dirty

  const { departments: staffDepts } = useStaffDirectory(schoolId, plan?.year)
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
        action: opts.action, summary: opts.summary, extra: opts.extra,
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
      return r
    } catch (e) {
      setError(`저장하지 못했습니다: ${e.message}`)
      return null
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }, [schoolId, planId, by])

  useEffect(() => () => clearTimeout(timerRef.current), [])

  /**
   * 화면은 창 높이에 고정하고 표만 스크롤한다. 표 밖(머리글·양쪽 패널)에서 굴린 휠도 표로 넘긴다.
   * 단, 양쪽 패널이 내용이 길어 스스로 더 굴러갈 수 있을 때는 그 패널을 먼저 굴린다.
   */
  useEffect(() => {
    const root = rootRef.current
    if (!root) return undefined
    const onWheel = (e) => {
      const sc = scrollRef.current
      if (!sc || e.ctrlKey || sc.contains(e.target)) return
      for (let el = e.target; el && el !== root; el = el.parentElement) {
        if (!/(auto|scroll)/.test(getComputedStyle(el).overflowY) || el.scrollHeight <= el.clientHeight + 1) continue
        const canUp = el.scrollTop > 0
        const canDown = el.scrollTop + el.clientHeight < el.scrollHeight - 1
        if ((e.deltaY < 0 && canUp) || (e.deltaY > 0 && canDown)) return
      }
      e.preventDefault()
      const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? sc.clientHeight : 1 // 줄·페이지 단위 휠
      sc.scrollBy({ top: e.deltaY * k, left: e.deltaX * k })
    }
    root.addEventListener('wheel', onWheel, { passive: false })
    return () => root.removeEventListener('wheel', onWheel)
  }, [plan === undefined || plan === null]) // eslint-disable-line react-hooks/exhaustive-deps

  // 전체 화면 — Esc로 나가도 버튼 모양이 따라오게 fullscreenchange를 듣는다
  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])
  /**
   * 마지막으로 본 뒤 다른 사람이 바꾼 것 — 이 브라우저에 초안별로 마지막으로 본 기록 번호를 기억한다.
   * 처음 열 때 한 번만 확인. 화면을 떠날 때(창 닫기·탭 숨김) 지금 번호를 '본 것'으로 기록한다.
   */
  const seenKey = `academicPlan.seen.${planId}`
  const readSeen = () => { try { return Number(localStorage.getItem(seenKey)) || 0 } catch { return 0 } }
  const writeSeen = (n) => { try { if (n) localStorage.setItem(seenKey, String(n)) } catch { /* 저장 못 하면 다음에 다시 알림 */ } }
  const versionCountRef = useRef(0)
  versionCountRef.current = plan?.versionCount || 0
  const checkedRef = useRef(false)
  useEffect(() => {
    if (!plan || checkedRef.current || !schoolId || !user?.uid) return
    checkedRef.current = true
    const seen = readSeen()
    if (!seen) { writeSeen(plan.versionCount || 0); return } // 처음 여는 초안 — 알릴 것 없음
    if ((plan.versionCount || 0) <= seen) return
    loadChangesSince(schoolId, planId, seen).then(({ versions, baseEvents }) => {
      const others = versions.filter((v) => v.by?.uid !== user.uid)
      if (!others.length) { writeSeen(plan.versionCount || 0); return }
      const cur = plan.events || []
      const diff = baseEvents ? diffEvents(baseEvents, cur) : null
      const changedIds = new Set(diff ? [...diff.added, ...diff.moved.map((m) => m.after), ...diff.changed.map((c) => c.after)].map((e) => e.id) : [])
      setSinceChanges({ versions: others, changedIds, changedCount: changedIds.size, removed: diff ? diff.removed.map((e) => e.title || '(이름 없음)') : [] })
    }).catch(() => { /* 알림만 못 띄움 */ })
  }, [plan, schoolId, planId, user?.uid]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const leave = () => { if (document.visibilityState === 'hidden') writeSeen(versionCountRef.current) }
    const unload = () => writeSeen(versionCountRef.current)
    document.addEventListener('visibilitychange', leave)
    window.addEventListener('beforeunload', unload)
    return () => { document.removeEventListener('visibilitychange', leave); window.removeEventListener('beforeunload', unload); unload() }
  }, [planId]) // eslint-disable-line react-hooks/exhaustive-deps
  const dismissChanges = () => { setSinceChanges(null); writeSeen(versionCountRef.current) }

  // 공유 링크 — 지금 접속한 주소(교내망은 .web.app 호스트)로. 받은 사람은 로그인 뒤 이 화면으로 돌아온다(ProtectedRoute → Login)
  const shareUrl = `${window.location.origin}/academic-plan/${planId}`
  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
    } catch {
      setCopied(false) // 복사가 막힌 브라우저 — 창의 주소를 직접 복사
    }
  }

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen?.()
    else document.documentElement.requestFullscreen?.().catch(() => setToast('이 브라우저에서는 전체 화면을 쓸 수 없습니다.'))
  }

  // 새 창 탭 제목
  useEffect(() => {
    if (!plan) return
    const prev = document.title
    document.title = `${plan.year} ${plan.name} · 학사일정`
    return () => { document.title = prev }
  }, [plan?.year, plan?.name]) // eslint-disable-line react-hooks/exhaustive-deps

  const change = (fn) => {
    if (!canEdit) return
    setDraft((d) => fn(d))
    setDirty(true)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => runSave(), SAVE_DELAY)
  }

  const view = useMemo(() => (plan && draft ? { ...plan, ...draft } : null), [plan, draft])
  const stats = useMemo(() => (view ? computeStats(view) : null), [view])
  const rows = useMemo(() => {
    if (!view) return []
    const all = buildWeekRows(view)
    // 주요 일정 단계의 2학기는 1학기 방학식이 있는 주부터 — 방학 기간과 2학기 개학을 한 화면에서 맞춘다
    if (semester === 2 && planStage(plan) === 'frame') {
      const end1 = (view.events || []).filter((e) => e.kind === '방학식' && /^\d{4}-0[3-8]-/.test(e.date || '')).map((e) => e.date).sort()[0]
      if (end1) {
        const from = addDays(end1, -mondayIndex(end1))
        return all.filter((r) => r.month >= 8 || r.month <= 2 || (r.month === 7 && r.monday >= from))
      }
    }
    return rowsForSemester(all, semester)
  }, [view, semester, plan])

  const stage = planStage(plan)
  const lockedOf = (id) => {
    const ev = draft?.events.find((e) => e.id === id)
    return Boolean(ev && isEventLocked(ev, stage))
  }
  const lockedToast = () => setToast(stage === 'final' ? '확정된 학사일정입니다. 고치려면 관리자가 그 일정을 잠금 해제해야 합니다.' : '주요 일정은 잠겨 있습니다. 관리자가 잠금 해제해야 고칠 수 있습니다.')

  /**
   * 세부·확정 단계에서 전일행사가 새로 생기거나 날짜가 바뀌면 실수업일이 줄어든다 — 막지 않고 알린다.
   * 사용자가 취소하면 false
   */
  const confirmFullDayImpact = (nextEvents) => {
    if (stage === 'frame') return true
    const drops = actualDrops(stats, computeStats({ ...view, events: nextEvents }))
    if (!drops.length) return true
    const lines = drops.slice(0, 8).map((d) => `${d.sem}학기 ${d.grade}학년 ${SCHOOL_WEEKDAYS[d.weekday]} ${d.from}→${d.to}${d.to < 16 ? ' (16회 미만!)' : ''}`)
    return window.confirm(`이 변경으로 실수업일이 줄어듭니다.\n\n${lines.join('\n')}${drops.length > 8 ? `\n외 ${drops.length - 8}칸` : ''}\n\n그래도 저장할까요?`)
  }

  const saveEvent = (input) => {
    if (lockedOf(input.id)) { lockedToast(); return }
    const isNew = !draft.events.some((e) => e.id === input.id)
    // 최종 확정 뒤 새 일정은 관리자만, 잠금 해제 상태로 들어가 재확정해야 새 판에 담긴다
    if (isNew && stage === 'final' && !canAdmin) { lockedToast(); return }
    const ev = isNew && stage === 'final' ? { ...input, unlocked: true } : input
    // 정기고사 기간은 날마다 따로 넣는다 — 시험일을 하루씩 옮기며 편성하기 쉽게
    const parts = splitExamEvent(ev, draft)
    const put = (events) => {
      const i = events.findIndex((e) => e.id === ev.id)
      return i < 0 ? [...events, ...parts] : [...events.slice(0, i), ...parts, ...events.slice(i + 1)]
    }
    if (!confirmFullDayImpact(put(draft.events))) return
    change((d) => ({ ...d, events: put(d.events) }))
    setDialog(null)
  }
  const deleteEvent = (id) => {
    if (lockedOf(id)) { lockedToast(); return }
    change((d) => ({ ...d, events: d.events.filter((e) => e.id !== id) }))
    setDialog(null)
  }
  // 관리자 — 확정 뒤 이 일정만 잠금 해제(수정 기록에 '잠금 해제'로 남는다)
  const unlockEvent = (id) => {
    change((d) => ({ ...d, events: d.events.map((e) => (e.id === id ? { ...e, unlocked: true } : e)) }))
    setDialog((x) => (x?.event?.id === id ? { event: { ...x.event, unlocked: true } } : x))
  }
  const moveEvent = (id, toDate) => {
    const { start, end } = yearRange(plan.year)
    if (toDate < start || toDate > end) return
    setHintDate(null)
    if (lockedOf(id)) { lockedToast(); return }
    // 보관함의 여러 날짜 시험 카드는 놓을 때 날마다 따로 나눈다
    const move = (events) => events.flatMap((e) => {
      if (e.id !== id || e.date === toDate) return [e]
      return isTrayEvent(e) ? splitExamEvent(placeTrayEvent(e, toDate), draft) : [shiftEvent(e, toDate)]
    })
    if (!confirmFullDayImpact(move(draft.events))) return
    change((d) => ({ ...d, events: move(d.events) }))
  }
  // 표의 일정을 보관함으로 — 날짜를 비운다
  const unschedule = (id) => {
    if (lockedOf(id)) { lockedToast(); return }
    change((d) => ({ ...d, events: d.events.map((e) => (e.id === id && !isTrayEvent(e) ? unscheduleEvent(e) : e)) }))
  }

  /**
   * 표의 일정을 한꺼번에 보관함 카드로(학기 또는 학년도 전체). 잠긴 일정과 날짜에 묶인 공휴일·요일 교체는 남긴다.
   * 한 번의 저장 = 수정 기록 한 줄이라 '이 버전으로 복구'로 바로 되돌릴 수 있다.
   */
  const unscheduleAll = (sem) => {
    const inSem = (k) => !sem || (sem === 1 ? Number(k.slice(5, 7)) >= 3 && Number(k.slice(5, 7)) <= 7 : Number(k.slice(5, 7)) >= 8 || Number(k.slice(5, 7)) <= 2)
    // 보기 필터를 켰으면 보이는 일정만
    const visible = makeEventFilter(filter)
    const targets = draft.events.filter((e) => !isTrayEvent(e) && !isEventLocked(e, stage) && e.kind !== '공휴일' && e.kind !== '요일교체'
      && inSem(e.date) && (!visible || visible(e)))
    if (!targets.length) { setToast('카드로 옮길 일정이 없습니다.'); return }
    const kept = draft.events.filter((e) => !isTrayEvent(e) && !targets.includes(e) && inSem(e.date) && (!visible || visible(e))).length
    if (!window.confirm(`${sem ? `${sem}학기` : '학년도 전체'}${visible ? ' (보기 필터에 보이는 것만)' : ''} 일정 ${targets.length}건을 보관함 카드로 옮깁니다.${kept ? `
(잠긴 일정·공휴일·요일 교체 ${kept}건은 그대로 둡니다)` : ''}

수정 기록의 '이 버전으로 복구'로 되돌릴 수 있습니다. 진행할까요?`)) return
    const ids = new Set(targets.map((e) => e.id))
    change((d) => ({ ...d, events: d.events.map((e) => (ids.has(e.id) ? unscheduleEvent(e) : e)) }))
    setToast(`일정 ${targets.length}건을 카드로 옮겼습니다.`)
  }

  /**
   * 지난 학년도 일정을 보관함 카드로 더하고(이미 있는 것은 건너뜀), 부서 색은 비어 있는 부서만 채운다.
   * 일정은 저장 한 번 = 수정 기록 한 줄이라 '이 버전으로 복구'로 되돌릴 수 있다.
   */
  const loadPrevCards = async () => {
    setBusy('prev')
    try {
      const prev = await loadPrevYear(schoolId, plan.year)
      if (!prev.plan) { setToast(`${plan.year - 1}학년도 학사일정이 없습니다.`); return }
      const { cards, skipped } = importPrevCards(draft.events, prev.plan.events)
      const colors = mergeDeptColors(yearDoc?.deptColors, prev.deptColors)
      if (!cards.length && !colors.added) { setToast(`이미 모두 불러왔습니다${skipped ? ` (${skipped}건 건너뜀)` : ''}.`); return }
      const src = `${plan.year - 1}학년도 '${prev.plan.name}'${prev.plan.status === 'confirmed' ? '(확정본)' : '(가장 최근 초안)'}`
      const msg = [
        cards.length && `일정 ${cards.length}건을 보관함 카드로 넣습니다${skipped ? ` (이미 있는 ${skipped}건 제외)` : ''}.`,
        colors.added && `부서 색 ${colors.added}개를 가져옵니다(이미 정한 색은 그대로).`,
      ].filter(Boolean).join('\n')
      if (!window.confirm(`${src}에서 불러옵니다.\n\n${msg}\n\n진행할까요?`)) return
      if (cards.length) change((d) => ({ ...d, events: [...d.events, ...cards] }))
      if (colors.added) await saveDeptColors(schoolId, plan.year, colors.colors)
      setToast([cards.length && `카드 ${cards.length}건`, colors.added && `부서 색 ${colors.added}개`].filter(Boolean).join(' · ') + '을 불러왔습니다.')
    } catch (e) {
      setError(`지난 학년도를 불러오지 못했습니다: ${e.message}`)
    } finally { setBusy('') }
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

  // ── 단계 진행(관리자) — 일정 변경과 단계·확정 판을 한 번의 저장(새 버전)으로 ─────────────
  const confirmations = plan?.confirmations || []
  const nextNo = (st) => confirmations.filter((c) => c.stage === st).length + 1
  const stageSave = ({ events, summary, stage: nextStage, confirmStage }) => runSave({
    mine: { ...draftRef.current, events },
    action: 'confirm',
    summary,
    extra: ({ versionNo, server }) => ({
      ...(nextStage ? { stage: nextStage } : {}),
      ...(confirmStage ? { confirmations: addConfirmation(server.confirmations || [], { stage: confirmStage, versionNo, at: Date.now(), by }) } : {}),
    }),
  })
  const busyGuard = () => {
    if (dirty || saving) { setError('저장이 끝난 뒤에 다시 눌러 주세요.'); return false }
    return true
  }

  const doConfirmFrame = async () => {
    if (!busyGuard()) return
    if (!window.confirm(`주요 일정을 확정합니다.\n\n· 개학·방학·고사·휴업·요일 교체·전일행사 일정이 잠깁니다(관리자가 일정별로 잠금 해제 가능).\n· 부장 선생님들은 이 초안에 세부 일정을 채웁니다.\n· 같은 학년도의 다른 초안은 목록에서 '보관'으로 표시됩니다.\n\n진행할까요?`)) return
    setBusy('stage')
    try {
      const r = await stageSave({ events: markFrameEvents(draftRef.current.events), summary: `주요 일정 확정 ${nextNo('frame')}판`, stage: 'detail', confirmStage: 'frame' })
      if (r) { await setActivePlan(schoolId, plan.year, planId); setToast('주요 일정을 확정했습니다. 이제 세부 일정을 넣을 수 있습니다.') }
    } finally { setBusy('') }
  }

  // 잠금 해제했던 일정을 고친 뒤 — 같은 단계를 새 판으로, 이전 판은 '변경됨'
  const doReconfirm = async () => {
    if (!busyGuard()) return
    const st = stage === 'final' ? 'final' : 'frame'
    const label = st === 'final' ? '확정' : '주요 일정 확정'
    if (!window.confirm(`잠금 해제한 일정을 다시 잠그고 ${label} ${nextNo(st)}판으로 기록합니다. 이전 판은 '변경됨'으로 표시됩니다. 진행할까요?`)) return
    setBusy('stage')
    try {
      const r = await stageSave({ events: relockEvents(draftRef.current.events), summary: `${label} ${nextNo(st)}판 (재확정)`, confirmStage: st })
      if (r) setToast(`${label} ${nextNo(st)}판으로 기록했습니다.`)
    } finally { setBusy('') }
  }

  const doConfirmFinal = async () => {
    if (!busyGuard()) return
    if (!window.confirm(`'${plan.name}'을(를) ${plan.year}학년도 학사일정으로 최종 확정합니다. 모든 일정이 잠기고, 같은 학년도의 다른 확정본은 초안으로 돌아갑니다. 진행할까요?`)) return
    setBusy('stage')
    try {
      const r = await stageSave({ events: relockEvents(draftRef.current.events), summary: `최종 확정 ${nextNo('final')}판`, stage: 'final', confirmStage: 'final' })
      if (r) { await confirmPlan({ schoolId, plan, plans, by }); setToast('최종 확정했습니다.') }
    } catch (e) { setError(e.message) } finally { setBusy('') }
  }

  const doUnconfirm = async () => {
    if (!window.confirm('최종 확정을 풀고 세부 일정 단계로 돌아갑니다. 확정 판 기록은 남습니다. 진행할까요?')) return
    setBusy('stage')
    try { await unconfirmPlan({ schoolId, plan }); setToast('세부 일정 단계로 돌아갔습니다.') } catch (e) { setError(e.message) } finally { setBusy('') }
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

  /**
   * 지금 화면 상태를 새 초안으로 — 원래 안은 그대로 두고 갈래를 나눠 작업한다.
   * 새 안은 주요 일정 단계부터(잠금 표시 frame·unlocked는 버림), 새 창으로 연다(팝업 차단을 피해 창부터 연다).
   */
  const openSaveAs = () => {
    const used = new Set(plans.map((p) => p.name))
    let name = `${plan.name} (2)`
    for (let i = 2; used.has(name); i++) name = `${plan.name} (${i})`
    setSaveAs({ name })
  }
  const doSaveAs = async () => {
    const name = saveAs.name.trim()
    if (!name) return
    const win = window.open('', '_blank')
    setBusy('saveAs')
    try {
      const events = (draftRef.current?.events || []).map(({ frame, unlocked, ...e }) => e) // eslint-disable-line no-unused-vars
      const id = await createPlan({ schoolId, year: plan.year, name, events, holidays: draftRef.current?.holidays || [], basedOn: planId, by })
      setSaveAs(null)
      if (win) win.location.href = `/academic-plan/${id}`
      else navigate(`/academic-plan/${id}`)
      setToast(`'${name}'(으)로 저장했습니다. 새 창에서 이어서 작업하세요.`)
    } catch (e) {
      win?.close()
      setError(`새 안으로 저장하지 못했습니다: ${e.message}`)
    } finally { setBusy('') }
  }

  const exportXlsx = () => {
    setPrintAnchor(null)
    downloadPlanXlsx(view, schoolName).catch((e) => setError(`엑셀을 만들지 못했습니다: ${e.message}`))
  }

  const print = (sems, pdf) => {
    setPrintAnchor(null)
    if (pdf) downloadPlanPdf(view, schoolName, sems).catch((e) => setError(e.message))
    else if (!printPlan(view, schoolName, sems)) setError('팝업이 차단되어 인쇄 창을 열지 못했습니다.')
  }

  if (plan === undefined) return <Box sx={{ p: 6, textAlign: 'center' }}><CircularProgress /></Box>
  if (plan === null) return <Alert severity="error" sx={{ m: 3 }}>학사일정 초안을 찾을 수 없습니다.</Alert>

  // 목록에서 새 창으로 열렸으면 창을 닫고, 주소로 바로 들어왔으면 목록으로
  const goList = () => {
    if (window.opener && !window.opener.closed) window.close()
    else navigate(`/academic-plan?year=${plan.year}`)
  }

  const status = saving ? '저장 중…' : dirty ? '저장 대기' : '저장됨'
  const deptColors = yearDoc?.deptColors || {}
  // 부서 목록 = 교직원 배정의 부서 + 일정에 적힌 부서(손으로 적은 것 포함)
  const departments = [...new Set([...staffDepts, ...(view.events || []).map((e) => e.dept).filter(Boolean)])]
    .sort((a, b) => a.localeCompare(b, 'ko'))
  // 보기 필터 — 표·보관함에만. 수업일수(stats)는 전체 일정 기준 그대로
  const pass = makeEventFilter(filter)
  const shownView = pass ? { ...view, events: (view.events || []).filter(pass) } : view
  const hiddenCount = pass ? (view.events || []).length - shownView.events.length : 0

  return (
    <Box ref={rootRef} sx={{ height: '100vh', overflow: 'hidden', bgcolor: PAGE_BG }}>
      {/* 새 창 전용 화면 — 포털 상단바·사이드바 없이. 왼쪽 수업일수 · 가운데 표 · 오른쪽 일정 카드 */}
      <Box sx={{ px: { xs: 1, md: 2 }, py: 1.5, display: 'flex', flexDirection: 'column', gap: 1.25, maxWidth: 1920, mx: 'auto', height: '100%', boxSizing: 'border-box' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Button startIcon={<ArrowBackIcon />} onClick={goList} size="small">목록</Button>
          {nameEdit !== null ? (
            <TextField size="small" autoFocus value={nameEdit} onChange={(e) => setNameEdit(e.target.value)}
              onBlur={async () => { if (nameEdit.trim() && nameEdit !== plan.name) await renamePlan(schoolId, planId, nameEdit.trim()); setNameEdit(null) }}
              onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setNameEdit(null) }} />
          ) : (
            <Typography variant="h6" sx={{ fontWeight: 800, cursor: canEdit ? 'text' : 'default' }}
              onClick={() => canEdit && setNameEdit(plan.name)}>
              {plan.year}학년도 · {plan.name}
            </Typography>
          )}
          {canEdit
            ? <Typography variant="caption" sx={{ color: dirty || saving ? '#b45309' : 'text.secondary' }}>{status}</Typography>
            : <Chip label="읽기 전용" size="small" variant="outlined" />}
          <Box sx={{ flex: 1 }} />
          <PresenceAvatars schoolId={schoolId} planId={planId} me={me} />
          <Button size="small" startIcon={<ShareIcon />} onClick={(e) => { setShareAnchor(e.currentTarget); copyShareLink() }}>공유</Button>
          <Popover open={Boolean(shareAnchor)} anchorEl={shareAnchor} onClose={() => { setShareAnchor(null); setCopied(false) }}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
            <Box sx={{ p: 1.5, width: 400, display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Typography sx={{ fontWeight: 800, fontSize: '0.92rem' }}>이 학사일정 링크</Typography>
              <Box sx={{ display: 'flex', gap: 0.5 }}>
                <TextField size="small" fullWidth value={shareUrl} InputProps={{ readOnly: true }} onFocus={(e) => e.target.select()} />
                <Button size="small" variant="contained" disableElevation startIcon={<ContentCopyIcon />} onClick={copyShareLink} sx={{ bgcolor: ACCENT, flexShrink: 0 }}>
                  {copied ? '복사됨' : '복사'}
                </Button>
              </Box>
              <Typography variant="caption" sx={{ color: 'text.secondary', lineHeight: 1.6 }}>
                메신저로 보내면 받은 선생님이 학교 계정으로 로그인한 뒤 이 화면으로 바로 들어옵니다.
                편집은 이 학년도 편집자(부장)와 관리자만 할 수 있고, 다른 교직원은 보기만 합니다.
                {(yearDoc?.editorUids || []).length ? ` 지금 편집자 ${(yearDoc.editorUids || []).length}명.` : ''}
              </Typography>
            </Box>
          </Popover>
          <Button size="small" startIcon={fullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />} onClick={toggleFullscreen}>
            {fullscreen ? '전체 화면 끄기' : '전체 화면'}
          </Button>
          {canEdit && (
            <Button size="small" startIcon={<EventAvailableIcon />} onClick={loadHolidays} disabled={busy === 'holidays'}>
              공휴일 불러오기
            </Button>
          )}
          <Button size="small" startIcon={<HistoryIcon />} onClick={() => setHistoryOpen(true)}>수정 기록</Button>
          {canEdit && <Button size="small" startIcon={<SaveAsIcon />} onClick={openSaveAs}>새 안으로 저장</Button>}
          <Button size="small" startIcon={<CompareArrowsIcon />} onClick={() => navigate(`/academic-plan/compare?year=${plan.year}&a=${planId}`)}>비교</Button>
          <Button size="small" startIcon={<PrintIcon />} onClick={(e) => setPrintAnchor(e.currentTarget)}>인쇄</Button>
          <Menu anchorEl={printAnchor} open={Boolean(printAnchor)} onClose={() => setPrintAnchor(null)}>
            <MenuItem onClick={() => print([1])}>1학기 인쇄 (A4 1장)</MenuItem>
            <MenuItem onClick={() => print([2])}>2학기 인쇄 (A4 1장)</MenuItem>
            <MenuItem onClick={() => print([1, 2])}>두 학기 모두 인쇄</MenuItem>
            <MenuItem onClick={() => print([1, 2], true)}>PDF로 저장</MenuItem>
            <MenuItem onClick={exportXlsx}>엑셀로 내려받기 (.xlsx)</MenuItem>
          </Menu>
          {canAdmin && stage === 'final' && (
            <Button size="small" variant="contained" disableElevation startIcon={<CloudUploadIcon />} onClick={doPublish} disabled={busy === 'publish'} sx={{ bgcolor: ACCENT }}>
              구글 캘린더 반영
            </Button>
          )}
        </Box>

        <StageBar stage={stage} confirmations={confirmations} canAdmin={canAdmin} busy={busy === 'stage'}
          unlockedCount={(view.events || []).filter((e) => e.unlocked).length}
          onConfirmFrame={doConfirmFrame} onConfirmFinal={doConfirmFinal} onReconfirm={doReconfirm} onUnconfirm={doUnconfirm} />

        {!canEdit && (
          <Alert severity="info">이 학년도 학사일정은 부장교사(편집자)와 관리자가 고칠 수 있습니다. 지금은 보기만 할 수 있습니다.</Alert>
        )}
        {canEdit && !(view.holidays || []).length && (
          <Alert severity="warning" action={<Button color="inherit" size="small" onClick={loadHolidays}>공휴일 불러오기</Button>}>
            공휴일이 아직 없습니다. 먼저 불러와야 수업일수가 맞게 계산됩니다.
          </Alert>
        )}
        {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
        {sinceChanges && <ChangesSinceBanner changes={sinceChanges} onDismiss={dismissChanges} />}

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Tabs value={semester ?? 0} onChange={(_, v) => setSemester(v || null)} sx={{ minHeight: 36, '& .MuiTab-root': { minHeight: 36, fontWeight: 700 } }}>
            <Tab value={1} label="1학기 (3~7월)" />
            <Tab value={2} label="2학기 (8~2월)" />
            <Tab value={0} label="전체" />
          </Tabs>
          <PlanFilter value={filter} onChange={setFilter} departments={departments} deptColors={deptColors} hiddenCount={hiddenCount} />
          <Box sx={{ flex: 1 }} />
          <FormControlLabel sx={{ mr: 0 }} label={<Typography variant="body2">일요일 보기</Typography>}
            control={<Checkbox size="small" checked={showSunday} onChange={(e) => setShowSunday(e.target.checked)} />} />
        </Box>

        {/* 남은 높이를 세 칸이 나눠 쓴다 — 가운데 표만 스크롤 */}
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', flex: 1, minHeight: 0 }}>
          {/* 왼쪽 — 수업일수(접기 가능, 스크롤해도 고정) */}
          {statsOpen ? (
            <Box sx={{ ...PANEL, width: 340, flexShrink: 0, maxHeight: '100%', boxSizing: 'border-box', overflowY: 'auto' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                <Typography sx={{ fontWeight: 800, flex: 1 }}>수업일수</Typography>
                <Tooltip title="수업일수 접기"><IconButton size="small" onClick={() => setStatsOpen(false)}><ChevronLeftIcon fontSize="small" /></IconButton></Tooltip>
              </Box>
              <PlanStatsPanel stats={stats} semester={semester} />
              <Box sx={{ borderTop: '1px solid #e2e8f0', mt: 1.5, pt: 1.25 }}>
                <CommentsPanel schoolId={schoolId} planId={planId} me={me} canAdmin={canAdmin} />
              </Box>
            </Box>
          ) : (
            <Tooltip title="수업일수 펼치기" placement="right">
              <Box onClick={() => setStatsOpen(true)}
                sx={{ ...PANEL, p: 0.5, width: 30, flexShrink: 0, cursor: 'pointer', textAlign: 'center',
                  '&:hover': { bgcolor: '#f0fdfa' } }}>
                <ChevronRightIcon fontSize="small" />
                <Typography sx={{ writingMode: 'vertical-rl', fontSize: '0.8rem', fontWeight: 800, mx: 'auto', py: 1 }}>수업일수</Typography>
                {stats.warnings.some((w) => !semester || w.semester === semester) && <Box sx={{ color: '#b91c1c', fontWeight: 900 }}>!</Box>}
              </Box>
            </Tooltip>
          )}

          {/* 가운데 — 학사일정 표 */}
          {/* 이 상자가 스크롤 상자 — 표 머리글(sticky)은 이 상자 위쪽에 붙는다 */}
          <Box ref={scrollRef} sx={{ flex: 1, minWidth: 0, height: '100%', overflow: 'auto', borderRadius: 1 }}>
            <Box>
              <Box sx={{ minWidth: 760 }}>
                <PlanGrid plan={view} events={shownView.events} rows={rows} hintDate={hintDate} changedIds={sinceChanges?.changedIds} canEdit={canEdit} showSunday={showSunday} deptColors={deptColors}
                  isLocked={(ev) => isEventLocked(ev, stage)}
                  onCellClick={(date) => setDialog({ event: { date } })}
                  onEventClick={(ev) => setDialog({ event: ev })}
                  onMove={moveEvent} />
              </Box>
            </Box>
            {canEdit && (
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1, pb: 1 }}>
                빈 곳을 누르면 그날 일정을 등록하고, 일정을 끌어서 다른 날이나 오른쪽 보관함으로 옮길 수 있습니다. 고친 내용은 자동 저장되고 수정 기록에 남습니다.
              </Typography>
            )}
          </Box>

          {/* 오른쪽 — 일정 카드 보관함 · 부서 색 */}
          <Box sx={{ ...PANEL, width: 250, flexShrink: 0, maxHeight: '100%', boxSizing: 'border-box', overflowY: 'auto' }}>
            <TrayPanel events={shownView.events} canEdit={canEdit} deptColors={deptColors}
              onAdd={() => setDialog({ event: { date: '' } })}
              onEdit={(ev) => setDialog({ event: ev })}
              onUnschedule={unschedule}
              semester={semester} onUnscheduleAll={unscheduleAll}
              prevYear={plan.year - 1} onLoadPrev={loadPrevCards} loadingPrev={busy === 'prev'}
              onCardDrag={(ev) => setHintDate(ev ? sameWeekdayNextYear(ev.prevDate) : null)}
              onEditColors={() => setColorOpen(true)} />
          </Box>
        </Box>
      </Box>

      <EventDialog open={Boolean(dialog)} event={dialog?.event} departments={departments}
        readOnly={!canEdit || Boolean(dialog?.event?.id && isEventLocked(dialog.event, stage))}
        locked={Boolean(dialog?.event?.id && isEventLocked(dialog.event, stage))}
        canUnlock={canAdmin} onUnlock={unlockEvent}
        stage={stage} restrictKinds={stage !== 'frame' && !canAdmin}
        onClose={() => setDialog(null)} onSave={saveEvent} onDelete={deleteEvent} />
      <Dialog open={Boolean(saveAs)} onClose={() => setSaveAs(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>새 안으로 저장</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pt: '8px !important' }}>
          <TextField label="새 안 이름" autoFocus value={saveAs?.name || ''} onChange={(e) => setSaveAs({ name: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Enter') doSaveAs() }} />
          <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.6 }}>
            지금 화면의 일정·공휴일·보관함 카드를 그대로 복사해 새 초안을 만들고 새 창으로 엽니다.
            '{plan.name}'은(는) 그대로 남습니다. 새 안은 주요 일정 단계부터 시작합니다.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setSaveAs(null)}>취소</Button>
          <Button variant="contained" disableElevation onClick={doSaveAs} disabled={busy === 'saveAs' || !saveAs?.name?.trim()}>저장하고 열기</Button>
        </DialogActions>
      </Dialog>
      <DeptColorDialog open={colorOpen} departments={departments} value={deptColors} onClose={() => setColorOpen(false)}
        onSave={async (colors) => {
          try { await saveDeptColors(schoolId, plan.year, colors); setColorOpen(false) } catch (e) { setError(`부서 색을 저장하지 못했습니다: ${e.message}`) }
        }} />
      <VersionDrawer open={historyOpen} onClose={() => setHistoryOpen(false)} schoolId={schoolId} plan={plan} canEdit={canEdit} onRestore={restore} />
      <Snackbar open={Boolean(toast)} autoHideDuration={5000} onClose={() => setToast('')} message={toast} />
    </Box>
  )
}
