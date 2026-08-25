/**
 * 캔버스 본문 편집기 — 업무 글 전용, Notion/Slack 캔버스 느낌.
 *
 * `RichTextEditor.jsx`를 포팅해 만들었다. 그 컴포넌트는 쪽지(`NoticeComposeModal.jsx`)도
 * 같이 쓰는데, 여기서 하려는 것(고정 툴바 제거, 선택하면 뜨는 서식 도구, 표·목차·삽입
 * 메뉴)은 업무 글 캔버스에만 맞는 변경이라 원본을 그대로 두고 갈래를 나눴다
 * (`PLAN_canvasEditor.md` "설계 원칙" 참고).
 *
 * 상단 고정 툴바를 없앤 이유: 서식 도구가 늘 떠 있으면 캔버스가 "입력 상자"처럼 보인다.
 * 대신 텍스트를 고르면(드래그 선택) 그 위에 작은 도구가 뜬다(Notion·Medium 방식) — 문단·
 * 단어·글자를 고쳐야 할 때만 도구가 나타나고 평소엔 흰 캔버스만 보인다.
 *
 * 테두리·헤더 바를 없앤 것도 같은 이유다. 스크롤도 이 컴포넌트 안에서 가두지 않는다 —
 * 상자 안에 또 스크롤이 생기면 그게 곧 "입력 상자"라는 신호가 된다. 부모(PostComposer)의
 * 캔버스 영역이 대신 스크롤한다.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import FormatBoldIcon from '@mui/icons-material/FormatBold'
import FormatItalicIcon from '@mui/icons-material/FormatItalic'
import FormatUnderlinedIcon from '@mui/icons-material/FormatUnderlined'
import StrikethroughSIcon from '@mui/icons-material/StrikethroughS'
import LinkIcon from '@mui/icons-material/Link'
import FormatColorTextIcon from '@mui/icons-material/FormatColorText'
import Popover from '@mui/material/Popover'
import SlashMenu from './SlashMenu'
import { useAuth } from '@shared/contexts/AuthContext'
import { isImageFile, uploadAttachment } from '@shared/lib/requestAttachments'
import { useToast } from './ToastProvider'
import { RICH_TEXT_SX } from './richTextStyles'

/** 글자색. 자유 선택기 대신 몇 가지만 둔다 — 종류가 많을수록 글이 알록달록해진다. */
const TEXT_COLORS = [
  { label: '기본', value: '#1f2937' },
  { label: '빨강 (중요)', value: '#d32f2f' },
  { label: '주황 (주의)', value: '#e65100' },
  { label: '파랑 (참고)', value: '#1565c0' },
  { label: '초록 (완료)', value: '#2e7d32' },
  { label: '회색 (보조)', value: '#6b7280' },
]

/** 선택한 글에만 거는 서식. 문단·목록 같은 블록 서식은 '/'·우클릭 메뉴 쪽 일이다. */
const BUBBLE_TOOLS = [
  { cmd: 'bold', label: '굵게 (⌘B)', Icon: FormatBoldIcon },
  { cmd: 'italic', label: '기울임 (⌘I)', Icon: FormatItalicIcon },
  { cmd: 'underline', label: '밑줄 (⌘U)', Icon: FormatUnderlinedIcon },
  { cmd: 'strikeThrough', label: '취소선', Icon: StrikethroughSIcon },
]

const BUBBLE_WIDTH = 232
const BUBBLE_HEIGHT = 40

