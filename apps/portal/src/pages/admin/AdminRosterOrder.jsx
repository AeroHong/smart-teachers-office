/**
 * 구성원 페이지 조직도 표시 순서 관리.
 *
 * 대시보드 구성원(Members.jsx) 화면의 사무실/교과/부서 트리는 하위 그룹을 원래
 * 항상 가나다순으로만 보여줬다(rosterTree.js). "교장실 → 행정실 → 1학년교무실" 같은
 * 실제 조직 순서와 안 맞아서, 여기서 관리자가 순서를 정하면 schools/{schoolId}
 * 문서의 rosterGroupOrder 필드에 저장하고 전 교직원이 그 순서로 본다
 * (사용자 요청, 2026-08-29).
 *
 * 순서는 연도별 값이 아니다 — 교장실→행정실 같은 순서가 매년 바뀔 이유가 없어서,
 * 이 탭만 위쪽 학년도 선택과 무관하게 항상 "지금" 학년도의 살아있는 이름 목록을
 * 기준으로 편집한다.
 *
 * 드래그는 Channels.jsx의 캔버스 탭 순서 바꾸기(handleTabPointerDown)와 같은 방식 —
 * 순정 Pointer Events로 삽입 위치를 계산해 세로 삽입선 + 커서를 따라다니는 고스트를
 * 보여주다가, 손을 뗀 시점에만 순서를 확정해 저장한다. 가로(탭) 버전을 세로(목록)로
 * 좌표축만 바꿔 옮겼다.
 */
import { useEffect, useRef, useState } from 'react'
import { collection, doc, getDoc, getDocs, query, updateDoc, where } from 'firebase/firestore'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import CircularProgress from '@mui/material/CircularProgress'
import Alert from '@mui/material/Alert'
import DragIndicatorIcon from '@mui/icons-material/DragIndicator'
import { db } from '@shared/lib/firebase'
import { COL, SCHOOLS, schoolPath, currentSchoolYear } from '@shared/lib/schema'

const ROOTS = [
  { key: 'office', label: '사무실', field: 'office' },
  { key: 'subject', label: '교과', field: 'subject' },
  { key: 'department', label: '부서', field: 'department' },
]

/** @param {string} schoolId */
export default function AdminRosterOrder({ schoolId }) {
  const [loading, setLoading] = useState(true)
  const [lists, setLists] = useState({ office: [], subject: [], department: [] })
  const [savingRoot, setSavingRoot] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!schoolId) return
    let alive = true
    setLoading(true)
    ;(async () => {
      try {
        const year = currentSchoolYear()
        const [assignSnap, schoolSnap] = await Promise.all([
          getDocs(query(
            collection(db, ...schoolPath(schoolId, COL.TEACHER_ASSIGNMENTS)),
            where('year', '==', year),
          )),
          getDoc(doc(db, SCHOOLS, schoolId)),
        ])
        const rows = assignSnap.docs.map(d => d.data())
        const savedOrder = schoolSnap.data()?.rosterGroupOrder || {}

        const next = {}
        ROOTS.forEach(root => {
          const live = [...new Set(rows.map(r => (r[root.field] || '').trim()).filter(Boolean))]
          const saved = savedOrder[root.key] || []
          const savedAlive = saved.filter(name => live.includes(name))
          const rest = live.filter(name => !saved.includes(name)).sort((a, b) => a.localeCompare(b, 'ko'))
          next[root.key] = [...savedAlive, ...rest]
        })
        if (alive) setLists(next)
      } catch (e) {
        if (alive) setError('표시 순서를 불러오지 못했습니다: ' + e.message)
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [schoolId])

  const handleReorder = async (rootKey, nextOrder) => {
    let previous
    setLists(prev => { previous = prev[rootKey]; return { ...prev, [rootKey]: nextOrder } })
    setSavingRoot(rootKey)
    try {
      await updateDoc(doc(db, SCHOOLS, schoolId), { [`rosterGroupOrder.${rootKey}`]: nextOrder })
    } catch (e) {
      setError('저장하지 못했습니다: ' + e.message)
      // 저장이 실패하면 화면과 실제 저장된 값이 어긋난다 — 되돌려서 다음 시도가
      // 헷갈리지 않게 한다.
      setLists(prev => ({ ...prev, [rootKey]: previous }))
    } finally {
      setSavingRoot(null)
    }
  }

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" mb={3}>
        구성원 페이지 조직도에서 사무실·교과·부서가 나열되는 순서입니다. 항목을 위아래로
        끌어서 옮기면 바로 저장됩니다. 아직 순서를 정하지 않은 항목은 가나다순으로
        뒤에 붙습니다.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>
      )}

      <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
        {ROOTS.map(root => (
          <OrderList
            key={root.key}
            label={root.label}
            names={lists[root.key]}
            saving={savingRoot === root.key}
            onReorder={(next) => handleReorder(root.key, next)}
          />
        ))}
      </Box>
    </Box>
  )
}

