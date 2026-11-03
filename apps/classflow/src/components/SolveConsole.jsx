import { useEffect, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import Typography from '@mui/material/Typography'

const SPIN = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
const COLORS = {
  local: '#cbd5e1',
  info: '#93c5fd',
  raw: '#5b6b80',
  solution: '#86efac',
  warn: '#fbbf24',
  done: '#5eead4',
  error: '#fca5a5',
}
const MARK = { local: '›', info: '▸', raw: ' ', solution: '★', warn: '!', done: '✔', error: '✖' }

const fmt = (ms) => {
  const s = Math.max(0, ms / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${(s % 60).toFixed(1).padStart(4, '0')}`
}

/** 편차 합계가 줄어드는 모양을 작은 계단 그래프로 */
function Sparkline({ points }) {
  if (points.length < 2) return <Box sx={{ height: 46 }} />
  const W = 220
  const H = 46
  const maxT = Math.max(...points.map((p) => p.t), 1)
  const maxV = Math.max(...points.map((p) => p.sum), 1)
  const x = (t) => (t / maxT) * (W - 4) + 2
  const y = (v) => H - 4 - (v / maxV) * (H - 10)
  let d = `M${x(points[0].t)},${y(points[0].sum)}`
  for (let i = 1; i < points.length; i++) d += ` H${x(points[i].t)} V${y(points[i].sum)}`
  const last = points[points.length - 1]
  return (
    <svg width={W} height={H} style={{ display: 'block' }}>
      <path d={d} fill="none" stroke="#86efac" strokeWidth="2" />
      <circle cx={x(last.t)} cy={y(last.sum)} r="3.5" fill="#86efac" />
    </svg>
  )
}

/**
 * 배정 계산 중 화면 — 실제 작업 내역(모델 만들기, 해 발견, CP-SAT 원본 진행 줄)을 터미널처럼 흘려 보여 준다.
 * console: { title, startedAt, stepStartedAt, limit, logs: [{t, type, text}], best, points, done }
 * done이 오면 결과 요약과 버튼(확인 / 더 오래 찾아 개선)을 보여 준다.
 */
export default function SolveConsole({ console: c, onCancel, onClose, onImprove }) {
  const [now, setNow] = useState(Date.now())
  const [frame, setFrame] = useState(0)
  const endRef = useRef(null)
  const running = c && !c.done

  useEffect(() => {
    if (!running) return undefined
    const id = setInterval(() => { setNow(Date.now()); setFrame((f) => (f + 1) % SPIN.length) }, 100)
    return () => clearInterval(id)
  }, [running])

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [c?.logs.length])

  if (!c) return null
  const elapsed = (c.done?.at || now) - c.startedAt
  const stepPct = c.limit && running ? Math.min(100, ((now - c.stepStartedAt) / 1000 / c.limit) * 100) : (c.done ? 100 : 0)
  const best = c.best

  return (
    <Dialog open maxWidth="md" fullWidth PaperProps={{ sx: { bgcolor: '#0b1220', color: '#e2e8f0', borderRadius: 2.5, border: '1px solid #1e293b', overflow: 'hidden' } }}>
      {/* 머리 */}
      <Box sx={{ px: 2.5, py: 1.5, display: 'flex', alignItems: 'center', gap: 1.5, borderBottom: '1px solid #1e293b', bgcolor: '#0f172a' }}>
        <Box sx={{ display: 'flex', gap: 0.75 }}>
          {['#f87171', '#fbbf24', '#4ade80'].map((col) => <Box key={col} sx={{ width: 11, height: 11, borderRadius: '50%', bgcolor: col, opacity: 0.85 }} />)}
        </Box>
        <Typography sx={{ fontFamily: 'Consolas, "D2Coding", monospace', fontSize: 14, color: '#94a3b8' }}>classflow · solver</Typography>
        <Typography sx={{ fontWeight: 800, fontSize: 15, ml: 1 }}>
          {running ? <span style={{ color: '#fbbf24', marginRight: 8 }}>{SPIN[frame]}</span> : <span style={{ color: c.done?.ok ? '#4ade80' : '#fbbf24', marginRight: 8 }}>{c.done?.ok ? '●' : '◐'}</span>}
          {c.title}
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Typography sx={{ fontFamily: 'Consolas, monospace', fontSize: 15, color: '#cbd5e1' }}>{fmt(elapsed)}</Typography>
      </Box>

      {/* 현황판 */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr) 240px', gap: 1.5, px: 2.5, py: 1.5, borderBottom: '1px solid #1e293b' }}>
        {[
          ['찾은 해', best ? `${best.n}개` : '—', '#e2e8f0'],
          ['분반 편차 최대', best ? `${best.worst}명` : '—', best ? (best.worst <= 1 ? '#4ade80' : best.worst <= 2 ? '#fbbf24' : '#f87171') : '#e2e8f0'],
          ['편차 합계', best ? `${best.sum}` : '—', '#e2e8f0'],
        ].map(([label, v, col]) => (
          <Box key={label} sx={{ bgcolor: '#111a2e', borderRadius: 1.5, px: 1.5, py: 1, border: '1px solid #1e293b' }}>
            <Typography sx={{ fontSize: 11.5, color: '#64748b' }}>{label}</Typography>
            <Typography sx={{ fontSize: 24, fontWeight: 800, color: col, fontFamily: 'Consolas, monospace', lineHeight: 1.2 }}>{v}</Typography>
          </Box>
        ))}
        <Box sx={{ bgcolor: '#111a2e', borderRadius: 1.5, px: 1, py: 0.5, border: '1px solid #1e293b' }}>
          <Typography sx={{ fontSize: 11.5, color: '#64748b' }}>편차 합계 변화</Typography>
          <Sparkline points={c.points} />
        </Box>
      </Box>

      {/* 진행 막대 */}
      <Box sx={{ height: 3, bgcolor: '#1e293b' }}>
        <Box sx={{ height: 3, width: `${stepPct}%`, bgcolor: c.done ? (c.done.ok ? '#4ade80' : '#fbbf24') : '#f59e0b', transition: 'width 0.1s linear' }} />
      </Box>

      {/* 로그 */}
      <Box sx={{ height: 340, overflowY: 'auto', px: 2.5, py: 1.25, fontFamily: 'Consolas, "D2Coding", monospace', fontSize: 12.5, lineHeight: 1.65,
        '@keyframes cfIn': { from: { opacity: 0, transform: 'translateX(-6px)' }, to: { opacity: 1, transform: 'none' } },
        '@keyframes cfBlink': { '50%': { opacity: 0 } } }}>
        {c.logs.map((l, i) => (
          <Box key={i} sx={{ display: 'flex', gap: 1.25, whiteSpace: 'pre-wrap', wordBreak: 'break-all', animation: 'cfIn .25s ease-out' }}>
            <span style={{ color: '#475569', flexShrink: 0 }}>{fmt(l.t)}</span>
            <span style={{ color: COLORS[l.type] || '#cbd5e1', width: 10, flexShrink: 0 }}>{MARK[l.type] || '›'}</span>
            <span style={{ color: COLORS[l.type] || '#cbd5e1', fontWeight: l.type === 'solution' || l.type === 'done' ? 700 : 400 }}>{l.text}</span>
          </Box>
        ))}
        {running && <Box component="span" sx={{ display: 'inline-block', width: 8, height: 15, bgcolor: '#94a3b8', ml: 7.5, mt: 0.5, animation: 'cfBlink 1s step-start infinite' }} />}
        <div ref={endRef} />
      </Box>

      {/* 바닥 */}
      <Box sx={{ px: 2.5, py: 1.25, borderTop: '1px solid #1e293b', bgcolor: '#0f172a', display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography sx={{ fontSize: 13, color: '#94a3b8', flex: 1 }}>
          {running
            ? (c.limit ? `이번 시도 제한 ${c.limit >= 60 ? `${c.limit / 60}분` : `${c.limit}초`} · 못 찾으면 시간을 늘려 자동으로 다시 시도합니다` : '원인과 대안을 찾는 중입니다')
            : c.done?.summary}
        </Typography>
        {running && <Button onClick={onCancel} sx={{ color: '#fca5a5' }}>중단</Button>}
        {!running && c.done?.canImprove && <Button onClick={onImprove} sx={{ color: '#93c5fd' }}>더 오래 찾아 개선</Button>}
        {!running && <Button variant="contained" onClick={onClose} sx={{ bgcolor: '#2563eb' }}>확인</Button>}
      </Box>
    </Dialog>
  )
}
