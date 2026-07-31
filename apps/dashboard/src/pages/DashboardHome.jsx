import { useEffect, useState, useCallback, useMemo } from 'react'
import { collection, doc, getDoc, onSnapshot, updateDoc } from 'firebase/firestore'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import DragIndicatorIcon from '@mui/icons-material/DragIndicator'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { COL, schoolPath, teacherAssignmentId, currentSchoolYear } from '@shared/lib/schema'
import { MODULE_CATALOG, isModuleVisibleToMe } from '@shared/lib/dashboardModules'
import DashboardLayout from '../components/DashboardLayout'
import MyTasksWidget from '../widgets/MyTasksWidget'
import CallsWidget from '../widgets/CallsWidget'
import PresenceWidget from '../widgets/PresenceWidget'
import AnnouncementsWidget from '../widgets/AnnouncementsWidget'
import CalendarWidget from '../widgets/CalendarWidget'
import NoticesWidget from '../widgets/NoticesWidget'

/**
 * 위젯 대시보드
 *
 * 탭으로 화면을 나누지 않고 한 화면 안에서 영역별로 보여준다.
 * 위젯은 열 사이를 드래그해 자유롭게 옮길 수 있고, 배치는 users/{uid}.dashboardLayout에
 * 저장돼 다음 접속에도 유지된다.
 *
 * CORE_WIDGETS는 항상 노출된다. OPTIONAL_WIDGETS는 schools/{id}/dashboardModules 문서
 * (componentKey가 이 객체의 키와 일치)의 enabled + visibility로 관리자가 켜고 끄며
 * 대상(전체/부서/개인)을 지정한다 — PLAN_dashboardElectron.md "모듈 노출 제어" 참고.
 *
 * 화면 기준: FHD(1920×1080) 이상 (개발 스펙 6.6). 좁아지면 열이 자동으로 접힌다.
 */

const CORE_WIDGETS = {
  tasks:    { title: '내 업무',   emoji: '📋', Component: MyTasksWidget },
  calls:    { title: '호출 알림', emoji: '🔔', Component: CallsWidget },
  presence: { title: '내 상태',   emoji: '🟢', Component: PresenceWidget },
}

const OPTIONAL_COMPONENTS = {
  announcements: AnnouncementsWidget,
  calendar: CalendarWidget,
  notices: NoticesWidget,
}

const OPTIONAL_WIDGETS = Object.fromEntries(
  Object.entries(MODULE_CATALOG).map(([key, meta]) => [key, { ...meta, Component: OPTIONAL_COMPONENTS[key] }]),
)

const WIDGETS = { ...CORE_WIDGETS, ...OPTIONAL_WIDGETS }
const DEFAULT_LAYOUT = [['tasks'], ['presence', 'calls']]

function padColumns(cols) {
  const next = cols.map(col => [...col])
  while (next.length < DEFAULT_LAYOUT.length) next.push([])
  return next
}

// 대상 목록(knownIds)에 없는 위젯은 걸러내고, 배치에 아직 없는 위젯은 마지막 열에 붙인다.
// 관리자가 모듈을 껐다 켰다 하거나, 새 옵션 위젯이 추가돼도 이 한 함수로 정리된다.
function reconcileLayout(columns, knownIds) {
  const filtered = columns.map(col => col.filter(id => knownIds.includes(id)))
  const placed = new Set(filtered.flat())
  knownIds.forEach(id => { if (!placed.has(id)) filtered[filtered.length - 1].push(id) })
  return filtered
}

function normalizeLayout(saved, knownIds) {
  const base = Array.isArray(saved) && saved.length > 0
    ? padColumns(saved.map(col => (Array.isArray(col) ? col : [])))
    : padColumns(DEFAULT_LAYOUT)
  return reconcileLayout(base, knownIds)
}

