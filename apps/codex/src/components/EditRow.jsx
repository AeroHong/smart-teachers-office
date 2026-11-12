import { memo, useEffect, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import ListSubheader from '@mui/material/ListSubheader'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import { childTypes, TYPE_LABEL } from '@shared/lib/regulationEdit'
import { nodePrefix } from '@shared/lib/regulationTree'

export const STATE_COLOR = { added: '#16a34a', modified: '#d97706', deleted: '#dc2626' }

/** 글 칸 — 입력은 칸 안에서만 들고 있다가 벗어날 때 올린다(수백 줄이라 타자마다 전체를 다시 그리지 않게) */
function LazyField({ value, onCommit, onCaret, inputRef, ...rest }) {
  const [v, setV] = useState(value ?? '')
  useEffect(() => { setV(value ?? '') }, [value])
  return (
    <TextField
      {...rest}
      inputRef={inputRef}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onSelect={(e) => onCaret?.(e.target.selectionStart)}
      onBlur={() => { if (v !== (value ?? '')) onCommit(v) }}
    />
  )
}

function TableEditor({ node, open, onClose, onSave }) {
  const [rows, setRows] = useState(node.rows)
  useEffect(() => { if (open) setRows(node.rows) }, [open, node.rows])
  const setCell = (r, c, text) => setRows((rs) => rs.map((row, i) => (i !== r ? row : { cells: row.cells.map((cell, k) => (k === c ? { ...cell, text } : cell)) })))
  const cols = Math.max(...rows.map((r) => r.cells.length), 1)
  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>표 고치기</DialogTitle>
      <DialogContent dividers>
        <Typography variant="caption" color="text.secondary">칸 합치기(병합)는 원본 모양을 그대로 둡니다. 글만 고치거나 행을 더하고 뺄 수 있습니다.</Typography>
        <Box sx={{ overflowX: 'auto', mt: 1 }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>
                  {r.cells.map((c, ci) => (
                    <td key={ci} colSpan={c.colSpan || 1} rowSpan={c.rowSpan || 1} style={{ border: '1px solid #ddd', padding: 2, minWidth: 90 }}>
                      <TextField size="small" multiline fullWidth value={c.text} onChange={(e) => setCell(ri, ci, e.target.value)} />
                    </td>
                  ))}
                  <td><Button size="small" color="error" onClick={() => setRows((rs) => rs.filter((_, i) => i !== ri))}>행 빼기</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Box>
        <Button size="small" sx={{ mt: 1 }} onClick={() => setRows((rs) => [...rs, { cells: Array.from({ length: cols }, () => ({ text: '' })) }])}>행 더하기</Button>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>취소</Button>
        <Button variant="contained" onClick={() => { onSave(rows); onClose() }}>적용</Button>
      </DialogActions>
    </Dialog>
  )
}

/**
 * 개정안 편집 줄 하나.
 * @param {{ node, depth, state: 'added'|'modified'|'deleted'|null, readOnly, onChange(id, patch), onAction(action, id, arg?), onInsertRef(id, caret) }} p
 */
const EditRow = memo(function EditRow({ node, depth, state, readOnly, onChange, onAction, onInsertRef }) {
  const [menu, setMenu] = useState(null)
  const [tableOpen, setTableOpen] = useState(false)
  const caret = useRef(null)
  const commit = (field) => (v) => onChange(node.id, { [field]: v })
  const act = (a, arg) => { setMenu(null); onAction(a, node.id, arg) }
  const isHead = node.type === 'chapter' || node.type === 'section'
  const ro = readOnly || node.deleted
  const small = { size: 'small', disabled: ro }

  let fields
  if (isHead) {
    fields = (
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography fontWeight={800}>제</Typography>
        <LazyField {...small} value={node.num} onCommit={commit('num')} sx={{ width: 64 }} />
        <Typography fontWeight={800}>{node.type === 'chapter' ? '장' : '절'}</Typography>
        <LazyField {...small} fullWidth value={node.title} onCommit={commit('title')} />
      </Stack>
    )
  } else if (node.type === 'article') {
    fields = (
      <Stack spacing={0.75}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography fontWeight={800}>제</Typography>
          <LazyField {...small} value={node.num} onCommit={commit('num')} sx={{ width: 64 }} />
          <Typography fontWeight={800}>조{node.branch ? '의' : ''}</Typography>
          {node.branch && <LazyField {...small} value={node.branch} onCommit={commit('branch')} sx={{ width: 56 }} />}
          <LazyField {...small} fullWidth placeholder="조 제목(예: 목적)" value={node.title} onCommit={commit('title')} />
        </Stack>
        {node.deleted ? <Typography color="error">삭제(번호 유지)</Typography> : (
          <LazyField {...small} fullWidth multiline minRows={1} placeholder="조 본문(항으로 나뉘면 비워 둠)" value={node.text} onCommit={commit('text')} onCaret={(c) => { caret.current = c }} />
        )}
      </Stack>
    )
  } else if (node.type === 'addendum') {
    fields = <Stack direction="row" spacing={1} alignItems="center"><Typography fontWeight={800}>부칙</Typography><LazyField {...small} placeholder="(2026. 6. 24.)" value={node.date} onCommit={commit('date')} /></Stack>
  } else if (node.type === 'appendix') {
    fields = <LazyField {...small} fullWidth value={node.title} onCommit={commit('title')} />
  } else if (node.type === 'table') {
    fields = (
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="body2">표 {node.rows.length}행 — {node.rows[0]?.cells.map((c) => c.text).join(' | ').slice(0, 60)}</Typography>
        {!ro && <Button size="small" onClick={() => setTableOpen(true)}>표 고치기</Button>}
        <TableEditor node={node} open={tableOpen} onClose={() => setTableOpen(false)} onSave={(rows) => onChange(node.id, { rows })} />
      </Stack>
    )
  } else {
    const hasNum = ['paragraph', 'item', 'subitem', 'line'].includes(node.type)
    fields = (
      <Stack direction="row" spacing={1} alignItems="flex-start">
        {hasNum && <LazyField {...small} value={node.num} onCommit={commit('num')} sx={{ width: 64 }} helperText={nodePrefix(node)} />}
        {node.deleted ? <Typography color="error" sx={{ pt: 1 }}>삭제(번호 유지)</Typography> : (
          <LazyField {...small} fullWidth multiline minRows={1} value={node.text} onCommit={commit('text')} onCaret={(c) => { caret.current = c }} />
        )}
      </Stack>
    )
  }

  const kids = childTypes(node.type)
  return (
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', pl: `${Math.min(depth, 5) * 1.4}rem`, py: 0.5, borderLeft: '4px solid', borderColor: state ? STATE_COLOR[state] : 'transparent', bgcolor: state === 'deleted' ? '#fef2f2' : undefined }}>
      <Typography variant="caption" color="text.secondary" sx={{ width: 34, pt: 1, flexShrink: 0 }}>{TYPE_LABEL[node.type]}</Typography>
      <Box sx={{ flex: 1, minWidth: 0 }}>{fields}</Box>
      {!readOnly && (
        <>
          <IconButton size="small" onClick={(e) => setMenu(e.currentTarget)} aria-label="줄 메뉴"><MoreVertIcon fontSize="small" /></IconButton>
          <Menu anchorEl={menu} open={!!menu} onClose={() => setMenu(null)}>
            <ListSubheader>아래에 같은 단계 추가</ListSubheader>
            <MenuItem onClick={() => act('after', node.type)}>{TYPE_LABEL[node.type]}</MenuItem>
            {node.type === 'article' && <MenuItem onClick={() => act('branch')}>가지 조(제{node.num}조의2)</MenuItem>}
            {!!kids.length && <ListSubheader>하위에 추가</ListSubheader>}
            {kids.map((t) => <MenuItem key={t} onClick={() => act('child', t)}>{TYPE_LABEL[t]}</MenuItem>)}
            <Divider />
            <MenuItem onClick={() => act('up')}>위로</MenuItem>
            <MenuItem onClick={() => act('down')}>아래로</MenuItem>
            {node.text !== undefined && !node.deleted && <MenuItem onClick={() => { setMenu(null); onInsertRef(node.id, caret.current) }}>조문 참조 넣기</MenuItem>}
            <Divider />
            {node.deleted
              ? <MenuItem onClick={() => act('undelete')}>삭제 표시 풀기</MenuItem>
              : (node.type === 'article' || node.type === 'paragraph' || node.type === 'item') && <MenuItem onClick={() => act('markDeleted')}>번호는 두고 「삭제」로</MenuItem>}
            <MenuItem onClick={() => act('remove')} sx={{ color: 'error.main' }}>지우기(하위 포함)</MenuItem>
          </Menu>
        </>
      )}
    </Box>
  )
})

export default EditRow
