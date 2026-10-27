import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Collapse from '@mui/material/Collapse'
import Typography from '@mui/material/Typography'
import NotificationsActiveOutlinedIcon from '@mui/icons-material/NotificationsActiveOutlined'

const fmt = (d) => (d ? d.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')

/**
 * 마지막으로 보신 뒤 다른 선생님이 바꾼 것 — 되돌리기 없이 확인만.
 * changes: { versions: [{versionNo, by, at, summary, details}], changedCount, removed: [제목] }
 */
export default function ChangesSinceBanner({ changes, onDismiss }) {
  const [open, setOpen] = useState(false)
  const people = {}
  for (const v of changes.versions) people[v.by?.name || '알 수 없음'] = (people[v.by?.name || '알 수 없음'] || 0) + 1
  const who = Object.entries(people).map(([n, c]) => `${n} ${c}번`).join(' · ')

  return (
    <Box sx={{ bgcolor: '#fff7ed', border: '1px solid #fdba74', borderRadius: 2, px: 1.25, py: 0.75 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <NotificationsActiveOutlinedIcon sx={{ color: '#c2410c', fontSize: 20 }} />
        <Typography variant="body2" sx={{ fontWeight: 700, color: '#7c2d12' }}>
          마지막으로 보신 뒤 다른 선생님이 고쳤습니다 — {who}
        </Typography>
        <Typography variant="body2" sx={{ color: '#9a3412' }}>
          {changes.changedCount > 0 && `바뀐 일정 ${changes.changedCount}개를 표에 주황 테두리로 표시했습니다.`}
          {changes.removed.length > 0 && ` 지워진 일정 ${changes.removed.length}개.`}
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Button size="small" onClick={() => setOpen((o) => !o)} sx={{ color: '#9a3412' }}>{open ? '접기' : '무엇을 바꿨는지'}</Button>
        <Button size="small" variant="contained" disableElevation onClick={onDismiss} sx={{ bgcolor: '#ea580c', '&:hover': { bgcolor: '#c2410c' } }}>확인</Button>
      </Box>
      <Collapse in={open}>
        <Box sx={{ mt: 0.75, maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          {changes.removed.length > 0 && (
            <Typography variant="caption" sx={{ color: '#7c2d12' }}>지워진 일정: {changes.removed.join(', ')}</Typography>
          )}
          {changes.versions.map((v) => (
            <Box key={v.versionNo} sx={{ bgcolor: '#fff', border: '1px solid #fed7aa', borderRadius: 1, px: 1, py: 0.5 }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: '#7c2d12' }}>
                {fmt(v.at)} · {v.by?.name || '알 수 없음'} · v{v.versionNo}
              </Typography>
              {(v.details?.length ? v.details : [v.summary]).slice(0, 12).map((line, i) => (
                <Typography key={i} variant="caption" sx={{ display: 'block', color: '#334155' }}>· {line}</Typography>
              ))}
              {(v.details?.length || 0) > 12 && <Typography variant="caption" sx={{ color: 'text.secondary' }}>외 {v.details.length - 12}건</Typography>}
            </Box>
          ))}
        </Box>
      </Collapse>
    </Box>
  )
}
