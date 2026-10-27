import { useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Tooltip from '@mui/material/Tooltip'
import {
  GRADES, WEEK_LABELS, addDays, classifyDay, daysBetween, eventDisplayTitle, indexEventsByDate, makeContext,
} from '@shared/lib/academicPlan'
import { KIND_STYLE } from './planUi'

const th = { border: '1px solid #cbd5e1', bgcolor: '#f1f5f9', fontSize: '0.78rem', fontWeight: 700, textAlign: 'center', py: 0.5 }
const td = { border: '1px solid #e2e8f0', verticalAlign: 'top', p: 0 }

/**
 * 엑셀과 같은 주 단위 격자 — 월 · 주 · 월~일 · 주합계 · 월합계. 월 경계 주는 달마다 한 줄.
 * 칸 빈 곳을 누르면 그날 일정 등록, 일정을 누르면 수정, 끌어서 다른 날로 옮긴다.
 */
export default function PlanGrid({ plan, rows, canEdit, onCellClick, onEventClick, onMove }) {
  const ctx = useMemo(() => makeContext(plan), [plan])
  const byDate = useMemo(() => indexEventsByDate(plan.events || []), [plan.events])
  const [over, setOver] = useState(null)

  // 달마다 첫 줄에 월 칸(rowSpan)과 월합계
  const monthInfo = useMemo(() => {
    const info = {}
    rows.forEach((r, i) => {
      const key = `${r.month}`
      if (!info[key]) info[key] = { first: i, count: 0, total: 0 }
      info[key].count++
      info[key].total += r.schoolDays
    })
    return info
  }, [rows])

  const dayState = (k) => {
    const ds = GRADES.map((g) => classifyDay(ctx, g, k))
    return {
      holiday: ds[0].holiday,
      vacation: ds.every((d) => d.vacation),
      closedAll: ds.every((d) => d.closure),
      school: ds.some((d) => d.schoolDay),
    }
  }

  const handleDrop = (e, k) => {
    e.preventDefault()
    setOver(null)
    try {
      const { id, offset } = JSON.parse(e.dataTransfer.getData('text/plain'))
      onMove(id, addDays(k, -offset))
    } catch { /* 일정이 아닌 것을 끌어다 놓음 */ }
  }

  return (
    <Box component="table" sx={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed', bgcolor: '#fff' }}>
      <colgroup>
        <col style={{ width: 44 }} /><col style={{ width: 34 }} />
        {WEEK_LABELS.map((w, i) => <col key={w} style={{ width: i < 5 ? undefined : '9%' }} />)}
        <col style={{ width: 46 }} /><col style={{ width: 46 }} />
      </colgroup>
      <thead>
        <tr>
          <Box component="th" sx={th}>월</Box>
          <Box component="th" sx={th}>주</Box>
          {WEEK_LABELS.map((w, i) => (
            <Box component="th" key={w} sx={{ ...th, color: i === 6 ? '#dc2626' : i === 5 ? '#2563eb' : 'inherit' }}>{w}</Box>
          ))}
          <Box component="th" sx={th}>주합계</Box>
          <Box component="th" sx={th}>월합계</Box>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const mi = monthInfo[`${r.month}`]
          const firstOfMonth = mi.first === i
          return (
            <tr key={`${r.monday}-${r.month}`}>
              {firstOfMonth && (
                <Box component="td" rowSpan={mi.count} sx={{ ...td, ...th, verticalAlign: 'middle', fontSize: '0.85rem' }}>{r.month}월</Box>
              )}
              <Box component="td" sx={{ ...td, textAlign: 'center', verticalAlign: 'middle', fontSize: '0.78rem', color: '#64748b' }}>{r.weekNo ?? ''}</Box>
              {r.days.map((k, di) => {
                if (!k) return <Box component="td" key={di} sx={{ ...td, bgcolor: '#f8fafc' }} />
                const st = dayState(k)
                const evs = byDate.get(k) || []
                const bg = over === k ? '#ccfbf1'
                  : st.holiday || st.closedAll ? '#fef2f2'
                  : st.vacation ? '#f1f5f9'
                  : di >= 5 ? '#fafafa' : '#fff'
                return (
                  <Box component="td" key={di}
                    sx={{ ...td, bgcolor: bg, cursor: canEdit ? 'pointer' : 'default', '&:hover': canEdit ? { outline: '2px solid #99f6e4', outlineOffset: -2 } : {} }}
                    onClick={() => canEdit && onCellClick(k)}
                    onDragOver={canEdit ? (e) => { e.preventDefault(); if (over !== k) setOver(k) } : undefined}
                    onDragLeave={canEdit ? () => setOver((o) => (o === k ? null : o)) : undefined}
                    onDrop={canEdit ? (e) => handleDrop(e, k) : undefined}>
                    <Box sx={{ minHeight: 64, p: 0.5, display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
                        <Box component="span" sx={{
                          fontSize: '0.78rem', fontWeight: 700,
                          color: st.holiday || di === 6 ? '#dc2626' : di === 5 ? '#2563eb' : st.vacation ? '#94a3b8' : '#0f172a',
                        }}>{Number(k.slice(8))}</Box>
                        {st.holiday && <Box component="span" sx={{ fontSize: '0.68rem', color: '#dc2626', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{st.holiday}</Box>}
                      </Box>
                      {evs.map((ev) => {
                        const ks = KIND_STYLE[ev.kind] || KIND_STYLE.일반
                        const label = eventDisplayTitle(ev)
                        return (
                          <Tooltip key={ev.id} placement="top" arrow
                            title={`${label}${ev.dept ? ` · ${ev.dept}` : ''}${ev.fullDay ? ' · 전일행사' : ''}${ev.note ? ` · ${ev.note}` : ''}`}>
                            <Box
                              draggable={canEdit}
                              onDragStart={(e) => {
                                e.stopPropagation()
                                e.dataTransfer.effectAllowed = 'move'
                                e.dataTransfer.setData('text/plain', JSON.stringify({ id: ev.id, offset: daysBetween(ev.date, k) }))
                              }}
                              onClick={(e) => { e.stopPropagation(); onEventClick(ev) }}
                              sx={{
                                bgcolor: ks.bg, color: ks.fg, borderRadius: '4px', px: 0.5, py: '1px',
                                fontSize: '0.7rem', lineHeight: 1.35, fontWeight: ev.fullDay || ev.kind !== '일반' ? 700 : 500,
                                cursor: canEdit ? 'grab' : 'pointer', wordBreak: 'keep-all', overflowWrap: 'anywhere',
                                borderLeft: ev.fullDay ? `3px solid ${ks.fg}` : 'none',
                              }}>
                              {label}
                            </Box>
                          </Tooltip>
                        )
                      })}
                    </Box>
                  </Box>
                )
              })}
              <Box component="td" sx={{ ...td, textAlign: 'center', verticalAlign: 'middle', fontWeight: 700, fontSize: '0.85rem' }}>{r.weekNo || r.schoolDays ? r.schoolDays : ''}</Box>
              {firstOfMonth && (
                <Box component="td" rowSpan={mi.count} sx={{ ...td, textAlign: 'center', verticalAlign: 'middle', fontWeight: 800, bgcolor: '#f8fafc' }}>{mi.total}</Box>
              )}
            </tr>
          )
        })}
      </tbody>
    </Box>
  )
}
