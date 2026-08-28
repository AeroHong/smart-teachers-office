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
 * 꺾쇠는 아이콘 자리 위에 겹쳐 두고 평소엔 숨긴다 — 아이콘과 꺾쇠를 나란히 늘 띄웠더니
 * 아이콘 두 개가 붙어 있는 것처럼 붐볐다(사용자 지적, 2026-08-26). 대신 그 자리에
 * 마우스를 올리면 아이콘이 꺾쇠로 바뀐다 — "여기가 접는 자리"라는 신호는 그대로 주면서
 * 평소엔 아이콘만 깔끔하게 보인다.
 *
 * @param {React.ElementType} [icon] 이 섹션을 나타내는 아이콘. 평소엔 이게 보이고,
 *   올리면 꺾쇠로 바뀐다.
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
        className="sidebar-section-head"
        sx={{
          display: 'flex', alignItems: 'center', gap: 0.3, width: '100%',
          border: 0, background: 'none', cursor: 'pointer', textAlign: 'left',
          px: 0.5, py: 0.65, borderRadius: 0.75,
          '&:hover': { bgcolor: 'action.hover' },
        }}
      >
        {/* 아이콘과 꺾쇠를 같은 자리에 겹쳐 두고 CSS만으로 hover 시 바꿔치기한다 —
            JS 상태 없이 즉시 반응한다. Icon이 없으면(호출부가 안 넘기면) 꺾쇠만
            늘 보인다(이 코드베이스의 모든 SidebarSection이 지금은 icon을 주지만,
            나중에 안 주는 곳이 생겨도 그대로 동작하도록). */}
        <Box sx={{ position: 'relative', width: 16, height: 16, flexShrink: 0, mr: 0.3 }}>
          {Icon && (
            <Icon sx={{
              position: 'absolute', inset: 0, fontSize: 16,
              color: open ? 'text.primary' : 'text.secondary',
              transition: 'opacity .1s ease',
              '.sidebar-section-head:hover &': { opacity: 0 },
            }} />
          )}
          <ExpandMoreIcon
            sx={{
              position: 'absolute', inset: 0, fontSize: 16, color: 'text.secondary',
              transform: open ? 'none' : 'rotate(-90deg)',
              transition: 'transform .15s ease, opacity .1s ease',
              opacity: Icon ? 0 : 1,
              ...(Icon && { '.sidebar-section-head:hover &': { opacity: 1 } }),
            }}
          />
        </Box>
        {/* Slack은 제목과 항목 글자 크기가 거의 같고 볼드·색으로만 위계를 준다 —
            제목이 항목(0.9rem)보다 작으면 "제목"답지 않다(사용자 지적, 2026-08-26).
            0.88rem으로 항목에 근접시키고 볼드·자간으로 구분한다. 색은 어두운
            사이드바에서 더 또렷하게 흰 쪽으로(사용자 지적, 2026-08-26).*/}
        <Typography
          sx={{
            fontSize: '0.88rem', fontWeight: 800, letterSpacing: '.01em',
            color: open ? 'text.primary' : 'text.secondary',
          }}
          noWrap
        >
          {label}
        </Typography>
        <Box sx={{ flexGrow: 1 }} />
        {/* 전체 개수(count)는 뺐다 — 제목 옆 숫자가 굳이 필요 없다는 지적(2026-08-26).
            안 읽음 배지(badge)는 남긴다 — 접힌 DM 섹션처럼 "새로 온 게 있다"는 신호는
            개수 표시와 뜻이 달라서다. */}
        {badge != null && badge > 0 && (
          <Box sx={{
            minWidth: 17, height: 17, px: 0.5, borderRadius: 5,
            bgcolor: 'error.main', color: '#fff',
            fontSize: '0.68rem', fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {badge}
          </Box>
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
 * @param {React.ReactNode} [avatar] 이름 앞에 붙는 작은 아바타(PersonAvatar 등). 안 주면
 *   기존 화면들(홈·쪽지·학사일정 등)은 그대로다 — 구성원 화면만 이걸 쓴다(사용자 요청,
 *   2026-08-27).
 * @param {(e: React.MouseEvent) => void} [onContextMenu] 줄 우클릭. action(⋮ 버튼)과
 *   같은 메뉴를 여는 또 다른 입구로 쓴다(사용자 지적, 2026-08-28 — "채널명 위에서의
 *   우클릭 지원 안됨").
 */
export function SidebarItem({
  label, chip, selected, strong, muted, onClick, indent = 0, checked, action, actionActive, href,
  avatar, onContextMenu,
}) {
  const CheckIcon = checked ? CheckBoxIcon : CheckBoxOutlineBlankIcon
  const linkProps = href
    ? { component: 'a', href, target: '_blank', rel: 'noopener noreferrer' }
    : { component: 'button', type: 'button', onClick }
  const row = (
    <Box
      {...linkProps}
      onContextMenu={onContextMenu}
      sx={{
        display: 'flex', alignItems: 'center', gap: 0.7, width: '100%',
        border: 0, cursor: 'pointer', textAlign: 'left',
        pl: 1.3 + indent, pr: 0.6, py: 0.7, borderRadius: 0.75,
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
      {avatar}
      <Typography
        noWrap
        sx={{
          flexGrow: 1, minWidth: 0,
          fontSize: '0.9rem',
          fontWeight: strong && !muted ? 700 : 500,
          textDecoration: muted ? 'line-through' : 'none',
        }}
      >
        {label}
      </Typography>
      {/* action(⋮)이 있는 줄은 마우스를 올리면 이 칩이 숨고 그 자리에 ⋮가 뜬다 — 아니면
          둘이 같은 오른쪽 끝 자리를 두고 겹친다(사용자 지적, 2026-08-28 — "점3개 추가
          메뉴 버튼이 안보이고, 숫자가 떠있어서 겹치는듯"). */}
      {chip && (
        <Box component="span" className="sidebar-row-chip" sx={{ display: 'flex', transition: 'opacity .1s ease' }}>
          {chip}
        </Box>
      )}
    </Box>
  )

  if (!action) return row

  return (
    <Box
      sx={{
        position: 'relative',
        '&:hover .sidebar-row-action, &:focus-within .sidebar-row-action': { opacity: 1 },
        '&:hover .sidebar-row-chip, &:focus-within .sidebar-row-chip': { opacity: 0 },
      }}
    >
      {row}
      <Box
        className="sidebar-row-action"
        sx={{
          position: 'absolute', right: 2, top: '50%', transform: 'translateY(-50%)',
          opacity: actionActive ? 1 : 0, transition: 'opacity .12s ease',
          // action 안의 아이콘 버튼이 이 색을 물려받도록(IconButton color="inherit") —
          // 선택된 줄(파란 배경)에서 기본 회색 아이콘은 대비가 낮아 거의 안 보였다
          // (같은 지적, "점3개 버튼이 안보이고").
          color: selected ? 'primary.contrastText' : 'text.secondary',
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
