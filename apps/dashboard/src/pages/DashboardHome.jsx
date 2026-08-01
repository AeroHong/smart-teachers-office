import { useEffect, useState, useCallback, useMemo } from 'react'
import { collection, doc, getDoc, onSnapshot, updateDoc } from 'firebase/firestore'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Skeleton from '@mui/material/Skeleton'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Tooltip from '@mui/material/Tooltip'
import DragIndicatorIcon from '@mui/icons-material/DragIndicator'
import EditIcon from '@mui/icons-material/Tune'
import DoneIcon from '@mui/icons-material/Done'
import { alpha } from '@mui/material/styles'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { COL, schoolPath, teacherAssignmentId, currentSchoolYear } from '@shared/lib/schema'
import { MODULE_CATALOG, isModuleVisibleToMe, mergeModuleSettings } from '@shared/lib/dashboardModules'
import { ListSkeleton, WidgetBadgeProvider } from '../components/widgetUi'
import ErrorBoundary from '../components/ErrorBoundary'
import { useToast } from '../components/ToastProvider'
import DashboardLayout from '../components/DashboardLayout'
import MyRequestsWidget from '../widgets/MyRequestsWidget'
import CallsWidget from '../widgets/CallsWidget'
import PresenceWidget from '../widgets/PresenceWidget'
import AnnouncementsWidget from '../widgets/AnnouncementsWidget'
import CalendarWidget from '../widgets/CalendarWidget'
import {
  DEFAULT_LAYOUT, GRID_COLUMNS, SIZES, SIZE_KEYS,
  moveItem, normalizeLayout, setSize,
} from '../lib/dashboardLayout'

/**
 * 위젯 대시보드 (3분할 셸의 가운데 캔버스)
 *
 * 12열 그리드에 위젯을 순서대로 흘려보내고, 위젯마다 폭(S/M/L)을 고른다.
 * 평소에는 배치가 잠겨 있고 '배치 편집'을 눌러야 옮기거나 크기를 바꿀 수 있다 —
 * 매일 보는 화면이라 지나가다 실수로 끌어 옮기는 일이 없어야 한다.
 *
 * CORE_WIDGETS는 항상 노출된다. OPTIONAL_WIDGETS는 schools/{id}/dashboardModules 문서의
 * enabled + visibility로 관리자가 켜고 끄며 대상을 지정한다.
 */

// 요청받은 일은 끌 수 없는 핵심 위젯이다. 이걸 숨길 수 있으면 "할 일이 하나도 안 빠지고
// 보인다"는 전제가 무너져, 마감을 놓치고도 시스템 탓을 할 수 없게 된다.
//
// 예전에 있던 '내 업무'(tasks)는 업무 요청과 같은 기능이라 걷어냈다. 요청 만들기에서
// 대상을 자신으로 지정하면 개인 업무가 되므로 별도 컬렉션을 둘 이유가 없었고,
// 할 일 목록이 둘로 갈려 있으면 "하나도 안 빠지고 보인다"는 전제도 무너진다.
const CORE_WIDGETS = {
  requests: { title: '요청받은 일', emoji: '✅', Component: MyRequestsWidget },
  calls:    { title: '호출 알림',   emoji: '🔔', Component: CallsWidget },
  presence: { title: '내 상태',     emoji: '🟢', Component: PresenceWidget },
}

const OPTIONAL_COMPONENTS = {
  announcements: AnnouncementsWidget,
  calendar: CalendarWidget,
}

const OPTIONAL_WIDGETS = Object.fromEntries(
  Object.entries(MODULE_CATALOG).map(([key, meta]) => [key, { ...meta, Component: OPTIONAL_COMPONENTS[key] }]),
)

const WIDGETS = { ...CORE_WIDGETS, ...OPTIONAL_WIDGETS }

