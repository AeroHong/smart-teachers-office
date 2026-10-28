import { useState } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import IconButton from '@mui/material/IconButton'
import Autocomplete from '@mui/material/Autocomplete'
import CloseIcon from '@mui/icons-material/Close'
import { homeroomSlots } from '@shared/lib/dutyPlan'
import { PERSON_DRAG, readPerson } from './dutyDnd'
import { ACCENT, ACCENT_BG } from './dutyUi'

/**
 * 사람 고르기 — 시스템 사용자(교직원 계정)에서만 고른다. hwpx 이름은 처음 올릴 때만 쓰고, 고르는 대상이 아니다.
 * onChange는 { uid, name, subject }. pool은 예전 호출 호환용(쓰지 않음)
 */
// eslint-disable-next-line no-unused-vars
function PersonPicker({ pool, staff = [], value, onChange, placeholder, sx }) {
  const options = staff.filter((s) => s.uid).map((s) => ({ uid: s.uid, name: s.name, subject: s.subject || '', department: s.department || '' }))
  options.sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  const current = value?.name ? options.find((o) => (value.uid ? o.uid === value.uid : o.name === value.name)) || { uid: value.uid || null, name: value.name } : null
  return (
    <Autocomplete size="small" options={options} value={current}
      getOptionLabel={(o) => o.name + (o.subject || o.department ? ` (${[o.subject, o.department].filter(Boolean).join(' · ')})` : '')}
      isOptionEqualToValue={(a, b) => (a.uid && b.uid ? a.uid === b.uid : a.name === b.name)}
      onChange={(_, v) => onChange(v ? { uid: v.uid, name: v.name, subject: v.subject } : null)}
      renderInput={(p) => <TextField {...p} placeholder={placeholder} sx={sx} />} />
  )
}

/** 담임 칸 하나(담임 또는 부담임) — 사람을 끌어 놓거나 눌러서 고른다 */
function Slot({ label, person, onSet, onEdit }) {
  const [over, setOver] = useState(false)
  return (
    <Box
      onDragOver={(e) => { if (e.dataTransfer.types.includes(PERSON_DRAG)) { e.preventDefault(); setOver(true) } }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { setOver(false); const p = readPerson(e); if (p) { e.preventDefault(); onSet(p) } }}
      onClick={onEdit}
      sx={{
        flex: 1, minWidth: 0, minHeight: 30, px: 0.75, py: 0.4, borderRadius: 1, cursor: 'pointer',
        border: `1px dashed ${over ? ACCENT : person?.name ? 'transparent' : '#cbd5e1'}`, bgcolor: over ? ACCENT_BG : person?.name ? '#fff' : 'transparent',
        display: 'flex', alignItems: 'center', gap: 0.5,
      }}>
      <Typography variant="caption" sx={{ color: 'text.secondary', flexShrink: 0 }}>{label}</Typography>
      <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: person?.uid ? '#0f172a' : '#b45309', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{person?.name || ''}</Typography>
      {person?.name && <IconButton size="small" sx={{ p: 0.1 }} onClick={(e) => { e.stopPropagation(); onSet(null) }}><CloseIcon sx={{ fontSize: 14 }} /></IconButton>}
    </Box>
  )
}

/**
 * 담임·부담임 격자 — 학년 × 반(특수반은 담임만). 학급 수는 학년도 설정(classCounts)을 따른다.
 * onSet(grade, classNo, role('homeroom'|'sub'), person|null), onClassCounts(next)
 */
