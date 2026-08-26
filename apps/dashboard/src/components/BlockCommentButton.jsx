/**
 * 블록 댓글 열기 단추 — BlockReactionRow와 같은 자리(손잡이 영역)에 나란히 뜬다.
 * CanvasEditor(쓰는 사람)는 호버 중인 블록마다, PostDetail(읽는 사람)은 이미 댓글이
 * 달린 블록마다 이 단추를 띄운다(useBlockCommentCounts). 누르면 3단 오른쪽의
 * BlockCommentsPanel이 그 블록으로 열린다.
 */
import Box from '@mui/material/Box'
import Tooltip from '@mui/material/Tooltip'
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline'

export default function BlockCommentButton({ count = 0, onClick }) {
  return (
    <Tooltip title={count > 0 ? `댓글 ${count}` : '댓글 남기기'}>
      <Box
        component="button" type="button"
        onClick={e => { e.stopPropagation(); onClick(e) }}
        sx={{
          display: 'inline-flex', alignItems: 'center', gap: '0.25em',
          fontFamily: 'inherit', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer',
          border: count > 0 ? '1px solid' : '1px dashed', borderColor: 'divider',
          bgcolor: 'background.paper', color: 'text.secondary',
          borderRadius: 999, px: 0.7, py: 0.15, lineHeight: 1.5, boxShadow: count > 0 ? 1 : 0,
          '&:hover': { borderColor: 'primary.light', color: 'text.primary' },
        }}
      >
        <ChatBubbleOutlineIcon sx={{ fontSize: 13 }} />
        {count > 0 && <span>{count}</span>}
      </Box>
    </Tooltip>
  )
}
