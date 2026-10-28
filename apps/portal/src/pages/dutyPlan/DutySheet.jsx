import { useMemo, useRef, useState, useSyncExternalStore } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import InputBase from '@mui/material/InputBase'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import DragIndicatorIcon from '@mui/icons-material/DragIndicator'
import { addTask, approvalRows, groupPlan, matchDuty, matchTask, moveAssignee, moveDuty, moveTasks, shiftDepartment, swapTasks, taskText } from '@shared/lib/dutyPlan'
import { DUTY_DRAG, NAME_DRAG, PERSON_DRAG, TASK_DRAG, dropIndexIn, hasType, nameDragStore, readPerson, taskDragStore } from './dutyDnd'
import { ACCENT, ACCENT_BG, CATEGORY_STYLE, ROLE_STYLE } from './dutyUi'

// 원본 표 열 — 구분 · 부서(번호) · 성명 · 담임 · 업무 · 주요 업무 내용
// 앞쪽 열은 내용만큼만 — 남는 폭은 모두 주요 업무 내용 칸으로(두 쪽 보기 FHD 한 쪽 약 740px)
const COLS = [24, 50, 40, 56, 32, 96, null]
const BORDER = '1px solid #cbd5e1'
// 부서 색 — 부서 칸 바탕과 왼쪽 띠. 같은 구분 안 이웃 부서끼리 다르게(order 순)
const DEPT_COLORS = [
  { bg: '#eff6ff', fg: '#1e40af', bd: '#60a5fa' }, { bg: '#f0fdf4', fg: '#166534', bd: '#4ade80' },
  { bg: '#fff7ed', fg: '#9a3412', bd: '#fb923c' }, { bg: '#faf5ff', fg: '#6b21a8', bd: '#c084fc' },
  { bg: '#ecfeff', fg: '#155e75', bd: '#22d3ee' }, { bg: '#fdf2f8', fg: '#9d174d', bd: '#f472b6' },
  { bg: '#fefce8', fg: '#854d0e', bd: '#facc15' },
]
const th = { border: BORDER, bgcolor: '#e2e8f0', fontWeight: 800, fontSize: '0.82rem', py: 0.75, px: 0.5, textAlign: 'center', position: 'sticky', top: 0, zIndex: 2 }
const td = { border: BORDER, px: 0.4, py: 0.5, fontSize: '0.85rem', textAlign: 'center', verticalAlign: 'middle', bgcolor: '#fff' }

/**
 * 이름 카드 — 끌기 미리보기 상태(tone)에 따라 모양을 바꾼다.
 *   normal 보통 · dragging 끌고 있는 원본(흐리게) · incoming 놓으면 들어올 이름(초록 점선)
 *   outgoing 놓으면 원래 줄에 남을 결과(맞바뀔 이름·비움 — 주황 점선) · copied 복사라 그대로 남음
 */
function NameChip({ name, linked = true, tone = 'normal', note, ...rest }) {
  const look = {
    normal: { bd: linked ? '#cbd5e1' : '#fdba74', bg: linked ? '#f8fafc' : '#fff7ed', fg: '#0f172a', style: 'solid' },
    dragging: { bd: '#cbd5e1', bg: '#f1f5f9', fg: '#94a3b8', style: 'solid' },
    incoming: { bd: '#16a34a', bg: '#dcfce7', fg: '#14532d', style: 'dashed' },
    outgoing: { bd: '#f59e0b', bg: '#fef3c7', fg: '#78350f', style: 'dashed' },
    copied: { bd: '#16a34a', bg: '#f0fdf4', fg: '#14532d', style: 'solid' },
  }[tone]
  return (
    <Box {...rest} sx={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 0.1, ...(rest.sx || {}) }}>
      <Box sx={{
        px: 0.5, py: 0.2, borderRadius: 1, wordBreak: 'keep-all', lineHeight: 1.3, transition: 'all .12s',
        border: `${tone === 'incoming' || tone === 'outgoing' ? 2 : 1}px ${look.style} ${look.bd}`, bgcolor: look.bg, color: look.fg,
        fontStyle: name ? 'normal' : 'italic', fontWeight: name ? 800 : 500, fontSize: name ? 'inherit' : '0.72rem',
        boxShadow: tone === 'incoming' ? '0 0 0 3px rgba(22,163,74,0.15)' : 'none',
      }}>{name || '비움'}</Box>
      {note && <Box sx={{ fontSize: '0.62rem', fontWeight: 700, color: look.fg, whiteSpace: 'nowrap' }}>{note}</Box>}
    </Box>
  )
}

