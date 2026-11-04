import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Typography from '@mui/material/Typography'

/** 저장할 때 다른 선생님의 저장본과 합쳤음을 알린다 — 둘 다 고친 곳(최신본을 남김)과 합친 뒤 검사 결과 */
export default function MergeInfoDialog({ info, onClose }) {
  if (!info) return null
  const broken = info.unassigned > 0 || info.clashes > 0
  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>다른 선생님의 저장본과 합쳐 저장했습니다</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" sx={{ mb: 1.5 }}>
          내가 연 뒤 <b>{info.byName || '다른 선생님'}</b>이(가) 먼저 저장했습니다. 서로 다른 곳을 고친 것은 둘 다 남겼습니다.
        </Typography>
        {info.conflicts.length > 0 ? (
          <Alert severity="warning" sx={{ mb: 1.5 }}>
            같은 곳을 둘 다 고친 {info.conflicts.length}곳은 최신 저장본 값을 남겼습니다.
            <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2, maxHeight: 200, overflowY: 'auto' }}>
              {info.conflicts.map((c) => <li key={c}>{c}</li>)}
            </Box>
          </Alert>
        ) : (
          <Alert severity="success" sx={{ mb: 1.5 }}>겹친 곳 없이 합쳤습니다.</Alert>
        )}
        {broken && (
          <Alert severity="error">
            합친 결과에 미배정 {info.unassigned}명 · 시간 충돌 {info.clashes}명이 있습니다. <b>배정 실행</b>으로 다시 맞추세요.
          </Alert>
        )}
      </DialogContent>
      <DialogActions><Button variant="contained" onClick={onClose}>확인</Button></DialogActions>
    </Dialog>
  )
}