export default function DashboardHome() {
  const { user, schoolId } = useAuth()
  const toast = useToast()
  const [rawLayout, setRawLayout] = useState(null)        // Firestore 원본 배치 (미로드 시 null)
  const [layoutLoaded, setLayoutLoaded] = useState(false)
  const [modules, setModules] = useState([])
  const [modulesLoaded, setModulesLoaded] = useState(false)
  const [department, setDepartment] = useState(null)
  const [editing, setEditing] = useState(false)
  const [dragIndex, setDragIndex] = useState(null)
  const [dropIndex, setDropIndex] = useState(null)

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
    // 설정 문서가 아직 없는 모듈은 mergeModuleSettings가 카탈로그 기본값으로 채워주므로,
    // 관리자가 한 번도 설정을 만지지 않은 학교에서도 기본 위젯이 그대로 보인다.
    const optionalIds = mergeModuleSettings(modules)
      .filter(m => OPTIONAL_WIDGETS[m.key] && isModuleVisibleToMe(m, { uid: user?.uid, department }))
      .map(m => m.key)
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
      // 화면상으론 이미 옮겨진 것처럼 보이므로, 저장 실패는 반드시 알려야 한다
      toast.error('위젯 배치를 저장하지 못했습니다. 새로고침하면 원래대로 돌아갑니다.', e)
    }
  }, [user, toast])

  const handleDrop = (targetIndex) => {
    if (dragIndex == null) return
    persist(moveItem(layout, dragIndex, targetIndex))
    setDragIndex(null)
    setDropIndex(null)
  }

  const handleResize = (id, size) => persist(setSize(layout, id, size))
  const resetLayout = () => persist(DEFAULT_LAYOUT.filter(item => visibleWidgetIds.includes(item.id)))

  if (!loaded) {
    return (
      <DashboardLayout>
        <Box sx={{ maxWidth: 1360, mx: 'auto' }}>
          <Skeleton variant="text" width={120} height={30} sx={{ mb: 1.5 }} />
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(12, 1fr)' }, gap: 1.25 }}>
            {[12, 4, 4].map((span, i) => (
              <Skeleton
                key={i} variant="rounded" height={220}
                sx={{ gridColumn: { xs: '1 / -1', md: `span ${span}` }, borderRadius: 1.25 }}
              />
            ))}
          </Box>
        </Box>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      {/* 1680px까지 늘리면 리스트 한 줄이 1500px를 가로질러 눈이 끝까지 따라가야 한다.
          읽기 좋은 폭에서 멈추고 남는 가로는 여백으로 둔다. */}
      <Box sx={{ maxWidth: 1360, mx: 'auto' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
          <Typography variant="h6" fontWeight={800}>대시보드</Typography>
          {editing && (
            <Typography fontSize="0.8rem" color="text.secondary">
              위젯을 끌어 옮기거나 폭을 고르세요
            </Typography>
          )}
          <Box sx={{ flexGrow: 1 }} />
          {editing && <Button size="small" onClick={resetLayout}>기본 배치로</Button>}
          <Button
            size="small"
            variant={editing ? 'contained' : 'text'}
            startIcon={editing ? <DoneIcon /> : <EditIcon />}
            onClick={() => { setEditing(v => !v); setDragIndex(null); setDropIndex(null) }}
          >
            {editing ? '완료' : '배치 편집'}
          </Button>
        </Box>

        <Box sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            md: `repeat(${GRID_COLUMNS}, 1fr)`,
          },
          gap: 1.25,
          alignItems: 'start',
        }}>
          {layout.map((item, index) => (
            <WidgetFrame
              key={item.id}
              item={item}
              index={index}
              editing={editing}
              dragging={dragIndex === index}
              dropTarget={dropIndex === index && dragIndex !== index}
              onDragStart={() => setDragIndex(index)}
              onDragEnd={() => { setDragIndex(null); setDropIndex(null) }}
              onDragOver={() => setDropIndex(index)}
              onDrop={() => handleDrop(index)}
              onResize={handleResize}
            />
          ))}
        </Box>
      </Box>
    </DashboardLayout>
  )
}

