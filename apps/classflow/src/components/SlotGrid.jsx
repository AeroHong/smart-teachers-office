import { useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import LockIcon from '@mui/icons-material/Lock'
import LockOpenIcon from '@mui/icons-material/LockOpen'
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'
import {
  moveSectionSlot, toggleSectionLock, sectionLabel, studentSchedule, spreadOf,
  updateSubject, resizeSections, recalcSections, placementCheck, placementCheckIfMoved, unassignedBySubject, hasFree,
} from '@shared/lib/sectioning'
import { blockColor } from './colors'

const ROW_HEAD = 104
const COL_MIN = '4.6rem'
// 가로 스크롤 때 왼쪽 그룹 칸을 붙여 둔다
const stickyLeft = { position: 'sticky', left: 0, zIndex: 1 }

const miniInput = {
  width: '100%', minWidth: 0, boxSizing: 'border-box', border: '1px solid #c9d3de', borderRadius: 4,
  padding: '1px 2px', fontSize: 12, textAlign: 'center', fontFamily: 'inherit', background: '#fff',
}

function NumBox({ value, placeholder, disabled, onCommit, title }) {
  return (
    <input type="number" min={0} title={title} className="cf-num" style={{ ...miniInput, color: disabled ? '#9aa5b1' : '#1f2933' }}
      value={value ?? ''} placeholder={placeholder} disabled={disabled}
      onChange={(e) => onCommit(e.target.value)} />
  )
}

/**
 * 2단계 배정표: 열 = 과목(칸막이별로 묶음), 행 = 그룹(A~E).
 * 헤더 아래에서 과목별 최대 인원·분반 수·같은 과목 다른 그룹(분리)·과목 고정을 정하고,
 * 왼쪽 그룹 칸에서 그룹별 교실 수(그 그룹에 열 수 있는 최대 분반 수)를 정한다.
 * 칸 = 그 과목이 그 그룹에 연 분반과 인원. 같은 과목 열 안에서 끌어 그룹을 옮긴다.
 */
export default function SlotGrid({ project, sizes, demand, validation, selectedSection, onSelectSection, onChange, onQuick }) {
  const [dragOver, setDragOver] = useState(null)
  const [dragSubject, setDragSubject] = useState(null)
  const [dragHints, setDragHints] = useState(null) // 끄는 분반을 그룹 t로 옮기면 배정 불가 학생 수
  const T = project.slots.length

  const blocks = useMemo(() => [...new Set(project.subjects.map((s) => s.block))], [project.subjects])
  const cols = useMemo(
    () => blocks.flatMap((b) => project.subjects.map((subj, s) => ({ subj, s })).filter((x) => x.subj.block === b)),
    [blocks, project.subjects],
  )

  const conflictCount = useMemo(() => {
    const m = {}
    for (const sid of validation.conflicts) {
      for (const x of studentSchedule(project, sid)) if (x.k !== null) m[`${x.s}:${x.k}`] = (m[`${x.s}:${x.k}`] || 0) + 1
    }
    return m
  }, [project, validation.conflicts])

  const pc = useMemo(() => placementCheck(project), [project])
  const unassigned = useMemo(() => unassignedBySubject(project), [project])
  const unassignedOf = useMemo(() => Object.fromEntries(unassigned.map((u) => [u.s, u])), [unassigned])

  const hasUnplaced = project.subjects.some((subj) => subj.slotBySection.some((t) => t === null || t === undefined))
  const rows = [...Array.from({ length: T }, (_, t) => t), ...(hasUnplaced ? [null] : [])]
  const rowStats = rows.map((t) => {
    let n = 0
    let min = Infinity
    let max = 0
    let over = 0
    project.subjects.forEach((subj, s) => subj.slotBySection.forEach((x, k) => {
      if ((x ?? null) !== t) return
      n++
      const v = sizes[s][k]
      min = Math.min(min, v)
      max = Math.max(max, v)
      if (v > (subj.maxSize || project.maxSize)) over++
    }))
    return { n, min: n ? min : 0, max, over }
  })

  // ── 과목 설정 ──
  const setMax = (s, v) => {
    const maxSize = v === '' ? null : Math.max(1, Number(v))
    onChange(recalcSections(updateSubject(project, s, { maxSize, sectionsManual: false }), { only: s }))
  }
  const setSections = (s, v) => {
    const subj = project.subjects[s]
    let n = Math.max(demand[s] ? 1 : 0, Number(v) || 0)
    if (subj.distinctSlots) n = Math.min(n, T)
    onChange(updateSubject(resizeSections(project, s, n), s, { sectionsManual: true }))
  }
  const setDistinct = (s, on) => {
    let p = updateSubject(project, s, { distinctSlots: on })
    if (on && project.subjects[s].sections > T) p = resizeSections(p, s, T)
    onChange(p)
  }

  const onDrop = (s, t) => (e) => {
    e.preventDefault()
    setDragOver(null)
    setDragSubject(null)
    setDragHints(null)
    const [ds, dk] = (e.dataTransfer.getData('text/plain') || '').split(':').map(Number)
    if (ds !== s || t === null) return
    const subj = project.subjects[s]
    if (subj.locked || subj.lockedSections[dk]) return
    if (subj.slotBySection[dk] === t) return
    const moved = moveSectionSlot(project, s, dk, t)
    // 그룹 배치가 바뀌면 그 분반 학생들이 겹칠 수 있다 — 학생만 브라우저에서 바로 다시 나눈다
    if (onQuick) onQuick(moved, `${subj.name} ${sectionLabel(project, s, dk)} → ${project.slots[t]}그룹 · `)
    else onChange(moved)
  }

  // 열이 너무 좁아지면 숫자가 가려진다 — 최소 폭 아래로는 가로 스크롤
  const gridCols = `${ROW_HEAD}px repeat(${cols.length}, minmax(${COL_MIN}, 1fr))`
  const gridMinWidth = `calc(${ROW_HEAD}px + ${cols.length} * ${COL_MIN})`
  const sepRight = (i, subj) => (cols[i + 1]?.subj.block !== subj.block ? '2px solid #c9d3de' : '1px solid #e6ebf0')
  const totalSections = project.subjects.reduce((a, s) => a + s.sections, 0)
  const showFree = hasFree(project)
  const freeLimit = project.freeMax === null || project.freeMax === undefined || project.freeMax === '' ? null : Number(project.freeMax)

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: '#fff', minWidth: 0, overflow: 'hidden' }}>
      {/* ── 배치 판정(브라우저, 즉시) ── */}
      <Box sx={{ px: 1.5, py: 0.5, display: 'flex', alignItems: 'center', gap: 1.5, flexShrink: 0, borderBottom: '1px solid #dde3ea',
        bgcolor: pc.count ? '#fdecec' : '#effaf1' }}>
        <Typography fontSize={13} fontWeight={700} color={pc.count ? '#b91c1c' : '#166534'}>
          {pc.count ? `✕ 지금 그룹 배치로는 ${pc.count}명 배정 불가` : '✓ 지금 그룹 배치로 모든 학생 배정 가능'}
        </Typography>
        {pc.count > 0 && (
          <Typography fontSize={12} color="#7f1d1d" noWrap sx={{ minWidth: 0, flex: 1 }}
            title={pc.blocked.map((b) => `${b.sids.join(',')}: ${b.subjects.map((x) => project.subjects[x].name).join('·')}`).join('\n')}>
            {pc.blocked.slice(0, 3).map((b) => `${b.sids[0]}${b.sids.length > 1 ? ` 외 ${b.sids.length - 1}명` : ''}(${b.subjects.map((x) => project.subjects[x].name).join('·')})`).join(' / ')}
            {pc.blocked.length > 3 ? ' …' : ''}
          </Typography>
        )}
        {!pc.count && !unassigned.length && <Typography fontSize={12} color="text.secondary" sx={{ flex: 1 }}>분반을 끌면 그룹마다 배정 가능 여부가 바로 표시되고, 놓으면 학생을 다시 나눕니다.</Typography>}
        {unassigned.length > 0 && (
          <Typography fontSize={12.5} color="error" fontWeight={700} noWrap sx={{ minWidth: 0, flex: pc.count ? 'none' : 1 }}
            title={unassigned.map((u) => `${u.name} ${u.count}명: ${u.students.join(', ')}`).join('\n')}>
            과목별 미배정 — {unassigned.map((u) => `${u.name} ${u.count}명`).join(' · ')}
          </Typography>
        )}
      </Box>
      {/* 헤더와 본문을 한 스크롤 상자에 — 같은 폭을 써서 세로선이 어긋나지 않는다 */}
      <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
      <Box sx={{ minWidth: gridMinWidth }}>
      {/* ── 헤더: 칸막이 + 과목명 + 과목 설정 ── */}
      <Box sx={{ display: 'grid', gridTemplateColumns: gridCols, borderBottom: '2px solid #c9d3de', position: 'sticky', top: 0, zIndex: 2, bgcolor: '#fff' }}>
        <Box sx={{ ...stickyLeft, gridRow: 'span 3', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', px: 1, pb: 0.75, bgcolor: '#f3f6f9', borderRight: '1px solid #dde3ea' }}>
          <Tooltip placement="right" title={
            <Box sx={{ fontSize: 12.5, lineHeight: 1.7 }}>
              <b>최대</b> 분반별 최대 인원(비우면 상단 값)<br />
              <b>분반</b> 분반 수(최대 인원으로 자동 계산, 직접 고치면 "직접")<br />
              <b>평균</b> 신청 ÷ 분반(최대 인원보다 크면 빨강)<br />
              <b>분리</b> 같은 과목 분반은 서로 다른 그룹에<br />
              <b>자물쇠</b> 과목 고정 — 분반 그룹·학생 배정 유지<br />
              <b>편차</b> 그 과목 분반 인원의 최대 − 최소<br />
              <b>그룹 칸</b> 분반 인원 범위 · 분반 수
            </Box>
          }>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'help', mb: 0.5, color: '#5b6b7c' }}>
              <HelpOutlineIcon sx={{ fontSize: 16 }} />
              <Typography fontSize={11.5}>보는 법</Typography>
            </Box>
          </Tooltip>
          <Typography fontSize={11.5} color="text.secondary">분반 합계</Typography>
          <Typography fontSize={15} fontWeight={800}>{totalSections}개</Typography>
        </Box>
        {blocks.map((b) => {
          const span = cols.filter((c) => c.subj.block === b).length
          const c = blockColor(b, blocks)
          return (
            <Box key={b} sx={{ gridColumn: `span ${span}`, textAlign: 'center', py: 0.25, bgcolor: c.bg, color: c.fg, fontSize: 12, fontWeight: 800, borderRight: '2px solid #c9d3de' }}>
              칸막이 {b}
            </Box>
          )
        })}
        {/* 과목명·신청 인원·차이 */}
        {cols.map(({ subj, s }, i) => {
          const c = blockColor(subj.block, blocks)
          const spread = spreadOf(sizes[s])
          return (
            <Box key={`n${s}`} sx={{
              px: 0.5, pt: 0.5, textAlign: 'center', borderRight: sepRight(i, subj),
              bgcolor: dragSubject === s ? '#fff7e0' : '#fafbfc', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 62,
            }}>
              <Typography fontSize={12.5} fontWeight={800} color={c.fg} sx={{ lineHeight: 1.2, wordBreak: 'keep-all' }} title={subj.name}>{subj.name}</Typography>
              <Typography fontSize={11.5} color="text.secondary">
                신청 <b style={{ color: '#1f2933' }}>{demand[s]}</b>명
                {subj.sections > 1 && (
                  <span style={{ marginLeft: 4, fontWeight: 700, color: spread <= 1 ? '#2e7d32' : spread <= 2 ? '#ed6c02' : '#d32f2f' }}>편차 {spread}</span>
                )}
              </Typography>
              {unassignedOf[s] && (
                <Tooltip title={`미배정 학생: ${unassignedOf[s].students.join(', ')}`}>
                  <Typography fontSize={11.5} fontWeight={800} color="error">미배정 {unassignedOf[s].count}명</Typography>
                </Tooltip>
              )}
            </Box>
          )
        })}
        {/* 설정 줄 */}
        {cols.map(({ subj, s }, i) => (
          <Box key={`c${s}`} sx={{ px: 0.5, py: 0.5, borderRight: sepRight(i, subj), bgcolor: '#fafbfc', borderTop: '1px dashed #e1e6ec' }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.5, alignItems: 'center' }}>
              <Typography fontSize={10.5} color="text.secondary" textAlign="center">최대</Typography>
              <Typography fontSize={10.5} color="text.secondary" textAlign="center">분반</Typography>
              <NumBox value={subj.maxSize} placeholder={String(project.maxSize)} disabled={subj.locked}
                title="이 과목의 분반별 최대 인원(비우면 상단 값)" onCommit={(v) => setMax(s, v)} />
              <NumBox value={subj.sections} disabled={subj.locked}
                title={subj.sectionsManual ? '분반 수를 직접 정함' : '최대 인원으로 계산한 분반 수'} onCommit={(v) => setSections(s, v)} />
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 0.25 }}>
              <Tooltip title="같은 과목 분반은 서로 다른 그룹에(분리)">
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <Checkbox size="small" sx={{ p: 0.25 }} checked={subj.distinctSlots} disabled={subj.locked} onChange={(e) => setDistinct(s, e.target.checked)} />
                  <Typography fontSize={10.5} color="text.secondary">분리</Typography>
                </Box>
              </Tooltip>
              <Tooltip title={subj.locked ? '과목 고정 해제' : '과목 고정: 분반 그룹과 학생 배정을 유지한 채 나머지만 다시 탐색'}>
                <IconButton size="small" sx={{ p: 0.25 }} color={subj.locked ? 'warning' : 'default'} onClick={() => onChange(updateSubject(project, s, { locked: !subj.locked }))}>
                  {subj.locked ? <LockIcon sx={{ fontSize: 16 }} /> : <LockOpenIcon sx={{ fontSize: 16, opacity: 0.45 }} />}
                </IconButton>
              </Tooltip>
            </Box>
            {(() => {
              const avg = subj.sections ? demand[s] / subj.sections : 0
              const over = avg > (subj.maxSize || project.maxSize)
              return (
                <Tooltip title={`분반 평균 인원 = 신청 ${demand[s]}명 ÷ ${subj.sections}분반${over ? ' — 최대 인원보다 많습니다' : ''}`}>
                  <Typography fontSize={11.5} textAlign="center" sx={{ mt: 0.25 }} fontWeight={700} color={over ? 'error' : '#14532d'}>
                    평균 {subj.sections ? (Math.round(avg * 10) / 10) : '—'}명
                    {subj.sectionsManual && <span style={{ fontSize: 9.5, fontWeight: 500, color: '#1d4ed8', marginLeft: 3 }}>직접</span>}
                  </Typography>
                </Tooltip>
              )
            })()}
          </Box>
        ))}
      </Box>

      {/* ── 본문: 그룹 행 ── */}
      <Box sx={{ display: 'grid', gridTemplateColumns: gridCols, gridAutoRows: 'minmax(74px, max-content)', alignContent: 'start' }}>
        {rows.map((t, ri) => {
          return [
            <Box key={`h${ri}`} sx={{
              ...stickyLeft, borderRight: '1px solid #dde3ea', borderBottom: '1px solid #dde3ea', px: 1, py: 0.5,
              bgcolor: t === null ? '#fffbea' : '#f3f6f9', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 0.25,
            }}>
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75 }}>
                <Typography fontSize={t === null ? 14 : 26} fontWeight={800} color="#14532d" lineHeight={1.1}>
                  {t === null ? '그룹 미정' : project.slots[t]}
                </Typography>
                {rowStats[ri].n > 0 && (
                  <Tooltip title="이 그룹 분반들의 인원 범위(가장 작은 반 ~ 가장 큰 반)">
                    <Typography fontSize={11.5} color="text.secondary" noWrap>{rowStats[ri].min}~{rowStats[ri].max}명</Typography>
                  </Tooltip>
                )}
              </Box>
              {rowStats[ri].over > 0 && (
                <Typography fontSize={11} color="error" fontWeight={700}>최대 인원 초과 {rowStats[ri].over}반</Typography>
              )}
              <Typography fontSize={11.5} color="text.secondary">분반 {rowStats[ri].n}개</Typography>
              {showFree && t !== null && (() => {
                const n = validation.freeCounts?.[t] ?? 0
                const over = freeLimit !== null && n > freeLimit
                return (
                  <Tooltip title={`이 그룹 시간에 수업이 없는 학생${freeLimit !== null ? ` (공강 최대 ${freeLimit}명)` : ''}`}>
                    <Typography fontSize={11.5} fontWeight={700} color={over ? 'error' : '#7c5a00'}>공강 {n}명{over ? ' 초과' : ''}</Typography>
                  </Tooltip>
                )
              })()}
            </Box>,
            ...cols.map(({ subj, s }, i) => {
              const ks = subj.slotBySection.map((x, k) => ((x ?? null) === t ? k : -1)).filter((k) => k >= 0)
              const key = `${s}:${t}`
              const canDrop = dragSubject === s && t !== null
              const c = blockColor(subj.block, blocks)
              const maxSize = subj.maxSize || project.maxSize
              return (
                <Box key={key}
                  onDragOver={(e) => { if (canDrop) { e.preventDefault(); setDragOver(key) } }}
                  onDragLeave={() => setDragOver((v) => (v === key ? null : v))}
                  onDrop={onDrop(s, t)}
                  sx={{
                    borderRight: sepRight(i, subj), borderBottom: '1px solid #dde3ea',
                    p: 0.5, display: 'flex', flexDirection: 'column', gap: 0.5, minWidth: 0,
                    bgcolor: dragOver === key ? '#fff1c7' : canDrop ? '#fffbea' : 'transparent',
                    outline: dragOver === key ? '2px dashed #b45309' : 'none', outlineOffset: -2,
                  }}>
                  {dragHints && dragHints.s === s && t !== null && (() => {
                    const n = dragHints.hints[t]
                    const here = project.subjects[s].slotBySection[dragHints.k] === t
                    return (
                      <Box sx={{ fontSize: 11, fontWeight: 800, textAlign: 'center', borderRadius: 1, py: 0.25,
                        color: here ? '#5b6b7c' : n === 0 ? '#166534' : '#b91c1c', bgcolor: here ? '#eef1f4' : n === 0 ? '#dcfce7' : '#fee2e2' }}>
                        {here ? '지금 위치' : n === 0 ? '✓ 모두 배정 가능' : `✕ ${n}명 배정 불가`}
                      </Box>
                    )
                  })()}
                  {ks.map((k) => {
                    const sk = `${s}:${k}`
                    const locked = subj.locked || subj.lockedSections[k]
                    const isSel = selectedSection && selectedSection.s === s && selectedSection.k === k
                    const conflicts = conflictCount[sk] || 0
                    const size = sizes[s][k]
                    const tooBig = project.maxMode !== 'off' ? size > maxSize : false
                    const minSize = subj.minSize || project.minSize
                    const tooSmall = project.minMode !== 'off' && minSize && subj.sections >= 2 && size < minSize
                    return (
                      <Tooltip key={k} placement="top" disableInteractive
                        title={`${subj.name} ${sectionLabel(project, s, k)} · ${size}명 (최대 ${maxSize})${locked ? ' · 그룹 고정' : ''} — 클릭: 선택(3단계 표에서 이 분반 학생만 보기), 더블클릭: 고정, 끌기: 그룹 이동`}>
                        <Box draggable={!locked}
                          onDragStart={(e) => {
                            e.dataTransfer.setData('text/plain', sk)
                            e.dataTransfer.effectAllowed = 'move'
                            setDragSubject(s)
                            setDragHints({ s, k, hints: project.slots.map((_, g) => placementCheckIfMoved(project, s, k, g)) })
                          }}
                          onDragEnd={() => { setDragSubject(null); setDragOver(null); setDragHints(null) }}
                          onClick={() => onSelectSection(isSel ? null : { s, k })}
                          onDoubleClick={() => !subj.locked && onChange(toggleSectionLock(project, s, k))}
                          sx={{
                            position: 'relative', borderRadius: 1.5, px: 0.5, py: 0.3, textAlign: 'center', cursor: locked ? 'pointer' : 'grab',
                            bgcolor: c.bg, border: `1px solid ${locked ? '#f59e0b' : c.border}`,
                            outline: isSel ? '3px solid #14532d' : 'none', outlineOffset: -1,
                          }}>
                          <Typography fontSize={11} fontWeight={700} color={c.fg} lineHeight={1.1}>
                            {sectionLabel(project, s, k)}{locked && <LockIcon sx={{ fontSize: 10, ml: 0.25, verticalAlign: 'baseline' }} color="warning" />}
                          </Typography>
                          <Typography fontSize={19} fontWeight={800} lineHeight={1.15} color={tooBig ? '#d32f2f' : tooSmall ? '#ed6c02' : 'text.primary'}>{size}</Typography>
                          {conflicts > 0 && (
                            <Box sx={{ position: 'absolute', top: -5, right: -5, bgcolor: '#d32f2f', color: '#fff', borderRadius: 8, px: 0.5, fontSize: 10, fontWeight: 700 }}>{conflicts}</Box>
                          )}
                        </Box>
                      </Tooltip>
                    )
                  })}
                </Box>
              )
            }),
          ]
        })}
      </Box>
      </Box>
      </Box>
    </Box>
  )
}
