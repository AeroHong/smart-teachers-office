import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import LockOpenIcon from '@mui/icons-material/LockOpen'
import { STAGES, STAGE_LABEL, currentConfirmation } from '@shared/lib/academicPlan'
import { ACCENT } from './planUi'

const DESC = {
  frame: '개학·방학·고사·휴업 등 큰 일정만 잡고 초안끼리 비교하는 단계',
  detail: '큰 일정은 잠기고, 부장 선생님들이 세부 일정·시수를 채우는 단계',
  final: '모든 일정이 잠긴 최종본',
}
const dateText = (ms) => (ms ? new Date(ms).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }) : '')

/** 판 하나 — '주요 일정 2판 10/27 홍창기', 바뀐 판은 취소선과 '변경됨' */
function ConfirmationText({ c }) {
  const label = `${c.stage === 'final' ? '최종' : '주요 일정'} ${c.no}판`
  return (
    <Tooltip title={`${label} · ${dateText(c.at)} ${c.by?.name || ''} · 수정 기록 v${c.versionNo}`}>
      <Box component="span" sx={{
        px: 0.75, py: 0.1, borderRadius: '4px', fontSize: '0.74rem', fontWeight: 700, whiteSpace: 'nowrap',
        ...(c.superseded
          ? { color: '#94a3b8', textDecoration: 'line-through', bgcolor: '#f1f5f9' }
          : { color: '#065f46', bgcolor: '#d1fae5' }),
      }}>
        {label}{c.superseded ? ' 변경됨' : ` · ${dateText(c.at)}`}
      </Box>
    </Tooltip>
  )
}

/**
 * 단계 표시 — ① 주요 일정 → ② 세부 일정 → ③ 확정, 확정 판 기록, 관리자 단계 버튼.
 * 잠금 해제한 일정이 있으면 '재확정'(새 판)을 띄운다.
 */
export default function StageBar({ stage, confirmations, canAdmin, busy, unlockedCount, onConfirmFrame, onConfirmFinal, onReconfirm, onUnconfirm }) {
  const idx = STAGES.indexOf(stage)
  const shown = confirmations.slice(-4)
  const cur = currentConfirmation(confirmations, stage === 'final' ? 'final' : 'frame')
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', bgcolor: '#fff', border: '1px solid #cbd5e1', borderRadius: 2, px: 1.25, py: 0.75 }}>
      {STAGES.map((st, i) => (
        <Box key={st} sx={{ display: 'flex', alignItems: 'center' }}>
          {i > 0 && <ChevronRightIcon sx={{ color: '#94a3b8', mx: 0.25 }} fontSize="small" />}
          <Tooltip title={DESC[st]}>
            <Box sx={{
              px: 1, py: 0.25, borderRadius: 10, fontSize: '0.82rem', fontWeight: 800,
              ...(i === idx ? { bgcolor: ACCENT, color: '#fff' } : i < idx ? { color: ACCENT, bgcolor: '#ccfbf1' } : { color: '#94a3b8', bgcolor: '#f1f5f9' }),
            }}>
              {i + 1}. {STAGE_LABEL[st]}
            </Box>
          </Tooltip>
        </Box>
      ))}
      <Typography variant="caption" sx={{ color: 'text.secondary', ml: 0.5 }}>{DESC[stage]}</Typography>
      <Box sx={{ display: 'flex', gap: 0.5, ml: 1 }}>
        {confirmations.length > shown.length && <Typography variant="caption" sx={{ color: 'text.secondary' }}>…</Typography>}
        {shown.map((c) => <ConfirmationText key={`${c.stage}${c.no}`} c={c} />)}
      </Box>
      <Box sx={{ flex: 1 }} />
      {unlockedCount > 0 && (
        <Typography variant="caption" sx={{ color: '#b45309', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 0.25 }}>
          <LockOpenIcon sx={{ fontSize: 15 }} /> 잠금 해제 {unlockedCount}건{canAdmin ? '' : ' — 관리자 재확정 대기'}
        </Typography>
      )}
      {canAdmin && unlockedCount > 0 && stage !== 'frame' && (
        <Button size="small" variant="contained" disableElevation color="warning" onClick={onReconfirm} disabled={busy}>
          재확정 ({stage === 'final' ? '최종' : '주요 일정'} {(cur?.no || 0) + 1}판)
        </Button>
      )}
      {canAdmin && stage === 'frame' && (
        <Button size="small" variant="contained" disableElevation onClick={onConfirmFrame} disabled={busy} sx={{ bgcolor: ACCENT }}>주요 일정 확정</Button>
      )}
      {canAdmin && stage === 'detail' && (
        <Button size="small" variant="contained" disableElevation onClick={onConfirmFinal} disabled={busy || unlockedCount > 0} sx={{ bgcolor: ACCENT }}>최종 확정</Button>
      )}
      {canAdmin && stage === 'final' && (
        <Button size="small" onClick={onUnconfirm} disabled={busy}>확정 해제</Button>
      )}
    </Box>
  )
}
