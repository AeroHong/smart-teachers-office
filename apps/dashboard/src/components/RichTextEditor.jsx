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
import FormatColorTextIcon from '@mui/icons-material/FormatColorText'
import Popover from '@mui/material/Popover'
import SlashMenu from './SlashMenu'
import { useAuth } from '@shared/contexts/AuthContext'
import { isImageFile, uploadAttachment } from '@shared/lib/requestAttachments'
import { useToast } from './ToastProvider'

/**
 * 글자색. 자유 선택기 대신 몇 가지만 둔다 — 업무 안내에서 색은 강조 수단이라
 * 종류가 많을수록 글이 알록달록해지고 정작 중요한 것이 묻힌다.
 */
const TEXT_COLORS = [
  { label: '기본', value: '#1f2937' },
  { label: '빨강 (중요)', value: '#d32f2f' },
  { label: '주황 (주의)', value: '#e65100' },
  { label: '파랑 (참고)', value: '#1565c0' },
  { label: '초록 (완료)', value: '#2e7d32' },
  { label: '회색 (보조)', value: '#6b7280' },
]

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
  const [colorAnchor, setColorAnchor] = useState(null)
  // '/'를 친 위치와 그 뒤에 이어 친 글자. 메뉴를 고르면 이 구간을 지우고 블록을 넣는다.
  const [slash, setSlash] = useState(null)

  // 부모가 값을 바꿨을 때만 DOM에 밀어 넣는다. 타이핑 중에 덮어쓰면 커서가 맨 앞으로 튄다.
  useEffect(() => {
    const el = editorRef.current
    if (el && value !== el.innerHTML) el.innerHTML = value || ''
  }, [value])

  const emit = useCallback(() => {
    onChange(editorRef.current?.innerHTML || '')
  }, [onChange])

  const handleInput = () => { emit(); syncSlash() }

  const exec = (cmd, value = null) => {
    editorRef.current?.focus()
    document.execCommand(cmd, false, value)
    emit()
  }

  /** 커서 바로 앞 텍스트에서 '/…' 조각을 찾는다. 줄 처음이나 공백 뒤일 때만 명령으로 본다. */
  const readSlashQuery = () => {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return null
    const node = sel.anchorNode
    if (!node || node.nodeType !== Node.TEXT_NODE) return null
    const before = node.textContent.slice(0, sel.anchorOffset)
    const m = /(?:^|\s)\/([^\s/]*)$/.exec(before)
    if (!m) return null
    return { query: m[1], length: m[1].length + 1 }
  }

  const syncSlash = () => {
    const found = readSlashQuery()
    if (!found) return setSlash(null)
    const rect = window.getSelection().getRangeAt(0).getBoundingClientRect()
    setSlash({
      query: found.query,
      length: found.length,
      // 빈 텍스트 노드에서는 rect가 0이라 편집기 왼쪽 위를 대신 쓴다
      rect: rect.width || rect.height ? rect : editorRef.current.getBoundingClientRect(),
    })
  }

  /** 메뉴에서 고른 블록을 넣는다. 먼저 '/질문' 글자를 지운다. */
  const applySlash = (item) => {
    const el = editorRef.current
    el?.focus()
    for (let i = 0; i < (slash?.length || 0); i++) document.execCommand('delete', false, null)
    setSlash(null)

    if (item.action === 'image') { fileInputRef.current?.click(); return }
    if (item.cmd) document.execCommand(item.cmd, false, null)
    else if (item.block) document.execCommand('formatBlock', false, item.block)
    else if (item.html) document.execCommand('insertHTML', false, item.html)
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
        <Tooltip title="글자색">
          <IconButton size="small" onMouseDown={e => e.preventDefault()} onClick={e => setColorAnchor(e.currentTarget)}>
            <FormatColorTextIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
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
        onInput={handleInput}
        onBlur={emit}
        onKeyUp={syncSlash}
        onClick={syncSlash}
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
          '& h2': { fontSize: '1.15rem', fontWeight: 800, m: '0.6em 0 0.2em' },
          '& h3': { fontSize: '1rem', fontWeight: 700, m: '0.5em 0 0.2em' },
          '& blockquote': {
            m: '0.4em 0', pl: 1.5, borderLeft: '3px solid', borderColor: 'divider',
            color: 'text.secondary',
          },
          '& hr': { border: 0, borderTop: '1px solid', borderColor: 'divider', my: 1.5 },
          '& details': {
            my: 0.6, p: 1, borderRadius: 1, border: '1px solid', borderColor: 'divider',
          },
          '& summary': { cursor: 'pointer', fontWeight: 700 },
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

      <Popover
        open={!!colorAnchor}
        anchorEl={colorAnchor}
        onClose={() => setColorAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Box sx={{ p: 0.5 }}>
          {TEXT_COLORS.map(c => (
            <Box
              key={c.value}
              onMouseDown={e => e.preventDefault()}
              onClick={() => { exec('foreColor', c.value); setColorAnchor(null) }}
              sx={{
                display: 'flex', alignItems: 'center', gap: 1,
                px: 1.2, py: 0.6, cursor: 'pointer', borderRadius: 0.75,
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              <Box sx={{ width: 14, height: 14, borderRadius: '50%', bgcolor: c.value, flexShrink: 0 }} />
              <Typography fontSize="0.83rem">{c.label}</Typography>
            </Box>
          ))}
        </Box>
      </Popover>

      <SlashMenu
        open={!!slash}
        anchorRect={slash?.rect}
        query={slash?.query}
        onSelect={applySlash}
        onClose={() => setSlash(null)}
      />
    </Box>
  )
}
