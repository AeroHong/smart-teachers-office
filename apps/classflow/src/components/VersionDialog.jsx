import { useEffect, useState } from 'react'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import { useAuth } from '@shared/contexts/AuthContext'
import { listVersions, deleteVersion } from '../lib/projectStore'

/** 불러오기 — 저장할 때 남긴 버전(및 여러 안에서 저장한 안)을 골라 작업 화면을 그 상태로 바꾼다 */
export default function VersionDialog({ projectId, onRestore, onClose }) {
  const { schoolId } = useAuth()
  const [items, setItems] = useState(null)
  const [error, setError] = useState('')

  const refresh = () => listVersions(schoolId, projectId).then(setItems).catch((e) => { console.error(e); setError('버전 목록을 불러오지 못했습니다.') })
  // 효과 함수가 Promise를 돌려주면 React가 정리 함수로 착각해 창이 깨진다 — 반드시 감싸서 부른다
  useEffect(() => { refresh() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const remove = async (v) => {
    if (!window.confirm(`"${v.name}" 버전을 지울까요?`)) return
    try { await deleteVersion(schoolId, projectId, v.id); refresh() } catch (e) { console.error(e); setError('지우지 못했습니다.') }
  }

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>불러오기</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          저장할 때 남긴 버전입니다. 불러온 뒤 <b>저장</b>해야 작업에 반영되고, 그 전에는 되돌리기(↶)로 돌아갈 수 있습니다.
        </Typography>
        {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
        {items === null ? <CircularProgress size={24} /> : (
          <List dense>
            {items.map((v) => (
              <ListItem key={v.id} secondaryAction={
                <Stack direction="row" spacing={0.5}>
                  <Button size="small" variant="outlined" onClick={() => onRestore(v.data, v.name)}>불러오기</Button>
                  <IconButton size="small" onClick={() => remove(v)}><DeleteOutlineIcon fontSize="small" /></IconButton>
                </Stack>
              }>
                <ListItemText primary={v.name}
                  secondary={`${v.createdAt ? v.createdAt.toLocaleString('ko-KR') : ''} · ${v.createdByName || ''}${v.stats?.worstSpread != null ? ` · 분반 편차 최대 ${v.stats.worstSpread}명` : ''}`} />
              </ListItem>
            ))}
            {!items.length && <ListItem><ListItemText secondary="저장된 버전이 없습니다. 저장할 때 「버전으로도 남기기」를 체크하세요." /></ListItem>}
          </List>
        )}
      </DialogContent>
      <DialogActions><Button onClick={onClose}>닫기</Button></DialogActions>
    </Dialog>
  )
}