export default function DashboardHome() {
  const { user, schoolId } = useAuth()
  const [rawLayout, setRawLayout] = useState(null)        // Firestore 원본 배치 (미로드 시 null)
  const [layoutLoaded, setLayoutLoaded] = useState(false)
  const [modules, setModules] = useState([])
  const [modulesLoaded, setModulesLoaded] = useState(false)
  const [department, setDepartment] = useState(null)
  const [dragging, setDragging] = useState(null)          // 끌고 있는 위젯 id
  const [dropAt, setDropAt] = useState(null)              // { col, index }

  useEffect(() => {
    if (!user) return
    getDoc(doc(db, 'users', user.uid))
      .then(snap => setRawLayout(snap.data()?.dashboardLayout ?? null))
      .catch(() => {})
      .finally(() => setLayoutLoaded(true))
  }, [user])

  useEffect(() => {
    if (!schoolId || !user) return
    getDoc(doc(db, ...schoolPath(schoolId, COL.TEACHER_ASSIGNMENTS), teacherAssignmentId(currentSchoolYear(), user.uid)))
      .then(snap => setDepartment(snap.data()?.department || null))
      .catch(() => {})
  }, [schoolId, user])

  useEffect(() => {
    if (!schoolId) return
    return onSnapshot(collection(db, ...schoolPath(schoolId, COL.DASHBOARD_MODULES)), snap => {
      setModules(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setModulesLoaded(true)
    })
  }, [schoolId])

  const visibleWidgetIds = useMemo(() => {
    // dashboardModules 문서 ID가 곧 componentKey다 (schools/{id}/dashboardModules/{componentKey})
    const optionalIds = modules
      .filter(m => OPTIONAL_WIDGETS[m.id] && isModuleVisibleToMe(m, { uid: user?.uid, department }))
      .map(m => m.id)
    return [...Object.keys(CORE_WIDGETS), ...optionalIds]
  }, [modules, user, department])

  const layout = useMemo(() => normalizeLayout(rawLayout, visibleWidgetIds), [rawLayout, visibleWidgetIds])
  const loaded = layoutLoaded && modulesLoaded

  const persist = useCallback(async (next) => {
    setRawLayout(next)
    if (!user) return
    try {
      await updateDoc(doc(db, 'users', user.uid), { dashboardLayout: next })
    } catch (e) {
      console.error('배치 저장 실패:', e)
    }
  }, [user])

  const handleDrop = (colIndex, insertIndex) => {
    if (!dragging) return
    const next = layout.map(col => col.filter(id => id !== dragging))
    const target = Math.min(Math.max(insertIndex, 0), next[colIndex].length)
    next[colIndex].splice(target, 0, dragging)
    setDragging(null)
    setDropAt(null)
    persist(next)
  }

  const resetLayout = () => persist(DEFAULT_LAYOUT.map(col => [...col]))

  if (!loaded) return <DashboardLayout><Box /></DashboardLayout>

  return (
    <DashboardLayout>
      <Box sx={{ maxWidth: 1680, mx: 'auto' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" fontWeight={800}>대시보드</Typography>
          <Typography fontSize="0.8rem" color="text.secondary" sx={{ ml: 1.5 }}>
            위젯 제목을 끌어서 원하는 위치로 옮길 수 있습니다
          </Typography>
          <Button size="small" onClick={resetLayout} sx={{ ml: 'auto' }}>배치 초기화</Button>
        </Box>

        <Box sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1.6fr 1fr' },
          gap: 2.5,
          alignItems: 'start',
        }}>
          {layout.map((colWidgets, colIndex) => (
            <Column
              key={colIndex}
              colIndex={colIndex}
              widgetIds={colWidgets}
              dragging={dragging}
              dropAt={dropAt}
              onDragStartWidget={setDragging}
              onDragEndWidget={() => { setDragging(null); setDropAt(null) }}
              onHover={setDropAt}
              onDrop={handleDrop}
            />
          ))}
        </Box>
      </Box>
    </DashboardLayout>
  )
}

function Column({ colIndex, widgetIds, dragging, dropAt, onDragStartWidget, onDragEndWidget, onHover, onDrop }) {
  const isTarget = dropAt?.col === colIndex

  // 마우스 Y 위치를 각 위젯의 중간선과 비교해 삽입 위치를 정한다
  const computeIndex = (e, container) => {
    const children = [...container.querySelectorAll('[data-widget]')]
    for (let i = 0; i < children.length; i++) {
      const r = children[i].getBoundingClientRect()
      if (e.clientY < r.top + r.height / 2) return i
    }
    return children.length
  }

  return (
    <Box
      onDragOver={(e) => {
        if (!dragging) return
        e.preventDefault()
        onHover({ col: colIndex, index: computeIndex(e, e.currentTarget) })
      }}
      onDrop={(e) => {
        if (!dragging) return
        e.preventDefault()
        onDrop(colIndex, computeIndex(e, e.currentTarget))
      }}
      sx={{
        display: 'flex', flexDirection: 'column', gap: 2.5, minHeight: 140,
        borderRadius: 3, p: dragging ? 1 : 0,
        border: dragging ? '2px dashed' : '2px dashed transparent',
        borderColor: isTarget ? '#6366f1' : dragging ? '#e2e8f0' : 'transparent',
        bgcolor: isTarget ? 'rgba(99,102,241,.04)' : 'transparent',
        transition: 'border-color .15s ease, background-color .15s ease',
      }}
    >
      {widgetIds.map((id, i) => (
        <Box key={id} data-widget={id} sx={{ position: 'relative' }}>
          {isTarget && dropAt?.index === i && <DropLine />}
          <WidgetFrame
            id={id}
            dragging={dragging === id}
            onDragStart={() => onDragStartWidget(id)}
            onDragEnd={onDragEndWidget}
          />
        </Box>
      ))}
      {isTarget && dropAt?.index >= widgetIds.length && <DropLine />}
    </Box>
  )
}

function DropLine() {
  return <Box sx={{ height: 3, borderRadius: 2, bgcolor: '#6366f1', mb: 1 }} />
}

function WidgetFrame({ id, dragging, onDragStart, onDragEnd }) {
  const w = WIDGETS[id]
  if (!w) return null
  const { Component } = w

  return (
    <Box sx={{
      bgcolor: '#fff', borderRadius: 3, border: '1px solid #ececf1',
      opacity: dragging ? 0.45 : 1,
      transition: 'box-shadow .18s ease, opacity .15s ease',
      '&:hover': { boxShadow: '0 8px 24px rgba(15,23,42,.07)' },
    }}>
      <Box
        draggable
        onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onDragStart() }}
        onDragEnd={onDragEnd}
        sx={{
          display: 'flex', alignItems: 'center', gap: 0.8,
          px: 2, py: 1.4, borderBottom: '1px solid #f1f3f5',
          cursor: 'grab', '&:active': { cursor: 'grabbing' },
        }}
      >
        <DragIndicatorIcon sx={{ fontSize: 18, color: '#cbd5e1' }} />
        <Typography fontSize="0.95rem" fontWeight={700}>
          {w.emoji} {w.title}
        </Typography>
      </Box>
      <Box sx={{ p: 2 }}>
        <Component />
      </Box>
    </Box>
  )
}
