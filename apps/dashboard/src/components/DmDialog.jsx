/**
 * DM 상대 고르기.
 *
 * 이름으로 좁혀 고른다. 교직원이 오륙십 명이라 목록만 늘어놓으면 스크롤로 찾게 되는데,
 * 이 화면에 오는 사람은 이미 누구에게 말할지 정하고 왔다 — 찾는 시간만 드는 셈이다.
 *
 * 부서·교과를 이름 옆에 적는 이유는 동명이인 때문이다. 학교에 같은 이름이 둘 있으면
 * 이름만 보고 고를 수 없고, 엉뚱한 사람에게 보낸 1:1 대화는 되돌릴 방법이 없다.
 *
 * 이미 대화가 있는 상대를 걸러내지 않는다. 고르면 그 대화를 그대로 열기 때문에(openDm),
 * 사람을 찾는 방법이 "대화가 있으면 사이드바, 없으면 여기"로 갈리지 않는 편이 낫다.
 */
import { useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'

export default function DmDialog({ open, members, loading, myUid, busy, onClose, onPick }) {
  const [keyword, setKeyword] = useState('')

  // 나 자신은 뺀다. 자기와의 대화는 메모장으로 쓸 자리가 있지만, 상대를 고르는 목록에
  // 내 이름이 섞여 있으면 잘못 누르기 쉽다.
  const candidates = useMemo(() => {
    const list = (members || [])
      .filter(m => m.uid !== myUid)
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
    const k = keyword.trim()
    if (!k) return list
    return list.filter(m => (
      m.name.includes(k) || m.department.includes(k) || m.subject.includes(k)
    ))
  }, [members, myUid, keyword])

  const close = () => { setKeyword(''); onClose() }

  return (
    <Dialog open={open} onClose={close} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontSize: '1rem', fontWeight: 800 }}>대화 상대 고르기</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus fullWidth size="small" margin="dense"
          placeholder="이름 · 부서 · 교과로 찾기"
          value={keyword}
          onChange={e => setKeyword(e.target.value)}
        />
        <Box sx={{ mt: 1, maxHeight: 320, overflowY: 'auto' }}>
          {loading ? (
            <Empty>명단을 읽는 중입니다…</Empty>
          ) : candidates.length === 0 ? (
            <Empty>{keyword.trim() ? '찾는 사람이 없습니다.' : '교직원 명단이 비어 있습니다.'}</Empty>
          ) : candidates.map(m => (
            <Box
              key={m.uid}
              component="button" type="button"
              disabled={busy}
              onClick={() => onPick(m)}
              sx={{
                display: 'flex', alignItems: 'baseline', gap: 0.8, width: '100%',
                border: 0, background: 'none', cursor: 'pointer', textAlign: 'left',
                fontFamily: 'inherit', px: 1, py: 0.7, borderRadius: 0.75,
                '&:hover': { bgcolor: 'action.hover' },
                '&:disabled': { cursor: 'default', opacity: 0.5 },
              }}
            >
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