/** 업무 내용 카드 한 장 — selected(고름)·swap(놓으면 맞바뀔 대상)·dragging(끌고 있는 카드) */
function TaskChip({ task, editable, hit, selected, swap, dragging, onClick, onDragStart, onDragEnd }) {
  return (
    <Box
      data-task-id={task.id}
      draggable={editable}
      onDragStart={editable ? onDragStart : undefined}
      onDragEnd={onDragEnd}
      onClick={(e) => { e.stopPropagation(); onClick?.(task, e) }}
      sx={{
        position: 'relative', display: 'inline-flex', alignItems: 'center', maxWidth: '100%', px: 0.9, py: 0.3, borderRadius: 1,
        border: swap ? '2px dashed #2563eb' : `1px solid ${selected ? ACCENT : hit ? '#f59e0b' : '#e2e8f0'}`,
        bgcolor: swap ? '#dbeafe' : selected ? '#ffedd5' : hit ? '#fef3c7' : '#f8fafc',
        boxShadow: selected && !swap ? `0 0 0 1px ${ACCENT}` : 'none', opacity: dragging ? 0.4 : 1,
        fontSize: '0.8rem', lineHeight: 1.4, cursor: editable ? 'grab' : 'pointer', textAlign: 'left', transition: 'background-color .1s, border-color .1s',
        userSelect: 'none', '&:hover': swap ? {} : { borderColor: ACCENT, bgcolor: selected ? '#ffedd5' : ACCENT_BG },
      }}>
      <span>{taskText(task)}</span>
      {task.note && <Box component="span" sx={{ ml: 0.5, color: '#94a3b8', fontSize: '0.7rem' }}>✎</Box>}
      {swap && (
        <Box sx={{ position: 'absolute', top: -9, right: -6, px: 0.4, borderRadius: 1, bgcolor: '#2563eb', color: '#fff', fontSize: '0.6rem', fontWeight: 800, lineHeight: 1.5 }}>↔ 교환</Box>
      )}
    </Box>
  )
}

/** 끼워 넣을 자리 표시 */
const InsertBar = () => <Box sx={{ width: 3, alignSelf: 'stretch', minHeight: 20, borderRadius: 2, bgcolor: ACCENT, boxShadow: `0 0 0 2px ${ACCENT}33` }} />

/**
 * 커서 아래 판정 — 카드 가운데(가로 25~75%)면 교환, 가장자리면 그 앞·뒤에 끼워 넣기, 빈 곳이면 가장 가까운 자리.
 * @returns {{ type: 'swap', id } | { type: 'insert', index }}
 */
function dropHint(box, e, allowSwap) {
  const chips = [...box.querySelectorAll('[data-task-id]')]
  for (let i = 0; i < chips.length; i++) {
    const r = chips[i].getBoundingClientRect()
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) continue
    const rx = (e.clientX - r.left) / r.width
    if (allowSwap && rx > 0.25 && rx < 0.75) return { type: 'swap', id: chips[i].getAttribute('data-task-id') }
    return { type: 'insert', index: rx <= 0.5 ? i : i + 1 }
  }
  return { type: 'insert', index: dropIndexIn(box, '[data-task-id]', e.clientX, e.clientY) }
}

/**
 * 업무 내용 칸 — 카드를 줄바꿈해 늘어놓는다. editable이면 다른 칸·보관함에서 끌어 놓기, 맨 끝 '+'로 바로 입력
 * (Enter로 하나씩, 여러 줄을 붙여 넣으면 줄마다 카드 하나).
 * 여러 장을 고른 채(selectedIds) 그중 하나를 끌면 고른 카드가 모두 옮겨진다(dragIdsFor가 표 순서대로 돌려준다).
 * 한 장만 끌 때는 카드 가운데에 놓으면 서로 맞바꾸고, 가장자리·빈 곳에 놓으면 끼워 넣는다.
 */
