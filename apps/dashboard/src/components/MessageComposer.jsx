/**
 * 채널 메시지 입력칸 — 고정 툴바 + #채널 · @사람 · + 첨부(Slack 스타일).
 *
 * RichTextEditor.jsx(쪽지용)를 뼈대로 삼았다 — contentEditable + execCommand로
 * 서식을 넣는 같은 방식이고, 위에 항상 떠 있는 툴바도 같다. 그대로 쓰지 않고 새로
 * 만든 이유는 그 편집기가 최소 260px짜리 "글쓰기" 화면이라 채팅 입력칸에 안 맞고,
 * Enter=보내기·`#`·`@` 트리거·첨부 메뉴가 없기 때문이다. CanvasEditor.jsx(선택하면
 * 뜨는 버블 툴바)와는 아예 다른 화면이라 — 그쪽은 캔버스 전용으로 그대로 둔다
 * (사용자 구분, 2026-08-26: "캔버스에서의 편집과 메시지에서의 기능은 다르다").
 *
 * `#`·`@`는 SlashMenu와 같은 패턴(MentionMenu.jsx)이다 — 커서 위치를 잰 뒤 그
 * 자리에 뜨는 자동완성. 고르면 클릭 가능한 인라인 조각을 심는다(channelMentionChip.js).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import Popover from '@mui/material/Popover'
import Tooltip from '@mui/material/Tooltip'
import AddIcon from '@mui/icons-material/Add'
import AlternateEmailIcon from '@mui/icons-material/AlternateEmail'
import CodeIcon from '@mui/icons-material/Code'
import FormatBoldIcon from '@mui/icons-material/FormatBold'
import FormatItalicIcon from '@mui/icons-material/FormatItalic'
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted'
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered'
import FormatUnderlinedIcon from '@mui/icons-material/FormatUnderlined'
import InsertEmoticonIcon from '@mui/icons-material/InsertEmoticonOutlined'
import LinkIcon from '@mui/icons-material/Link'
import SendIcon from '@mui/icons-material/Send'
import StrikethroughSIcon from '@mui/icons-material/StrikethroughS'
import { channelMentionHtml, userMentionHtml } from '@shared/lib/channelMentionChip'
import MentionMenu from './MentionMenu'
import { RICH_TEXT_SX } from './richTextStyles'

const TOOLS = [
  { cmd: 'bold', label: '굵게', Icon: FormatBoldIcon },
  { cmd: 'italic', label: '기울임', Icon: FormatItalicIcon },
  { cmd: 'underline', label: '밑줄', Icon: FormatUnderlinedIcon },
  { cmd: 'strikeThrough', label: '취소선', Icon: StrikethroughSIcon },
  { divider: true },
  { cmd: 'insertUnorderedList', label: '글머리 기호', Icon: FormatListBulletedIcon },
  { cmd: 'insertOrderedList', label: '번호 매기기', Icon: FormatListNumberedIcon },
]

/** 메시지에 끼워 넣을 이모지 — 검색·카테고리 탭 없는 고정 그리드(TEXT_COLORS·
 *  CALLOUT_COLORS처럼 이 코드베이스가 이미 쓰는 "몇 가지만 고정" 방식). 라이브러리
 *  없이 자주 쓰는 것만 직접 나열한다 — 표정 12 · 손동작 6 · 하트 6 · 기호 6, 5×6 그리드. */
const EMOJI_PICKER_ITEMS = [
  '😀', '😂', '😊', '😍', '🥲', '😢',
  '😮', '😅', '🤔', '😴', '😎', '🙄',
  '👍', '👎', '👏', '🙌', '🙏', '💪',
  '❤️', '💛', '💚', '💙', '💜', '🖤',
  '🎉', '🔥', '✨', '💯', '✅', '❌',
]

