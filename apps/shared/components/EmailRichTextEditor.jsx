/**
 * 이메일 발송 전용 경량 본문 편집기.
 *
 * apps/dashboard/src/components/RichTextEditor.jsx를 바탕으로 만들되, SlashMenu(콜아웃·
 * 토글·표·날짜칩 등 캔버스 전용 블록)를 걷어냈다. 그 블록들은 CSS 클래스 기반 스타일이라
 * 이메일 클라이언트에서 깨지고, 애초에 대시보드 전용 컴포넌트라 apps/portal이 직접
 * import할 수도 없다. 굵게·기울임·밑줄·취소선·목록·글자색·링크·이미지만 남긴다 —
 * 이메일 본문에 필요한 서식은 이 정도로 충분하다.
 *
 * 이미지는 붙여넣기·드래그·버튼 어느 쪽으로 넣어도 즉시 Storage에 올라가고, 본문에는
 * 다운로드 주소만 들어간다(RichTextEditor.jsx와 동일한 관례).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import Popover from '@mui/material/Popover'
import FormatBoldIcon from '@mui/icons-material/FormatBold'
import FormatItalicIcon from '@mui/icons-material/FormatItalic'
import FormatUnderlinedIcon from '@mui/icons-material/FormatUnderlined'
import StrikethroughSIcon from '@mui/icons-material/StrikethroughS'
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted'
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered'
import LinkIcon from '@mui/icons-material/Link'
import ImageIcon from '@mui/icons-material/Image'
import FormatColorTextIcon from '@mui/icons-material/FormatColorText'
import { isImageFile, uploadAttachment } from '@shared/lib/requestAttachments'

/** 이메일 본문에서 실제로 쓰이는 태그만 최소한으로 꾸민다 — richTextStyles.js의 축소판. */
const EMAIL_RICH_TEXT_SX = {
  '& img': { maxWidth: '100%', borderRadius: 1, my: 0.5 },
  '& ul, & ol': { pl: 3, my: 0.5 },
  '& a': { color: 'primary.main' },
  '& p': { m: '0 0 0.6em' },
}

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

