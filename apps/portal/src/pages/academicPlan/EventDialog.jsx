import { useEffect, useState } from 'react'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import Autocomplete from '@mui/material/Autocomplete'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import Alert from '@mui/material/Alert'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import AddIcon from '@mui/icons-material/Add'
import {
  ACTIVITY_TYPES, EVENT_KINDS, GRADES, SCHOOL_WEEKDAYS, isDateKey, mondayIndex, shortLabel,
} from '@shared/lib/academicPlan'
import { DEFAULT_FULL_DAY, KIND_HELP } from './planUi'

const newId = () => `ev_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`

const EMPTY = {
  title: '', kind: '일반', date: '', endDate: '', grades: [], dept: '', fullDay: false,
  examType: '중간', weekdaySwap: 0, activities: [], note: '',
}

function GradePicker({ value, onChange, label = '대상 학년' }) {
  const all = !value?.length
  const toggle = (g) => {
    const cur = all ? [...GRADES] : value
    const next = cur.includes(g) ? cur.filter((x) => x !== g) : [...cur, g].sort()
    onChange(next.length === GRADES.length ? [] : next)
  }
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
      <Typography variant="body2" sx={{ color: 'text.secondary', mr: 1, minWidth: 64 }}>{label}</Typography>
      {GRADES.map((g) => (
        <FormControlLabel key={g} sx={{ mr: 1 }}
          control={<Checkbox size="small" checked={all || value.includes(g)} onChange={() => toggle(g)} />}
          label={`${g}학년`} />
      ))}
    </Box>
  )
}

/**
 * 일정 등록·수정. event가 id를 가지면 수정, 아니면 새로 등록(date만 채워 연다).
 * onSave(event) / onDelete(id)
 */
