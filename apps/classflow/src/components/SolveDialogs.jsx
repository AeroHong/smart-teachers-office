import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'

/** 해가 없음(증명됨) — 미배정 최소 학생과 완화 제안 */
export function InfeasibleDialog({ info, project, onApply, onClose }) {
  if (!info) return null
  const { diagnose } = info
  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>이 설정으로는 모든 학생을 배정할 수 없습니다</DialogTitle>
      <DialogContent dividers>
        <Alert severity="warning" sx={{ mb: 2 }}>
          솔버가 지금 분반 수·그룹·교실 조건으로는 해가 없다는 것을 증명했습니다. 아래 대안 중 하나를 적용하면 다시 계산합니다.
        </Alert>
        {diagnose?.minUnassigned != null && (
          <Box sx={{ mb: 2 }}>
            <Typography fontWeight={700} sx={{ mb: 0.5 }}>
              조건을 그대로 두면 최소 {diagnose.minUnassigned}명이 남습니다
            </Typography>
            {diagnose.unassigned.map((u) => (
              <Typography key={u.id} variant="body2">· <b>{u.id}</b> — {u.subjects.join(', ')}</Typography>
            ))}
            <Typography variant="caption" color="text.secondary">
              이 학생의 과목 조합을 다른 학생과 겹치지 않게 놓을 그룹이 없습니다. 분반을 늘리거나, 학생 상담으로 과목을 바꾸는 방법이 있습니다.
            </Typography>
          </Box>
        )}
        <Typography fontWeight={700} sx={{ mb: 0.5 }}>풀리는 대안 (분반 평균 인원이 많은 과목부터 시험한 순서)</Typography>
        {diagnose?.suggestions?.length ? (
          <Table size="small">
            <TableHead>
              <TableRow><TableCell>바꿀 것</TableCell><TableCell align="center">분반 평균 인원</TableCell><TableCell align="center">분반 편차 최대</TableCell><TableCell align="center">편차 합계</TableCell><TableCell /></TableRow>
            </TableHead>
            <TableBody>
              {diagnose.suggestions.map((s) => (
                <TableRow key={s.label}>
                  <TableCell>{s.label}</TableCell>
                  <TableCell align="center">{s.avgBefore != null ? `${s.avgBefore} → ${s.avgAfter}명` : '—'}</TableCell>
                  <TableCell align="center">{s.worstSpread}명</TableCell>
                  <TableCell align="center">{s.spreadSum}</TableCell>
                  <TableCell align="right"><Button size="small" variant="contained" onClick={() => onApply(s.change)}>적용 후 다시 계산</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <Typography variant="body2" color="text.secondary">
            한 가지만 바꿔서는 풀리지 않았습니다. 교실 수를 늘리거나, 1분반 과목의 분반을 늘리거나, &quot;분리&quot;를 끄고 다시 시도하세요.
          </Typography>
        )}
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          현재 분반 {project.subjects.reduce((a, s) => a + s.sections, 0)}개 · 그룹 {project.slots.length}개 · 그룹별 교실 {project.slots.map((l, t) => `${l} ${Array.isArray(project.rooms) ? (project.rooms[t] ?? '∞') : (project.rooms ?? '∞')}`).join(' · ')}
        </Typography>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>닫기</Button></DialogActions>
    </Dialog>
  )
}
