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
import { sectionSizes, spreadOf, validateProject } from '@shared/lib/sectioning'

/** 그룹 배치를 "과목:그룹" 집합으로 — 안끼리 다른 곳 세기 */
const placementSet = (p) => new Set(p.subjects.flatMap((subj) => subj.slotBySection.filter((t) => t !== null).map((t) => `${subj.name}:${t}`)))

/**
 * 여러 안 비교 — 같은 설정에서 그룹 배치가 서로 다른 안들을 나란히 놓고 고른다.
 * items: [{ label, project }] (첫 줄은 지금 작업)
 */
export default function AlternativesDialog({ items, onApply, onSaveVersion, onClose }) {
  if (!items) return null
  const base = items[0]?.project
  const baseSet = base ? placementSet(base) : new Set()
  const rows = items.map((it) => {
    const sizes = sectionSizes(it.project)
    const spreads = sizes.filter((x) => x.length > 1).map(spreadOf)
    const set = placementSet(it.project)
    const diff = [...set].filter((k) => !baseSet.has(k)).length
    const perSlot = it.project.slots.map((_, t) => it.project.subjects.reduce((a, s) => a + s.slotBySection.filter((x) => x === t).length, 0))
    const worstSubject = it.project.subjects
      .map((s, i) => ({ name: s.name, sp: spreadOf(sizes[i]) }))
      .sort((a, b) => b.sp - a.sp)[0]
    return { ...it, worst: Math.max(0, ...spreads), sum: spreads.reduce((a, b) => a + b, 0), diff, perSlot, worstSubject, ok: validateProject(it.project).ok }
  })
  const bestSum = Math.min(...rows.slice(1).map((r) => r.sum), Infinity)

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>여러 안 비교</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          같은 설정(분반 수·교실 수·고정)에서 그룹 배치를 서로 다르게 만든 안입니다. 시간표 사정에 맞는 안을 고르세요. 적용해도 저장 전까지는 되돌릴 수 있습니다.
        </Typography>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>안</TableCell>
              <TableCell align="center">분반 편차 최대</TableCell>
              <TableCell align="center">편차 합계</TableCell>
              <TableCell>편차가 가장 큰 과목</TableCell>
              <TableCell align="center">그룹별 분반 수</TableCell>
              <TableCell align="center">지금과 다른 배치</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={r.label} sx={{ bgcolor: i === 0 ? '#f5f7fa' : r.sum === bestSum ? '#effaf1' : 'transparent' }}>
                <TableCell><b>{r.label}</b>{!r.ok && <Typography component="span" color="error" fontSize={12}> (미배정 있음)</Typography>}</TableCell>
                <TableCell align="center">{r.worst}명</TableCell>
                <TableCell align="center">{r.sum}</TableCell>
                <TableCell>{r.worstSubject?.sp ? `${r.worstSubject.name} (${r.worstSubject.sp})` : '—'}</TableCell>
                <TableCell align="center">
                  <Box sx={{ fontFamily: 'Consolas, monospace', fontSize: 12 }}>
                    {r.project.slots.map((l, t) => `${l}${r.perSlot[t]}`).join(' ')}
                  </Box>
                </TableCell>
                <TableCell align="center">{i === 0 ? '—' : `${r.diff}곳`}</TableCell>
                <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                  {i > 0 && <Button size="small" onClick={() => onSaveVersion(r)}>버전 저장</Button>}
                  {i > 0 && <Button size="small" variant="contained" onClick={() => onApply(r)}>적용</Button>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>닫기</Button></DialogActions>
    </Dialog>
  )
}