function OrderList({ label, names, saving, onReorder }) {
  const rowNodesRef = useRef(new Map())
  // { name, barLeft, barWidth, ghostTop, insertBeforeName, indicatorTop } | null
  const [dragRow, setDragRow] = useState(null)

  const handleRowPointerDown = (name, e) => {
    if (e.button !== 0) return // 왼쪽 버튼만
    const order = names
    const startNode = rowNodesRef.current.get(name)
    if (!startNode) return
    const startRect = startNode.getBoundingClientRect()
    const grabOffsetY = e.clientY - startRect.top
    const barLeft = startRect.left
    const barWidth = startRect.width
    setDragRow({ name, barLeft, barWidth, ghostTop: startRect.top, insertBeforeName: null, indicatorTop: null })

    const onMove = (ev) => {
      let insertBeforeName = null
      let indicatorTop = null
      for (const n of order) {
        if (n === name) continue
        const node = rowNodesRef.current.get(n)
        if (!node) continue
        const r = node.getBoundingClientRect()
        if (ev.clientY < r.top + r.height / 2) { insertBeforeName = n; indicatorTop = r.top; break }
      }
      if (indicatorTop === null) {
        const lastName = order[order.length - 1]
        const lastNode = (lastName === name ? startNode : rowNodesRef.current.get(lastName)) || startNode
        indicatorTop = lastNode.getBoundingClientRect().bottom
      }
      setDragRow(prev => prev && { ...prev, insertBeforeName, indicatorTop, ghostTop: ev.clientY - grabOffsetY })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setDragRow((prev) => {
        if (prev) {
          const finalOrder = order.filter(n => n !== name)
          const insertIdx = prev.insertBeforeName ? finalOrder.indexOf(prev.insertBeforeName) : -1
          finalOrder.splice(insertIdx === -1 ? finalOrder.length : insertIdx, 0, name)
          const changed = finalOrder.some((n, i) => n !== order[i])
          if (changed) onReorder(finalOrder)
        }
        return null
      })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <Box sx={{ minWidth: 240, flex: '1 1 240px' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Typography variant="subtitle2" fontWeight={700}>{label}</Typography>
        {saving && <CircularProgress size={12} />}
      </Box>

      <Box sx={{ border: '1px solid #e0e0e0', borderRadius: 1, overflow: 'hidden' }}>
        {names.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
            표시할 항목이 없습니다.
          </Typography>
        ) : names.map((name, i) => (
          <Box
            key={name}
            ref={el => {
              if (el) rowNodesRef.current.set(name, el)
              else rowNodesRef.current.delete(name)
            }}
            onPointerDown={e => handleRowPointerDown(name, e)}
            sx={{
              display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1,
              borderBottom: i < names.length - 1 ? '1px solid #f0f0f0' : 'none',
              cursor: 'grab', userSelect: 'none', bgcolor: '#fff', touchAction: 'none',
              opacity: dragRow?.name === name ? 0.25 : 1,
            }}
          >
            <DragIndicatorIcon sx={{ fontSize: 18, color: 'text.disabled' }} />
            <Typography fontSize="0.9rem">{name}</Typography>
          </Box>
        ))}
      </Box>

      {/* 커서를 따라다니는 고스트 — 실제 목록은 손을 뗄 때까지 그대로 두고
          미리보기만 보여준다(Channels.jsx 탭 드래그와 같은 방식). */}
      {dragRow && (
        <Box sx={{
          position: 'fixed', top: dragRow.ghostTop, left: dragRow.barLeft, width: dragRow.barWidth,
          zIndex: 1400, pointerEvents: 'none', display: 'flex', alignItems: 'center', gap: 1,
          px: 1.5, py: 1, bgcolor: '#fff', border: '1px solid #1976d2', borderRadius: 1,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        }}>
          <DragIndicatorIcon sx={{ fontSize: 18 }} />
          <Typography fontSize="0.9rem">{dragRow.name}</Typography>
        </Box>
      )}
      {dragRow?.indicatorTop != null && (
        <Box sx={{
          position: 'fixed', top: dragRow.indicatorTop - 1, left: dragRow.barLeft, width: dragRow.barWidth,
          height: 2, bgcolor: 'primary.main', zIndex: 1300, pointerEvents: 'none', borderRadius: 1,
        }} />
      )}
    </Box>
  )
}
