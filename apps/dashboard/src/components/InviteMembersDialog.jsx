/**
 * "누구나 초대 가능" 공개 채널에서 참여자가 아닌 사람을 여럿 골라 데려온다.
 *
 * DmDialog.jsx와 같은 이름 찾기 모양이지만, 상대를 하나 고르면 바로 끝나는 DM과 달리
 * 여러 명을 한 번에 체크해서 모아 보낸다 — 초대는 "이 사람도, 저 사람도" 식으로 여럿을
 * 한 번에 데려오는 일이 흔하다.
 *
 * 이미 참여 중인 사람은 후보에서 아예 뺀다 — 다시 골라도 달라지는 게 없는데 명단만
 * 길어지면 찾는 사람만 더 어려워진다.
 */
import { useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'

export default function InviteMembersDialog({ open, members, memberUids = [], busy, onClose, onInvite }) {
  const [keyword, setKeyword] = useState('')
  const [picked, setPicked] = useState([])

  const candidates = useMemo(() => {
    const already = new Set(memberUids)
    const list = (members || [])
      .filter(m => !already.has(m.uid))
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
    const k = keyword.trim()
    if (!k) return list
    return list.filter(m => (
      m.name.includes(k) || m.department.includes(k) || m.subject.includes(k)
    ))
  }, [members, memberUids, keyword])

  const toggle = (uid) => {
    setPicked(prev => (prev.includes(uid) ? prev.filter(u => u !== uid) : [...prev, uid]))
  }

  const close = () => { setKeyword(''); setPicked([]); onClose() }

  const handleInvite = async () => {
    await onInvite(picked)
    close()
  }

  return (
    <Dialog open={open} onClose={close} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontSize: '1rem', fontWeight: 800 }}>참여자 초대</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus fullWidth size="small" margin="dense"
          placeholder="이름 · 부서 · 교과로 찾기"
          value={keyword}
          onChange={e => setKeyword(e.target.value)}
        />
        <Box sx={{ mt: 1, maxHeight: 320, overflowY: 'auto' }}>
          {candidates.length === 0 ? (
            <Empty>{keyword.trim() ? '찾는 사람이 없습니다.' : '이미 모두 참여 중입니다.'}</Empty>
          ) : candidates.map(m => (
            <Box
              key={m.uid}
              component="button" type="button"
              disabled={busy}
              onClick={() => toggle(m.uid)}
              sx={{
                display: 'flex', alignItems: 'center', gap: 0.6, width: '100%',
                border: 0, background: 'none', cursor: 'pointer', textAlign: 'left',
                fontFamily: 'inherit', px: 0.5, py: 0.3, borderRadius: 0.75,
                '&:hover': { bgcolor: 'action.hover' },
                '&:disabled': { cursor: 'default', opacity: 0.5 },
              }}
            >
              <Checkbox size="small" checked={picked.includes(m.uid)} tabIndex={-1} sx={{ p: 0.5 }} />
              <Typography fontSize="0.9rem" fontWeight={600}>{m.name}</Typography>
              <Typography fontSize="0.76rem" color="text.secondary" noWrap>
                {[m.department, m.subject].filter(Boolean).join(' · ')}
              </Typography>
            </Box>
          ))}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={close}>취소</Button>
        <Button variant="contained" disabled={picked.length === 0 || busy} onClick={handleInvite}>
          {picked.length > 0 ? `${picked.length}명 초대` : '초대'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

function Empty({ children }) {
  return (
    <Typography color="text.secondary" fontSize="0.85rem" sx={{ py: 3, textAlign: 'center' }}>
      {children}
    </Typography>
  )
}
