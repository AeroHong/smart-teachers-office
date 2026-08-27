/**
 * 위젯 공용 UI.
 *
 * 위젯이 하나씩 늘면서 같은 모양이 파일마다 다시 쓰였다. 리스트 한 줄만 해도
 * `p: 1.2 / borderRadius: 2 / border: 1px solid #ececf1` 조합이 위젯 6개에 복제돼 있었고,
 * 빈 화면도 이모지 크기·여백이 제각각(py 4와 py 5)이었다. 상태 칩 색은 hex 쌍이
 * 위젯마다 따로 선언돼 같은 "완료"가 화면마다 다른 회색이었다.
 *
 * 규칙 (apps/portal .../admin/adminUi.jsx와 같은 방침)
 *  - 색은 테마 팔레트에서 가져온다. hex를 새로 만들지 않는다.
 *  - 테두리는 'divider' 토큰만 쓴다.
 *  - 빈 화면은 항상 "다음에 뭘 하면 되는지"를 같이 보여준다. 안내문만 두지 않는다.
 */
import { createContext, useContext, useEffect } from 'react'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Skeleton from '@mui/material/Skeleton'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import { alpha } from '@mui/material/styles'

/**
 * 상태 칩의 의미별 색. 위젯이 hex 쌍을 직접 들고 있지 않도록 여기서만 팔레트를 읽는다.
 * 예: 대기 중=danger, 확인함=success, 완료·만료=neutral, 분류·안읽음=info, D-day=warning
 */
// CalendarGrid.jsx도 같은 팔레트로 이벤트 칩 색을 정한다(ToneChip은 칸에 넣기엔 커서
// 직접 이 맵을 쓴다) — 그래서 export한다.
export const TONE_PALETTE = {
  info: theme => theme.palette.primary.main,
  danger: theme => theme.palette.error.main,
  success: theme => theme.palette.success.main,
  warning: theme => theme.palette.warning.main,
  neutral: theme => theme.palette.text.secondary,
}

function toneSx(tone) {
  const pick = TONE_PALETTE[tone] || TONE_PALETTE.neutral
  return theme => ({
    bgcolor: alpha(pick(theme), 0.1),
    color: pick(theme),
    fontWeight: 600,
  })
}

/** 의미(tone)로 색을 정하는 상태 칩. */
export function ToneChip({ label, tone = 'neutral', ...rest }) {
  return <Chip size="small" label={label} sx={toneSx(tone)} {...rest} />
}

/**
 * 위젯 리스트의 한 줄.
 * @param {boolean} highlight 안읽음처럼 주의를 끌어야 하는 줄 (연한 primary 배경)
 * @param {boolean} muted     지난 항목처럼 흐리게 둘 줄
 * @param {boolean} dense     지난 호출 목록처럼 촘촘하게 쌓는 줄
 */
export function ListRow({ children, onClick, highlight = false, muted = false, dense = false, sx }) {
  const clickable = !!onClick
  return (
    <Box
      onClick={onClick}
      sx={[
        theme => ({
          p: dense ? 0.9 : 1.1,
          borderRadius: 0.75,
          border: '1px solid',
          borderColor: 'divider',
          opacity: muted ? 0.65 : 1,
          bgcolor: highlight ? alpha(theme.palette.primary.main, 0.04) : 'transparent',
          cursor: clickable ? 'pointer' : 'default',
          transition: 'background-color .12s ease, border-color .12s ease',
          // 그림자 대신 배경만 바뀐다. 목록에서 줄마다 그림자가 떴다 사라지면 산만하다.
          ...(clickable && {
            '&:hover': { bgcolor: 'action.hover' },
          }),
        }),
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {children}
    </Box>
  )
}

/** 리스트 줄들을 일정한 간격으로 쌓는다. */
export function RowStack({ children, dense = false }) {
  return <Box sx={{ display: 'flex', flexDirection: 'column', gap: dense ? 0.5 : 0.7 }}>{children}</Box>
}

/** "지난 호출" 같은 소제목. */
export function SectionLabel({ children }) {
  return (
    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2, mb: 0.8 }}>
      {children}
    </Typography>
  )
}

/**
 * 위젯이 비었을 때 보여주는 화면.
 * 안내문만 띄우고 끝내지 않고, 지금 할 수 있는 동작(actionLabel)이 있으면 버튼으로 같이 준다.
 * 동작이 다른 앱(포털 관리자 페이지)에 있으면 href로 넘긴다.
 */
export function EmptyState({ emoji, message, hint, actionLabel, onAction, href }) {
  const action = actionLabel && (onAction || href)

  // 노트북(768px 높이)에서 빈 상태 하나가 세로 280px를 먹어 위젯이 두 개밖에 안 보였다.
  // 빈 화면은 '지금은 볼 게 없다'만 알리면 되므로 한 줄로 눕히고 높이를 최소로 잡는다.
  return (
    <Box sx={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      gap: 1, flexWrap: 'wrap', py: 2.5, px: 1.5, textAlign: 'center',
    }}>
      <Typography fontSize="1.15rem" sx={{ lineHeight: 1 }}>{emoji}</Typography>
      <Typography color="text.secondary" fontSize="0.87rem">{message}</Typography>
      {hint && (
        <Typography color="text.secondary" fontSize="0.78rem" sx={{ opacity: 0.75, width: '100%' }}>
          {hint}
        </Typography>
      )}
      {action && (
        <Button
          size="small"
          onClick={onAction}
          {...(href ? { href, target: '_blank', rel: 'noopener' } : {})}
          sx={{ py: 0.1 }}
        >
          {actionLabel}
        </Button>
      )}
    </Box>
  )
}

/** 위젯 본문 맨 위에 놓이는 주 동작 버튼 (업무 추가 / 쪽지 보내기). */
export function WidgetAction({ icon, onClick, children }) {
  return (
    <Button size="small" startIcon={icon} onClick={onClick} sx={{ mb: 1.5 }}>
      {children}
    </Button>
  )
}

/**
 * 위젯 제목 옆 배지 (안읽음 3, 대기 2 …).
 *
 * 배지에 넣을 숫자는 위젯 본문만 알고 있는데 표시는 프레임이 한다. 그렇다고 세는 로직을
 * 프레임으로 끌어올리면 위젯마다 다른 구독을 프레임이 알아야 해서, 반대로 위젯이
 * 값을 위로 올려보내는 방식을 썼다. 위젯은 useWidgetBadge(n) 한 줄만 쓰면 된다.
 */
const WidgetBadgeContext = createContext(null)

export function WidgetBadgeProvider({ onChange, children }) {
  return <WidgetBadgeContext.Provider value={onChange}>{children}</WidgetBadgeContext.Provider>
}

/** @param {number|string|null} badge 0이나 null이면 배지를 숨긴다. */
export function useWidgetBadge(badge) {
  const publish = useContext(WidgetBadgeContext)
  useEffect(() => {
    if (!publish) return
    publish(badge || null)
    return () => publish(null)
  }, [publish, badge])
}

/**
 * 불러오는 동안의 자리 표시.
 *
 * 예전에는 로딩 중에 아무것도 그리지 않아 화면이 잠깐 텅 비었다. 느린 회선에서는
 * "고장났나" 싶은 정적이 생기고, 데이터가 도착하는 순간 화면이 크게 튄다.
 * 들어올 내용과 비슷한 높이를 미리 잡아두면 둘 다 사라진다.
 */
export function ListSkeleton({ rows = 3 }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} variant="rounded" height={46} sx={{ borderRadius: 0.75 }} />
      ))}
    </Box>
  )
}
