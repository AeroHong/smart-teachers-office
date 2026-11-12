import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'

const markSx = {
  del: { textDecoration: 'line-through', color: '#b91c1c', bgcolor: '#fee2e2' },
  ins: { textDecoration: 'underline', textUnderlineOffset: '3px', color: '#1d4ed8', fontWeight: 700, bgcolor: '#dbeafe' },
}

function Line({ l }) {
  if (l.omit) return <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ my: 0.5 }}>(생 략)</Typography>
  if (l.note) return <Typography variant="body2" textAlign="center" sx={{ my: 0.5, fontWeight: 700 }}>{`<${l.note}>`}</Typography>
  return (
    <Typography variant="body2" sx={{ pl: `${Math.min(l.depth, 4) * 1}rem`, whiteSpace: 'pre-wrap', my: 0.4, lineHeight: 1.7, wordBreak: 'keep-all' }}>
      {l.segs.map((s, i) => (s.mark ? <Box component="span" key={i} sx={markSx[s.mark]}>{s.t}</Box> : <span key={i}>{s.t}</span>))}
    </Typography>
  )
}

/** 신구대조표 — 현행 | 개정안. rows는 regulationDiff.comparisonRows 결과 */
export default function CompareTable({ rows, leftLabel = '현    행', rightLabel = '개  정  안' }) {
  if (!rows.length) return <Typography color="text.secondary">바뀐 곳이 없습니다.</Typography>
  return (
    <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
      <Table size="small" sx={{ tableLayout: 'fixed', minWidth: 640, '& td, & th': { borderRight: '1px solid', borderColor: 'divider', verticalAlign: 'top' } }}>
        <TableHead>
          <TableRow sx={{ bgcolor: 'action.hover' }}>
            <TableCell align="center" sx={{ fontWeight: 800, width: '50%' }}>{leftLabel}</TableCell>
            <TableCell align="center" sx={{ fontWeight: 800, width: '50%' }}>{rightLabel}</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell>{r.old.map((l, i) => <Line key={i} l={l} />)}</TableCell>
              <TableCell>{r.new.map((l, i) => <Line key={i} l={l} />)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Paper>
  )
}
