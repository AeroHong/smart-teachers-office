import { useEffect, useMemo, useState } from 'react'
import Autocomplete from '@mui/material/Autocomplete'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { indexNodes, nodeLine, nodeRefLabel } from '@shared/lib/regulationTree'

const REFERABLE = new Set(['article', 'paragraph', 'item', 'subitem', 'chapter', 'appendix'])

/**
 * 조문 참조 고르기 — 규정 → 조·항·호. 고른 것은 고정 링크({{ref:…}})로 들어가 번호가 바뀌어도 따라간다.
 * @param {{ open, onClose, onPick(regId, nodeId), book, regId(지금 규정), nodes(지금 규정 편집본), loadNodes(regId) }} p
 */
export default function RefPicker({ open, onClose, onPick, book, regId, nodes, loadNodes }) {
  const [target, setTarget] = useState(regId)
  const [targetNodes, setTargetNodes] = useState(nodes)
  const [pick, setPick] = useState(null)
  useEffect(() => { if (open) { setTarget(regId); setPick(null) } }, [open, regId])
  useEffect(() => {
    if (target === regId) { setTargetNodes(nodes); return }
    let alive = true
    setTargetNodes(null)
    loadNodes(target).then((ns) => { if (alive) setTargetNodes(ns || []) })
    return () => { alive = false }
  }, [target, regId, nodes, loadNodes])
  const options = useMemo(() => {
    if (!targetNodes) return []
    const { byId } = indexNodes(targetNodes)
    return targetNodes.filter((n) => REFERABLE.has(n.type) && !n.deleted)
      .map((n) => ({ id: n.id, label: nodeRefLabel(byId, n.id), text: nodeLine(n).slice(0, 70) }))
  }, [targetNodes])

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>조문 참조 넣기</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField select label="규정" value={target} onChange={(e) => { setTarget(e.target.value); setPick(null) }}>
            {(book?.regulations || []).map((r) => <MenuItem key={r.id} value={r.id}>{r.id === regId ? `${r.title} (이 규정)` : r.title}</MenuItem>)}
          </TextField>
          <Autocomplete
            options={options}
            loading={!targetNodes}
            value={pick}
            onChange={(_, v) => setPick(v)}
            getOptionLabel={(o) => `${o.label}  ${o.text}`}
            renderInput={(p) => <TextField {...p} label="조·항·호" placeholder="번호나 낱말로 찾기" />}
          />
          <Typography variant="caption" color="text.secondary">
            커서가 있던 자리(없으면 글 끝)에 들어갑니다. 화면·내려받기에서는 「{target === regId ? '제○조제○항' : '규정명」 제○조'}」처럼 지금 번호로 보입니다.
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>취소</Button>
        <Button variant="contained" disabled={!pick} onClick={() => { onPick(target, pick.id); onClose() }}>넣기</Button>
      </DialogActions>
    </Dialog>
  )
}
