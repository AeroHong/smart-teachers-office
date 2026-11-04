import { useEffect, useMemo, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import FormControlLabel from '@mui/material/FormControlLabel'
import Switch from '@mui/material/Switch'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Typography from '@mui/material/Typography'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import DownloadIcon from '@mui/icons-material/Download'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import { formatSolveLog } from '@shared/lib/sectioning'

const COLORS = { local: '#cbd5e1', info: '#93c5fd', raw: '#5b6b80', solution: '#86efac', warn: '#fbbf24', done: '#5eead4', error: '#fca5a5' }
const MARK = { local: '›', info: '▸', raw: ' ', solution: '★', warn: '!', done: '✔', error: '✖' }
const fmt = (ms) => {
  const s = Math.max(0, ms / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${(s % 60).toFixed(1).padStart(4, '0')}`
}
const when = (iso) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const HEIGHT_KEY = 'classflow.logPanelHeight'
const readHeight = () => { try { return Number(localStorage.getItem(HEIGHT_KEY)) || 240 } catch { return 240 } }

/**
 * 배정 기록 — 2단계 배정표 아래. 최근 실행 5회의 진행 로그·결과를 보여 주고 복사·다운로드(.txt).
 * 기록은 작업에 붙어 있어 저장할 때 함께 저장된다(버전에도 들어간다).
 */
export default function SolveLogPanel({ project, open, onToggle, onExported }) {
  const logs = useMemo(() => project.solveLogs || [], [project.solveLogs])
  const [sel, setSel] = useState(null)
  const [raw, setRaw] = useState(false)
  const [height, setHeight] = useState(readHeight)
  const [copied, setCopied] = useState(false)
  const endRef = useRef(null)

  // 새 기록이 생기면 그 기록으로
  const lastId = logs[logs.length - 1]?.id
  useEffect(() => { setSel(lastId || null) }, [lastId])
  const entry = logs.find((l) => l.id === sel) || logs[logs.length - 1]
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [entry?.id, raw, open])

  const text = entry ? formatSolveLog(project, entry, { raw }) : ''
  const fileName = entry ? `배정기록_${(project.title || '분반').replace(/[\\/:*?"<>|]/g, '_')}_${entry.at.slice(0, 16).replace(/[-:T]/g, '')}.txt` : ''

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
      onExported?.('복사', entry)
    } catch { /* 클립보드 권한 없음 — 다운로드를 쓰면 된다 */ }
  }
  const download = () => {
    const blob = new Blob(['﻿' + text], { type: 'text/plain;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = fileName
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    onExported?.('다운로드', entry)
  }

  // 위 경계를 끌어 높이 조절
  const startDrag = (e) => {
    e.preventDefault()
    const y0 = e.clientY
    const h0 = height
    const move = (ev) => setHeight(Math.min(Math.max(120, h0 + (y0 - ev.clientY)), window.innerHeight * 0.7))
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      setHeight((h) => { try { localStorage.setItem(HEIGHT_KEY, String(Math.round(h))) } catch { /* 이번 화면에서만 */ } return h })
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  const lines = (entry?.lines || []).filter((l) => raw || l.type !== 'raw')

  return (
    <Box sx={{ flexShrink: 0, borderTop: '2px solid #c9d3de', bgcolor: '#0f172a', color: '#e2e8f0', display: 'flex', flexDirection: 'column', height: open ? height : 36 }}>
      {open && <Box onMouseDown={startDrag} sx={{ height: 5, cursor: 'row-resize', bgcolor: '#1e293b', flexShrink: 0, '&:hover': { bgcolor: '#334155' } }} />}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, minHeight: 31, flexShrink: 0 }}>
        <Button size="small" onClick={onToggle} sx={{ color: '#e2e8f0', fontWeight: 800, minWidth: 0 }} endIcon={open ? <ExpandMoreIcon /> : <ExpandLessIcon />}>
          배정 기록 {logs.length ? `(${logs.length})` : ''}
        </Button>
        {!logs.length && <Typography variant="caption" sx={{ color: '#94a3b8' }}>배정 실행을 누르면 진행 기록이 여기에 남고, 저장할 때 함께 저장됩니다.</Typography>}
        {open && logs.length > 0 && (
          <Tabs value={entry?.id || false} onChange={(_, v) => setSel(v)} variant="scrollable" scrollButtons={false}
            sx={{ minHeight: 28, flex: 1, '& .MuiTab-root': { minHeight: 28, py: 0, px: 1.25, fontSize: 12, color: '#94a3b8', textTransform: 'none' }, '& .Mui-selected': { color: '#e2e8f0 !important' } }}>
            {[...logs].reverse().map((l) => (
              <Tab key={l.id} value={l.id} label={`${l.ok ? '✔' : '✖'} ${when(l.at)} ${l.title}`} />
            ))}
          </Tabs>
        )}
        {!open && <Box sx={{ flex: 1 }} />}
        {logs.length > 0 && (
          <>
            {open && <FormControlLabel sx={{ mr: 0, '& .MuiFormControlLabel-label': { fontSize: 12, color: '#94a3b8' } }}
              control={<Switch size="small" checked={raw} onChange={(e) => setRaw(e.target.checked)} />} label="솔버 원본 줄" />}
            <Button size="small" startIcon={<ContentCopyIcon />} onClick={copy} sx={{ color: '#e2e8f0' }}>{copied ? '복사됨' : '복사'}</Button>
            <Button size="small" startIcon={<DownloadIcon />} onClick={download} sx={{ color: '#e2e8f0' }}>다운로드</Button>
          </>
        )}
      </Box>
      {open && entry && (
        <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: 1.5, pb: 1, fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 12.5, lineHeight: 1.6 }}>
          <Box sx={{ color: '#94a3b8' }}>
            {entry.byName && `${entry.byName} · `}{new Date(entry.at).toLocaleString('ko-KR')} · 학생 {entry.settings?.students}명 · 분반 {entry.settings?.sections}개 · 최대 {entry.settings?.maxSize}명
          </Box>
          {lines.map((l, i) => (
            <Box key={i} sx={{ color: COLORS[l.type] || COLORS.local, whiteSpace: 'pre-wrap' }}>
              <span style={{ color: '#475569' }}>{fmt(l.t)} </span>{MARK[l.type] || '›'} {l.text}
            </Box>
          ))}
          <Box sx={{ mt: 0.5, color: entry.ok ? '#5eead4' : '#fca5a5', fontWeight: 700 }}>{entry.ok ? '✔' : '✖'} {entry.summary}</Box>
          {entry.result && (
            <Box sx={{ mt: 0.5, color: '#cbd5e1' }}>
              미배정 {entry.result.unassigned}명 · 충돌 {entry.result.conflicts}명 · 분반 편차 최대 {entry.result.worst}명 · 편차 합계 {entry.result.sum}
              {entry.result.subjects.map((s) => (
                <Box key={s.name} sx={{ color: '#94a3b8' }}>  [{s.block}] {s.name}: {s.sections.map((x) => `${x.label} ${x.n}명`).join(', ') || '분반 없음'}</Box>
              ))}
            </Box>
          )}
          <div ref={endRef} />
        </Box>
      )}
    </Box>
  )
}