export default function EmailRichTextEditor({ schoolId, docId, folder = 'emails', value, onChange, onImageUploaded, onError, placeholder }) {
  const editorRef = useRef(null)
  const fileInputRef = useRef(null)
  const [uploading, setUploading] = useState(0)
  const [colorAnchor, setColorAnchor] = useState(null)
  const [picked, setPicked] = useState(null) // { el, rect, clip } — 크기 조절 중인 이미지
  const [linkPopover, setLinkPopover] = useState(null) // { rect, url }
  const savedRangeRef = useRef(null)

  // 부모가 값을 바꿨을 때만 DOM에 밀어 넣는다. 타이핑 중에 덮어쓰면 커서가 맨 앞으로 튄다.
  useEffect(() => {
    const el = editorRef.current
    if (el && value !== el.innerHTML) el.innerHTML = value || ''
  }, [value])

  const emit = useCallback(() => {
    onChange(editorRef.current?.innerHTML || '')
  }, [onChange])

  const clipRect = useCallback(() => editorRef.current?.getBoundingClientRect() || null, [])

  const measure = useCallback(() => {
    setPicked(prev => {
      if (!prev?.el?.isConnected) return null
      return { el: prev.el, rect: prev.el.getBoundingClientRect(), clip: clipRect() }
    })
  }, [clipRect])

  const pickImage = (img) => {
    setPicked({ el: img, rect: img.getBoundingClientRect(), clip: clipRect() })
  }

  const handleEditorClick = (e) => {
    if (e.target?.tagName === 'IMG') pickImage(e.target)
    else setPicked(null)
  }

  useEffect(() => {
    if (!picked) return
    const el = editorRef.current
    window.addEventListener('resize', measure)
    el?.addEventListener('scroll', measure)
    return () => {
      window.removeEventListener('resize', measure)
      el?.removeEventListener('scroll', measure)
    }
  }, [picked, measure])

  const startResize = (e) => {
    e.preventDefault()
    e.stopPropagation()
    const img = picked?.el
    if (!img) return

    const startX = e.clientX
    const startWidth = img.getBoundingClientRect().width
    const maxWidth = editorRef.current?.clientWidth || 900

    const onMove = (ev) => {
      const next = Math.round(Math.min(maxWidth, Math.max(80, startWidth + (ev.clientX - startX))))
      img.setAttribute('width', String(next))
      img.style.width = ''
      measure()
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      emit()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const setImageWidth = (ratio) => {
    const img = picked?.el
    if (!img) return
    const box = editorRef.current?.clientWidth || 900
    if (ratio === null) img.removeAttribute('width')
    else img.setAttribute('width', String(Math.round(box * ratio)))
    img.style.width = ''
    measure()
    emit()
  }

  const exec = (cmd, value = null) => {
    editorRef.current?.focus()
    document.execCommand(cmd, false, value)
    emit()
  }

  const insertImage = useCallback(async (file) => {
    setUploading(n => n + 1)
    try {
      const uploaded = await uploadAttachment({ schoolId, docId, folder, file })
      editorRef.current?.focus()
      document.execCommand('insertHTML', false,
        `<img src="${uploaded.url}" alt="${(file.name || '이미지').replace(/"/g, '')}" /><br/>`)
      emit()
      onImageUploaded?.(uploaded)
    } catch (e) {
      onError?.(e)
    } finally {
      setUploading(n => n - 1)
    }
  }, [schoolId, docId, folder, emit, onImageUploaded, onError])

  const handleFiles = (files) => {
    [...files].filter(isImageFile).forEach(insertImage)
  }

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

  const openLinkPopover = () => {
    const sel = window.getSelection()
    const range = sel?.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null
    savedRangeRef.current = range
    const rect = range?.getBoundingClientRect() || editorRef.current?.getBoundingClientRect()
    setLinkPopover({ rect, url: 'https://' })
  }

  const confirmLinkPopover = () => {
    const raw = (linkPopover?.url || '').trim()
    if (!raw || raw === 'https://') { setLinkPopover(null); return }
    const safe = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
    editorRef.current?.focus()
    const sel = window.getSelection()
    if (savedRangeRef.current) {
      sel.removeAllRanges()
      sel.addRange(savedRangeRef.current)
    }
    document.execCommand('createLink', false, safe)
    setLinkPopover(null)
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
          <IconButton size="small" onMouseDown={e => e.preventDefault()} onClick={openLinkPopover}>
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
        onClick={handleEditorClick}
        onPaste={handlePaste}
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
        data-placeholder={placeholder}
        sx={{
          minHeight: 220, maxHeight: '46vh', overflowY: 'auto',
          px: 1.5, py: 1.2, fontSize: '0.93rem', lineHeight: 1.7,
          outline: 'none',
          '&:empty::before': {
            content: 'attr(data-placeholder)',
            color: 'text.disabled',
          },
          ...EMAIL_RICH_TEXT_SX,
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

      <Popover
        open={!!linkPopover}
        anchorReference="anchorPosition"
        anchorPosition={linkPopover ? { top: linkPopover.rect.bottom, left: linkPopover.rect.left } : undefined}
        onClose={() => setLinkPopover(null)}
      >
        <Box sx={{ p: 1.2, display: 'flex', gap: 0.8, alignItems: 'center' }}>
          <TextField
            size="small" autoFocus placeholder="https://..."
            value={linkPopover?.url || ''}
            onChange={e => setLinkPopover(p => ({ ...p, url: e.target.value }))}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); confirmLinkPopover() } }}
          />
          <Button size="small" variant="contained" onClick={confirmLinkPopover}>
            링크 추가
          </Button>
        </Box>
      </Popover>

      {picked?.clip && (
        <Box sx={{
          position: 'fixed',
          top: picked.clip.top, left: picked.clip.left,
          width: picked.clip.width, height: picked.clip.height,
          overflow: 'hidden', pointerEvents: 'none', zIndex: 1300,
        }}>
          <Box sx={{
            position: 'absolute',
            top: picked.rect.top - picked.clip.top,
            left: picked.rect.left - picked.clip.left,
            width: picked.rect.width, height: picked.rect.height,
            border: '2px solid', borderColor: 'primary.main', borderRadius: 1,
          }} />
          <Box
            onPointerDown={startResize}
            sx={{
              position: 'absolute',
              top: picked.rect.bottom - picked.clip.top - 7,
              left: picked.rect.right - picked.clip.left - 7,
              width: 14, height: 14, borderRadius: '50%',
              bgcolor: 'primary.main', border: '2px solid #fff',
              cursor: 'nwse-resize', pointerEvents: 'auto',
            }}
          />
          <Box sx={{
            position: 'absolute',
            top: Math.max(4, picked.rect.top - picked.clip.top - 34),
            left: picked.rect.left - picked.clip.left + 4,
            display: 'flex', gap: 0.3, p: 0.3, borderRadius: 1,
            bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider',
            boxShadow: 2, pointerEvents: 'auto',
          }}>
            {[['작게', 0.3], ['보통', 0.6], ['넓게', 1], ['원본', null]].map(([label, ratio]) => (
              <Box
                key={label}
                onMouseDown={e => { e.preventDefault(); setImageWidth(ratio) }}
                sx={{
                  px: 0.9, py: 0.3, fontSize: '0.75rem', fontWeight: 600,
                  cursor: 'pointer', borderRadius: 0.75,
                  '&:hover': { bgcolor: 'action.hover' },
                }}
              >
                {label}
              </Box>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  )
}
