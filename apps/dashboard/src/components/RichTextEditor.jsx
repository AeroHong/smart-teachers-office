/**
 * 본문 편집기 — 서식과 이미지.
 *
 * 게시판 글쓰기에서 기대하는 최소한만 담는다. 굵게·기울임·밑줄·취소선, 목록, 링크,
 * 그리고 이미지. 학교에서 안내를 쓸 때 실제로 쓰는 것들이다.
 *
 * 편집기 라이브러리를 넣지 않고 contentEditable + execCommand로 만들었다. 번들이 이미
 * 1MB인데 ProseMirror 계열을 얹으면 40%가 더 늘고, 여기서 필요한 기능은 그 무게를
 * 정당화하지 못한다. execCommand는 표준에서 폐기 예정이라고 표시돼 있지만 모든 브라우저가
 * 지원하며 제거 계획은 없다 — 교내 도구 수명 안에서는 문제되지 않는다.
 *
 * 이미지는 붙여넣기·드래그·버튼 어느 쪽으로 넣어도 즉시 Storage에 올라간다. 본문에는
 * 다운로드 주소만 들어간다. 화면 캡처를 그냥 붙여넣는 게 제일 흔한 사용법이라 그 경로를
 * 우선으로 잡았다.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import FormatBoldIcon from '@mui/icons-material/FormatBold'
import FormatItalicIcon from '@mui/icons-material/FormatItalic'
import FormatUnderlinedIcon from '@mui/icons-material/FormatUnderlined'
import StrikethroughSIcon from '@mui/icons-material/StrikethroughS'
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted'
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered'
import LinkIcon from '@mui/icons-material/Link'
import ImageIcon from '@mui/icons-material/Image'
import { useAuth } from '@shared/contexts/AuthContext'
import { isImageFile, uploadAttachment } from '@shared/lib/requestAttachments'
import { useToast } from './ToastProvider'

const TOOLS = [
  { cmd: 'bold', label: '굵게 (⌘B)', Icon: FormatBoldIcon },
  { cmd: 'italic', label: '기울임 (⌘I)', Icon: FormatItalicIcon },
  { cmd: 'underline', label: '밑줄 (⌘U)', Icon: FormatUnderlinedIcon },
  { cmd: 'strikeThrough', label: '취소선', Icon: StrikethroughSIcon },
  { divider: true },
  { cmd: 'insertUnorderedList', label: '글머리 기호', Icon: FormatListBulletedIcon },
  { cmd: 'insertOrderedList', label: '번호 매기기', Icon: FormatListNumberedIcon },
]

export default function RichTextEditor({ requestId, value, onChange, onImageUploaded, placeholder }) {
  const { schoolId } = useAuth()
  const toast = useToast()
  const editorRef = useRef(null)
  const fileInputRef = useRef(null)
  const [uploading, setUploading] = useState(0)

  // 부모가 값을 바꿨을 때만 DOM에 밀어 넣는다. 타이핑 중에 덮어쓰면 커서가 맨 앞으로 튄다.
  useEffect(() => {
    const el = editorRef.current
    if (el && value !== el.innerHTML) el.innerHTML = value || ''
  }, [value])

  const emit = useCallback(() => {
    onChange(editorRef.current?.innerHTML || '')
  }, [onChange])

  const exec = (cmd) => {
    editorRef.current?.focus()
    document.execCommand(cmd, false, null)
    emit()
  }

  const insertImage = useCallback(async (file) => {
    setUploading(n => n + 1)
    try {
      const uploaded = await uploadAttachment({ schoolId, requestId, file })
      editorRef.current?.focus()
      document.execCommand('insertHTML', false,
        `<img src="${uploaded.url}" alt="${(file.name || '이미지').replace(/"/g, '')}" /><br/>`)
      emit()
      // 글을 버리고 나갈 때 지울 수 있게 부모에게 경로를 알린다
      onImageUploaded?.(uploaded)
    } catch (e) {
      toast.error(`이미지를 올리지 못했습니다: ${e.message}`, e)
    } finally {
      setUploading(n => n - 1)
    }
  }, [schoolId, requestId, emit, onImageUploaded, toast])

  const handleFiles = (files) => {
    [...files].filter(isImageFile).forEach(insertImage)
  }

  // 붙여넣기는 두 가지를 처리한다 — 이미지는 올리고, 글은 서식을 벗겨 넣는다.
  // 한글이나 웹에서 복사하면 원래 글꼴·색·표가 통째로 따라와 글이 깨진다.
  const handlePaste = (e) => {
    const files = [...(e.clipboardData?.files || [])].filter(isImageFile)
    if (files.length > 0) {
      e.preventDefault()
      files.forEach(insertImage)
      return
    }
    e.preventDefault()
    const text = e.clipboardData?.getData('text/plain') || ''
    document.execCommand('insertText', false, text)
    emit()
  }

  const handleDrop = (e) => {
    const files = [...(e.dataTransfer?.files || [])].filter(isImageFile)
    if (files.length === 0) return
    e.preventDefault()
    files.forEach(insertImage)
  }

  const addLink = () => {
    const url = window.prompt('링크 주소를 입력하세요', 'https://')
    if (!url || url === 'https://') return
    const safe = /^https?:\/\//i.test(url) ? url : `https://${url}`
    editorRef.current?.focus()
    document.execCommand('createLink', false, safe)
    emit()
  }

  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 0.2, flexWrap: 'wrap',
        px: 0.6, py: 0.35, borderBottom: '1px solid', borderColor: 'divider',
        bgcolor: 'background.default',
      }}>
        {TOOLS.map((tool, i) => tool.divider ? (
          <Divider key={`d${i}`} orientation="vertical" flexItem sx={{ mx: 0.5, my: 0.6 }} />
        ) : (
          <Tooltip key={tool.cmd} title={tool.label}>
            <IconButton size="small" onMouseDown={e => e.preventDefault()} onClick={() => exec(tool.cmd)}>
              <tool.Icon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        ))}
        <Divider orientation="vertical" flexItem sx={{ mx: 0.5, my: 0.6 }} />
        <Tooltip title="링크">
          <IconButton size="small" onMouseDown={e => e.preventDefault()} onClick={addLink}>
            <LinkIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="이미지 (붙여넣기·끌어놓기도 됩니다)">
          <IconButton size="small" onMouseDown={e => e.preventDefault()} onClick={() => fileInputRef.current?.click()}>
            <ImageIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
        {uploading > 0 && (
          <Typography fontSize="0.75rem" color="text.secondary" sx={{ ml: 0.5 }}>
            이미지 {uploading}개 올리는 중…
          </Typography>
        )}
      </Box>

      <Box
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={emit}
        onBlur={emit}
        onPaste={handlePaste}
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
        data-placeholder={placeholder}
        sx={{
          minHeight: 260, maxHeight: '46vh', overflowY: 'auto',
          px: 1.5, py: 1.2, fontSize: '0.93rem', lineHeight: 1.7,
          outline: 'none',
          '&:empty::before': {
            content: 'attr(data-placeholder)',
            color: 'text.disabled',
          },
          '& img': { maxWidth: '100%', borderRadius: 1, my: 0.5 },
          '& ul, & ol': { pl: 3, my: 0.5 },
          '& a': { color: 'primary.main' },
          '& p': { m: 0 },
        }}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={e => { handleFiles(e.target.files); e.target.value = '' }}
      />
    </Box>
  )
}