export default function CanvasEditor({ docId, folder = 'requests', value, onChange, onImageUploaded, placeholder }) {
  const { schoolId } = useAuth()
  const toast = useToast()
  const editorRef = useRef(null)
  const fileInputRef = useRef(null)
  const [uploading, setUploading] = useState(0)
  const [colorAnchor, setColorAnchor] = useState(null)
  // 크기를 조절하려고 고른 이미지. 손잡이는 이 값이 있을 때만 그린다.
  const [picked, setPicked] = useState(null)   // { el, rect }
  // '/'를 친 위치와 그 뒤에 이어 친 글자. 메뉴를 고르면 이 구간을 지우고 블록을 넣는다.
  const [slash, setSlash] = useState(null)
  // 우클릭으로 연 서식 메뉴의 자리. 항목은 '/' 메뉴와 같고 여는 방법만 다르다.
  const [menuRect, setMenuRect] = useState(null)
  // 텍스트를 드래그로 고르면 그 위에 뜨는 작은 도구 — 문단·단어·글자 수정은 여기서 한다.
  const [bubble, setBubble] = useState(null)   // { rect }
  // 제목 기반 목차. { id, level, text }[] — id는 저장하지 않고 편집기 DOM에만 매길 때마다 다시 매긴다.
  const [headings, setHeadings] = useState([])

  /**
   * 목차를 다시 읽는다. 저장된 값이 아니라 **지금 화면의 DOM**에서 뽑는다 — 목차는 편집
   * 중에만 필요하고 읽기 화면(PostDetail)에는 요청되지 않아서, id를 본문에 박아 저장할
   * 이유가 없다. 앵커가 매번 새로 매겨져도 클릭한 순간 기준으로만 맞으면 충분하다.
   */
  const syncHeadings = useCallback(() => {
    const el = editorRef.current
    if (!el) { setHeadings([]); return }
    const nodes = [...el.querySelectorAll('h2,h3,h4')]
    setHeadings(nodes.map((node, i) => {
      const id = `h-${i}`
      node.id = id
      return { id, level: node.tagName, text: node.textContent.trim() || '(제목 없음)' }
    }))
  }, [])

  // 부모가 값을 바꿨을 때만 DOM에 밀어 넣는다. 타이핑 중에 덮어쓰면 커서가 맨 앞으로 튄다.
  useEffect(() => {
    const el = editorRef.current
    if (el && value !== el.innerHTML) el.innerHTML = value || ''
    syncHeadings()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const emit = useCallback(() => {
    onChange(editorRef.current?.innerHTML || '')
    syncHeadings()
  }, [onChange, syncHeadings])

  // 글을 고치면 이미지가 밀리므로 손잡이도 따라가야 한다 (measure가 위치를 다시 잰다).
  // 우클릭 메뉴는 글을 치기 시작하면 닫는다 — '/'와 달리 쳐서 좁힐 수 있는 메뉴가 아니다.
  const handleInput = () => { emit(); syncSlash(); measure(); setMenuRect(null) }

  const clipRect = useCallback(() => editorRef.current?.getBoundingClientRect() || null, [])

  /** 고른 이미지의 화면 위치를 다시 잰다 — 스크롤·창 크기·크기 조절 후 손잡이를 따라 붙인다. */
  const measure = useCallback(() => {
    setPicked(prev => {
      if (!prev?.el?.isConnected) return null
      return { el: prev.el, rect: prev.el.getBoundingClientRect(), clip: clipRect() }
    })
  }, [clipRect])

  const pickImage = (img) => {
    setPicked({ el: img, rect: img.getBoundingClientRect(), clip: clipRect() })
  }

  // 이미지를 누르면 고르고, 다른 곳을 누르면 푼다
  const handleEditorClick = (e) => {
    if (e.target?.tagName === 'IMG') {
      pickImage(e.target)
    } else {
      setPicked(null)
      syncSlash()
    }
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
      rect: rect.width || rect.height ? rect : editorRef.current.getBoundingClientRect(),
    })
  }

  /**
   * 드래그로 고른 글 위에 서식 도구를 띄운다.
   *
   * selectionchange는 표준 이벤트라 마우스든 키보드(Shift+화살표)든 똑같이 잡힌다.
   * 에디터 밖에서 고른 글(예: 옆 패널 텍스트)에는 뜨면 안 되므로 range가 에디터 안에
   * 있는지 확인한다.
   */
  useEffect(() => {
    const onSelectionChange = () => {
      const sel = window.getSelection()
      const el = editorRef.current
      if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !el || !el.isConnected) {
        setBubble(null)
        return
      }
      const range = sel.getRangeAt(0)
      if (!el.contains(range.commonAncestorContainer)) { setBubble(null); return }
      const rect = range.getBoundingClientRect()
      if (!rect.width && !rect.height) { setBubble(null); return }
      setBubble({ rect })
    }
    document.addEventListener('selectionchange', onSelectionChange)
    return () => document.removeEventListener('selectionchange', onSelectionChange)
  }, [])

  const LINE_BLOCKS = 'p,h1,h2,h3,h4,div,li,blockquote,pre,aside,summary'
  const BOX_BLOCKS = 'aside'
  const LIST_TAGS = { insertUnorderedList: 'UL', insertOrderedList: 'OL' }

  const readLine = () => {
    const el = editorRef.current
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return null

    const node = sel.anchorNode
    const host = node?.nodeType === Node.TEXT_NODE ? node.parentElement : node
    const block = host && host !== el ? host.closest(LINE_BLOCKS) : null
    const text = block ? block.textContent : (node?.textContent || '')
    return { sel, block, isEmpty: !text.trim() }
  }

  const placeAtEmptyLine = (block, nodes) => {
    const el = editorRef.current
    const sel = window.getSelection()

    if (block?.tagName === 'LI') {
      const list = block.parentElement
      block.remove()
      list.after(nodes)
      if (!list.childElementCount) list.remove()
    } else if (block && block !== el) {
      block.replaceWith(nodes)
    } else {
      sel.getRangeAt(0).insertNode(nodes)
    }
  }

  const putCaretIn = (target, atEnd = false) => {
    const sel = window.getSelection()
    const range = document.createRange()
    range.selectNodeContents(target)
    range.collapse(!atEnd)
    sel.removeAllRanges()
    sel.addRange(range)
  }

  const applyHtml = (html, caret) => {
    const line = readLine()
    if (!line) return

    const template = document.createElement('template')
    template.innerHTML = html
    const inner = caret ? template.content.querySelector(caret) : null
    const blocks = [...template.content.children]
    const last = blocks[blocks.length - 1]

    if (!line.isEmpty) {
      const sel = window.getSelection()
      if (sel && !sel.isCollapsed) sel.collapseToEnd()
      document.execCommand('insertHTML', false, html)
      return
    }

    placeAtEmptyLine(line.block, template.content)
    const target = inner || last
    if (target) putCaretIn(target, !!inner)
  }

  const applyList = (cmd) => {
    const line = readLine()
    if (!line) return

    if (!line.isEmpty) {
      document.execCommand(cmd, false, null)
      return
    }

    const list = document.createElement(LIST_TAGS[cmd])
    const item = document.createElement('li')
    item.appendChild(document.createElement('br'))
    list.appendChild(item)

    placeAtEmptyLine(line.block, list)
    putCaretIn(item)
  }

  const applyBlock = (tag) => {
    const line = readLine()
    if (!line) return

    const box = line.block?.matches?.(BOX_BLOCKS) ? line.block : null
    if (box) {
      const created = document.createElement(tag)
      created.append(...box.childNodes)
      if (!created.hasChildNodes()) created.appendChild(document.createElement('br'))
      box.appendChild(created)
      putCaretIn(created, true)
      return
    }

    if (!line.isEmpty) {
      document.execCommand('formatBlock', false, tag)
      return
    }

    const created = document.createElement(tag)
    created.appendChild(document.createElement('br'))

    placeAtEmptyLine(line.block, created)
    putCaretIn(created)
  }

  const EXIT_ON_ENTER = 'h1,h2,h3,h4,blockquote'

  const handleKeyDown = (e) => {
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return

    const line = readLine()
    const block = line?.block?.closest(EXIT_ON_ENTER)
    if (!block) return

    const sel = window.getSelection()
    const rest = document.createRange()
    rest.selectNodeContents(block)
    rest.setStart(sel.anchorNode, sel.anchorOffset)
    if (rest.toString().trim()) return

    const paragraph = document.createElement('p')
    paragraph.appendChild(document.createElement('br'))
    block.after(paragraph)
    putCaretIn(paragraph)
    e.preventDefault()
    emit()
  }

  const applySlash = (item) => {
    const el = editorRef.current
    el?.focus()

    const found = readSlashQuery()
    if (found) {
      const sel = window.getSelection()
      const range = document.createRange()
      range.setStart(sel.anchorNode, Math.max(0, sel.anchorOffset - found.length))
      range.setEnd(sel.anchorNode, sel.anchorOffset)
      range.deleteContents()
      sel.removeAllRanges()
      sel.addRange(range)
    }
    setSlash(null)
    setMenuRect(null)

    if (item.action === 'image') { fileInputRef.current?.click(); return }
    if (item.cmd) {
      if (LIST_TAGS[item.cmd]) applyList(item.cmd)
      else document.execCommand(item.cmd, false, null)
    }
    else if (item.block) applyBlock(item.block)
    else if (item.html) applyHtml(item.html, item.caret)
    emit()
  }

  const handleContextMenu = (e) => {
    e.preventDefault()
    setSlash(null)
    setMenuRect({ top: e.clientY, bottom: e.clientY, left: e.clientX, right: e.clientX, width: 0, height: 0 })
  }

  useEffect(() => {
    if (!menuRect) return
    const close = () => setMenuRect(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [menuRect])

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
      toast.error(`이미지를 올리지 못했습니다: ${e.message}`, e)
    } finally {
      setUploading(n => n - 1)
    }
  }, [schoolId, docId, folder, emit, onImageUploaded, toast])

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

  const addLink = () => {
    const url = window.prompt('링크 주소를 입력하세요', 'https://')
    if (!url || url === 'https://') return
    const safe = /^https?:\/\//i.test(url) ? url : `https://${url}`
    editorRef.current?.focus()
    document.execCommand('createLink', false, safe)
    emit()
  }

  // 버블 도구는 화면 폭을 넘기지 않게 자리를 맞춘다 — SlashMenu의 위치 계산과 같은 방식.
  const bubbleStyle = bubble ? {
    top: Math.max(8, bubble.rect.top - BUBBLE_HEIGHT - 8),
    left: Math.min(
      Math.max(8, bubble.rect.left + bubble.rect.width / 2 - BUBBLE_WIDTH / 2),
      window.innerWidth - BUBBLE_WIDTH - 8,
    ),
  } : null

  const jumpToHeading = (id) => {
    editorRef.current?.querySelector(`#${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
      {/* 제목 기반 목차 — 제목이 하나도 없으면 아예 안 그린다. 늘 자리를 차지하면
          짧은 글을 쓰는 사람에게는 빈 칼럼만 남는다. 스크롤은 부모가 하므로 sticky로
          붙여 두면 긴 글에서도 계속 보인다. */}
      {headings.length > 0 && (
        <Box sx={{
          width: 168, flexShrink: 0, position: 'sticky', top: 8,
          display: 'flex', flexDirection: 'column', gap: 0.2, pt: 1,
        }}>
          <Typography fontSize="0.7rem" fontWeight={800} color="text.disabled" sx={{ mb: 0.3, pl: 0.8 }}>
            목차
          </Typography>
          {headings.map(h => (
            <Box
              key={h.id}
              component="button"
              type="button"
              onClick={() => jumpToHeading(h.id)}
              sx={{
                display: 'block', width: '100%', textAlign: 'left',
                border: 0, background: 'none', cursor: 'pointer', fontFamily: 'inherit',
                borderRadius: 0.75, px: 0.8, py: 0.35,
                pl: h.level === 'H2' ? 0.8 : h.level === 'H3' ? 1.8 : 2.8,
                fontSize: h.level === 'H2' ? '0.8rem' : '0.76rem',
                fontWeight: h.level === 'H2' ? 700 : 500,
                color: 'text.secondary',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                '&:hover': { bgcolor: 'action.hover', color: 'text.primary' },
              }}
            >
              {h.text}
            </Box>
          ))}
        </Box>
      )}

      <Box sx={{ position: 'relative', flexGrow: 1, minWidth: 0 }}>
      <Box
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onBlur={emit}
        onKeyDown={handleKeyDown}
        onKeyUp={syncSlash}
        onClick={handleEditorClick}
        onContextMenu={handleContextMenu}
        onCompositionEnd={syncSlash}
        onPaste={handlePaste}
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
        data-placeholder={placeholder}
        sx={{
          minHeight: 320, px: { xs: 0, sm: 1 }, py: 1,
          fontSize: '0.95rem', lineHeight: 1.8,
          outline: 'none', bgcolor: 'background.paper',
          '&:empty::before': {
            content: 'attr(data-placeholder)',
            color: 'text.disabled',
          },
          ...RICH_TEXT_SX,
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

      {uploading > 0 && (
        <Typography fontSize="0.75rem" color="text.secondary" sx={{ mt: 0.5 }}>
          이미지 {uploading}개 올리는 중…
        </Typography>
      )}

      {/* 드래그로 고른 글 위에 뜨는 서식 도구. 마우스가 선택을 놓지 않도록 mousedown에서
          기본 동작을 막는다 — 안 막으면 버튼을 누르는 순간 선택이 풀려 아무 글자에도
          서식이 걸리지 않는다. */}
      {bubbleStyle && (
        <Paper
          elevation={6}
          onMouseDown={e => e.preventDefault()}
          sx={{
            position: 'fixed', top: bubbleStyle.top, left: bubbleStyle.left,
            width: BUBBLE_WIDTH, zIndex: 1300,
            display: 'flex', alignItems: 'center', gap: 0.1, px: 0.4, py: 0.3,
            border: '1px solid', borderColor: 'divider', borderRadius: 1.5,
          }}
        >
          {BUBBLE_TOOLS.map(tool => (
            <Tooltip key={tool.cmd} title={tool.label}>
              <IconButton size="small" onClick={() => exec(tool.cmd)}>
                <tool.Icon sx={{ fontSize: 17 }} />
              </IconButton>
            </Tooltip>
          ))}
          <Tooltip title="글자색">
            <IconButton size="small" onClick={e => setColorAnchor(e.currentTarget)}>
              <FormatColorTextIcon sx={{ fontSize: 17 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="링크">
            <IconButton size="small" onClick={addLink}>
              <LinkIcon sx={{ fontSize: 17 }} />
            </IconButton>
          </Tooltip>
        </Paper>
      )}

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

      <SlashMenu
        open={!!slash || !!menuRect}
        anchorRect={slash?.rect || menuRect}
        query={slash?.query}
        onSelect={applySlash}
        onClose={() => { setSlash(null); setMenuRect(null) }}
      />
      </Box>
    </Box>
  )
}
