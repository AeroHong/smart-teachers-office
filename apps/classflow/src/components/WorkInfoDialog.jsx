import { useState } from 'react'
import Alert from '@mui/material/Alert'
import Autocomplete from '@mui/material/Autocomplete'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { defaultFolder, defaultTitle, entryYearOf, yearOf } from '@shared/lib/sectioning'

/** 작업 정보 입력값 — { title, entryYear, grade, semester, year, folder } (숫자 칸은 문자열로 들고 있는다) */
export function infoFromProject(p) {
  const entryYear = p.entryYear || entryYearOf(p.year, p.grade) || ''
  return {
    title: p.title || '',
    entryYear: entryYear ? String(entryYear) : '',
    grade: p.grade ? String(p.grade) : '',
    semester: p.semester ? String(p.semester) : '',
    year: p.year ? String(p.year) : '',
    folder: p.folder || defaultFolder({ entryYear, year: p.year, grade: p.grade }),
  }
}

/** 저장할 값(숫자 변환) */
export function infoPatch(v) {
  const n = (x) => (String(x).trim() === '' ? null : Number(x) || null)
  return {
    title: v.title.trim() || defaultTitle({ year: n(v.year), grade: n(v.grade), semester: n(v.semester) }),
    entryYear: n(v.entryYear), grade: n(v.grade), semester: n(v.semester), year: n(v.year),
    folder: v.folder.trim() || defaultFolder({ entryYear: n(v.entryYear), year: n(v.year), grade: n(v.grade) }),
  }
}

/**
 * 작업 정보 입력 칸 — 입학년도·학년·학기를 고치면 학년도(= 입학년도 + 학년 − 1)를 다시 계산한다.
 * 학년도를 직접 고치면 그 값을 쓴다. 작업명은 자동 이름을 쓰다가, 직접 고치면 그대로 둔다.
 */
export function WorkInfoFields({ value, onChange, folders = [] }) {
  const set = (patch) => {
    const next = { ...value, ...patch }
    if ('entryYear' in patch || 'grade' in patch) {
      const y = yearOf(next.entryYear, next.grade)
      if (y) next.year = String(y)
    }
    if ('year' in patch && next.grade) {
      const e = entryYearOf(next.year, next.grade)
      if (e) next.entryYear = String(e)
    }
    // 작업명이 자동 이름 그대로면 따라 바꾼다
    const n = (x) => Number(x) || null
    const oldAuto = defaultTitle({ year: n(value.year), grade: n(value.grade), semester: n(value.semester) })
    if (!value.title || value.title === oldAuto) next.title = defaultTitle({ year: n(next.year), grade: n(next.grade), semester: n(next.semester) })
    const oldFolder = defaultFolder({ entryYear: n(value.entryYear), year: n(value.year), grade: n(value.grade) })
    if (!value.folder || value.folder === oldFolder) next.folder = defaultFolder({ entryYear: n(next.entryYear), year: n(next.year), grade: n(next.grade) })
    onChange(next)
  }
  const num = { type: 'number', size: 'small' }
  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1.5}>
        <TextField {...num} label="입학년도" value={value.entryYear} onChange={(e) => set({ entryYear: e.target.value })} sx={{ width: 120 }} />
        <TextField {...num} label="학년" value={value.grade} onChange={(e) => set({ grade: e.target.value })} sx={{ width: 90 }} inputProps={{ min: 1, max: 3 }} />
        <TextField {...num} label="학기" value={value.semester} onChange={(e) => set({ semester: e.target.value })} sx={{ width: 90 }} inputProps={{ min: 1, max: 2 }} />
        <TextField {...num} label="학년도(수업하는 해)" value={value.year} onChange={(e) => set({ year: e.target.value })} sx={{ width: 170 }}
          helperText="입학년도 + 학년 − 1" />
      </Stack>
      <TextField size="small" label="작업명" value={value.title} onChange={(e) => onChange({ ...value, title: e.target.value })} fullWidth
        helperText="작업 목록에 크게 보이는 이름입니다." />
      <Autocomplete freeSolo options={folders} value={value.folder} inputValue={value.folder}
        onInputChange={(_, v) => onChange({ ...value, folder: v })}
        renderInput={(params) => <TextField {...params} size="small" label="묶음" helperText="작업 목록을 이 이름으로 묶어 보여 줍니다(기본: 입학년도별)." />} />
    </Stack>
  )
}

/** 작업 정보 고치기 — 작업 화면 머리글·작업 목록의 연필에서 연다. 저장하면 바로 반영(다른 수정과 별개) */
export default function WorkInfoDialog({ project, folders = [], onSave, onClose }) {
  const [value, setValue] = useState(() => infoFromProject(project))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async () => {
    setBusy(true)
    setError('')
    try {
      await onSave(infoPatch(value))
    } catch (e) {
      console.error(e)
      setError('저장하지 못했습니다. 네트워크를 확인하세요.')
      setBusy(false)
    }
  }
  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>작업 정보</DialogTitle>
      <DialogContent dividers>
        <WorkInfoFields value={value} onChange={setValue} folders={folders} />
        {project.sourceFileName && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>원본 파일: {project.sourceFileName}</Typography>}
        {error && <Alert severity="error" sx={{ mt: 1.5 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>취소</Button>
        <Button variant="contained" disabled={busy} onClick={submit}>{busy ? '저장 중…' : '저장'}</Button>
      </DialogActions>
    </Dialog>
  )
}
