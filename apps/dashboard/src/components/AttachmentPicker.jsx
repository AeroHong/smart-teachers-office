/**
 * 요청 첨부 — 파일과 링크.
 *
 * "첨부파일이 지워졌어요", "양식 다시 주세요"가 사라지는 게 목적이다. 메시지는 흘러가지만
 * 요청에 붙은 자료는 마감일까지 같은 자리에 있다.
 *
 * 파일은 고르는 즉시 업로드한다. 저장 버튼을 눌렀을 때 한꺼번에 올리면 큰 한글 파일에서
 * 몇 초씩 멈춘 것처럼 보이고, 실패했을 때 무엇이 올라갔는지 알 수 없다.
 */
import { useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import IconButton from '@mui/material/IconButton'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import AttachFileIcon from '@mui/icons-material/AttachFile'
import CloseIcon from '@mui/icons-material/Close'
import LinkIcon from '@mui/icons-material/Link'
import { useAuth } from '@shared/contexts/AuthContext'
import { deleteAttachment, fileKind, formatBytes, uploadAttachment } from '@shared/lib/requestAttachments'
import { useToast } from './ToastProvider'

export default function AttachmentPicker({ requestId, attachments, links, onChange }) {
  const { schoolId } = useAuth()
  const toast = useToast()
  const fileInput = useRef(null)
  const [uploading, setUploading] = useState(0)
  const [linkUrl, setLinkUrl] = useState('')

  const handleFiles = async (e) => {
    const files = [...(e.target.files || [])]
    e.target.value = ''   // 같은 파일을 다시 고를 수 있게 초기화
    if (files.length === 0) return

    setUploading(n => n + files.length)
    for (const file of files) {
      try {
        const uploaded = await uploadAttachment({ schoolId, requestId, file })
        onChange({ attachments: [...attachments, uploaded], links })
      } catch (err) {
        toast.error(`${file.name} 업로드 실패: ${err.message}`, err)
      } finally {
        setUploading(n => n - 1)
      }
    }
  }

  const removeFile = async (attachment) => {
    onChange({ attachments: attachments.filter(a => a.path !== attachment.path), links })
    try {
      await deleteAttachment(attachment)
    } catch (err) {
      toast.error('파일을 지우지 못했습니다. 목록에서는 제거됐습니다.', err)
    }
  }

  // 링크는 주소만 받는다. 이름을 따로 묻던 칸은 없앴다 — 대부분 주소를 그대로 붙여넣기만
  // 하는데 이름까지 요구하면 입력이 두 배가 되고, 이름은 주소에서 뽑아도 충분하다.
  const addLink = () => {
    const url = linkUrl.trim()
    if (!url) return
    const withScheme = /^https?:\/\//i.test(url) ? url : `https://${url}`
    onChange({ attachments, links: [...links, { label: labelFromUrl(withScheme), url: withScheme }] })
    setLinkUrl('')
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.8, mb: attachments.length + links.length > 0 ? 1.5 : 0 }}>
        {attachments.map(a => {
          const kind = fileKind(a.name)
          return (
            <Row key={a.path} onRemove={() => removeFile(a)}>
              <Typography fontSize="0.9rem">{kind.emoji}</Typography>
              <Typography fontSize="0.88rem" fontWeight={600} noWrap sx={{ flexGrow: 1, minWidth: 0 }}>
                {a.name}
              </Typography>
              <Typography fontSize="0.75rem" color="text.secondary" sx={{ flexShrink: 0 }}>
                {formatBytes(a.size)}
              </Typography>
            </Row>
          )
        })}

        {links.map((l, i) => (
          <Row key={`${l.url}-${i}`} onRemove={() => onChange({ attachments, links: links.filter((_, j) => j !== i) })}>
            <LinkIcon sx={{ fontSize: 17, color: 'text.disabled' }} />
            <Typography fontSize="0.88rem" fontWeight={600} noWrap sx={{ flexGrow: 1, minWidth: 0 }}>
              {l.label}
            </Typography>
          </Row>
        ))}

        {uploading > 0 && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.2, py: 0.8 }}>
            <CircularProgress size={14} />
            <Typography fontSize="0.85rem" color="text.secondary">{uploading}개 올리는 중…</Typography>
          </Box>
        )}
      </Box>

      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
        <Button size="small" variant="outlined" startIcon={<AttachFileIcon />} onClick={() => fileInput.current?.click()}>
          파일 첨부
        </Button>
        <input ref={fileInput} type="file" multiple hidden onChange={handleFiles} />
        <TextField
          size="small" placeholder="링크 붙여넣기 (docs.google.com/...)" value={linkUrl}
          onChange={e => setLinkUrl(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addLink() } }}
          onBlur={addLink}
          sx={{ flexGrow: 1 }}
        />
      </Box>
      <Typography fontSize="0.75rem" color="text.secondary" sx={{ mt: 0.8 }}>
        한글·엑셀 등 20MB까지. 링크를 가진 사람은 로그인 없이도 열 수 있으니 고사 원안처럼 민감한 파일은 올리지 마세요.
      </Typography>
    </Box>
  )
}

/** 주소에서 보여줄 이름을 뽑는다 — 구글 문서면 'docs.google.com', 파일이면 파일명. */
function labelFromUrl(url) {
  try {
    const { hostname, pathname } = new URL(url)
    const last = pathname.split('/').filter(Boolean).pop()
    return last && last.includes('.') ? last : hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function Row({ children, onRemove }) {
  return (
    <Box sx={{
      display: 'flex', alignItems: 'center', gap: 1,
      px: 1.2, py: 0.8, borderRadius: 2,
      border: '1px solid', borderColor: 'divider',
    }}>
      {children}
      <IconButton size="small" onClick={onRemove} aria-label="제거" sx={{ flexShrink: 0 }}>
        <CloseIcon sx={{ fontSize: 16 }} />
      </IconButton>
    </Box>
  )
}
