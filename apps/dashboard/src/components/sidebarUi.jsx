/**
 * 사이드바 공용 UI — 접이식 섹션과 목록 줄.
 *
 * 홈(안내·요청·호출·일정)과 쪽지, 구성원 명단이 모두 같은 모양을 쓴다. 화면마다 목록
 * 생김새가 조금씩 다르면 같은 조작인데도 매번 다시 익혀야 한다.
 *
 * 줄은 제목 하나로 끝낸다. 부제·시각·설명을 붙이면 한 줄이 두 줄이 되고, 제목만 훑어
 * 고르려고 목록/상세로 바꾼 의미가 사라진다. 급한 것만 오른쪽에 작은 칩으로 알린다.
 */
import Box from '@mui/material/Box'
import Collapse from '@mui/material/Collapse'
import Typography from '@mui/material/Typography'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'

/** 접이식 섹션 머리. 접혀 있어도 건수는 보여야 열지 말지 판단할 수 있다. */
export function SidebarSection({ label, count, badge, open, onToggle, children }) {
  return (
    <Box sx={{ mb: 0.3 }}>
      <Box
        component="button"
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        sx={{
          display: 'flex', alignItems: 'center', gap: 0.3, width: '100%',
          border: 0, background: 'none', cursor: 'pointer', textAlign: 'left',
          px: 0.6, py: 0.45, borderRadius: 0.75,
          '&:hover': { bgcolor: 'action.hover' },
        }}
      >
        <ExpandMoreIcon
          sx={{
            fontSize: 17, color: 'text.disabled', flexShrink: 0,
            transform: open ? 'none' : 'rotate(-90deg)',
            transition: 'transform .15s ease',
          }}
        />
        <Typography
          sx={{ fontSize: '0.73rem', fontWeight: 800, letterSpacing: '.03em', color: 'text.secondary' }}
          noWrap
        >
          {label}
        </Typography>
        <Box sx={{ flexGrow: 1 }} />
        {badge != null && badge > 0 ? (
          <Box sx={{
            minWidth: 17, height: 17, px: 0.5, borderRadius: 5,
            bgcolor: 'error.main', color: '#fff',
            fontSize: '0.68rem', fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {badge}
          </Box>
        ) : count != null && (
          <Typography sx={{ fontSize: '0.72rem', color: 'text.disabled' }}>{count}</Typography>
        )}
      </Box>
      <Collapse in={open} unmountOnExit>
        <Box sx={{ pb: 0.4 }}>{children}</Box>
      </Collapse>
    </Box>
  )
}

/**
 * 목록 한 줄.
 * @param {boolean} selected 지금 오른쪽에 펼쳐져 있는 항목
 * @param {boolean} strong   아직 안 본 것 — 굵게
 * @param {boolean} muted    이미 끝낸 것 — 흐리게
 */
export function SidebarItem({ label, chip, selected, strong, muted, onClick, indent = 0 }) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      sx={{
        display: 'flex', alignItems: 'center', gap: 0.7, width: '100%',
        border: 0, cursor: 'pointer', textAlign: 'left',
        pl: 1.7 + indent, pr: 0.7, py: 0.4, borderRadius: 0.75,
        bgcolor: selected ? 'primary.main' : 'transparent',
        color: selected ? 'primary.contrastText' : muted ? 'text.disabled' : 'text.primary',
        opacity: muted && !selected ? 0.7 : 1,
        '&:hover': { bgcolor: selected ? 'primary.main' : 'action.hover' },
      }}
    >
      <Typography
        noWrap
        sx={{
          flexGrow: 1, minWidth: 0,
          fontSize: '0.83rem',
          fontWeight: strong && !muted ? 700 : 500,
          textDecoration: muted ? 'line-through' : 'none',
        }}
      >
        {label}
      </Typography>
      {chip}
    </Box>
  )
}

/** 섹션 안이 비었을 때. 한 줄로 끝낸다. */
export function SidebarEmpty({ children }) {
  return (
    <Typography sx={{ pl: 1.7, pr: 0.7, py: 0.4, fontSize: '0.78rem', color: 'text.disabled' }}>
      {children}
    </Typography>
  )
}

/** 사이드바용 작은 칩 — 목록 줄 오른쪽의 D-3, 독촉 같은 표시. */
export function MiniChip({ label, tone = 'neutral', selected }) {
  const toneColor = {
    danger: 'error.main',
    warning: 'warning.main',
    info: 'primary.main',
    success: 'success.main',
    neutral: 'text.disabled',
  }[tone] || 'text.disabled'

  return (
    <Typography
      sx={{
        flexShrink: 0, fontSize: '0.7rem', fontWeight: 700,
        color: selected ? 'primary.contrastText' : toneColor,
        opacity: selected ? 0.85 : 1,
      }}
    >
      {label}
    </Typography>
  )
}