export function HomeroomGrid({ data, staff, classCounts, specialClasses, onSet, onLayout }) {
  const [editing, setEditing] = useState(null) // { grade, classNo, role }
  const slots = homeroomSlots(data, classCounts || {}, specialClasses || {})
  const pool = data.staffPool || []
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        {[1, 2, 3].map((g) => (
          <Box key={g} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>{g}학년</Typography>
            <TextField size="small" type="number" value={classCounts?.[g] ?? 0} sx={{ width: 72 }}
              onChange={(e) => onLayout({ classCounts: { ...(classCounts || {}), [g]: Math.max(0, Math.min(20, Number(e.target.value) || 0)) }, specialClasses })} />
            <Typography variant="caption">반</Typography>
            <Button size="small" variant={specialClasses?.[g] ? 'contained' : 'outlined'} disableElevation sx={{ minWidth: 0, px: 1 }}
              onClick={() => onLayout({ classCounts, specialClasses: { ...(specialClasses || {}), [g]: !specialClasses?.[g] } })}>특수</Button>
          </Box>
        ))}
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }, gap: 1.5 }}>
        {[1, 2, 3].map((g) => (
          <Box key={g} sx={{ border: '1px solid #e2e8f0', borderRadius: 2, p: 1, bgcolor: '#f8fafc', display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Typography sx={{ fontWeight: 800, mb: 0.25 }}>{g}학년</Typography>
            {slots.filter((s) => s.grade === g).map((s) => (
              <Box key={`${s.grade}-${s.classNo}`} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, borderBottom: '1px solid #e2e8f0', pb: 0.4 }}>
                <Typography sx={{ width: 34, fontWeight: 800, fontSize: '0.85rem', color: ACCENT }}>{s.classNo === '특수' ? '특수' : `${s.classNo}반`}</Typography>
                <Slot label="담임" person={{ uid: s.homeroomUid, name: s.homeroomName }}
                  onSet={(p) => onSet(s.grade, s.classNo, 'homeroom', p)} onEdit={() => setEditing({ ...s, role: 'homeroom' })} />
                {s.classNo !== '특수' && (
                  <Slot label="부" person={{ uid: s.subHomeroomUid, name: s.subHomeroomName }}
                    onSet={(p) => onSet(s.grade, s.classNo, 'sub', p)} onEdit={() => setEditing({ ...s, role: 'sub' })} />
                )}
              </Box>
            ))}
          </Box>
        ))}
      </Box>
      {editing && (
        <Box sx={{ position: 'fixed', inset: 0, zIndex: 1300, bgcolor: 'rgba(15,23,42,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setEditing(null)}>
          <Box sx={{ bgcolor: '#fff', borderRadius: 2, p: 2, width: 340 }} onClick={(e) => e.stopPropagation()}>
            <Typography sx={{ fontWeight: 800, mb: 1 }}>{editing.grade}학년 {editing.classNo === '특수' ? '특수학급' : `${editing.classNo}반`} {editing.role === 'sub' ? '부담임' : '담임'}</Typography>
            <PersonPicker pool={pool} staff={staff} placeholder="교직원 고르기"
              value={editing.role === 'sub' ? { uid: editing.subHomeroomUid, name: editing.subHomeroomName } : { uid: editing.homeroomUid, name: editing.homeroomName }}
              onChange={(p) => { onSet(editing.grade, editing.classNo, editing.role, p); setEditing(null) }} />
          </Box>
        </Box>
      )}
    </Box>
  )
}

/** 교과부장 — 교과(군)마다 한 줄. onSet(group, patch), onRemove(group), onAdd(group) */
export function SubjectHeadsEditor({ data, staff, onSet, onRemove, onAdd }) {
  const [group, setGroup] = useState('')
  const pool = data.staffPool || []
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, maxWidth: 760 }}>
      {(data.subjectHeads || []).map((s) => (
        <Box key={s.group} sx={{ display: 'grid', gridTemplateColumns: '120px 220px 1fr 32px', gap: 1, alignItems: 'center' }}>
          <Typography sx={{ fontWeight: 800 }}>{s.group}</Typography>
          <PersonPicker pool={pool} staff={staff} value={{ uid: s.uid, name: s.name }} placeholder="교과부장" onChange={(p) => onSet(s.group, { uid: p?.uid || null, name: p?.name || '' }, p)} />
          <TextField size="small" value={s.note || ''} placeholder="비고 — 포함 과목" onChange={(e) => onSet(s.group, { note: e.target.value })} />
          <IconButton size="small" onClick={() => window.confirm(`'${s.group}' 줄을 지울까요?`) && onRemove(s.group)}><CloseIcon fontSize="small" /></IconButton>
        </Box>
      ))}
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
        <TextField size="small" value={group} onChange={(e) => setGroup(e.target.value)} placeholder="교과 이름 (예: 국어과)" sx={{ width: 200 }} />
        <Button size="small" disabled={!group.trim() || (data.subjectHeads || []).some((s) => s.group === group.trim())}
          onClick={() => { onAdd(group.trim()); setGroup('') }}>교과 추가</Button>
      </Box>
    </Box>
  )
}

export { PersonPicker }

/**
 * 부장교사 명단 — 부장은 업무분장표의 '부장' 줄 담당자로 정해진다(여기서는 읽기만). 비고만 고친다.
 * onNote(deptId, text)
 */
export function HeadsEditor({ rows, onNote }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, maxWidth: 760 }}>
      {rows.map((h) => (
        <Box key={h.deptId} sx={{ display: 'grid', gridTemplateColumns: '130px 100px 110px 1fr', gap: 1, alignItems: 'center' }}>
          <Typography sx={{ fontWeight: 800 }}>{h.dept}</Typography>
          <Typography sx={{ fontWeight: 700, color: h.name ? '#0f172a' : '#b45309' }}>{h.name || '부장 없음'}</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>{h.subject}</Typography>
          <TextField size="small" value={h.note} placeholder="비고" onChange={(e) => onNote(h.deptId, e.target.value)} />
        </Box>
      ))}
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>부장은 업무분장표에서 그 부서 '부장' 줄의 성명으로 정해집니다.</Typography>
    </Box>
  )
}
