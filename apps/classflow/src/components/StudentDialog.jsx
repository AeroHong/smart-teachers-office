import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import LockIcon from '@mui/icons-material/Lock'
import { studentSchedule, moveOptions, setStudentSection, toggleStudentLock, sectionLabel, separationPartners, sectionOf } from '@shared/lib/sectioning'

/**
 * 학생 한 명의 과목별 분반을 고치는 작은 창.
 * 그룹이 겹치는 분반은 고를 수 없고, 겹치는 과목을 비는 그룹으로 옮길 수 있으면 "맞바꿈"으로 고를 수 있다.
 */
export default function StudentDialog({ project, sid, problem, onChange, onClose, onPrev, onNext, onAddSeparation }) {
  if (!sid) return null
  const sch = [...studentSchedule(project, sid)].sort((a, b) => (a.slot ?? 99) - (b.slot ?? 99))
  const usedSlots = new Set(sch.map((x) => x.slot).filter((t) => t !== null))
  const isLocked = (project.lockedStudents || []).includes(sid)
  const isManual = (project.manualStudents || []).includes(sid)
  const partners = [...separationPartners(project, sid)]

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth
      onKeyDown={(e) => { if (e.key === 'ArrowDown' && e.altKey) onNext?.(); if (e.key === 'ArrowUp' && e.altKey) onPrev?.() }}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pb: 1 }}>
        <Typography fontSize={22} fontWeight={800}>{sid}</Typography>
        {project.names?.[sid] && <Typography fontSize={18} fontWeight={600} color="text.secondary">{project.names[sid]}</Typography>}
        {problem && <Chip size="small" color="error" label="미배정/충돌" />}
        {isManual && <Chip size="small" color="primary" variant="outlined" label="수동 변경" />}
        <Box sx={{ flex: 1 }} />
        <Button size="small" variant={isLocked ? 'contained' : 'outlined'} color="warning" startIcon={<LockIcon />}
          onClick={() => onChange(toggleStudentLock(project, sid))}>
          {isLocked ? '고정됨' : '학생 고정'}
        </Button>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={1}>
          {sch.map((x) => {
            const opts = moveOptions(project, sid, x.s)
            const subj = project.subjects[x.s]
            return (
              <Box key={x.s} sx={{ display: 'grid', gridTemplateColumns: '30px 1fr 150px', alignItems: 'center', gap: 1 }}>
                <Typography fontSize={20} fontWeight={800} color={x.slot === null ? 'error' : '#14532d'} textAlign="center">
                  {x.slot === null ? '?' : project.slots[x.slot]}
                </Typography>
                <Box sx={{ minWidth: 0 }}>
                  <Typography fontSize={14} fontWeight={600} noWrap title={subj.name}>{subj.name}</Typography>
                  <Typography fontSize={11} color="text.secondary">칸막이 {subj.block}{subj.locked ? ' · 과목 고정' : ''}</Typography>
                </Box>
                <Select size="small" value={x.k ?? ''} displayEmpty disabled={isLocked || subj.locked}
                  onChange={(e) => {
                    const o = opts[Number(e.target.value)]
                    let p = setStudentSection(project, sid, x.s, o.k)
                    if (!o.ok && o.swap) p = setStudentSection(p, sid, o.swap.s, o.swap.k)
                    onChange(p)
                  }}
                  MenuProps={{ PaperProps: { sx: { minWidth: 320 } } }}
                  renderValue={(v) => (v === '' ? <span style={{ color: '#d32f2f' }}>미배정</span> : `${sectionLabel(project, x.s, v)} 분반`)}>
                  {opts.map((o) => (
                    <MenuItem key={o.k} value={o.k} disabled={!o.ok && !o.current && !o.swap}>
                      <Box sx={{ display: 'flex', width: '100%', gap: 1 }}>
                        <b>{o.label}</b>
                        <span style={{ color: '#5b6b7c' }}>{o.size}명</span>
                        {o.current && <span style={{ marginLeft: 'auto', fontSize: 12, color: '#14532d' }}>현재</span>}
                        {!o.current && o.swap && <span style={{ marginLeft: 'auto', fontSize: 12, color: '#b45309' }}>↔ {o.swap.name} {o.swap.label}로 맞바꿈</span>}
                        {!o.current && !o.swap && o.reason && <span style={{ marginLeft: 'auto', fontSize: 12, color: '#d32f2f' }}>{o.reason}</span>}
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </Box>
            )
          })}
        </Stack>
        <Typography fontSize={12} color="text.secondary" sx={{ mt: 1.5 }}>
          빈 그룹: {project.slots.filter((_, t) => !usedSlots.has(t)).join(', ') || '없음'} · 고정한 학생은 배정 실행에서도 그대로 둡니다.
        </Typography>
        <Box sx={{ mt: 1.5, pt: 1.25, borderTop: '1px dashed #dde3ea', display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Typography fontSize={13} fontWeight={700}>분리 대상</Typography>
          {partners.length ? partners.map((pid) => {
            const together = sch.some((x) => x.k !== null && sectionOf(project, pid, x.s) === x.k)
            return <Chip key={pid} size="small" label={pid} color={together ? 'error' : 'default'} title={together ? '같은 분반에 있음' : ''} />
          }) : <Typography fontSize={12} color="text.secondary">없음</Typography>}
          {onAddSeparation && <Button size="small" onClick={onAddSeparation}>이 학생과 분리할 학생 추가</Button>}
        </Box>
      </DialogContent>
      <DialogActions>
        {onPrev && <Button onClick={onPrev}>← 이전 학생</Button>}
        {onNext && <Button onClick={onNext}>다음 학생 →</Button>}
        <Box sx={{ flex: 1 }} />
        <Button variant="contained" onClick={onClose}>닫기</Button>
      </DialogActions>
    </Dialog>
  )
}
