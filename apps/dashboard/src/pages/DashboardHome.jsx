import { useEffect, useState, useCallback } from 'react'
import { doc, getDoc, updateDoc } from 'firebase/firestore'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import DragIndicatorIcon from '@mui/icons-material/DragIndicator'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import DashboardLayout from '../components/DashboardLayout'
import MyTasksWidget from '../widgets/MyTasksWidget'
import CallsWidget from '../widgets/CallsWidget'
import PresenceWidget from '../widgets/PresenceWidget'

/**
 * 위젯 대시보드
 *
 * 탭으로 화면을 나누지 않고 한 화면 안에서 영역별로 보여준다.
 * 위젯은 열 사이를 드래그해 자유롭게 옮길 수 있고, 배치는 users/{uid}.dashboardLayout에
 * 저장돼 다음 접속에도 유지된다. 캘린더·메신저 같은 위젯은 WIDGETS에 항목만 추가하면 된다.
 *
 * 화면 기준: FHD(1920×1080) 이상 (개발 스펙 6.6). 좁아지면 열이 자동으로 접힌다.
 */

const WIDGETS = {
  tasks:    { title: '내 업무',   emoji: '📋', Component: MyTasksWidget },
  calls:    { title: '호출 알림', emoji: '🔔', Component: CallsWidget },
  presence: { title: '내 상태',   emoji: '🟢', Component: PresenceWidget },
}

const DEFAULT_LAYOUT = [['tasks'], ['presence', 'calls']]

// 저장된 배치에 빠진 위젯이 있으면 마지막 열에 붙이고, 없어진 위젯 id는 걸러낸다
function normalizeLayout(saved) {
  const known = Object.keys(WIDGETS)
  const base = Array.isArray(saved) && saved.length > 0
    ? saved.map(col => (Array.isArray(col) ? col.filter(id => known.includes(id)) : []))
    : DEFAULT_LAYOUT.map(col => [...col])

  while (base.length < DEFAULT_LAYOUT.length) base.push([])
  const placed = new Set(base.flat())
  known.forEach(id => { if (!placed.has(id)) base[base.length - 1].push(id) })
  return base
}

export default function DashboardHome() {
  const { user } = useAuth()
  const [layout, setLayout] = useState(() => normalizeLayout(null))
  const [loaded, setLoaded] = useState(false)
  const [dragging, setDragging] = useState(null)          // 끌고 있는 위젯 id
  const [dropAt, setDropAt] = useState(null)              // { col, index }

  useEffect(() => {
    if (!user) return
    getDoc(doc(db, 'users', user.uid))
      .then(snap => setLayout(normalizeLayout(snap.data()?.dashboardLayout)))
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [user])

  const persist = useCallback(async (next) => {
    setLayout(next)
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
