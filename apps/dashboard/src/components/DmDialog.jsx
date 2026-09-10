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
 *
 * ── 체크박스 다중 선택(2026-09-10, "DM에서 여러 명 선택") ──────────────────────
 *
 * 예전엔 한 사람을 누르면 그 자리에서 바로 열렸다. 여러 명을 고를 수 있게 하려면 "누르는
 * 즉시 연다"와 "체크만 하고 나중에 시작한다"가 한 목록 안에서 공존할 수 없어(같은 클릭이
 * 둘 중 뭘 뜻하는지 구분이 안 된다), InviteMembersDialog와 같은 체크박스 + 확인 버튼
 * 모양으로 통일했다. 1명만 고르는 흔한 경우도 버튼을 한 번 더 눌러야 하지만, 두 흐름을
 * 갈라서 헷갈리게 두는 것보다는 이 편이 낫다.
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

export default function DmDialog({ open, members, loading, myUid, busy, onClose, onStart }) {
  const [keyword, setKeyword] = useState('')
  const [picked, setPicked] = useState([])

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

  const toggle = (uid) => {
    setPicked(prev => (prev.includes(uid) ? prev.filter(u => u !== uid) : [...prev, uid]))
  }

  const close = () => { setKeyword(''); setPicked([]); onClose() }

  const handleStart = async () => {
    const chosen = (members || []).filter(m => picked.includes(m.uid))
    if (chosen.length === 0) return
    await onStart(chosen)
    close()
  }

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
        <Button variant="contained" disabled={picked.length === 0 || busy} onClick={handleStart}>
          {picked.length > 1 ? `${picked.length}명과 대화 시작` : '대화 시작'}
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
