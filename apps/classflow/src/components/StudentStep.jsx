import { useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import LockIcon from '@mui/icons-material/Lock'
import CallSplitIcon from '@mui/icons-material/CallSplit'
import Button from '@mui/material/Button'
import { studentIds, studentSchedule, sectionLabel, unassignedBySubject } from '@shared/lib/sectioning'
import { blockColor } from './colors'
import StudentDialog from './StudentDialog'
import SeparationDialog from './SeparationDialog'

// 그룹 글자별 색 — 학생 표에서 어느 그룹인지 한눈에
const SLOT_COLORS = ['#1d4ed8', '#047857', '#b45309', '#7c3aed', '#be123c', '#0e7490', '#4d7c0f', '#9333ea']

/**
 * 3단계 — 학번별로 선택 과목이 어느 분반(그룹)에 배정됐는지 표로 본다.
 * 행을 누르면 작은 창에서 과목별 분반을 고친다.
 */
export default function StudentStep({ project, validation, selectedSection, onSelectSection, onChange }) {
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('all')
  const [openSid, setOpenSid] = useState(null)
  const [unSubject, setUnSubject] = useState(null) // 이 과목 미배정 학생만
  const [sepOpen, setSepOpen] = useState(null) // null | { initial: [학번] }

  const blocks = useMemo(() => [...new Set(project.subjects.map((s) => s.block))], [project.subjects])
  const cols = useMemo(
    () => blocks.flatMap((b) => project.subjects.map((subj, s) => ({ subj, s })).filter((x) => x.subj.block === b)),
    [blocks, project.subjects],
  )
  const ids = useMemo(() => studentIds(project), [project.requests]) // eslint-disable-line react-hooks/exhaustive-deps
  const problem = useMemo(() => new Set([...validation.unassigned, ...validation.conflicts]), [validation])
  const manual = new Set(project.manualStudents || [])
  const locked = new Set(project.lockedStudents || [])
  const inRule = new Set((project.separations || []).flatMap((r) => r.students))
  const sepBad = new Set(validation.separationViolations.flatMap((v) => v.students))

  const unassignedOf = useMemo(() => Object.fromEntries(unassignedBySubject(project).map((u) => [u.s, u])), [project])
  const schedules = useMemo(() => Object.fromEntries(ids.map((sid) => [sid, studentSchedule(project, sid)])), [project, ids])

  const list = ids.filter((sid) => {
    if (q && !sid.includes(q.trim())) return false
    if (filter === 'problem') return problem.has(sid)
    if (filter === 'manual') return manual.has(sid)
    if (filter === 'locked') return locked.has(sid)
    if (filter === 'separation') return sepBad.has(sid)
    if (filter === 'unassignedSubject' && unSubject !== null) return unassignedOf[unSubject]?.students.includes(sid)
    if (filter === 'section' && selectedSection) return schedules[sid].some((x) => x.s === selectedSection.s && x.k === selectedSection.k)
    return true
  })
  const effective = (filter === 'section' && !selectedSection) || (filter === 'unassignedSubject' && !unassignedOf[unSubject]) ? 'all' : filter

  const gridCols = `80px 60px repeat(${cols.length}, minmax(0, 1fr))`
  const idx = openSid ? list.indexOf(openSid) : -1

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0, bgcolor: '#fff' }}>
      <Box sx={{ px: 2, py: 1.25, borderBottom: '1px solid #dde3ea', display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography fontWeight={800}>학생별 배정</Typography>
        <Typography variant="body2" color="text.secondary">칸의 글자는 그룹(분반)입니다. 학생을 누르면 분반을 고칠 수 있습니다.</Typography>
        <Box sx={{ flex: 1 }} />
        <TextField size="small" placeholder="학번 검색" value={q} onChange={(e) => setQ(e.target.value)} sx={{ width: 140 }} />
        {[
          ['all', `전체 ${ids.length}`],
          ['problem', `문제 ${problem.size}`],
          ['manual', `수동 변경 ${manual.size}`],
          ['locked', `고정 ${locked.size}`],
          ...(sepBad.size ? [['separation', `분리 위반 ${sepBad.size}`]] : []),
        ].map(([v, label]) => (
          <Chip key={v} label={label} onClick={() => setFilter(v)}
            color={effective === v ? ((v === 'problem' && problem.size) || v === 'separation' ? 'error' : 'primary') : 'default'} variant={effective === v ? 'filled' : 'outlined'} />
        ))}
        {filter === 'unassignedSubject' && unassignedOf[unSubject] && (
          <Chip color="error" onDelete={() => { setUnSubject(null); setFilter('all') }}
            label={`${unassignedOf[unSubject].name} 미배정 ${unassignedOf[unSubject].count}명`} />
        )}
        <Button size="small" variant="outlined" startIcon={<CallSplitIcon />} color={sepBad.size ? 'error' : 'primary'}
          onClick={() => setSepOpen({ initial: [] })}>
          분리 규칙 {(project.separations || []).length}
        </Button>
        {selectedSection && (
          <Chip onClick={() => setFilter('section')} onDelete={() => { onSelectSection(null); setFilter('all') }}
            color={effective === 'section' ? 'primary' : 'default'} variant={effective === 'section' ? 'filled' : 'outlined'}
            label={`${project.subjects[selectedSection.s].name} ${sectionLabel(project, selectedSection.s, selectedSection.k)} 분반`} />
        )}
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: gridCols, borderBottom: '2px solid #c9d3de', flexShrink: 0, bgcolor: '#fafbfc', pr: '10px' }}>
        <Box sx={{ gridRow: 'span 2', display: 'flex', alignItems: 'flex-end', px: 1, pb: 0.5, fontSize: 12, fontWeight: 700, color: '#5b6b7c' }}>학번</Box>
        <Box sx={{ gridRow: 'span 2', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', pb: 0.5, fontSize: 12, fontWeight: 700, color: '#5b6b7c' }}>상태</Box>
        {blocks.map((b) => {
          const c = blockColor(b, blocks)
          return (
            <Box key={b} sx={{ gridColumn: `span ${cols.filter((x) => x.subj.block === b).length}`, textAlign: 'center', bgcolor: c.bg, color: c.fg, fontSize: 12, fontWeight: 800, borderRight: '2px solid #c9d3de' }}>
              칸막이 {b}
            </Box>
          )
        })}
        {cols.map(({ subj, s }, i) => (
          <Box key={s} sx={{ px: 0.5, py: 0.5, textAlign: 'center', borderRight: cols[i + 1]?.subj.block !== subj.block ? '2px solid #c9d3de' : '1px solid #e6ebf0' }}>
            <Typography fontSize={12} fontWeight={700} sx={{ lineHeight: 1.2, wordBreak: 'keep-all' }} color={blockColor(subj.block, blocks).fg}>{subj.name}</Typography>
            {unassignedOf[s] && (
              <Typography component="button" onClick={() => { setUnSubject(s); setFilter('unassignedSubject') }}
                title="이 과목 미배정 학생만 보기"
                sx={{ border: 0, bgcolor: 'transparent', cursor: 'pointer', p: 0, fontSize: 11.5, fontWeight: 800, color: 'error.main', textDecoration: 'underline' }}>
                미배정 {unassignedOf[s].count}
              </Typography>
            )}
          </Box>
        ))}
      </Box>

      <Box sx={{ flex: 1, overflowY: 'scroll', minHeight: 0 }}>
        {list.map((sid) => {
          const sch = schedules[sid]
          const bySubject = Object.fromEntries(sch.map((x) => [x.s, x]))
          const isProblem = problem.has(sid)
          return (
            <Box key={sid} onClick={() => setOpenSid(sid)}
              sx={{ display: 'grid', gridTemplateColumns: gridCols, borderBottom: '1px solid #f0f2f5', cursor: 'pointer', bgcolor: isProblem ? '#fff4f4' : 'transparent', '&:hover': { bgcolor: '#eaf2fc' } }}>
              <Typography fontSize={13} fontWeight={700} sx={{ px: 1, py: 0.45 }}>{sid}</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.25 }}>
                {isProblem && <Typography fontSize={11} color="error" fontWeight={700}>문제</Typography>}
                {manual.has(sid) && <Typography fontSize={11} color="primary">수동</Typography>}
                {locked.has(sid) && <LockIcon sx={{ fontSize: 13 }} color="warning" />}
                {inRule.has(sid) && <CallSplitIcon sx={{ fontSize: 14 }} color={sepBad.has(sid) ? 'error' : 'action'} titleAccess="분리 규칙 학생" />}
              </Box>
              {cols.map(({ subj, s }, i) => {
                const x = bySubject[s]
                const sel = x && selectedSection && selectedSection.s === s && selectedSection.k === x.k
                return (
                  <Box key={s} sx={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRight: cols[i + 1]?.subj.block !== subj.block ? '2px solid #c9d3de' : '1px solid #f0f2f5',
                    bgcolor: sel ? '#fff1c7' : 'transparent',
                  }}>
                    {x && (x.label
                      ? <Typography fontSize={13} fontWeight={800} color={x.slot === null ? '#5b6b7c' : SLOT_COLORS[x.slot % SLOT_COLORS.length]}>{x.label}</Typography>
                      : <Typography fontSize={12} fontWeight={700} color="error">미배정</Typography>)}
                  </Box>
                )
              })}
            </Box>
          )
        })}
        {!list.length && <Typography sx={{ p: 3 }} color="text.secondary">해당하는 학생이 없습니다.</Typography>}
      </Box>

      {openSid && (
        <StudentDialog project={project} sid={openSid} problem={problem.has(openSid)} onChange={onChange}
          onClose={() => setOpenSid(null)}
          onPrev={idx > 0 ? () => setOpenSid(list[idx - 1]) : null}
          onNext={idx >= 0 && idx < list.length - 1 ? () => setOpenSid(list[idx + 1]) : null}
          onAddSeparation={() => setSepOpen({ initial: [openSid] })} />
      )}
      {sepOpen && (
        <SeparationDialog project={project} onChange={onChange} initialStudents={sepOpen.initial} onClose={() => setSepOpen(null)} />
      )}
    </Box>
  )
}
