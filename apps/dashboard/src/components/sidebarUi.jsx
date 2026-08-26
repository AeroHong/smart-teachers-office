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
import CheckBoxIcon from '@mui/icons-material/CheckBox'
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank'

/**
 * 접이식 섹션 머리. 접혀 있어도 건수는 보여야 열지 말지 판단할 수 있다.
 *
 * 섹션마다 다른 아이콘을 쓴다. 전부 같은 꺾쇠면 목록이 세 덩어리로 나뉘어 있다는 것만
 * 알 뿐 어느 덩어리인지는 글자를 읽어야 안다. 접힌 상태는 아이콘을 흐리게 해서 알린다.
 *
 * @param {React.ElementType} [icon] 이 섹션을 나타내는 아이콘. 없으면 꺾쇠를 쓴다.
 * @param {boolean} [actionOnHover] 딸린 단추를 평소엔 숨긴다. 사용자가 만든 섹션처럼
 *   관리 단추가 늘 떠 있으면 오른쪽의 건수를 가리고 목록이 시끄러워지는 경우에 쓴다.
 * @param {boolean} [actionActive] 메뉴가 열려 있는 동안처럼 계속 보여야 할 때.
 */
export function SidebarSection({
  label, icon: Icon, count, badge, open, onToggle, action, actionOnHover, actionActive, children,
}) {
  return (
    <Box sx={{
      mb: 0.3, position: 'relative',
      ...(actionOnHover && {
        '&:hover .sidebar-section-action, &:focus-within .sidebar-section-action': { opacity: 1 },
      }),
    }}>
      <Box
        component="button"
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        sx={{
          display: 'flex', alignItems: 'center', gap: 0.3, width: '100%',
          border: 0, background: 'none', cursor: 'pointer', textAlign: 'left',
          px: 0.5, py: 0.45, borderRadius: 0.75,
          '&:hover': { bgcolor: 'action.hover' },
        }}
      >
        {Icon ? (
          <Icon sx={{
            fontSize: 16, flexShrink: 0, mr: 0.35,
            color: open ? 'text.secondary' : 'text.disabled',
            transition: 'color .15s ease',
          }} />
        ) : (
          <ExpandMoreIcon
            sx={{
              fontSize: 16, color: 'text.disabled', flexShrink: 0,
              transform: open ? 'none' : 'rotate(-90deg)',
              transition: 'transform .15s ease',
            }}
          />
        )}
        <Typography
          sx={{
            fontSize: '0.76rem', fontWeight: 800, letterSpacing: '.03em',
            color: open ? 'text.secondary' : 'text.disabled',
          }}
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
      {/* 머리 줄 위에 겹쳐 놓는다. 접기 단추 안에 중첩하면 버튼 안의 버튼이 되어
          그룹을 통째로 고르려다 접혀버린다. */}
      {action && (
        <Box
          className={actionOnHover ? 'sidebar-section-action' : undefined}
          sx={{
            position: 'absolute', right: 4, top: 2,
            ...(actionOnHover && {
              opacity: actionActive ? 1 : 0, transition: 'opacity .12s ease',
            }),
          }}
        >
          {action}
        </Box>
      )}
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
 * @param {boolean} [checked] 선택 모드일 때만 준다. 줄 자체가 버튼이라 체크박스를 따로
 *   두면 버튼 안에 버튼이 되므로, 표시만 그리고 토글은 줄 클릭(onClick)이 맡는다.
 * @param {React.ReactNode} [action] 줄에 딸린 단추(예: ⋮). 평소엔 숨어 있다가 마우스를
 *   올리거나 키보드 초점이 들어오면 나타난다. SidebarSection과 같은 이유로 줄 버튼 안에
 *   중첩하지 않고 위에 겹쳐 놓는다 — 버튼 안의 버튼이 되면 단추를 누르려다 줄이 눌린다.
 * @param {boolean} [actionActive] 메뉴가 열려 있는 동안처럼 계속 보여야 할 때. 없으면
 *   마우스를 떼는 순간 단추가 사라져 메뉴만 허공에 뜬 것처럼 보인다.
 * @param {string} [href] 바깥 사이트로 나가는 줄. 진짜 <a>로 그린다 — 버튼에 window.open을
 *   달면 가운데 클릭·Ctrl 클릭·'새 탭에서 열기'가 전부 안 먹는다.
 */
export function SidebarItem({
  label, chip, selected, strong, muted, onClick, indent = 0, checked, action, actionActive, href,
}) {
  const CheckIcon = checked ? CheckBoxIcon : CheckBoxOutlineBlankIcon
  const linkProps = href
    ? { component: 'a', href, target: '_blank', rel: 'noopener noreferrer' }
    : { component: 'button', type: 'button', onClick }
  const row = (
    <Box
      {...linkProps}
      sx={{
        display: 'flex', alignItems: 'center', gap: 0.7, width: '100%',
        border: 0, cursor: 'pointer', textAlign: 'left',
        pl: 1.3 + indent, pr: 0.6, py: 0.4, borderRadius: 0.75,
        bgcolor: selected ? 'primary.main' : 'transparent',
        color: selected ? 'primary.contrastText' : muted ? 'text.disabled' : 'text.primary',
        opacity: muted && !selected ? 0.7 : 1,
        // <a>로 그릴 때만 필요한 것들 — 버튼에는 원래 없는 기본 스타일이다
        textDecoration: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
        '&:hover': { bgcolor: selected ? 'primary.main' : 'action.hover' },
      }}
    >
      {checked !== undefined && (
        <CheckIcon sx={{
          fontSize: 17, flexShrink: 0, ml: -0.9,
          color: checked ? 'primary.main' : 'text.disabled',
        }} />
      )}
      <Typography
        noWrap
        sx={{
          flexGrow: 1, minWidth: 0,
          fontSize: '0.88rem',
          fontWeight: strong && !muted ? 700 : 500,
          textDecoration: muted ? 'line-through' : 'none',
        }}
      >
        {label}
      </Typography>
      {chip}
    </Box>
  )

  if (!action) return row

  return (
    <Box
      sx={{
        position: 'relative',
        '&:hover .sidebar-row-action, &:focus-within .sidebar-row-action': { opacity: 1 },
      }}
    >
      {row}
      <Box
        className="sidebar-row-action"
        sx={{
          position: 'absolute', right: 2, top: '50%', transform: 'translateY(-50%)',
          opacity: actionActive ? 1 : 0, transition: 'opacity .12s ease',
        }}
      >
        {action}
      </Box>
    </Box>
  )
}

/** 섹션 안이 비었을 때. 한 줄로 끝낸다. */
export function SidebarEmpty({ children }) {
  return (
    <Typography sx={{ pl: 1.3, pr: 0.6, py: 0.4, fontSize: '0.8rem', color: 'text.disabled' }}>
      {children}
    </Typography>
  )
}

/** 사이드바용 작은 칩 — 목록 줄 오른쪽의 D-3, 다시 알림 같은 표시. */
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