/**
 * 위젯 한 장의 껍데기. 테두리·제목·여백이 여기서만 정해지므로 위젯을 추가해도 통일감이 유지된다.
 * 드래그 손잡이와 크기 선택은 편집 모드에서만 나타난다.
 */
function WidgetFrame({
  item, index, editing, dragging, dropTarget,
  onDragStart, onDragEnd, onDragOver, onDrop, onResize,
}) {
  const [badge, setBadge] = useState(null)
  const w = WIDGETS[item.id]
  if (!w) return null
  const { Component } = w
  const span = SIZES[item.size]?.span ?? 6

  return (
    <Box
      draggable={editing}
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onDragStart() }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => { if (editing) { e.preventDefault(); onDragOver() } }}
      onDrop={(e) => { if (editing) { e.preventDefault(); onDrop() } }}
      sx={theme => ({
        gridColumn: { xs: '1 / -1', md: `span ${span}` },
        bgcolor: 'background.paper', borderRadius: 1.25,
        border: '1px solid',
        borderColor: dropTarget ? 'primary.main' : 'divider',
        boxShadow: dropTarget ? `0 0 0 3px ${alpha(theme.palette.primary.main, 0.15)}` : 'none',
        opacity: dragging ? 0.45 : 1,
        cursor: editing ? 'grab' : 'default',
        transition: 'opacity .15s ease, border-color .15s ease',
        '&:active': editing ? { cursor: 'grabbing' } : undefined,
      })}
    >
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 0.7,
        px: 1.5, py: 0.85, borderBottom: '1px solid', borderColor: 'divider',
      }}>
        {editing && <DragIndicatorIcon sx={{ fontSize: 18, color: 'text.disabled' }} />}
        {/* 이모지를 제목과 한 문자열로 두면 공백이 뭉개져 '✅요청받은 일'로 붙어 보인다 */}
        <Typography fontSize="0.9rem" sx={{ lineHeight: 1, flexShrink: 0 }}>{w.emoji}</Typography>
        <Typography fontSize="0.875rem" fontWeight={700} noWrap letterSpacing="-.01em">
          {w.title}
        </Typography>
        {!editing && badge != null && (
          <Chip
            size="small"
            label={badge}
            color="primary"
            sx={{ height: 20, minWidth: 20, fontSize: '0.72rem', fontWeight: 700 }}
          />
        )}
        <Box sx={{ flexGrow: 1 }} />
        {editing && <SizePicker value={item.size} onChange={(size) => onResize(item.id, size)} />}
      </Box>

      {/* 편집 중에는 내용을 접어둔다 — 위젯이 길면 끌어 옮길 때 화면이 크게 튄다.
          본문 높이 상한은 화면에 비례시킨다. 460px 고정이면 768px 노트북에서 위젯 하나가
          화면의 60%를 차지해 두 개밖에 안 보인다. */}
      {!editing && (
        <Box sx={{ p: 1.5, maxHeight: 'min(420px, 44vh)', overflowY: 'auto' }}>
          {/* 위젯 하나가 터져도 나머지 화면은 살아 있어야 한다 */}
          <ErrorBoundary label={w.title}>
            <WidgetBadgeProvider onChange={setBadge}>
              <Component />
            </WidgetBadgeProvider>
          </ErrorBoundary>
        </Box>
      )}
    </Box>
  )
}

function SizePicker({ value, onChange }) {
  return (
    <ToggleButtonGroup
      size="small"
      exclusive
      value={value}
      onChange={(_, next) => next && onChange(next)}
      onClick={(e) => e.stopPropagation()}
      sx={{ '& .MuiToggleButton-root': { px: 1, py: 0.1, fontSize: '0.7rem', fontWeight: 700 } }}
    >
      {SIZE_KEYS.map(key => (
        <Tooltip key={key} title={SIZES[key].label}>
          <ToggleButton value={key} aria-label={SIZES[key].label}>{key}</ToggleButton>
        </Tooltip>
      ))}
    </ToggleButtonGroup>
  )
}