export default function EventDialog({ open, event, departments = [], onClose, onSave, onDelete, readOnly }) {
  const [f, setF] = useState(EMPTY)
  const [err, setErr] = useState('')
  const editing = Boolean(event?.id)

  useEffect(() => {
    if (!open) return
    setErr('')
    setF({ ...EMPTY, ...(event || {}), endDate: event?.endDate || '', activities: event?.activities || [] })
  }, [open, event])

  const set = (patch) => setF((p) => ({ ...p, ...patch }))
  const setKind = (kind) => set({
    kind,
    fullDay: DEFAULT_FULL_DAY[kind] ?? (kind === '정기고사' || kind === '재량휴업' || kind === '공휴일' ? false : f.fullDay),
    title: f.title && !EVENT_KINDS.includes(f.title) ? f.title : (kind === '일반' ? '' : kind === '정기고사' ? `${f.examType}고사` : kind),
  })
  const setActivity = (i, patch) => set({ activities: f.activities.map((a, j) => (j === i ? { ...a, ...patch } : a)) })

  const save = () => {
    if (!f.title.trim()) return setErr('일정 이름을 입력하세요.')
    if (!isDateKey(f.date)) return setErr('날짜를 확인하세요.')
    if (f.endDate && (!isDateKey(f.endDate) || f.endDate < f.date)) return setErr('끝나는 날짜는 시작일과 같거나 뒤여야 합니다.')
    if (f.kind === '요일교체' && mondayIndex(f.date) > 4) return setErr('요일 교체는 평일에만 등록할 수 있습니다.')
    const ev = {
      id: event?.id || newId(),
      title: f.title.trim(),
      kind: f.kind,
      date: f.date,
      grades: f.grades || [],
      fullDay: Boolean(f.fullDay),
      activities: (f.activities || []).filter((a) => Number(a.hours) > 0).map((a) => ({
        type: a.type, hours: Number(a.hours), grades: a.grades || [],
      })),
    }
    if (f.endDate && f.endDate > f.date && f.kind !== '요일교체') ev.endDate = f.endDate
    if (f.dept) ev.dept = f.dept
    if (f.note?.trim()) ev.note = f.note.trim()
    if (f.kind === '정기고사') ev.examType = f.examType
    if (f.kind === '요일교체') ev.weekdaySwap = Number(f.weekdaySwap)
    onSave(ev)
  }

  const isWeekend = isDateKey(f.date) && mondayIndex(f.date) > 4

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>
        {readOnly ? '일정 보기' : editing ? '일정 수정' : '일정 등록'}
        {isDateKey(f.date) && <Typography component="span" sx={{ ml: 1, color: 'text.secondary' }}>{shortLabel(f.date)}</Typography>}
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <TextField select label="유형" value={f.kind} onChange={(e) => setKind(e.target.value)} sx={{ width: 150 }} disabled={readOnly}>
            {EVENT_KINDS.map((k) => <MenuItem key={k} value={k}>{k === '요일교체' ? '요일 교체' : k}</MenuItem>)}
          </TextField>
          <TextField label="일정 이름" value={f.title} onChange={(e) => set({ title: e.target.value })} fullWidth autoFocus={!editing} disabled={readOnly} />
        </Box>
        <Typography variant="caption" sx={{ color: 'text.secondary', mt: -1 }}>{KIND_HELP[f.kind]}</Typography>

        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <TextField type="date" label="날짜" value={f.date} onChange={(e) => set({ date: e.target.value })} InputLabelProps={{ shrink: true }} fullWidth disabled={readOnly} />
          {f.kind !== '요일교체' && (
            <TextField type="date" label="끝나는 날 (기간 일정)" value={f.endDate} onChange={(e) => set({ endDate: e.target.value })} InputLabelProps={{ shrink: true }} fullWidth disabled={readOnly} />
          )}
        </Box>
        {isWeekend && <Alert severity="info" sx={{ py: 0 }}>토·일요일 일정은 표시만 되고 수업일수에는 들어가지 않습니다.</Alert>}

        {f.kind === '정기고사' && (
          <TextField select label="고사 구분" value={f.examType} onChange={(e) => set({ examType: e.target.value })} sx={{ width: 160 }} disabled={readOnly}>
            <MenuItem value="중간">중간고사</MenuItem>
            <MenuItem value="기말">기말고사</MenuItem>
          </TextField>
        )}
        {f.kind === '요일교체' && (
          <TextField select label="이날 운영할 시간표" value={f.weekdaySwap} onChange={(e) => set({ weekdaySwap: e.target.value })} sx={{ width: 200 }} disabled={readOnly}>
            {SCHOOL_WEEKDAYS.map((w, i) => <MenuItem key={w} value={i}>{w}요일 수업</MenuItem>)}
          </TextField>
        )}

        <GradePicker value={f.grades} onChange={(grades) => set({ grades })} />

        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
          <Autocomplete freeSolo options={departments} value={f.dept || ''} disabled={readOnly}
            onInputChange={(_, v) => set({ dept: v })} sx={{ flex: 1 }}
            renderInput={(p) => <TextField {...p} label="관련 부서" />} />
          {['일반', '개학', '방학식', '종업식', '졸업식'].includes(f.kind) && (
            <FormControlLabel disabled={readOnly}
              control={<Checkbox checked={Boolean(f.fullDay)} onChange={(e) => set({ fullDay: e.target.checked })} />}
              label="전일행사" />
          )}
        </Box>

        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>창의적 체험활동 시수</Typography>
            {!readOnly && (
              <Button size="small" startIcon={<AddIcon />} onClick={() => set({ activities: [...f.activities, { type: '자율', hours: 1, grades: [] }] })}>
                추가
              </Button>
            )}
          </Box>
          {f.activities.map((a, i) => (
            <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1, flexWrap: 'wrap' }}>
              <TextField select size="small" value={a.type} onChange={(e) => setActivity(i, { type: e.target.value })} sx={{ width: 100 }} disabled={readOnly}>
                {ACTIVITY_TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
              </TextField>
              <TextField size="small" type="number" label="시간" value={a.hours} inputProps={{ min: 0, step: 1 }}
                onChange={(e) => setActivity(i, { hours: e.target.value })} sx={{ width: 90 }} disabled={readOnly} />
              <GradePicker label="" value={a.grades || []} onChange={(grades) => setActivity(i, { grades })} />
              {!readOnly && (
                <IconButton size="small" onClick={() => set({ activities: f.activities.filter((_, j) => j !== i) })}>
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              )}
            </Box>
          ))}
          {!f.activities.length && <Typography variant="caption" sx={{ color: 'text.secondary' }}>자율·동아리 시간이 있는 날만 추가하세요. 학년별로 시간이 다르면 줄을 나눠 넣습니다.</Typography>}
        </Box>

        <TextField label="메모" value={f.note} onChange={(e) => set({ note: e.target.value })} multiline minRows={1} disabled={readOnly} />
        {err && <Alert severity="error">{err}</Alert>}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        {editing && !readOnly && (
          <Button color="error" onClick={() => onDelete(event.id)} sx={{ mr: 'auto' }}>삭제</Button>
        )}
        <Button onClick={onClose}>{readOnly ? '닫기' : '취소'}</Button>
        {!readOnly && <Button variant="contained" onClick={save} disableElevation>{editing ? '수정' : '등록'}</Button>}
      </DialogActions>
    </Dialog>
  )
}