export function TaskCell({ tasks, dutyId, editable, q, selectedIds, onChange, onTaskClick, dragIdsFor, minHeight = 30, emptyText }) {
  const [hint, setHint] = useState(null)
  const [adding, setAdding] = useState(false)
  const [text, setText] = useState('')
  const drag = useSyncExternalStore(taskDragStore.subscribe, taskDragStore.get)
  const boxRef = useRef(null)
  const commit = (raw) => {
    const lines = String(raw).split('\n').map((s) => s.trim()).filter(Boolean)
    if (!lines.length) return
    onChange((d) => lines.reduce((acc, line) => addTask(acc, dutyId, line).data, d))
    setText('')
  }
  const draggingIds = drag?.ids || []
  const startDrag = (t) => (e) => {
    e.stopPropagation()
    const ids = dragIdsFor ? dragIdsFor(t) : [t.id]
    e.dataTransfer.setData(TASK_DRAG, JSON.stringify(ids))
    e.dataTransfer.effectAllowed = 'move'
    taskDragStore.start(ids)
  }
  const chips = []
  tasks.forEach((t, i) => {
    if (hint?.type === 'insert' && hint.index === i) chips.push(<InsertBar key="bar" />)
    chips.push(
      <TaskChip key={t.id} task={t} editable={editable} hit={matchTask(t, q)} selected={selectedIds?.has(t.id)}
        swap={hint?.type === 'swap' && hint.id === t.id} dragging={draggingIds.includes(t.id)}
        onClick={onTaskClick} onDragStart={startDrag(t)} onDragEnd={() => taskDragStore.end()} />,
    )
  })
  if (hint?.type === 'insert' && hint.index >= tasks.length) chips.push(<InsertBar key="bar" />)

  return (
    <Box ref={boxRef}
      onDragOver={editable ? (e) => {
        if (!hasType(e, TASK_DRAG)) return
        e.preventDefault(); e.stopPropagation()
        const ids = taskDragStore.get()?.ids || []
        const h = dropHint(boxRef.current, e, ids.length === 1)
        // 자기 자신 위에서는 아무것도 안 한다
        const next = h.type === 'swap' && ids.includes(h.id) ? null : h
        setHint((p) => (JSON.stringify(p) === JSON.stringify(next) ? p : next))
      } : undefined}
      onDragLeave={editable ? (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setHint(null) } : undefined}
      onDrop={editable ? (e) => {
        if (!hasType(e, TASK_DRAG)) return
        e.preventDefault(); e.stopPropagation()
        const h = hint || dropHint(boxRef.current, e, false)
        setHint(null)
        let ids = []
        try { ids = JSON.parse(e.dataTransfer.getData(TASK_DRAG)) } catch { ids = [e.dataTransfer.getData(TASK_DRAG)] }
        ids = ids.filter(Boolean)
        if (!ids.length) return
        if (h.type === 'swap' && ids.length === 1) onChange((d) => swapTasks(d, ids[0], h.id))
        else onChange((d) => moveTasks(d, ids, dutyId, h.type === 'insert' ? h.index : Infinity))
        taskDragStore.end()
      } : undefined}
      sx={{
        display: 'flex', flexWrap: 'wrap', gap: 0.5, alignItems: 'center', minHeight, p: 0.25, borderRadius: 1,
        outline: hint ? `2px dashed ${hint.type === 'swap' ? '#93c5fd' : ACCENT}` : 'none', bgcolor: hint ? (hint.type === 'swap' ? '#eff6ff' : ACCENT_BG) : 'transparent',
      }}>
      {chips}
      {!tasks.length && !adding && emptyText && !hint && <Typography variant="caption" sx={{ color: '#94a3b8' }}>{emptyText}</Typography>}
      {editable && (adding ? (
        <InputBase autoFocus multiline value={text} placeholder="업무 내용 입력 후 Enter (Esc 닫기)"
          onChange={(e) => setText(e.target.value)}
          onPaste={(e) => {
            const pasted = e.clipboardData.getData('text')
            if (pasted.includes('\n')) { e.preventDefault(); commit(pasted) }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); commit(text) }
            if (e.key === 'Escape') { setAdding(false); setText('') }
          }}
          onBlur={() => { commit(text); setAdding(false) }}
          sx={{ flex: '1 1 220px', fontSize: '0.8rem', px: 0.75, border: `1px solid ${ACCENT}`, borderRadius: 1, bgcolor: '#fff', '& textarea::placeholder': { fontSize: '0.72rem', color: '#a3afbf', opacity: 1 } }} />
      ) : (
        <Tooltip title="업무 내용 카드 추가">
          <IconButton size="small" onClick={(e) => { e.stopPropagation(); setAdding(true) }} sx={{ p: 0.25, color: '#94a3b8', '&:hover': { color: ACCENT } }}>
            <AddIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
      ))}
      {drag && drag.ids.length > 1 && hint && (
        <Box sx={{ fontSize: '0.66rem', fontWeight: 800, color: ACCENT }}>{drag.ids.length}장 넣기</Box>
      )}
    </Box>
  )
}