export default function MessageComposer({
  value, onChange, onSubmit, disabled,
  channels = [], members = [], placeholder = '메시지를 입력하세요',
  onPlusClick,
}) {
  const editorRef = useRef(null)
  // '#'·'@' 둘 다 같은 모양이라 하나의 상태로 다룬다 — { trigger:'#'|'@', query, length, rect }
  const [trigger, setTrigger] = useState(null)
  // 이모지 피커 — 연 단추의 자리(anchorEl). 부모(ChannelMessages.jsx)로 안 올린다 —
  // 커서 위치에 바로 넣어야 해서(insertAtCursor) 편집기 ref를 쥔 이 컴포넌트 안에서
  // 끝내는 게 자연스럽다(멘션 '@' 단추와 같은 자리).
  const [emojiAnchor, setEmojiAnchor] = useState(null)

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

  /** 고른 글을 <code>로 감싼다. execCommand엔 인라인 코드 명령이 없어 직접 만든다.
   *  여러 블록에 걸친 선택은 surroundContents가 던지므로 그때는 조용히 포기한다 —
   *  메시지는 한 줄짜리가 대부분이라 실제로 걸릴 일이 드물다. */
  const toggleCode = () => {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return
    const range = sel.getRangeAt(0)
    const code = document.createElement('code')
    try {
      range.surroundContents(code)
      emit()
    } catch { /* 여러 블록에 걸친 선택 — 포기 */ }
  }

  const addLink = () => {
    const url = window.prompt('링크 주소를 입력하세요', 'https://')
    if (!url || url === 'https://') return
    const safe = /^https?:\/\//i.test(url) ? url : `https://${url}`
    editorRef.current?.focus()
    document.execCommand('createLink', false, safe)
    emit()
  }

  /** 커서 바로 앞에서 '#…'·'@…' 조각을 찾는다. RichTextEditor의 readSlashQuery와 같은
   *  방식이고 트리거 글자만 다르다. */
  const readTrigger = () => {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return null
    const node = sel.anchorNode
    if (!node || node.nodeType !== Node.TEXT_NODE) return null
    const before = node.textContent.slice(0, sel.anchorOffset)
    const m = /(?:^|\s)([#@])([^\s#@]*)$/.exec(before)
    if (!m) return null
    return { trigger: m[1], query: m[2], length: m[2].length + 1 }
  }

  const syncTrigger = () => {
    const found = readTrigger()
    if (!found) return setTrigger(null)
    const rect = window.getSelection().getRangeAt(0).getBoundingClientRect()
    setTrigger({
      ...found,
      rect: rect.width || rect.height ? rect : editorRef.current.getBoundingClientRect(),
    })
  }

  /** 골라 넣은 뒤 '#질문'·'@질문' 글자를 지운다 — applySlash와 같은 방식(구간을 다시
   *  찾아 한 번에 지운다. 한글 입력은 마지막 글자가 늦게 확정돼 상태에 저장해둔 길이가
   *  실제와 어긋날 수 있다). */
  const applyTrigger = (html) => {
    const el = editorRef.current
    el?.focus()
    const found = readTrigger()
    if (found) {
      const sel = window.getSelection()
      const range = document.createRange()
      range.setStart(sel.anchorNode, Math.max(0, sel.anchorOffset - found.length))
      range.setEnd(sel.anchorNode, sel.anchorOffset)
      range.deleteContents()
      sel.removeAllRanges()
      sel.addRange(range)
    }
    setTrigger(null)
    document.execCommand('insertHTML', false, html)
    emit()
  }

  const channelItems = trigger?.trigger === '#'
    ? channels
      .filter(c => c.name?.toLowerCase().includes((trigger.query || '').toLowerCase()))
      .slice(0, 8)
      .map(c => ({ id: c.id, label: `#${c.name}`, _channel: c }))
    : []
  const memberItems = trigger?.trigger === '@'
    ? members
      .filter(m => m.name?.toLowerCase().includes((trigger.query || '').toLowerCase()))
      .slice(0, 8)
      .map(m => ({ id: m.uid, label: m.name, sublabel: m.department, _member: m }))
    : []

  const submit = () => {
    if (disabled) return
    onSubmit()
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !trigger) {
      e.preventDefault()
      submit()
    }
  }

  const insertAtCursor = (text) => {
    editorRef.current?.focus()
    document.execCommand('insertText', false, text)
    syncTrigger()
  }

  // 이모지 피커는 팝오버라 여는 순간 포커스가 팝오버 쪽으로 옮겨간다(MUI Popover의
  // 접근성 동작) — '@' 단추처럼 클릭 즉시 넣는 게 아니라, 그 사이 커서 위치를 잃는다.
  // CanvasEditor.jsx의 날짜 칩 팝오버(savedRangeRef)와 같은 방식으로, 열 때 커서
  // 자리를 미리 저장해 뒀다가 이모지를 고른 순간 되살려 그 자리에 넣는다.
  const savedRangeRef = useRef(null)

  const openEmojiPicker = (e) => {
    const sel = window.getSelection()
    savedRangeRef.current = sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.anchorNode)
      ? sel.getRangeAt(0).cloneRange()
      : null
    setEmojiAnchor(e.currentTarget)
  }

  const pickEmoji = (emoji) => {
    editorRef.current?.focus()
    if (savedRangeRef.current) {
      const sel = window.getSelection()
      sel.removeAllRanges()
      sel.addRange(savedRangeRef.current)
    }
    document.execCommand('insertText', false, emoji)
    setEmojiAnchor(null)
  }

  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 0.2, flexWrap: 'wrap',
        px: 0.6, py: 0.3, borderBottom: '1px solid', borderColor: 'divider',
        bgcolor: 'background.default',
      }}>
        {TOOLS.map((tool, i) => tool.divider ? (
          <Divider key={`d${i}`} orientation="vertical" flexItem sx={{ mx: 0.5, my: 0.5 }} />
        ) : (
          <Tooltip key={tool.cmd} title={tool.label}>
            <IconButton size="small" onMouseDown={e => e.preventDefault()} onClick={() => exec(tool.cmd)}>
              <tool.Icon sx={{ fontSize: 17 }} />
            </IconButton>
          </Tooltip>
        ))}
        <Divider orientation="vertical" flexItem sx={{ mx: 0.5, my: 0.5 }} />
        <Tooltip title="링크">
          <IconButton size="small" onMouseDown={e => e.preventDefault()} onClick={addLink}>
            <LinkIcon sx={{ fontSize: 17 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="코드 (글을 먼저 고르세요)">
          <IconButton size="small" onMouseDown={e => e.preventDefault()} onClick={toggleCode}>
            <CodeIcon sx={{ fontSize: 17 }} />
          </IconButton>
        </Tooltip>
      </Box>

      <Box
        ref={editorRef}
        contentEditable={!disabled}
        suppressContentEditableWarning
        onInput={() => { emit(); syncTrigger() }}
        onBlur={emit}
        onKeyDown={handleKeyDown}
        onKeyUp={syncTrigger}
        onClick={syncTrigger}
        onCompositionEnd={syncTrigger}
        onPaste={(e) => {
          e.preventDefault()
          const text = e.clipboardData?.getData('text/plain') || ''
          document.execCommand('insertText', false, text)
          emit()
        }}
        data-placeholder={placeholder}
        sx={{
          minHeight: 40, maxHeight: '30vh', overflowY: 'auto',
          px: 1.3, py: 0.9, fontSize: '0.88rem', lineHeight: 1.6,
          outline: 'none',
          '&:empty::before': { content: 'attr(data-placeholder)', color: 'text.disabled' },
          ...RICH_TEXT_SX,
        }}
      />

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.2, px: 0.6, py: 0.4 }}>
        <Tooltip title="첨부">
          <IconButton size="small" onClick={onPlusClick} disabled={disabled}>
            <AddIcon sx={{ fontSize: 19 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="이모지">
          <IconButton size="small" onMouseDown={e => e.preventDefault()} onClick={openEmojiPicker}>
            <InsertEmoticonIcon sx={{ fontSize: 19 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="멘션">
          <IconButton size="small" onMouseDown={e => e.preventDefault()} onClick={() => insertAtCursor('@')}>
            <AlternateEmailIcon sx={{ fontSize: 19 }} />
          </IconButton>
        </Tooltip>
        <Box sx={{ flexGrow: 1 }} />
        <IconButton color="primary" disabled={disabled} onClick={submit} aria-label="보내기">
          <SendIcon sx={{ fontSize: 20 }} />
        </IconButton>
      </Box>

      <Popover
        open={!!emojiAnchor}
        anchorEl={emojiAnchor}
        onClose={() => setEmojiAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 0.2, p: 0.7 }}>
          {EMOJI_PICKER_ITEMS.map(emoji => (
            <Box
              key={emoji} component="button" type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => pickEmoji(emoji)}
              sx={{
                border: 0, background: 'none', cursor: 'pointer', fontSize: '1.2rem',
                width: 32, height: 32, borderRadius: 0.75, lineHeight: 1,
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              {emoji}
            </Box>
          ))}
        </Box>
      </Popover>

      <MentionMenu
        open={trigger?.trigger === '#'}
        anchorRect={trigger?.rect}
        items={channelItems}
        emptyText="채널을 찾을 수 없습니다"
        onSelect={item => applyTrigger(channelMentionHtml(item._channel))}
        onClose={() => setTrigger(null)}
      />
      <MentionMenu
        open={trigger?.trigger === '@'}
        anchorRect={trigger?.rect}
        items={memberItems}
        emptyText="이 채널에 없는 사람입니다"
        onSelect={item => applyTrigger(userMentionHtml(item._member))}
        onClose={() => setTrigger(null)}
      />
    </Box>
  )
}
