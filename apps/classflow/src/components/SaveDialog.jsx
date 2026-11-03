import { useState } from 'react'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControlLabel from '@mui/material/FormControlLabel'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'

/**
 * 저장 — 작업명을 고치고, 원하면 지금 상태를 이름 붙인 버전으로도 남긴다(나중에 「불러오기」에서 되돌림).
 * Ctrl+S는 이 창 없이 바로 저장한다.
 */
export default function SaveDialog({ project, summary, onSave, onClose }) {
  const [title, setTitle] = useState(project.title || '')
  const [asVersion, setAsVersion] = useState(true)
  const [versionName, setVersionName] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    const ok = await onSave({ title: title.trim() || project.title, versionName: asVersion ? (versionName.trim() || summary) : null })
    setBusy(false)
    if (ok) onClose()
  }

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>저장</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <TextField label="작업명" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus fullWidth
            helperText="작업 목록에 보이는 이름입니다." />
          <FormControlLabel control={<Checkbox checked={asVersion} onChange={(e) => setAsVersion(e.target.checked)} />}
            label="지금 상태를 버전으로도 남기기 (나중에 「불러오기」에서 이 상태로 되돌릴 수 있음)" />
          {asVersion && (
            <TextField label="버전 이름" value={versionName} onChange={(e) => setVersionName(e.target.value)} fullWidth
              placeholder={summary} helperText="예: 1차 배정, 심화영어 2분반안 — 비우면 위 회색 글씨로 저장합니다." />
          )}
          <Typography variant="caption" color="text.secondary">작업은 항상 마지막 저장 상태로 열립니다. 버전은 그와 별도로 쌓이는 기록입니다.</Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>취소</Button>
        <Button variant="contained" disabled={busy} onClick={submit}>{busy ? '저장 중…' : '저장'}</Button>
      </DialogActions>
    </Dialog>
  )
}