/**
 * 업무분장표 — 한글 원본과 같은 머리(구분 · 부서 · 성명 · 담임 · 업무 · 주요 업무 내용)로 세로로 길게.
 * 한 줄 = 업무 한 자리, 주요 업무 내용 = 카드. editable이면
 *   · 카드를 다른 줄·보관함으로 끌어 옮기고, '+'로 바로 추가, 눌러서 고치기(onTaskClick)
 *   · 업무 칸의 손잡이로 줄을 끌어 다른 줄 앞·다른 부서로 옮기기
 *   · assign이면 교직원 패널의 사람을 성명 칸에 놓아 담당자 정하기(onDropPerson)
 * 검색어(q)에 안 걸리는 줄은 흐리게, 걸린 카드는 노랗게. highlight(duty)가 참인 줄은 강조(내 업무·고른 사람·내 지망).
 */
export default function DutySheet({
  data, editable = false, assign = false, q = '', highlight, onlyHighlighted = false, rowExtra, selectedIds, selectedDutyId, dragIdsFor,
  onChange, onTaskClick, onDutyClick, onEditDuty, onEditDept, onAddDuty, onDropPerson,
}) {
  const rows = useMemo(() => approvalRows(data), [data])
  const dutyById = useMemo(() => new Map((data.duties || []).map((d) => [d.id, d])), [data.duties])
  const depts = useMemo(() => groupPlan(data).categories.flatMap((c) => c.departments), [data])
  const deptByName = useMemo(() => new Map(depts.map((d) => [`${d.category}|${d.name}`, d])), [depts])
  const [overRow, setOverRow] = useState(null)
  const nd = useSyncExternalStore(nameDragStore.subscribe, nameDragStore.get)

  const dropRow = (e, duty, dept) => {
    if (!editable) return
    if (hasType(e, DUTY_DRAG)) {
      e.preventDefault(); setOverRow(null)
      const id = e.dataTransfer.getData(DUTY_DRAG)
      if (!id || id === duty?.id) return
      const index = duty ? dept.duties.filter((x) => x.id !== id).findIndex((x) => x.id === duty.id) : Infinity
      onChange((d) => moveDuty(d, id, dept.id, index))
    } else if (assign && duty && hasType(e, PERSON_DRAG)) {
      e.preventDefault(); setOverRow(null)
      const p = readPerson(e)
      if (p) onDropPerson?.(duty.id, p)
    } else if (assign && duty && hasType(e, NAME_DRAG)) {
      // 이름 카드 — 옮기기(사람이 있으면 맞바꾸기), Ctrl을 누른 채 놓으면 복사
      e.preventDefault(); setOverRow(null)
      const from = e.dataTransfer.getData(NAME_DRAG)
      onChange((d) => moveAssignee(d, from, duty.id, { copy: e.ctrlKey || e.metaKey }))
      nameDragStore.end()
    }
  }
  const overHandler = (key) => (editable ? (e) => {
    if (hasType(e, DUTY_DRAG) || (assign && (hasType(e, PERSON_DRAG) || hasType(e, NAME_DRAG)))) {
      e.preventDefault()
      if (hasType(e, NAME_DRAG)) {
        const copy = e.ctrlKey || e.metaKey
        e.dataTransfer.dropEffect = copy ? 'copy' : 'move'
        const duty = dutyById.get(key)
        nameDragStore.over(duty ? duty.id : null, copy, duty?.assigneeName || '')
        return
      }
      setOverRow(key)
    }
  } : undefined)

  return (
    <Box sx={{ border: BORDER, borderRadius: 1.5, overflow: 'visible', bgcolor: '#fff' }}>
      <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <colgroup>{COLS.map((w, i) => <col key={i} style={w ? { width: w } : undefined} />)}</colgroup>
        <thead>
          <tr>
            <Box component="th" sx={th}>구분</Box>
            <Box component="th" sx={th} colSpan={2}>부서</Box>
            <Box component="th" sx={th}>성명</Box>
            <Box component="th" sx={th}>담임</Box>
            <Box component="th" sx={th}>업무</Box>
            <Box component="th" sx={th}>주 요 업 무 내 용</Box>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const duty = r.id ? dutyById.get(r.id) : null
            const dept = deptByName.get(`${r.category}|${r.dept}`)
            const cs = CATEGORY_STYLE[r.category] || CATEGORY_STYLE.교무행정지원
            const hi = duty && highlight?.(duty)
            const dim = duty && ((q && !matchDuty(duty, q, { deptName: r.dept })) || (onlyHighlighted && !hi))
            const rowBg = duty && duty.id === selectedDutyId ? '#ffedd5' : hi ? ACCENT_BG : '#fff'
            const role = duty && ROLE_STYLE[duty.roleType]
            const key = duty?.id || `empty-${dept?.id}`
            // 구분·부서 칸은 첫 줄에 붙어 있어 줄(tr) 전체를 흐리면 같이 흐려진다 — 줄의 칸만 흐린다
            const dc = DEPT_COLORS[((r.category === '교육활동' ? 4 : 0) + (dept?.order || 0)) % DEPT_COLORS.length]
            const deptTop = r.deptSpan > 0 ? '2px solid #475569' : BORDER
            const c = { ...td, bgcolor: rowBg, opacity: dim ? 0.35 : 1, borderTop: overRow === key ? `3px solid ${ACCENT}` : deptTop }
            return (
              <Box component="tr" key={key}
                onDragOver={overHandler(key)} onDragLeave={() => setOverRow((k) => (k === key ? null : k))}
                onDrop={(e) => dropRow(e, duty, dept)}>
                {r.categorySpan > 0 && (
                  <Box component="td" rowSpan={r.categorySpan} sx={{ ...td, bgcolor: cs.bg, color: cs.fg, fontWeight: 800, fontSize: '0.78rem', writingMode: 'vertical-rl', letterSpacing: 2, px: 0 }}>
                    {r.category}
                  </Box>
                )}
                {r.deptSpan > 0 && (
                  <Box component="td" rowSpan={r.deptSpan} sx={{ ...td, px: 0.25, fontWeight: 800, fontSize: '0.78rem', lineHeight: 1.25, bgcolor: dc.bg, color: dc.fg, borderTop: '2px solid #475569', boxShadow: `inset 4px 0 0 ${dc.bd}`, '&:hover .dept-tools': { visibility: 'visible' } }}
                    onDragOver={overHandler(`dept-${dept?.id}`)}
                    onDrop={(e) => { e.stopPropagation(); dropRow(e, null, dept) }}>
                    <Box sx={{ wordBreak: 'break-all' }}>{r.dept}</Box>
                    {editable && dept && (
                      <Box className="dept-tools" sx={{ visibility: 'hidden', mt: 0.25, display: 'flex', flexDirection: 'column', alignItems: 'center', '& .MuiIconButton-root': { p: 0.25 } }}>
                        <Tooltip title="부서 고치기"><IconButton size="small" onClick={() => onEditDept?.(dept)}><EditIcon sx={{ fontSize: 15 }} /></IconButton></Tooltip>
                        <Tooltip title="줄 추가"><IconButton size="small" onClick={() => onAddDuty?.(dept.id)}><AddIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>
                        <Tooltip title="부서를 위로"><IconButton size="small" onClick={() => onChange((d) => shiftDepartment(d, dept.id, -1))}><ArrowUpwardIcon sx={{ fontSize: 14 }} /></IconButton></Tooltip>
                        <Tooltip title="부서를 아래로"><IconButton size="small" onClick={() => onChange((d) => shiftDepartment(d, dept.id, 1))}><ArrowDownwardIcon sx={{ fontSize: 14 }} /></IconButton></Tooltip>
                      </Box>
                    )}
                  </Box>
                )}
                {!duty ? (
                  <Box component="td" colSpan={5} sx={{ ...td, color: '#94a3b8', fontSize: '0.78rem' }}>
                    {editable ? '줄이 없습니다 — 부서 칸의 + 로 줄을 만들거나 보관함에서 끌어 놓으세요' : '업무 없음'}
                  </Box>
                ) : (
                  <>
                    <Box component="td" sx={{ ...c, fontSize: '0.7rem', color: '#475569', wordBreak: 'break-all', px: 0.25 }}>{r.slotLabel}</Box>
                    <Box component="td" sx={{ ...c, fontWeight: 800, fontSize: '0.82rem', wordBreak: 'keep-all', color: duty.assigneeName && !duty.assigneeUid ? '#b45309' : '#0f172a', cursor: onDutyClick || editable ? 'pointer' : 'default' }}
                      onClick={() => (editable ? onEditDuty?.(duty) : onDutyClick?.(duty))}>
                      {(() => {
                        // 이름 카드를 끄는 중이면 놓을 줄·원래 줄에 결과를 미리 그린다
                        const isTarget = nd && nd.targetId === duty.id && nd.fromId !== duty.id
                        const isSource = nd && nd.fromId === duty.id
                        if (isTarget) {
                          return <NameChip name={nd.name} tone="incoming"
                            note={nd.copy ? '복사해 넣기' : r.name ? `↔ ${r.name}와 맞바꿈` : '여기로 옮김'} />
                        }
                        if (isSource && nd.targetId) {
                          return nd.copy
                            ? <NameChip name={r.name} tone="copied" note="그대로 남음" />
                            : <NameChip name={nd.targetName} tone="outgoing" note={nd.targetName ? '맞바뀌어 들어옴' : '비워짐'} />
                        }
                        if (!r.name) return editable ? <Typography variant="caption" sx={{ color: '#cbd5e1' }}>{assign ? '사람 놓기' : '—'}</Typography> : ''
                        if (!(editable && assign)) return r.name
                        return (
                          <NameChip name={r.name} linked={Boolean(duty.assigneeUid)} tone={isSource ? 'dragging' : 'normal'}
                            draggable
                            onClick={(e) => { e.stopPropagation(); onEditDuty?.(duty) }}
                            onDragStart={(e) => {
                              e.stopPropagation()
                              e.dataTransfer.setData(NAME_DRAG, duty.id)
                              e.dataTransfer.effectAllowed = 'copyMove'
                              nameDragStore.start(duty.id, r.name)
                            }}
                            onDragEnd={() => nameDragStore.end()}
                            sx={{ cursor: 'grab', '&:hover > div:first-of-type': { borderColor: ACCENT, bgcolor: ACCENT_BG } }} />
                        )
                      })()}
                    </Box>
                    <Box component="td" sx={{ ...c, fontSize: '0.78rem', color: r.mark === '비' ? '#94a3b8' : '#15803d', fontWeight: 700 }}>{r.mark}</Box>
                    <Box component="td" sx={c}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                        {editable && (
                          <Box draggable onDragStart={(e) => { e.dataTransfer.setData(DUTY_DRAG, duty.id); e.dataTransfer.effectAllowed = 'move' }}
                            sx={{ cursor: 'grab', color: '#cbd5e1', display: 'flex', '&:hover': { color: ACCENT } }}>
                            <DragIndicatorIcon sx={{ fontSize: 16 }} />
                          </Box>
                        )}
                        <Box sx={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => (editable ? onEditDuty?.(duty) : onDutyClick?.(duty))}>
                          {role && <Box component="span" sx={{ fontSize: '0.66rem', fontWeight: 800, px: 0.5, mr: 0.4, borderRadius: 0.75, bgcolor: role.bg, color: role.fg }}>{duty.roleType}</Box>}
                          <Box component="span" sx={{ fontWeight: 700, wordBreak: 'keep-all' }}>{duty.title || <span style={{ color: '#94a3b8' }}>(업무명)</span>}</Box>
                          {rowExtra?.(duty)}
                        </Box>
                      </Box>
                    </Box>
                    <Box component="td" sx={{ ...c, textAlign: 'left' }}>
                      <TaskCell tasks={duty.tasks || []} dutyId={duty.id} editable={editable} q={q} onChange={onChange} selectedIds={selectedIds}
                        dragIdsFor={dragIdsFor} onTaskClick={(t, e) => onTaskClick?.(t, duty, e)} />
                    </Box>
                  </>
                )}
              </Box>
            )
          })}
        </tbody>
      </Box>
      {!rows.length && <Typography sx={{ color: 'text.secondary', textAlign: 'center', py: 4 }}>부서가 없습니다.</Typography>}
    </Box>
  )
}
