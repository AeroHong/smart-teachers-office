/**
 * 블록 댓글 — 3단 오른쪽에 뜨는 4번째 칸(PLAN_canvasBlocks.md Phase 4).
 *
 * CanvasEditor·PostDetail의 블록 손잡이 영역에서 댓글 아이콘을 누르면 Channels.jsx가
 * 캔버스 옆에 이 칸을 조건부로 그린다(WorkspaceLayout.jsx 자체는 안 건드린다 — 레일·
 * 사이드바처럼 항상 있는 칸이 아니라 블록 하나를 고를 때만 뜨는 칸이라 이 자리가 맞다).
 *
 * 실제 목록·입력창은 PostComments.jsx(compact 모드)가 그린다 — 글 전체 댓글과 같은
 * 컴포넌트, blockId로만 걸러진다.
 */
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import CloseIcon from '@mui/icons-material/Close'
import PostComments from './PostComments'

export default function BlockCommentsPanel({ requestId, blockId, members, onClose }) {
  return (
    <Box sx={{
      width: 320, flexShrink: 0, display: 'flex', flexDirection: 'column',
      height: '100%', minHeight: 0, borderLeft: '1px solid', borderColor: 'divider',
      bgcolor: 'background.paper',
    }}>
      <Box sx={{
        flexShrink: 0, display: 'flex', alignItems: 'center', gap: 0.5,
        px: 1.3, py: 1, borderBottom: '1px solid', borderColor: 'divider',
      }}>
        <Typography fontWeight={800} fontSize="0.85rem" sx={{ flexGrow: 1 }}>블록 댓글</Typography>
        <Tooltip title="닫기">
          <IconButton size="small" onClick={onClose} aria-label="블록 댓글 닫기">
            <CloseIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      </Box>
      <PostComments
        requestId={requestId}
        blockId={blockId}
        members={members}
        compact
        placeholder="이 블록에 댓글 남기기"
        emptyText="아직 댓글이 없습니다. 이 블록에 대해 궁금한 점을 남겨보세요."
      />
    </Box>
  )
}
