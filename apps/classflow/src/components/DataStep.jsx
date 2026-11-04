import { useMemo, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import { allStudentIds, demandOf, toggleStudentPick, addStudent, removeStudent } from '@shared/lib/sectioning'
import { blockColor } from './colors'

/**
 * 1단계 — 올린 수강신청 데이터를 그대로 보여 주고 고친다.
 * 칸을 누르면 신청/취소. 선택 수가 다른 학생·신청 없는 학생을 걸러 볼 수 있다.
 * 이미 배정한 뒤 고치면 그 학생의 바뀐 과목만 미배정이 된다.
 */
export default function DataStep({ project, onChange, onNext }) {
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('all')
  const [newId, setNewId] = useState('')

  const blocks = useMemo(() => [...new Set(project.subjects.map((s) => s.block))], [project.subjects])
  const cols = useMemo(
    () => blocks.flatMap((b) => project.subjects.map((subj, s) => ({ subj, s })).filter((x) => x.subj.block === b)),
    [blocks, project.subjects],
  )
  const ids = useMemo(() => allStudentIds(project), [project])
  const demand = useMemo(() => demandOf(project), [project])
  const T = project.slots.length
  const excludedSet = new Set((project.excluded || []).map((x) => x.id))

  // 칸막이별로 대부분 학생이 고른 수 — 그와 다른 학생을 표시
  const blockNorm = useMemo(() => {
    const out = {}
    for (const b of blocks) {
      const freq = {}
      for (const subs of Object.values(project.requests)) {
        const n = subs.filter((s) => project.subjects[s].block === b).length
        freq[n] = (freq[n] || 0) + 1
      }
      out[b] = Number(Object.entries(freq).sort((x, y) => y[1] - x[1])[0]?.[0] ?? 0)
    }
    return out
  }, [project.requests, project.subjects, blocks])

  const oddOf = (sid) => {
    const subs = project.requests[sid] || []
    if (!subs.length) return '신청 없음'
    if (subs.length > T) return `${subs.length}과목 — 그룹 ${T}개보다 많음`
    const bad = blocks.filter((b) => subs.filter((s) => project.subjects[s].block === b).length !== blockNorm[b])
    if (bad.length) return bad.map((b) => `${b} ${subs.filter((s) => project.subjects[s].block === b).length}과목(보통 ${blockNorm[b]})`).join(', ')
    return null
  }

  const oddIds = ids.filter((sid) => oddOf(sid))
  const pickCount = {}
  for (const subs of Object.values(project.requests)) pickCount[subs.length] = (pickCount[subs.length] || 0) + 1
  const list = ids.filter((sid) => {
    if (q && !sid.includes(q.trim()) && !(project.names?.[sid] || '').includes(q.trim())) return false
    if (filter === 'odd') return !!oddOf(sid)
    return true
  })

  const add = () => {
    const id = newId.trim()
    if (!/^\d{4,}$/.test(id)) return
    onChange(addStudent(project, id))
    setNewId('')
    setQ(id)
  }

  const gridCols = `${Object.keys(project.names || {}).length ? 140 : 86}px 56px repeat(${cols.length}, minmax(0, 1fr)) 40px`

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0, bgcolor: '#fff' }}>
      <Box sx={{ px: 2, py: 1.25, borderBottom: '1px solid #dde3ea', display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
        <Typography fontWeight={800}>수강신청 데이터</Typography>
        <Typography variant="body2" color="text.secondary">
          {project.sourceFileName} · 배정 대상 {Object.keys(project.requests).length}명 · 제외 {excludedSet.size}명 · 학생당 {T}과목(그룹 {project.slots.join('·')})
        </Typography>
        <Box sx={{ flex: 1 }} />
        <TextField size="small" placeholder="학번·이름 검색" value={q} onChange={(e) => setQ(e.target.value)} sx={{ width: 140 }} />
        <Chip label={`전체 ${ids.length}`} onClick={() => setFilter('all')} color={filter === 'all' ? 'primary' : 'default'} variant={filter === 'all' ? 'filled' : 'outlined'} />
        <Chip label={`확인 필요 ${oddIds.length}`} onClick={() => setFilter('odd')}
          color={filter === 'odd' ? (oddIds.length ? 'error' : 'primary') : 'default'} variant={filter === 'odd' ? 'filled' : 'outlined'} />
        <TextField size="small" placeholder="학번 추가" value={newId} onChange={(e) => setNewId(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()} sx={{ width: 120 }} />
        <Button size="small" variant="outlined" onClick={add}>추가</Button>
        <Button variant="contained" onClick={onNext}>다음: 분반 배정 →</Button>
      </Box>
      {project.warnings?.length > 0 && filter === 'odd' && (
        <Alert severity="info" sx={{ borderRadius: 0 }}>불러올 때 경고: {project.warnings.slice(0, 5).join(' / ')}{project.warnings.length > 5 ? ' …' : ''}</Alert>
      )}

      {/* 헤더 */}
      <Box sx={{ display: 'grid', gridTemplateColumns: gridCols, borderBottom: '2px solid #c9d3de', flexShrink: 0, bgcolor: '#fafbfc', pr: '10px' }}>
        <Box sx={{ gridRow: 'span 2', display: 'flex', alignItems: 'flex-end', px: 1, pb: 0.5, fontSize: 12, fontWeight: 700, color: '#5b6b7c' }}>학번</Box>
        <Box sx={{ gridRow: 'span 2', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', pb: 0.5, fontSize: 12, fontWeight: 700, color: '#5b6b7c' }}>선택 수</Box>
        {blocks.map((b) => {
          const c = blockColor(b, blocks)
          return (
            <Box key={b} sx={{ gridColumn: `span ${cols.filter((x) => x.subj.block === b).length}`, textAlign: 'center', bgcolor: c.bg, color: c.fg, fontSize: 12, fontWeight: 800, borderRight: '2px solid #c9d3de' }}>
              칸막이 {b} · 학생당 {blockNorm[b]}과목
            </Box>
          )
        })}
        <Box sx={{ gridRow: 'span 2' }} />
        {cols.map(({ subj, s }, i) => (
          <Box key={s} sx={{ px: 0.5, py: 0.5, textAlign: 'center', borderRight: cols[i + 1]?.subj.block !== subj.block ? '2px solid #c9d3de' : '1px solid #e6ebf0' }}>
            <Typography fontSize={12} fontWeight={700} sx={{ lineHeight: 1.2, wordBreak: 'keep-all' }} color={blockColor(subj.block, blocks).fg}>{subj.name}</Typography>
            <Typography fontSize={12} fontWeight={800}>{demand[s]}명</Typography>
          </Box>
        ))}
      </Box>

      {/* 본문 */}
      <Box sx={{ flex: 1, overflowY: 'scroll', minHeight: 0 }}>
        {list.map((sid) => {
          const subs = project.requests[sid] || []
          const odd = oddOf(sid)
          return (
            <Box key={sid} sx={{ display: 'grid', gridTemplateColumns: gridCols, borderBottom: '1px solid #f0f2f5', bgcolor: excludedSet.has(sid) ? '#f6f6f6' : odd ? '#fff4f4' : 'transparent', '&:hover': { bgcolor: '#f3f7fc' } }}>
              <Typography fontSize={13} fontWeight={700} sx={{ px: 1, py: 0.4, color: excludedSet.has(sid) ? 'text.disabled' : 'text.primary' }} noWrap>{sid}{project.names?.[sid] && <Box component="span" sx={{ ml: 0.75, fontWeight: 500, color: 'text.secondary' }}>{project.names[sid]}</Box>}</Typography>
              <Tooltip title={odd || ''} disableHoverListener={!odd}>
                <Typography fontSize={13} textAlign="center" sx={{ py: 0.4 }} color={odd ? 'error' : 'text.secondary'} fontWeight={odd ? 700 : 400}>{subs.length}</Typography>
              </Tooltip>
              {cols.map(({ subj, s }, i) => {
                const on = subs.includes(s)
                const c = blockColor(subj.block, blocks)
                return (
                  <Box key={s} onClick={() => onChange(toggleStudentPick(project, sid, s))}
                    sx={{
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      borderRight: cols[i + 1]?.subj.block !== subj.block ? '2px solid #c9d3de' : '1px solid #f0f2f5',
                      '&:hover': { bgcolor: '#e8f0fb' },
                    }}>
                    {on && <Box sx={{ width: 22, height: 18, borderRadius: 0.75, bgcolor: c.fg, color: '#fff', fontSize: 12, fontWeight: 700, textAlign: 'center', lineHeight: '18px' }}>1</Box>}
                  </Box>
                )
              })}
              <IconButton size="small" sx={{ p: 0.25 }} onClick={() => { if (window.confirm(`${sid}${project.names?.[sid] ? ` ${project.names[sid]}` : ''} 학생을 명단에서 지울까요?`)) onChange(removeStudent(project, sid)) }}>
                <DeleteOutlineIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Box>
          )
        })}
        {!list.length && <Typography sx={{ p: 3 }} color="text.secondary">해당하는 학생이 없습니다.</Typography>}
      </Box>
      {/* 아래 고정 합계 줄 — 고치는 대로 과목별 신청 인원이 바뀐다 */}
      <Box sx={{ display: 'grid', gridTemplateColumns: gridCols, borderTop: '2px solid #c9d3de', bgcolor: '#f3f6f9', pr: '10px', flexShrink: 0 }}>
        <Typography fontSize={13} fontWeight={800} sx={{ px: 1, py: 0.6 }}>합계</Typography>
        <Tooltip title={Object.entries(pickCount).map(([n, c]) => `${n}과목 ${c}명`).join(' · ')}>
          <Typography fontSize={12} textAlign="center" sx={{ py: 0.6 }} color="text.secondary">{Object.keys(project.requests).length}명</Typography>
        </Tooltip>
        {cols.map(({ subj, s }, i) => (
          <Typography key={s} fontSize={13} fontWeight={800} textAlign="center" sx={{ py: 0.6, borderRight: cols[i + 1]?.subj.block !== subj.block ? '2px solid #c9d3de' : '1px solid #e6ebf0' }}
            color={blockColor(subj.block, blocks).fg}>
            {demand[s]}
          </Typography>
        ))}
        <span />
      </Box>
      <Stack direction="row" sx={{ px: 2, py: 0.75, borderTop: '1px solid #dde3ea', bgcolor: '#fafbfc' }}>
        <Typography variant="caption" color="text.secondary">
          칸을 누르면 신청/취소됩니다. 신청을 모두 지우면 배정에서 빠지고(회색), 다시 누르면 들어옵니다. 이미 배정한 학생은 바뀐 과목만 미배정이 됩니다.
        </Typography>
      </Stack>
    </Box>
  )
}
