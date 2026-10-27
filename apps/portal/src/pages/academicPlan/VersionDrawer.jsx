import { useEffect, useState } from 'react'
import Drawer from '@mui/material/Drawer'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Collapse from '@mui/material/Collapse'
import TextField from '@mui/material/TextField'
import { listVersions } from './planRepo'

const ACTION_LABEL = { save: '수정', restore: '복구', create: '만들기', holidays: '공휴일' }

const fmt = (d) => (d ? d.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')

/**
 * 수정 기록 — 누가·언제·무엇을 바꿨는지(ExamCore VersionDrawer와 같은 모양).
 * 각 기록은 저장 시점의 전체 스냅숏을 갖고 있어 '이 버전으로 복구'할 수 있다(복구도 새 기록으로 남는다).
 */
export default function VersionDrawer({ open, onClose, schoolId, plan, canEdit, onRestore }) {
  const [items, setItems] = useState(null)
  const [openId, setOpenId] = useState(null)
  const [filter, setFilter] = useState('')
  const [busy, setBusy] = useState(null)

  useEffect(() => {
    if (!open || !plan?.id) return
    setItems(null)
    listVersions(schoolId, plan.id).then(setItems).catch(() => setItems([]))
  }, [open, schoolId, plan?.id, plan?.revision])

  const shown = (items || []).filter((v) => !filter || `${v.by?.name} ${v.summary} ${(v.details || []).join(' ')}`.includes(filter))

  return (
    <Drawer anchor="right" open={open} onClose={onClose} PaperProps={{ sx: { width: { xs: '100%', sm: 420 } } }}>
      <Box sx={{ p: 2, borderBottom: '1px solid #e2e8f0' }}>
        <Typography sx={{ fontWeight: 800 }}>수정 기록</Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>{plan?.name} · 저장할 때마다 남습니다</Typography>
        <TextField size="small" fullWidth placeholder="이름·일정으로 찾기" value={filter} onChange={(e) => setFilter(e.target.value)} sx={{ mt: 1 }} />
      </Box>
      <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.25, overflowY: 'auto' }}>
        {items === null && <CircularProgress size={24} sx={{ alignSelf: 'center' }} />}
        {items?.length === 0 && <Typography variant="body2" sx={{ color: 'text.secondary' }}>아직 저장된 기록이 없습니다.</Typography>}
        {shown.map((v) => (
          <Box key={v.id} sx={{ border: '1px solid #e2e8f0', borderRadius: 2, p: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
              <Typography sx={{ fontWeight: 800, fontSize: '0.85rem' }}>v{v.versionNo}</Typography>
              <Chip size="small" label={ACTION_LABEL[v.action] || v.action} sx={{ height: 20, fontSize: '0.7rem' }} />
              {v.id === plan?.latestVersionId && <Chip size="small" color="success" label="현재" sx={{ height: 20, fontSize: '0.7rem' }} />}
              <Typography variant="caption" sx={{ color: 'text.secondary', ml: 'auto' }}>{v.by?.name} · {fmt(v.at)}</Typography>
            </Box>
            <Typography variant="body2" sx={{ mt: 0.5 }}>{v.summary}</Typography>
            <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
              {(v.details?.length || 0) > 1 && (
                <Button size="small" onClick={() => setOpenId(openId === v.id ? null : v.id)}>
                  변경 내역 {v.details.length}건 {openId === v.id ? '접기' : '보기'}
                </Button>
              )}
              {canEdit && v.id !== plan?.latestVersionId && (
                <Button size="small" color="warning" disabled={busy === v.id}
                  onClick={async () => { setBusy(v.id); try { await onRestore(v) } finally { setBusy(null) } }}>
                  이 버전으로 복구
                </Button>
              )}
            </Box>
            <Collapse in={openId === v.id}>
              <Box component="ul" sx={{ m: 0, pl: 2.5, fontSize: '0.8rem', color: '#334155' }}>
                {(v.details || []).map((l, i) => <li key={i}>{l}</li>)}
              </Box>
            </Collapse>
          </Box>
        ))}
      </Box>
    </Drawer>
  )
}
