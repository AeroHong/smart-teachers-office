/**
 * 요청에 붙은 자료 목록 (읽기 전용).
 *
 * "첨부파일이 지워졌어요", "양식 다시 주세요"를 없애는 게 목적이라 요청이 살아 있는 동안
 * 항상 같은 자리에 있어야 한다. 현황 화면과 할 일 위젯이 같은 모양으로 보여준다.
 */
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import LinkIcon from '@mui/icons-material/Link'
import DownloadIcon from '@mui/icons-material/Download'
import { fileKind, formatBytes } from '@shared/lib/requestAttachments'

export default function RequestMaterials({ attachments = [], links = [], dense = false }) {
  if (attachments.length === 0 && links.length === 0) return null

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.7 }}>
      {attachments.map(a => {
        const kind = fileKind(a.name)
        return (
          <Item key={a.path || a.url} href={a.url} dense={dense} download={a.name}>
            <Typography fontSize="0.95rem">{kind.emoji}</Typography>
            <Typography fontSize={dense ? '0.83rem' : '0.88rem'} fontWeight={600} noWrap sx={{ flexGrow: 1, minWidth: 0 }}>
              {a.name}
            </Typography>
            <Typography fontSize="0.72rem" color="text.secondary" sx={{ flexShrink: 0 }}>
              {formatBytes(a.size)}
            </Typography>
            <DownloadIcon sx={{ fontSize: 16, color: 'text.disabled', flexShrink: 0 }} />
          </Item>
        )
      })}

      {links.map((l, i) => (
        <Item key={`${l.url}-${i}`} href={l.url} dense={dense}>
          <LinkIcon sx={{ fontSize: 17, color: 'text.disabled' }} />
          <Typography fontSize={dense ? '0.83rem' : '0.88rem'} fontWeight={600} noWrap sx={{ flexGrow: 1, minWidth: 0 }}>
            {l.label || l.url}
          </Typography>
        </Item>
      ))}
    </Box>
  )
}

function Item({ children, href, dense, download }) {
  return (
    <Box
      component="a"
      href={href}
      target="_blank"
      rel="noopener"
      {...(download ? { download } : {})}
      onClick={e => e.stopPropagation()}
      sx={{
        display: 'flex', alignItems: 'center', gap: 1,
        px: 1.2, py: dense ? 0.6 : 0.8, borderRadius: 2,
        border: '1px solid', borderColor: 'divider',
        textDecoration: 'none', color: 'text.primary',
        '&:hover': { bgcolor: 'action.hover' },
      }}
    >
      {children}
    </Box>
  )
}
