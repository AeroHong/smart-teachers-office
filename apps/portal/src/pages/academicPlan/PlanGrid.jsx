import { useEffect, useMemo, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Tooltip from '@mui/material/Tooltip'
import LockIcon from '@mui/icons-material/Lock'
import {
  GRADES, WEEK_LABELS, addDays, classifyDay, daysBetween, eventDisplayTitle, indexEventsByDate, isNoProgress, makeContext,
} from '@shared/lib/academicPlan'
import { eventStyle } from './planUi'

export const ACT_COLOR = { 자율: '#0f766e', 동아리: '#7c3aed' }
export const gradeSuffix = (grades) => (grades?.length && grades.length < 3 ? `(${grades.join(',')})` : '')

/**
 * 배지용으로 시수를 줄인다(표시만, 저장값은 그대로).
 * 같은 유형·같은 학년끼리 더하고(자4(1,2)+자2(1,2) → 자6(1,2)), 학년만 다르고 시간이 같으면 학년을 합친다
 * (자6(1,2)+자6(3) → 자6). 빈 학년 = 전 학년.
 */
export function compactActivities(activities = []) {
  const sum = new Map()
  for (const a of activities) {
    if (!(Number(a.hours) > 0)) continue
    const g = a.grades?.length && a.grades.length < GRADES.length ? [...a.grades].sort() : []
    const key = `${a.type}|${g.join(',')}`
    const cur = sum.get(key) || { type: a.type, hours: 0, grades: g }
    cur.hours += Number(a.hours)
    sum.set(key, cur)
  }
  const merged = new Map()
  for (const a of sum.values()) {
    const key = `${a.type}|${a.hours}`
    const cur = merged.get(key)
    if (!cur) merged.set(key, { ...a, grades: [...a.grades] })
    else if (cur.grades.length && a.grades.length) cur.grades = [...new Set([...cur.grades, ...a.grades])].sort()
    else cur.grades = [] // 어느 한쪽이 전 학년
  }
  return [...merged.values()].map((a) => (a.grades.length >= GRADES.length ? { ...a, grades: [] } : a))
}

/** 자2·동2 배지 */
export function ActivityBadges({ activities }) {
  return compactActivities(activities).map((a, i) => (
    <Box key={i} component="span" sx={{
      display: 'inline-block', mr: 0.4, px: '3px', borderRadius: '3px', bgcolor: '#fff',
      border: `1px solid ${ACT_COLOR[a.type] || '#64748b'}`, color: ACT_COLOR[a.type] || '#64748b',
      fontSize: '0.64rem', fontWeight: 800, lineHeight: 1.3, whiteSpace: 'nowrap',
    }}>
      {a.type.slice(0, 1)}{a.hours}{gradeSuffix(a.grades)}
    </Box>
  ))
}

/** 끌어 놓기 데이터 — 격자·보관함이 같이 쓴다. offset: 기간 일정에서 끈 칸이 첫날에서 며칠째인지 */
export const DRAG_TYPE = 'text/plain'
export const dragPayload = (id, offset = 0) => JSON.stringify({ id, offset })
export function readDrag(e) {
  try { return JSON.parse(e.dataTransfer.getData(DRAG_TYPE)) } catch { return null }
}

/** 잠긴 일정 앞 작은 자물쇠 */
const Lock = () => <LockIcon sx={{ fontSize: '0.72rem', mr: 0.25, verticalAlign: '-1px', opacity: 0.7 }} />

const SPAN_H = 20 // 기간 일정 띠 높이
const DATE_W = 17 // 날짜 숫자 칸 — 한 자리·두 자리 날짜의 일정이 같은 위치에서 시작하게
const DATE_GAP = 4
const FIXED_W = 44 + 34 // 월·주 열

// 월~일 열 너비 비율 — 머리글 경계를 끌어 바꾸고 이 브라우저에 기억(더블클릭하면 기본값)
const COL_KEY = 'academicPlan.colWeights'
const DEFAULT_WEIGHTS = [1, 1, 1, 1, 1, 0.55, 0.55]
const MIN_WEIGHT = 0.25
function loadWeights() {
  try {
    const w = JSON.parse(localStorage.getItem(COL_KEY))
    if (Array.isArray(w) && w.length === 7 && w.every((x) => Number(x) >= MIN_WEIGHT)) return w.map(Number)
  } catch { /* 기본값 */ }
  return DEFAULT_WEIGHTS
}
function saveWeights(w) {
  try { localStorage.setItem(COL_KEY, JSON.stringify(w.map((x) => Math.round(x * 1000) / 1000))) } catch { /* 저장 못 해도 화면은 그대로 */ }
}
const SPAN_BLEED = 5 // 칸 안쪽 여백 4px + 경계 1px
const isSpan = (ev) => Boolean(ev.endDate && ev.endDate > ev.date)

// 칸 선은 배경보다 확실히 진하게, 월 구분선은 더 진하게
const LINE = '#b6c2d1'
const th = { border: `1px solid ${LINE}`, bgcolor: '#e2e8f0', color: '#1e293b', fontSize: '0.8rem', fontWeight: 800, textAlign: 'center', py: 0.6 }
// 요일 머리글은 스크롤해도 화면 위에 붙어 있다. border-collapse에서는 붙은 칸의 테두리가 사라지므로 아래 선은 그림자로
const headTh = { ...th, position: 'sticky', top: 0, zIndex: 5, boxShadow: `inset 0 -2px 0 #64748b` }
const td = { border: `1px solid ${LINE}`, verticalAlign: 'top', p: 0 }

/**
 * 엑셀과 같은 주 단위 격자 — 월 · 주 · 월~토(일요일은 켜야 보임). 월 경계 주는 달마다 한 줄.
 * 칸 빈 곳을 누르면 그날 일정 등록, 일정을 누르면 수정, 끌어서 다른 날로 옮긴다(보관함 카드도 여기로 끌어 놓는다).
 * 기간 일정은 날짜 줄 바로 아래 '띠 줄'에 그린다 — 첫날(과 줄이 바뀐 주의 첫 칸)에 이름, 이어지는 날은 같은 색 띠가
 * 칸 경계를 덮어 끊김 없이 이어진다. 한 주에 기간 일정이 여럿이면 주 단위로 줄 번호를 정해 칸마다 높이를 맞춘다.
 * 자율·동아리 시수는 이름 앞 작은 배지(자2·동2). 일반 일정은 관련 부서 색(deptColors)을 입는다.
 * 칸 안은 [날짜 | 일정] 두 칸 — 일정은 줄이 바뀌어도 날짜 오른쪽 칸 안에서 이어진다.
 * hintDate: 작년 날짜가 있는 카드를 끄는 동안 '작년 이맘때(같은 요일)' 칸을 점선으로 표시.
 */
export default function PlanGrid({
  plan, events, rows, canEdit, showSunday, deptColors, hintDate, changedIds, isLocked = () => false, onCellClick, onEventClick, onMove,
}) {
  // 마지막으로 본 뒤 다른 사람이 바꾼 일정 — 주황 테두리
  const changedRing = (ev) => (changedIds?.has(ev.id) ? { boxShadow: '0 0 0 2px #f97316', position: 'relative' } : {})
  const ctx = useMemo(() => makeContext(plan), [plan])
  // 칸 배경(공휴일·방학)은 전체 일정(plan)으로, 칩은 보기 필터를 거친 events로
  const shown = events || plan.events
  const byDate = useMemo(() => indexEventsByDate(shown || []), [shown])
  const [over, setOver] = useState(null)
  const cols = showSunday ? [0, 1, 2, 3, 4, 5, 6] : [0, 1, 2, 3, 4, 5]

  // 열 너비 — 표를 감싼 상자의 폭을 재서 월~일 열을 비율대로 px로 나눈다.
  // 표 자체를 재면 테두리만큼 넓어진 폭을 다시 재어 끝없이 커지므로 바깥 상자를 잰다
  const tableRef = useRef(null)
  const [tableW, setTableW] = useState(0)
  const [weights, setWeights] = useState(loadWeights)
  useEffect(() => {
    const box = tableRef.current?.parentElement
    if (!box) return undefined
    const ro = new ResizeObserver(() => setTableW(box.clientWidth))
    ro.observe(box)
    return () => ro.disconnect()
  }, [])
  const dayArea = Math.max(0, tableW - FIXED_W)
  const visSum = cols.reduce((n, c) => n + weights[c], 0)
  // 마지막 열은 비워 두어 테두리·반올림으로 남거나 모자란 폭을 흡수하게 한다
  const colPx = (c) => (dayArea && c !== cols[cols.length - 1] ? Math.floor((dayArea * weights[c]) / visSum) : undefined)

  /** 머리글의 오른쪽 경계를 끌면 그 열과 오른쪽 이웃 열이 너비를 나눠 갖는다(전체 폭은 그대로) */
  const startResize = (ci) => (e) => {
    e.preventDefault()
    e.stopPropagation()
    const a = cols[ci]
    const b = cols[ci + 1]
    if (b === undefined || !dayArea) return
    const x0 = e.clientX
    const w0 = [...weights]
    const perPx = visSum / dayArea
    let latest = w0
    const move = (ev) => {
      const d = (ev.clientX - x0) * perPx
      const na = Math.min(w0[a] + w0[b] - MIN_WEIGHT, Math.max(MIN_WEIGHT, w0[a] + d))
      latest = w0.map((x, i) => (i === a ? na : i === b ? w0[a] + w0[b] - na : x))
      setWeights(latest)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.body.style.cursor = ''
      saveWeights(latest)
    }
    document.body.style.cursor = 'col-resize'
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  const resetWidths = () => { setWeights(DEFAULT_WEIGHTS); saveWeights(DEFAULT_WEIGHTS) }

  // 열 여러 개 고르기 — 머리글을 누르면 고르고/풀고, Shift+누르기는 범위. 2개 이상이면 '같은 폭으로'
  const [picked, setPicked] = useState([])
  const lastPick = useRef(null)
  const pickCol = (c, shift) => {
    if (shift && lastPick.current !== null) {
      const [x, y] = [cols.indexOf(lastPick.current), cols.indexOf(c)].sort((m, n) => m - n)
      setPicked([...new Set([...picked, ...cols.slice(x, y + 1)])])
    } else {
      setPicked(picked.includes(c) ? picked.filter((x) => x !== c) : [...picked, c])
    }
    lastPick.current = c
  }
  /** 고른 열들이 차지하던 폭을 똑같이 나눈다(나머지 열은 그대로) */
  const equalizePicked = () => {
    const sel = picked.filter((c) => cols.includes(c))
    const each = sel.reduce((n, c) => n + weights[c], 0) / sel.length
    const next = weights.map((w, i) => (sel.includes(i) ? each : w))
    setWeights(next)
    saveWeights(next)
    setPicked([])
  }
  const pickedShown = picked.filter((c) => cols.includes(c))

  // 달마다 첫 줄에 월 칸(rowSpan)
  const monthInfo = useMemo(() => {
    const info = {}
    rows.forEach((r, i) => {
      const key = `${r.month}`
      if (!info[key]) info[key] = { first: i, count: 0 }
      info[key].count++
    })
    return info
  }, [rows])

  const dayState = (k) => {
    const ds = GRADES.map((g) => classifyDay(ctx, g, k))
    return {
      holiday: ds[0].holiday,
      vacation: ds.every((d) => d.vacation),
      closedAll: ds.every((d) => d.closure),
    }
  }

  // 잠긴 일정(주요 일정 확정 이후 큰 일정, 최종 확정 이후 전부)은 끌 수 없고 자물쇠 표시
  const dragProps = (ev, k) => ({
    draggable: canEdit && !isLocked(ev),
    onDragStart: (e) => {
      e.stopPropagation()
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData(DRAG_TYPE, dragPayload(ev.id, daysBetween(ev.date, k)))
    },
    onClick: (e) => { e.stopPropagation(); onEventClick(ev) },
  })
  const tipOf = (ev) => `${eventDisplayTitle(ev)}${ev.kind === '일반' && !ev.fullDay && isNoProgress(ev) ? ' · 진도 없음' : ''}${ev.endDate ? ` (${ev.date.slice(5).replace('-', '/')}~${ev.endDate.slice(5).replace('-', '/')})` : ''}${ev.dept ? ` · ${ev.dept}` : ''}${ev.fullDay ? ' · 전일행사' : ''}${ev.note ? ` · ${ev.note}` : ''}`

  const renderEvent = (ev, k) => {
    const ks = eventStyle(ev, deptColors)
    return (
      <Tooltip key={ev.id} placement="top" arrow title={tipOf(ev)}>
        <Box {...dragProps(ev, k)}
          sx={{
            bgcolor: ks.bg, color: ks.fg, border: `1px solid ${ks.bd}`, borderRadius: '4px', px: 0.5, py: '1px',
            fontSize: '0.72rem', lineHeight: 1.35, fontWeight: ev.fullDay || ev.kind !== '일반' ? 800 : 600,
            cursor: canEdit && !isLocked(ev) ? 'grab' : 'pointer', wordBreak: 'keep-all', overflowWrap: 'anywhere',
            borderLeft: ev.fullDay ? `4px solid ${ks.fg}` : `1px solid ${ks.bd}`,
            ...changedRing(ev),
          }}>
          {isLocked(ev) && <Lock />}
          <ActivityBadges activities={ev.activities} />
          {`${ev.title || ''}${gradeSuffix(ev.grades)}`}
        </Box>
      </Tooltip>
    )
  }

  /**
   * 기간 일정 띠 한 칸. head면 이름을 쓰고(글자는 다음 칸 띠 위로 넘쳐도 된다), 이어지는 쪽은 칸 여백·경계까지
   * 덮어(SPAN_BLEED) 옆 칸 띠와 붙인다. 끝나는 날·줄 끝은 둥글게.
   */
  const renderSpan = (ev, k, { head, joinLeft, joinRight }) => {
    const ks = eventStyle(ev, deptColors)
    const edge = `1px solid ${ks.bd}`
    return (
      <Tooltip key={ev.id} placement="top" arrow title={tipOf(ev)}>
        <Box {...dragProps(ev, k)}
          sx={{
            position: 'relative', zIndex: head ? 2 : 1, height: SPAN_H, boxSizing: 'border-box',
            bgcolor: ks.bg, color: ks.fg, borderTop: edge, borderBottom: edge,
            borderLeft: joinLeft ? 'none' : edge, borderRight: joinRight ? 'none' : edge,
            ml: joinLeft ? `-${SPAN_BLEED}px` : 0, mr: joinRight ? `-${SPAN_BLEED}px` : 0,
            borderTopLeftRadius: joinLeft ? 0 : 4, borderBottomLeftRadius: joinLeft ? 0 : 4,
            borderTopRightRadius: joinRight ? 0 : 4, borderBottomRightRadius: joinRight ? 0 : 4,
            px: head ? 0.5 : 0, fontSize: '0.72rem', fontWeight: ev.fullDay || ev.kind !== '일반' ? 800 : 600,
            lineHeight: `${SPAN_H - 2}px`, whiteSpace: 'nowrap', cursor: canEdit && !isLocked(ev) ? 'grab' : 'pointer',
            '&:hover': { filter: 'brightness(0.95)' },
            ...(changedIds?.has(ev.id) ? { boxShadow: 'inset 0 0 0 2px #f97316' } : {}),
          }}>
          {head && isLocked(ev) && <Lock />}
          {head && `${ev.title || ''}${gradeSuffix(ev.grades)}`}
        </Box>
      </Tooltip>
    )
  }

  const handleDrop = (e, k) => {
    e.preventDefault()
    setOver(null)
    const d = readDrag(e)
    if (d?.id) onMove(d.id, addDays(k, -(d.offset || 0)))
  }

  return (
    <Box component="table" ref={tableRef} sx={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed', bgcolor: '#fff', border: '1px solid #64748b' }}>
      <colgroup>
        <col style={{ width: 44 }} /><col style={{ width: 34 }} />
        {cols.map((i) => <col key={i} style={{ width: colPx(i) }} />)}
      </colgroup>
      <thead>
        <tr>
          <Box component="th" sx={headTh}>월</Box>
          <Box component="th" sx={headTh}>주</Box>
          {cols.map((i, ci) => (
            <Box component="th" key={i} onClick={(e) => pickCol(i, e.shiftKey)}
              title="눌러서 열 고르기(Shift: 범위) — 2개 이상 고르면 같은 폭으로 맞출 수 있습니다"
              sx={{
                ...headTh, cursor: 'pointer', userSelect: 'none',
                color: i === 6 ? '#dc2626' : i === 5 ? '#2563eb' : th.color,
                ...(picked.includes(i) ? { bgcolor: '#99f6e4', boxShadow: 'inset 0 -3px 0 #0f766e' } : {}),
              }}>
              {WEEK_LABELS[i]}
              {/* 고른 열이 2개 이상이면 마지막 머리글 아래에 도구 — 머리글과 함께 고정된다 */}
              {ci === cols.length - 1 && pickedShown.length >= 2 && (
                <Box onClick={(e) => e.stopPropagation()}
                  sx={{
                    position: 'absolute', top: '100%', right: 0, mt: 0.5, zIndex: 7, display: 'flex', alignItems: 'center', gap: 0.75,
                    bgcolor: '#fff', border: '1px solid #14b8a6', borderRadius: 1.5, px: 1, py: 0.5, boxShadow: '0 4px 12px rgba(15,23,42,0.15)',
                    whiteSpace: 'nowrap', fontWeight: 600, color: '#0f172a',
                  }}>
                  {pickedShown.map((c) => WEEK_LABELS[c]).join('·')} {pickedShown.length}개 열
                  <Box component="button" type="button" onClick={equalizePicked}
                    sx={{ border: 0, borderRadius: 1, bgcolor: '#0f766e', color: '#fff', px: 1, py: 0.25, fontWeight: 700, cursor: 'pointer' }}>같은 폭으로</Box>
                  <Box component="button" type="button" onClick={() => setPicked([])}
                    sx={{ border: 0, bgcolor: 'transparent', color: '#475569', cursor: 'pointer', fontWeight: 600 }}>선택 해제</Box>
                </Box>
              )}
              {ci < cols.length - 1 && (
                <Box onPointerDown={startResize(ci)} onDoubleClick={resetWidths} onClick={(e) => e.stopPropagation()} title="끌어서 열 너비 조절 (두 번 누르면 처음대로)"
                  sx={{
                    position: 'absolute', top: 0, right: -4, width: 8, height: '100%', cursor: 'col-resize', zIndex: 6,
                    '&:hover': { bgcolor: 'rgba(20,184,166,0.35)' },
                  }} />
              )}
            </Box>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const mi = monthInfo[`${r.month}`]
          const firstOfMonth = mi.first === i
          // 달이 바뀌는 줄은 위쪽 선을 진하게
          const monthTop = firstOfMonth && i > 0 ? { borderTop: '2px solid #64748b' } : {}
          const rowKeys = cols.map((c) => r.days[c]).filter(Boolean)
          // 이 주에 걸친 기간 일정 — 시작일·id 순으로 줄 번호
          const spanMap = new Map()
          for (const k of rowKeys) for (const ev of byDate.get(k) || []) if (isSpan(ev)) spanMap.set(ev.id, ev)
          const spans = [...spanMap.values()].sort((a, b) => (a.date === b.date ? (a.id < b.id ? -1 : 1) : a.date < b.date ? -1 : 1))
          const covers = (ev, k) => k >= ev.date && k <= ev.endDate
          return (
            <tr key={`${r.monday}-${r.month}`}>
              {firstOfMonth && (
                <Box component="td" rowSpan={mi.count} sx={{ ...td, ...th, ...monthTop, verticalAlign: 'middle', fontSize: '0.9rem' }}>{r.month}월</Box>
              )}
              <Box component="td" sx={{ ...td, ...monthTop, textAlign: 'center', verticalAlign: 'middle', fontSize: '0.78rem', fontWeight: 700, color: '#475569', bgcolor: '#f8fafc' }}>{r.weekNo ?? ''}</Box>
              {cols.map((di) => {
                const k = r.days[di]
                if (!k) return <Box component="td" key={di} sx={{ ...td, ...monthTop, bgcolor: '#eef1f5' }} />
                const st = dayState(k)
                const evs = (byDate.get(k) || []).filter((ev) => !isSpan(ev))
                const covered = spans.some((ev) => covers(ev, k))
                const rowFirst = k === rowKeys[0]
                const rowLast = k === rowKeys[rowKeys.length - 1]
                const hint = hintDate === k
                const bg = over === k ? '#99f6e4'
                  : hint ? '#ecfeff'
                  : st.holiday || st.closedAll ? '#fff1f2'
                  : st.vacation ? '#eceff3'
                  : di >= 5 ? '#f8fafc' : '#fff'
                return (
                  <Box component="td" key={di}
                    sx={{
                      ...td, ...monthTop, bgcolor: bg, cursor: canEdit ? 'pointer' : 'default',
                      ...(hint ? { outline: '2px dashed #0891b2', outlineOffset: -3 } : {}),
                      '&:hover': canEdit ? { outline: '2px solid #14b8a6', outlineOffset: -2 } : {},
                    }}
                    title={hint ? '작년 이맘때(같은 요일)' : undefined}
                    onClick={() => canEdit && onCellClick(k)}
                    onDragOver={canEdit ? (e) => { e.preventDefault(); if (over !== k) setOver(k) } : undefined}
                    onDragLeave={canEdit ? () => setOver((o) => (o === k ? null : o)) : undefined}
                    onDrop={canEdit ? (e) => handleDrop(e, k) : undefined}>
                    {/*
                      [날짜 | 일정] — 높이는 내용만큼(일정 없는 주는 낮게). 일반 일정은 날짜 오른쪽 칸에서 이어진다.
                      기간 일정 띠는 날짜 줄 바로 아래에 칸 전체 폭으로 — 띠 이름이 다음 칸 날짜 숫자와 겹치지 않고,
                      날짜 줄(한 줄 고정) 다음이라 옆 칸 띠와 높이가 맞는다.
                    */}
                    <Box sx={{ minHeight: 26, px: 0.5, py: 0.25, display: 'grid', gridTemplateColumns: `${DATE_W}px minmax(0, 1fr)`, columnGap: `${DATE_GAP}px`, rowGap: '3px', alignItems: 'start' }}>
                      <Box component="span" sx={{
                        fontSize: '0.82rem', fontWeight: 800, lineHeight: `${SPAN_H}px`,
                        color: st.holiday || di === 6 ? '#dc2626' : di === 5 ? '#2563eb' : st.vacation ? '#94a3b8' : '#0f172a',
                      }}>{Number(k.slice(8))}</Box>
                      {covered ? (
                        <>
                          <Box sx={{ minWidth: 0, height: SPAN_H, fontSize: '0.72rem', fontWeight: 700, color: '#dc2626', lineHeight: `${SPAN_H}px`, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {st.holiday || ''}
                          </Box>
                          <Box sx={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 0.3 }}>
                            {spans.map((ev) => (covers(ev, k)
                              ? renderSpan(ev, k, {
                                head: k === ev.date || rowFirst,
                                joinLeft: k !== ev.date && !rowFirst,
                                joinRight: k !== ev.endDate && !rowLast,
                              })
                              : <Box key={ev.id} sx={{ height: SPAN_H }} />))}
                          </Box>
                          {evs.length > 0 && (
                            <Box sx={{ gridColumn: 2, display: 'flex', flexDirection: 'column', gap: 0.3, minWidth: 0 }}>
                              {evs.map((ev) => renderEvent(ev, k))}
                            </Box>
                          )}
                        </>
                      ) : (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.3, minWidth: 0 }}>
                          {st.holiday && (
                            <Box sx={{ fontSize: '0.72rem', fontWeight: 700, color: '#dc2626', lineHeight: `${SPAN_H}px`, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{st.holiday}</Box>
                          )}
                          {evs.map((ev) => renderEvent(ev, k))}
                        </Box>
                      )}
                    </Box>
                  </Box>
                )
              })}
            </tr>
          )
        })}
      </tbody>
    </Box>
  )
}
