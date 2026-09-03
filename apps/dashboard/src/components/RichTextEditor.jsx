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
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import TextField from '@mui/material/TextField'
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
import { RICH_TEXT_SX } from './richTextStyles'

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

export default function RichTextEditor({ docId, folder = 'requests', value, onChange, onImageUploaded, placeholder }) {
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
  // 링크 걸기 팝오버 — 팝오버 입력창이 포커스를 가져가면 편집기의 선택이 풀리므로,
  // 열 때 선택 구간을 저장해 뒀다가 확정할 때 되살린다(날짜 팝오버와 같은 방식,
  // CanvasEditor.jsx 참고).
  const [linkPopover, setLinkPopover] = useState(null)   // { rect, url }
  const savedRangeRef = useRef(null)

  // 부모가 값을 바꿨을 때만 DOM에 밀어 넣는다. 타이핑 중에 덮어쓰면 커서가 맨 앞으로 튄다.
  useEffect(() => {
    const el = editorRef.current
    if (el && value !== el.innerHTML) el.innerHTML = value || ''
  }, [value])

  const emit = useCallback(() => {
    onChange(editorRef.current?.innerHTML || '')
  }, [onChange])

  // 글을 고치면 이미지가 밀리므로 손잡이도 따라가야 한다 (measure가 위치를 다시 잰다).
  // 우클릭 메뉴는 글을 치기 시작하면 닫는다 — '/'와 달리 쳐서 좁힐 수 있는 메뉴가 아니다.
  const handleInput = () => { emit(); syncSlash(); measure(); setMenuRect(null) }

  // 편집기는 내용이 넘치면 잘라내므로(overflow: auto), 테두리와 손잡이도 같은 범위 안에서만
  // 그려야 한다. 안 그러면 이미지는 잘리는데 테두리만 화면을 가로질러 남는다.
  const clipRect = useCallback(() => editorRef.current?.getBoundingClientRect() || null, [])

  /** 고른 이미지의 화면 위치를 다시 잰다 — 스크롤·창 크기·크기 조절 후 손잡이를 따라 붙인다. */
  const measure = useCallback(() => {
    setPicked(prev => {
      // 이미지를 지우거나 부모가 본문을 통째로 바꾸면 참조가 문서에서 떨어져 나간다.
      // 그대로 두면 사라진 이미지 자리에 손잡이만 남는다.
      if (!prev?.el?.isConnected) return null
      return { el: prev.el, rect: prev.el.getBoundingClientRect(), clip: clipRect() }
    })
  }, [clipRect])

  /**
   * 이미지를 고른다.
   *
   * clip까지 같이 재는 것이 중요하다 — 손잡이는 clip이 있을 때만 그려지는데, 예전에는
   * el과 rect만 넣어둬서 스크롤이나 창 크기 변경으로 measure가 한 번 돌기 전에는 손잡이가
   * 아예 나타나지 않았다. 붙여넣은 직후에는 이미지가 로드되며 생긴 스크롤 덕에 우연히
   * 보였고, 엔터를 친 뒤 다시 클릭하면 그 우연이 없어 크기를 못 바꾸던 증상이 이것이다.
   */
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

  /**
   * 오른쪽 아래 손잡이를 끌어 폭을 바꾼다.
   *
   * style이 아니라 width 속성에 px로 넣는다. 저장할 때 style은 색만 남기고 걸러지는데,
   * width 속성은 그대로 통과하기 때문이다. 화면에서는 max-width:100%가 걸려 있어
   * 좁은 창에서는 알아서 줄어든다 — 지정한 폭은 상한으로만 작동한다.
   */
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

  /** 자주 쓰는 폭 — 손으로 끌지 않고도 한 번에 맞춘다. */
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
      // 빈 텍스트 노드에서는 rect가 0이라 편집기 왼쪽 위를 대신 쓴다
      rect: rect.width || rect.height ? rect : editorRef.current.getBoundingClientRect(),
    })
  }

  /** 줄을 감싸는 블록 요소. 편집기 바로 아래 맨 텍스트 노드면 없을 수 있다. */
  const LINE_BLOCKS = 'p,h1,h2,h3,h4,div,li,blockquote,pre,aside,summary'

  /**
   * '상자'인 블록 — 안에 든 줄을 바꿔야지 상자 자체를 바꾸면 안 된다.
   *
   * execCommand('formatBlock')은 커서가 든 가장 가까운 블록을 통째로 갈아치운다. 콜아웃
   * 안에서 제목을 고르면 `<aside>`가 `<h2>`로 바뀌어 회색 배경이 통째로 사라졌다.
   * 지금 만드는 콜아웃은 안에 문단을 두므로 이 경우에 걸리지 않지만, 그 전에 쓴 글은
   * aside에 글이 직접 들어 있어 여기서 지켜야 한다.
   */
  const BOX_BLOCKS = 'aside'

  /** 슬래시 메뉴의 목록 명령 → 만들 태그 */
  const LIST_TAGS = { insertUnorderedList: 'UL', insertOrderedList: 'OL' }

  /** 커서가 있는 줄과 그 줄이 비었는지. 슬래시 명령은 글자를 지우고 나면 늘 빈 줄이다. */
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

  /**
   * 빈 줄 자리에 새 블록을 끼운다.
   *
   * 목록 안이면 목록 **밖으로** 내보낸다. 목록 항목 자리에 그대로 넣으면 넣은 것도
   * 목록에 딸리고, 그 뒤에 쓰는 내용까지 계속 같은 목록으로 이어져 번호가 다시 붙는다.
   * (구분선을 넣고 제목을 쓴 다음 엔터를 치면 번호가 이어지던 문제)
   */
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

  /**
   * 새로 만든 블록 안으로 커서를 옮긴다. 바로 이어서 쓸 수 있어야 한다.
   * 콜아웃처럼 기본 문구가 들어 있는 블록은 끝(atEnd)에 둬야 문구 앞에 글이 끼지 않는다.
   */
  const putCaretIn = (target, atEnd = false) => {
    const sel = window.getSelection()
    const range = document.createRange()
    range.selectNodeContents(target)
    range.collapse(!atEnd)
    sel.removeAllRanges()
    sel.addRange(range)
  }

  /**
   * 구분선·토글처럼 통째로 끼우는 HTML.
   *
   * 빈 줄에서 execCommand('insertHTML')를 쓰면 커서가 목록 안에 있을 때 그 안에 박힌다.
   * 그래서 직접 만들어 넣고, 커서는 뒤따라오는 빈 문단에 둔다.
   */
  const applyHtml = (html, caret) => {
    const line = readLine()
    if (!line) return

    const template = document.createElement('template')
    template.innerHTML = html
    // 콜아웃·토글은 상자 안에서 글을 쓰기 시작해야 한다. caret이 그 자리를 가리킨다 —
    // 없으면 커서가 상자 **뒤**의 빈 문단으로 가서, 방금 만든 상자에 쓰려면 다시 올라가야 했다.
    const inner = caret ? template.content.querySelector(caret) : null
    const blocks = [...template.content.children]
    const last = blocks[blocks.length - 1]

    if (!line.isEmpty) {
      // 고른 글이 있으면 선택을 먼저 푼다. insertHTML은 선택 구간을 **대체**하므로,
      // 우클릭으로 글을 고른 채 콜아웃이나 구분선을 넣으면 고른 글이 통째로 사라진다.
      const sel = window.getSelection()
      if (sel && !sel.isCollapsed) sel.collapseToEnd()
      document.execCommand('insertHTML', false, html)
      return
    }

    placeAtEmptyLine(line.block, template.content)
    const target = inner || last
    if (target) putCaretIn(target, !!inner)
  }

  /**
   * 목록을 시작한다.
   *
   * 빈 줄에서 execCommand로 목록을 만들면, 바로 위에 다른 종류의 목록이 있을 때
   * **새 목록을 만드는 대신 위 목록을 통째로 바꾼다** — 글머리 기호로 써둔 줄들이
   * 번호로 변한다. 슬래시 명령은 '/번호' 글자를 지우고 나면 항상 빈 줄이라 정확히
   * 이 경우에 걸린다.
   *
   * 그래서 빈 줄일 때는 applyBlock과 같은 방식으로 목록을 직접 만들어 끼운다.
   */
  const applyList = (cmd) => {
    const line = readLine()
    if (!line) return

    // 글자가 있는 줄은 execCommand가 그 줄만 정확히 목록으로 바꾼다
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

  /**
   * 줄을 제목·인용 같은 블록으로 바꾼다.
   *
   * 글자가 있는 줄은 execCommand('formatBlock')이 잘 처리하는데, **빈 줄에서는 아무 일도
   * 하지 않는다**. '/제목'처럼 슬래시 명령만 친 줄은 명령 글자를 지우고 나면 정확히 그
   * 빈 줄 상태가 되므로, 첫 줄에서 /제목을 고르면 글자만 사라지고 제목은 안 생겼다.
   */
  const applyBlock = (tag) => {
    const line = readLine()
    if (!line) return

    // 콜아웃 안이면 상자는 남기고 그 안의 내용만 바꾼다 (BOX_BLOCKS 설명 참고)
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

  /** 엔터를 치면 본문으로 돌아와야 하는 블록. 목록은 이어지는 게 맞으므로 뺀다. */
  const EXIT_ON_ENTER = 'h1,h2,h3,h4,blockquote'

  /**
   * 제목·인용에서 엔터를 치면 다음 줄은 본문으로 시작한다.
   *
   * 브라우저 기본 동작은 같은 블록을 이어서 만든다 — 제목을 쓰고 엔터를 치면 다음 줄도
   * 제목이고, 인용에서는 계속 인용이라 빠져나올 방법이 백스페이스밖에 없다. 제목이나
   * 인용을 두 줄 연달아 쓰는 일은 드물어서, 본문으로 돌아오는 쪽이 기대에 맞는다.
   *
   * 줄 끝에서 친 경우만 처리한다. 중간에서 치는 것은 줄을 나누려는 뜻이므로 그대로 둔다.
   */
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

  /**
   * 메뉴에서 고른 블록을 넣는다. 먼저 '/질문' 글자를 지운다.
   *
   * 지울 개수를 상태에 담아뒀다가 쓰지 않고 실행 시점에 다시 찾는다. 한글 입력은 마지막
   * 글자가 늦게 확정돼 상태와 실제 글자 수가 어긋나는데, 백스페이스를 세어 지우면 그만큼
   * 엉뚱한 글자가 지워지거나 남는다. 구간을 직접 잡아 한 번에 지운다.
   */
  const applySlash = (item) => {
    const el = editorRef.current
    el?.focus()

    // '/'로 열었을 때만 지울 명령 글자가 있다. 우클릭으로 연 메뉴에는 없다.
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

  /**
   * 우클릭 — 고른 글의 서식을 바꾼다.
   *
   * '/'는 새 줄에 블록을 넣는 것이라, 이미 쓴 글을 제목이나 목록으로 바꾸려면 도구 막대에
   * 있는 몇 개만 쓸 수 있었다. 같은 메뉴를 우클릭에 달아 고른 글에 그대로 건다.
   */
  const handleContextMenu = (e) => {
    e.preventDefault()
    setSlash(null)
    // 마우스 자리를 폭 없는 사각형으로 넘긴다 — 메뉴가 이 바로 아래에 붙는다
    setMenuRect({ top: e.clientY, bottom: e.clientY, left: e.clientX, right: e.clientX, width: 0, height: 0 })
  }

  // 메뉴 밖을 누르면 닫는다. 항목 선택은 mousedown에서 끝나므로 click이 올 때는 이미 처리됐다.
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
      // 글을 버리고 나갈 때 지울 수 있게 부모에게 경로를 알린다
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

  /**
   * 고른 글에 링크 걸기. window.prompt는 데스크톱 앱(Electron)에서 조용히 반응이
   * 없어(사용자 확인, 2026-09-03) 팝오버로 바꿨다 — 도구 막대 버튼은 onMouseDown에서
   * 기본 동작을 막아 선택을 지키지만, 팝오버가 뜨며 입력창으로 포커스가 넘어가는
   * 것까지는 못 막으므로 선택 구간을 미리 저장해 둔다.
   */
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
          minHeight: 260, maxHeight: '46vh', overflowY: 'auto',
          px: 1.5, py: 1.2, fontSize: '0.93rem', lineHeight: 1.7,
          outline: 'none',
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

      {/* 링크 걸기 */}
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
          {/* 오른쪽 아래 모서리 손잡이 */}
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
          {/* 자주 쓰는 폭 — 이미지 위에 자리가 없으면 안쪽 위에 붙인다 */}
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

      {/* '/'로 열든 우클릭으로 열든 같은 메뉴다. 우클릭에는 거를 질문이 없어 전부 보인다. */}
      <SlashMenu
        open={!!slash || !!menuRect}
        anchorRect={slash?.rect || menuRect}
        query={slash?.query}
        onSelect={applySlash}
        onClose={() => { setSlash(null); setMenuRect(null) }}
      />
    </Box>
  )
}
