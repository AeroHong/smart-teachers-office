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
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined'
import EventIcon from '@mui/icons-material/Event'
import FormatBoldIcon from '@mui/icons-material/FormatBold'
import FormatItalicIcon from '@mui/icons-material/FormatItalic'
import FormatUnderlinedIcon from '@mui/icons-material/FormatUnderlined'
import StrikethroughSIcon from '@mui/icons-material/StrikethroughS'
import LinkIcon from '@mui/icons-material/Link'
import FormatColorTextIcon from '@mui/icons-material/FormatColorText'
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted'
import PlaylistAddCheckIcon from '@mui/icons-material/PlaylistAddCheck'
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered'
import TableChartOutlinedIcon from '@mui/icons-material/TableChartOutlined'
import AttachFileIcon from '@mui/icons-material/AttachFile'
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined'
import DragIndicatorIcon from '@mui/icons-material/DragIndicator'
import ContentCopyIcon from '@mui/icons-material/ContentCopyOutlined'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import TitleIcon from '@mui/icons-material/Title'
import FormatQuoteIcon from '@mui/icons-material/FormatQuote'
import NotesIcon from '@mui/icons-material/Notes'
import Popover from '@mui/material/Popover'
import SlashMenu from './SlashMenu'
import { useAuth } from '@shared/contexts/AuthContext'
import { isImageFile, uploadAttachment } from '@shared/lib/requestAttachments'
import { canvasRefCardHtml, canvasRefTarget } from '@shared/lib/canvasRefCard'
import { dateChipHtml, hydrateDateChips } from '@shared/lib/dateChips'
import { makeBlockId } from '@shared/lib/blockReactions'
import { useToast } from './ToastProvider'
import { RICH_TEXT_SX } from './richTextStyles'
import useBlockReactions from './useBlockReactions'
import useBlockReactionRects from './useBlockReactionRects'
import BlockReactionRow from './BlockReactionRow'
import ReactionPicker from './ReactionPicker'

/** '+'와 '/'가 함께 여는 메뉴에 얹는 캔버스 전용 항목. 표·목차 등 지금 뜻이 없는 것과
 *  갈라, 쪽지 쪽 RichTextEditor·SlashMenu에는 안 넘긴다(SlashMenu.jsx extraItems). */
const CANVAS_EXTRA_ITEMS = [
  { id: 'table', label: '표', hint: '3×3 표 넣기', keywords: 'ㅍ 표 테이블 table', Icon: TableChartOutlinedIcon, action: 'table' },
  { id: 'date', label: '날짜', hint: '리마인더 칩', keywords: 'ㄴㅉ 날짜 리마인더 date reminder', Icon: EventIcon, action: 'date' },
  { id: 'canvasRef', label: '캔버스', hint: '다른 업무 글을 카드로', keywords: 'ㅋㅂㅅ 캔버스 업무글 링크 canvas', Icon: DescriptionOutlinedIcon, action: 'canvasRef' },
  { id: 'file', label: '파일', hint: '한글·엑셀 등 첨부', keywords: 'ㅍㅇ 파일 첨부 file attach', Icon: AttachFileIcon, action: 'file' },
  { id: 'checklist', label: '체크리스트', hint: '할 일 목록', keywords: 'ㅊㅋㄹㅅㅌ 체크리스트 할일 목록 checklist todo', Icon: PlaylistAddCheckIcon, action: 'checklist' },
]

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

/**
 * 블록 손잡이 메뉴의 "변환" 항목. 표·이미지·콜아웃·구분선은 여기 없다 — "제목으로
 * 변환"이 뜻이 없는 블록들이다. 커서 위치 기반인 applyBlock/applyList와 달리
 * 손잡이로 고른 블록(hoveredBlock)을 직접 받는다 — 메뉴를 열 때 커서가 그 블록
 * 안에 있으리라는 보장이 없다(다른 블록에 커서를 둔 채로 손잡이를 눌렀을 수도 있다).
 */
const BLOCK_CONVERT_OPTIONS = [
  { id: 'p', label: '문단', tag: 'P', Icon: NotesIcon },
  { id: 'h2', label: '큰 제목', tag: 'H2', Icon: TitleIcon },
  { id: 'h3', label: '중간 제목', tag: 'H3', Icon: TitleIcon },
  { id: 'h4', label: '작은 제목', tag: 'H4', Icon: TitleIcon },
  { id: 'ul', label: '글머리 기호', list: 'UL', Icon: FormatListBulletedIcon },
  { id: 'ol', label: '번호 매기기', list: 'OL', Icon: FormatListNumberedIcon },
  { id: 'blockquote', label: '인용', tag: 'BLOCKQUOTE', Icon: FormatQuoteIcon },
]

/** 변환 메뉴 자체를 보여줄지 — 표·이미지가 든 문단·콜아웃·구분선·상세는 대상 밖. */
const CONVERTIBLE_TAGS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'UL', 'OL', 'BLOCKQUOTE'])

/** 콜아웃 배경색 — TEXT_COLORS처럼 몇 가지만 둔다. null(기본)이 richTextStyles.js의
 *  기본 회색이다. */
const CALLOUT_COLORS = [
  { id: null, label: '기본', swatch: '#e5e7eb' },
  { id: 'red', label: '빨강', swatch: '#fdecea' },
  { id: 'orange', label: '주황', swatch: '#fff3e0' },
  { id: 'yellow', label: '노랑', swatch: '#fffde7' },
  { id: 'green', label: '초록', swatch: '#e8f5e9' },
  { id: 'blue', label: '파랑', swatch: '#e3f2fd' },
  { id: 'purple', label: '보라', swatch: '#f3e5f5' },
]

/**
 * 직계 자식 블록마다 data-block-id를 매긴다(이미 있으면 그대로 둔다) — 반응(이모지
 * 리액션)이 붙을 자리를 미리 마련해 둔다.
 *
 * "반응을 처음 누른 사람에게만 새로 매긴다"는 더 좁은 방식 대신 매 emit()마다 모든
 * 블록에 미리 매기는 이유: 반응은 글쓴이만이 아니라 채널의 누구나 남길 수 있어야 하는데
 * (PLAN_canvasBlocks.md Phase 3), 읽기 화면(PostDetail)의 다른 사람은 bodyHtml을 저장할
 * 권한이 없다 — 자기가 처음 반응을 누른 블록에 ID를 새로 박아 저장할 방법이 없다는 뜻.
 * 그래서 글쓴이가 무엇이든 고칠 때마다 모든 블록에 미리 ID를 매겨 두면, 그 뒤로는 누가
 * 반응을 눌러도(읽기 화면 포함) 이미 있는 ID에 반응 문서만 붙이면 된다.
 */
function ensureBlockIds(el) {
  if (!el) return
  for (const child of el.children) {
    if (!child.hasAttribute('data-block-id')) child.setAttribute('data-block-id', makeBlockId())
  }
}

/**
 * 제목을 이 컴포넌트 안에서 그린다(2026-08-26부터) — 예전엔 부모(PostComposer)가
 * 캔버스 바로 위에 따로 그렸는데, 그러면 제목의 왼쪽 여백과 본문의 왼쪽 여백이
 * 서로 다른 값이 됐다(본문은 목차 칸+간격만큼 오른쪽으로 밀린다, 아래 참고). 제목을
 * 목차와 같은 줄(본문 칸) 맨 위로 옮기면 항상 같은 칸을 공유해 여백이 저절로
 * 맞는다(사용자 지적, 2026-08-26). ref로 `focus()`를 계속 내주는 이유: 제목에서
 * Enter를 치면 본문으로 이어서 써야 하는데, 지금은 그 처리를 내부에서 하지만
 * (onTitleKeyDown) 다른 화면이 이 컴포넌트 바깥에서 본문에 포커스를 주고 싶을 때를
 * 위해 남겨둔다.
 */
const CanvasEditor = forwardRef(function CanvasEditor({
  docId, folder = 'requests', value, onChange, onImageUploaded, onFileUploaded, onOpenCanvasRef,
  canvasOptions = [], placeholder,
  title, onTitleChange, titlePlaceholder = '제목',
}, ref) {
  const { schoolId } = useAuth()
  const toast = useToast()
  const editorRef = useRef(null)
  const fileInputRef = useRef(null)     // 이미지 전용(accept="image/*")
  const docFileInputRef = useRef(null)  // "+파일" — 무슨 형식이든 받는다
  const [uploading, setUploading] = useState(0)
  const [colorAnchor, setColorAnchor] = useState(null)
  // 크기를 조절하려고 고른 이미지. 손잡이는 이 값이 있을 때만 그린다.
  const [picked, setPicked] = useState(null)   // { el, rect }
  // 클릭해 고른 표. 바깥에 "행 추가"/"열 추가" 단추를 그릴 때만 쓴다.
  const [pickedTable, setPickedTable] = useState(null)   // { el, rect }
  // 표 안에서 지금 마우스가 올라간 행·열 — 왼쪽·위쪽에 뜨는 작은 손잡이로 잡아
  // 그 행·열끼리만 순서를 바꾼다(표 밖 블록 재배치와 같은 발상, 범위만 표 안으로).
  const [hoveredRow, setHoveredRow] = useState(null)   // { el, rect }
  const [hoveredCol, setHoveredCol] = useState(null)   // { index, rect }
  const [rowDrag, setRowDrag] = useState(null)   // { indicatorTop }
  const [colDrag, setColDrag] = useState(null)   // { indicatorLeft }
  // '/'를 친 위치와 그 뒤에 이어 친 글자. 메뉴를 고르면 이 구간을 지우고 블록을 넣는다.
  const [slash, setSlash] = useState(null)
  // 우클릭 또는 하단 '+' 단추로 연 메뉴의 자리. 항목은 '/' 메뉴와 같고 여는 방법만 다르다.
  const [menuRect, setMenuRect] = useState(null)
  // 텍스트를 드래그로 고르면 그 위에 뜨는 작은 도구 — 문단·단어·글자 수정은 여기서 한다.
  const [bubble, setBubble] = useState(null)   // { rect }
  // 제목 기반 목차. { id, level, text }[] — id는 저장하지 않고 편집기 DOM에만 매길 때마다 다시 매긴다.
  const [headings, setHeadings] = useState([])
  // 날짜 칩을 찍을 위치. 팝오버의 날짜 입력창은 실제 포커스가 필요해 커서가 편집기를
  // 벗어나므로, 열 때 선택 구간을 미리 저장해 뒀다가 확정할 때 되살린다.
  const [datePicker, setDatePicker] = useState(null)   // { rect, value }
  const savedRangeRef = useRef(null)
  const [canvasMenuAnchor, setCanvasMenuAnchor] = useState(null)   // { top, left } — 캔버스 삽입 고르기
  // 막대로 축약된 목차에 마우스를 올리면 글자 목록을 오버레이로 펼친다.
  const [tocExpanded, setTocExpanded] = useState(false)
  // 지금 마우스가 올라가 있는 블록(에디터의 직계 자식) — 손잡이(⋮⋮)를 그 옆에 띄운다.
  const [hoveredBlock, setHoveredBlock] = useState(null)   // { el, rect }
  // 손잡이 ⋮⋮ 클릭으로 연 메뉴 — 삭제·복제·변환. el을 따로 담는 이유는 메뉴가 열려
  // 있는 동안 마우스가 손잡이 밖으로 나가 hoveredBlock이 비워질 수 있어서다.
  const [blockMenu, setBlockMenu] = useState(null)   // { el, anchor: {top,left} }
  const [convertSubmenuAnchor, setConvertSubmenuAnchor] = useState(null)
  // 손잡이를 끌어 블록을 옮기는 중 — 삽입될 자리를 얇은 선으로 보여준다.
  const [blockDrag, setBlockDrag] = useState(null)   // { indicatorTop }
  // 블록 반응(이모지 리액션, PLAN_canvasBlocks.md Phase 3) — 이 글 전체의 반응을 한 번에
  // 구독한다(블록마다 따로 구독하지 않는다).
  const { byBlock: blockReactions, toggle: toggleReaction, uid: reactionUid } = useBlockReactions({
    schoolId, requestId: docId,
  })
  const reactionRects = useBlockReactionRects(editorRef, Object.keys(blockReactions), value)
  // 이모지 고르는 팝오버 — hoveredBlock과 따로 둔다(blockMenu와 같은 이유). 손잡이 칸처럼
  // hoveredBlock에 매어 두면, 팝오버를 연 다음 마우스가 살짝만 움직여도(다른 블록으로
  // 인식되면) 칸 전체가 사라지며 막 연 팝오버까지 닫혀버린다(사용자 확인, 2026-08-26).
  const [reactionPicker, setReactionPicker] = useState(null)   // { blockId, anchor: {top,left} }

  useImperativeHandle(ref, () => ({
    focus: () => editorRef.current?.focus(),
  }), [])

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
    hydrateDateChips(el)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const emit = useCallback(() => {
    ensureBlockIds(editorRef.current)
    onChange(editorRef.current?.innerHTML || '')
    syncHeadings()
    // 날짜 칩의 "D-2" 문구는 저장하지 않고 매번 다시 계산한다(dateChips.js) — 오늘 기준으로
    // 값이 안 틀어지려면 여기서 매 변경마다 다시 그려야 한다.
    hydrateDateChips(editorRef.current)
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

  // 이미지를 누르면 고르고, 표 안을 누르면 표를 고르고, 캔버스 삽입 카드를 누르면 그
  // 글을 열고(편집 중에도 — contenteditable="false"라 글자 편집과 안 부딪힌다),
  // 다른 곳을 누르면 다 푼다.
  const handleEditorClick = (e) => {
    const todoCheck = e.target.closest?.('[data-todo-check]')
    if (todoCheck) {
      const li = todoCheck.closest('li[data-todo]')
      if (li) {
        li.setAttribute('data-checked', li.getAttribute('data-checked') === 'true' ? 'false' : 'true')
        emit()
      }
      return
    }
    const table = e.target.closest?.('table')
    const cardTarget = canvasRefTarget(e.target)
    if (cardTarget) {
      onOpenCanvasRef?.(cardTarget)
    } else if (e.target?.tagName === 'IMG') {
      pickImage(e.target)
      setPickedTable(null)
    } else if (table && editorRef.current?.contains(table)) {
      setPickedTable({ el: table, rect: table.getBoundingClientRect() })
      setPicked(null)
    } else {
      setPicked(null)
      setPickedTable(null)
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

  // 표를 바꿔 고르거나(다른 표 클릭) 아예 놓으면(바깥 클릭) 행·열 손잡이도 같이
  // 지운다 — 안 그러면 이제 안 골라진 표의 행 손잡이가 화면에 그대로 남는다.
  useEffect(() => { setHoveredRow(null); setHoveredCol(null) }, [pickedTable?.el])

  /** 고른 표의 화면 위치를 다시 잰다 — "행 추가"/"열 추가" 단추가 표를 따라가야 한다. */
  const measureTable = useCallback(() => {
    setPickedTable(prev => {
      if (!prev?.el?.isConnected) return null
      return { el: prev.el, rect: prev.el.getBoundingClientRect() }
    })
  }, [])

  useEffect(() => {
    if (!pickedTable) return
    const el = editorRef.current
    window.addEventListener('resize', measureTable)
    el?.addEventListener('scroll', measureTable)
    return () => {
      window.removeEventListener('resize', measureTable)
      el?.removeEventListener('scroll', measureTable)
    }
  }, [pickedTable, measureTable])

  const addTableRow = () => {
    const table = pickedTable?.el
    if (!table) return
    const cols = table.rows[0]?.cells.length || 1
    const tr = document.createElement('tr')
    for (let i = 0; i < cols; i++) {
      const td = document.createElement('td')
      td.appendChild(document.createElement('br'))
      tr.appendChild(td)
    }
    table.appendChild(tr)
    emit()
    measureTable()
  }

  const addTableCol = () => {
    const table = pickedTable?.el
    if (!table) return
    ;[...table.rows].forEach((row) => {
      const td = document.createElement('td')
      td.appendChild(document.createElement('br'))
      row.appendChild(td)
    })
    emit()
    measureTable()
  }

  /** 마지막 행·열만 지운다 — 추가와 같은 자리(늘 끝에)라 어느 것이 지워질지 헷갈리지
   *  않는다. 한 칸까지만 남기고 그 아래로는 막는다 — 표가 통째로 사라지면 되돌릴
   *  방법이 삭제(Undo)뿐인데 이 편집기는 브라우저 기본 Undo에만 기대고 있다. */
  const deleteTableRow = () => {
    const table = pickedTable?.el
    if (!table || table.rows.length <= 1) return
    table.deleteRow(-1)
    emit()
    measureTable()
  }

  const deleteTableCol = () => {
    const table = pickedTable?.el
    if (!table || (table.rows[0]?.cells.length || 0) <= 1) return
    ;[...table.rows].forEach(row => row.deleteCell(-1))
    emit()
    measureTable()
  }

  /** 표 전체 폭 조절 — 이미지 리사이즈(startResize)와 같은 자리(오른쪽 아래 손잡이,
   *  pointermove로 폭만 바꾼다). 표는 width 속성이 아니라 style.width로 준다 —
   *  richText.js가 style에서 color 말고는 다 걸러내므로, 대신 표에는 width 속성을
   *  직접 허용해 뒀다(richTextStyles.js는 테두리·간격만 담당). */
  const startTableResize = (e) => {
    e.preventDefault()
    e.stopPropagation()
    const table = pickedTable?.el
    if (!table) return

    const startX = e.clientX
    const startWidth = table.getBoundingClientRect().width
    const maxWidth = editorRef.current?.clientWidth || 900

    const onMove = (ev) => {
      const next = Math.round(Math.min(maxWidth, Math.max(160, startWidth + (ev.clientX - startX))))
      table.setAttribute('width', String(next))
      measureTable()
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      emit()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  /**
   * 칸(열) 너비 조정 — 경계 하나를 끌면 양옆 두 칸만 나눠 갖는다(표 전체 폭은
   * 그대로). tableLayout:'fixed'에서는 **첫 행**의 width가 그 열 전체를 정하므로
   * 첫 행의 칸에만 값을 준다(richTextStyles.js 참고).
   */
  const startColResize = (colIndex) => (e) => {
    e.preventDefault()
    e.stopPropagation()
    const table = pickedTable?.el
    const firstRow = table?.rows[0]
    const leftCell = firstRow?.cells[colIndex]
    const rightCell = firstRow?.cells[colIndex + 1]
    if (!leftCell || !rightCell) return

    const startX = e.clientX
    const leftStart = leftCell.getBoundingClientRect().width
    const rightStart = rightCell.getBoundingClientRect().width

    const onMove = (ev) => {
      const dx = ev.clientX - startX
      const nextLeft = Math.max(40, Math.round(leftStart + dx))
      const nextRight = Math.max(40, Math.round(rightStart - dx))
      // 둘 다 최소 40px을 지키면서 합을 유지한다 — 한쪽이 바닥을 치면 반대쪽만
      // 계속 늘어나 표 전체 폭이 조용히 커지는 것을 막는다.
      if (nextLeft === 40 || nextRight === 40) return
      leftCell.setAttribute('width', String(nextLeft))
      rightCell.setAttribute('width', String(nextRight))
      measureTable()
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      emit()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  /**
   * 표 안에서 마우스가 있는 행·열을 찾는다 — pickedTable일 때만 부른다.
   *
   * 못 찾았을 때 여기서 바로 지우지 않는다(값을 찾았을 때만 채운다) — 행·열
   * 손잡이도 표 rect 바깥(fixed)에 뜨므로 블록 손잡이와 같은 "그 사이 빈 틈"
   * 문제가 있다. 지우는 판단은 호출부(handleEditorMouseMove)가 scheduleHoverClear로
   * 한 군데에서 통일해서 한다. @returns 행이나 열을 하나라도 찾았는가
   */
  const handleTableMouseMove = (e) => {
    const table = pickedTable?.el
    if (!table) return false
    let found = false

    const y = e.clientY
    const row = [...table.rows].find(tr => {
      const r = tr.getBoundingClientRect()
      return y >= r.top && y <= r.bottom
    })
    if (row) {
      setHoveredRow(prev => (prev?.el === row ? prev : { el: row, rect: row.getBoundingClientRect() }))
      found = true
    }

    const x = e.clientX
    const firstRow = table.rows[0]
    const colIndex = firstRow ? [...firstRow.cells].findIndex(td => {
      const r = td.getBoundingClientRect()
      return x >= r.left && x <= r.right
    }) : -1
    if (colIndex >= 0) {
      setHoveredCol(prev => (prev?.index === colIndex ? prev : { index: colIndex, rect: firstRow.cells[colIndex].getBoundingClientRect() }))
      found = true
    }
    return found
  }

  /**
   * 행 손잡이(표 왼쪽) — 끌면 이 표 안에서만 행 순서를 바꾼다. 블록 드래그와 같은
   * 방식(형제 rect 중간값과 커서 y좌표 비교)이지만 대상이 tr이고 범위가 표 하나뿐이다.
   *
   * 얇은 삽입선만으로는 "무엇을 옮기는지"가 잘 안 보인다는 지적(2026-08-26)에, 실제
   * 행 내용을 커서에 붙여 떠다니게 하는 미리보기를 더했다(rowDrag.rowHtml) — 원본
   * 행은 옮기는 동안 흐리게 해서 "그 자리에서 빠져나와 옮겨지는" 느낌을 준다.
   */
  const startRowDrag = (e) => {
    e.preventDefault()
    e.stopPropagation()
    const table = pickedTable?.el
    const row = hoveredRow?.el
    if (!table || !row) return
    const siblings = [...table.rows]
    const grabOffsetY = e.clientY - row.getBoundingClientRect().top
    const rowHtml = row.innerHTML
    row.style.opacity = '0.25'

    const onMove = (ev) => {
      let insertBeforeEl = null
      let indicatorTop = null
      for (const sib of siblings) {
        if (sib === row) continue
        const r = sib.getBoundingClientRect()
        if (ev.clientY < r.top + r.height / 2) { insertBeforeEl = sib; indicatorTop = r.top; break }
      }
      if (indicatorTop === null) {
        const last = siblings[siblings.length - 1]
        indicatorTop = (last === row ? row : last).getBoundingClientRect().bottom
      }
      setRowDrag({ insertBeforeEl, indicatorTop, ghostTop: ev.clientY - grabOffsetY, rowHtml })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      row.style.opacity = ''
      setRowDrag(prev => {
        if (prev) {
          // row.parentElement를 쓴다(table이 아니라) — HTML을 문자열로 만들어 넣으면
          // <tr>들이 암시적 <tbody> 아래 들어가므로, 실제 부모는 table 자신이 아니다.
          const container = row.parentElement
          if (prev.insertBeforeEl) container.insertBefore(row, prev.insertBeforeEl)
          else container.appendChild(row)
          emit()
        }
        return null
      })
      setHoveredRow(null)
      measureTable()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  /** 열 손잡이(표 위쪽) — 끌면 모든 행에서 그 순서의 칸을 한꺼번에 옮긴다. 열은
   *  DOM에 실제로 존재하는 태그가 아니라 "각 행의 n번째 칸들의 모임"이라, 한 행씩
   *  옮기는 게 아니라 행마다 같은 인덱스의 칸을 반복해서 옮겨야 한다. */
  const startColDrag = (e) => {
    e.preventDefault()
    e.stopPropagation()
    const table = pickedTable?.el
    const colIndex = hoveredCol?.index
    if (!table || colIndex == null) return
    const firstRow = table.rows[0]
    const colCells = [...firstRow.cells]   // 경계 계산은 첫 행 기준

    const onMove = (ev) => {
      let insertBeforeIndex = null
      let indicatorLeft = null
      for (let i = 0; i < colCells.length; i++) {
        if (i === colIndex) continue
        const r = colCells[i].getBoundingClientRect()
        if (ev.clientX < r.left + r.width / 2) { insertBeforeIndex = i; indicatorLeft = r.left; break }
      }
      if (indicatorLeft === null) {
        const last = colCells[colCells.length - 1]
        indicatorLeft = last.getBoundingClientRect().right
      }
      setColDrag({ insertBeforeIndex, indicatorLeft })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setColDrag(prev => {
        if (prev && prev.insertBeforeIndex !== colIndex && prev.insertBeforeIndex !== colIndex + 1) {
          ;[...table.rows].forEach((tr) => {
            const cell = tr.cells[colIndex]
            const target = prev.insertBeforeIndex != null ? tr.cells[prev.insertBeforeIndex] : null
            if (!cell) return
            if (target) tr.insertBefore(cell, target)
            else tr.appendChild(cell)
          })
          emit()
        }
        return null
      })
      setHoveredCol(null)
      measureTable()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // ── 블록 손잡이(⋮⋮) — 호버·메뉴·드래그 재배치 ──────────────────────────
  //
  // "블록"은 기본적으로 에디터의 직계 자식이다. e.target 히트테스트 대신 **커서의
  // y좌표가 어느 직계 자식의 세로 범위 안에 있는지**로 찾는다 — 왼쪽·오른쪽
  // 여백(패딩)에 마우스가 있으면 e.target이 편집기 루트 자신이 되어(자식
  // 엘리먼트가 거기까지 안 넓혀져 있어서) 블록을 못 찾았다(사용자 지적,
  // 2026-08-26) — 그 줄의 세로 범위 안이면 가로 위치와 무관하게 잡히게 한다.
  //
  // 콜아웃·인용문 "안"에 든 블록은 한 단 더 들어가서 찾는다 — 안 그러면 드래그로
  // 그 안에 넣은 블록을 다시 꺼낼 손잡이가 아예 안 뜬다(사용자 지적, 2026-08-26).
  // 두 단계까지만 본다 — 컨테이너 안에 또 컨테이너를 넣는 것까지는 다루지 않는다.
  const CONTAINER_TAGS = ['ASIDE', 'BLOCKQUOTE']
  const findTopBlockAtY = useCallback((y) => {
    const el = editorRef.current
    if (!el) return null
    for (const child of el.children) {
      const r = child.getBoundingClientRect()
      if (y < r.top || y > r.bottom) continue
      if (CONTAINER_TAGS.includes(child.tagName)) {
        for (const inner of child.children) {
          const ir = inner.getBoundingClientRect()
          if (y >= ir.top && y <= ir.bottom) return inner
        }
      }
      return child
    }
    return null
  }, [])

  /**
   * 손잡이가 편집기 rect 왼쪽 바깥(fixed)에 뜨다 보니, "글자 위 → 손잡이" 이동은
   * 그 사이 몇 px의 빈 공간을 지난다 — 편집기도 바깥 칸도 그 빈 공간까지 자기
   * 영역으로 치지 않아(fixed는 레이아웃 크기에 안 잡힌다) 지나가는 순간 mouseleave가
   * 먼저 터진다. 그 즉시 지우지 않고 살짝(180ms) 기다렸다가 지운다 — 그사이 손잡이에
   * 도착하면(onMouseEnter) 취소된다. 드롭다운 메뉴가 트리거와 패널 사이 틈을 이렇게
   * 넘기는 것과 같은 방식이다.
   */
  const hoverClearTimer = useRef(null)
  const cancelHoverClear = () => {
    if (hoverClearTimer.current) { clearTimeout(hoverClearTimer.current); hoverClearTimer.current = null }
  }
  // 표 안 행·열 손잡이(표 왼쪽·위쪽 바깥)도 같은 문제라 같은 타이머를 같이 쓴다.
  const scheduleHoverClear = () => {
    cancelHoverClear()
    hoverClearTimer.current = setTimeout(() => {
      hoverClearTimer.current = null
      setHoveredBlock(null)
      setHoveredRow(null)
      setHoveredCol(null)
    }, 180)
  }
  useEffect(() => () => cancelHoverClear(), [])

  const handleEditorMouseMove = (e) => {
    if (blockDrag || rowDrag || colDrag) return   // 드래그 중엔 각자의 onMove가 따로 관리한다
    cancelHoverClear()
    // 손잡이 자체는 편집기 밖(같은 바깥 칸의 형제)이라 findTopBlock이 못 찾는다 —
    // 그대로 두면 손잡이 위에 마우스가 있는 동안에도 매 mousemove마다 "블록 아님"으로
    // 읽혀 손잡이가 깜빡이며 사라진다. 손잡이 위에서는 지금 상태를 그대로 둔다.
    if (e.target.closest?.('[data-block-handle],[data-table-handle]')) return
    const block = findTopBlockAtY(e.clientY)
    if (block) setHoveredBlock(prev => (prev?.el === block ? prev : { el: block, rect: block.getBoundingClientRect() }))
    // 표를 고른 상태면 그 표 안의 행·열도 같이 찾는다. 찾은 게 하나도 없을 때만
    // (블록도, 표의 행·열도 아님) 지우기를 예약한다 — 그래야 손잡이로 이동하는
    // 중간의 빈 틈에서 곧바로 사라지지 않는다.
    const foundInTable = pickedTable ? handleTableMouseMove(e) : false
    if (!block && !foundInTable) scheduleHoverClear()
  }

  const handleEditorMouseLeave = () => {
    if (!blockDrag && !blockMenu && !rowDrag && !colDrag && !reactionPicker) scheduleHoverClear()
  }

  // 손잡이가 떠 있는 동안 스크롤·창 크기 변화에 다시 잰다 — picked(이미지 손잡이)와
  // 같은 이유. 이 에디터는 스스로 스크롤하지 않고 부모(PostComposer)가 하므로
  // capture 단계로 window의 scroll도 듣는다.
  useEffect(() => {
    if (!hoveredBlock) return
    const remeasure = () => {
      setHoveredBlock(prev => (prev?.el?.isConnected ? { el: prev.el, rect: prev.el.getBoundingClientRect() } : null))
    }
    window.addEventListener('resize', remeasure)
    window.addEventListener('scroll', remeasure, true)
    return () => {
      window.removeEventListener('resize', remeasure)
      window.removeEventListener('scroll', remeasure, true)
    }
  }, [hoveredBlock?.el])

  // 표 안 행·열 손잡이도 같은 이유로 다시 잰다.
  useEffect(() => {
    if (!hoveredRow) return
    const remeasure = () => {
      setHoveredRow(prev => (prev?.el?.isConnected ? { el: prev.el, rect: prev.el.getBoundingClientRect() } : null))
    }
    window.addEventListener('resize', remeasure)
    window.addEventListener('scroll', remeasure, true)
    return () => {
      window.removeEventListener('resize', remeasure)
      window.removeEventListener('scroll', remeasure, true)
    }
  }, [hoveredRow?.el])

  useEffect(() => {
    if (!hoveredCol || !pickedTable) return
    const remeasure = () => {
      const cell = pickedTable.el.rows[0]?.cells[hoveredCol.index]
      setHoveredCol(prev => (cell ? { index: prev.index, rect: cell.getBoundingClientRect() } : null))
    }
    window.addEventListener('resize', remeasure)
    window.addEventListener('scroll', remeasure, true)
    return () => {
      window.removeEventListener('resize', remeasure)
      window.removeEventListener('scroll', remeasure, true)
    }
  }, [hoveredCol?.index, pickedTable])

  const closeBlockMenu = () => { setBlockMenu(null); setConvertSubmenuAnchor(null) }

  const deleteBlock = () => {
    const el = blockMenu?.el
    if (!el) return
    el.remove()
    closeBlockMenu()
    setHoveredBlock(null)
    emit()
  }

  const duplicateBlock = () => {
    const el = blockMenu?.el
    if (!el) return
    const clone = el.cloneNode(true)
    // data-block-id까지 복제하면 두 블록이 같은 반응 문서를 가리키게 된다 — 지워서
    // 다음 emit()의 ensureBlockIds가 새 ID를 매기게 한다.
    clone.removeAttribute('data-block-id')
    el.after(clone)
    closeBlockMenu()
    emit()
  }

  /** 문단↔제목↔목록↔인용처럼 "글자만 있는" 블록끼리만 서로 바꾼다. 목록→다른 것은
   *  항목들을 한 문단으로 이어붙이고, 다른 것→목록은 통째로 항목 하나가 된다. */
  const convertBlock = (option) => {
    const el = blockMenu?.el
    if (!el) return
    const wasList = el.tagName === 'UL' || el.tagName === 'OL'
    let created
    if (option.list) {
      created = document.createElement(option.list)
      if (wasList) {
        created.append(...el.childNodes)
      } else {
        const li = document.createElement('li')
        li.append(...el.childNodes)
        if (!li.hasChildNodes()) li.appendChild(document.createElement('br'))
        created.appendChild(li)
      }
    } else {
      created = document.createElement(option.tag)
      if (wasList) {
        created.textContent = [...el.querySelectorAll('li')].map(li => li.textContent).join(' ')
      } else {
        created.append(...el.childNodes)
      }
      if (!created.hasChildNodes()) created.appendChild(document.createElement('br'))
    }
    // 이미 반응이 달려 있던 블록이면 새 태그로도 그 ID를 그대로 옮겨, 반응이 엉뚱한
    // 블록(이제는 없는 옛 엘리먼트)에 남겨진 채 고아가 되지 않게 한다.
    if (el.hasAttribute('data-block-id')) created.setAttribute('data-block-id', el.getAttribute('data-block-id'))
    el.replaceWith(created)
    closeBlockMenu()
    setHoveredBlock(null)
    emit()
  }

  /** 콜아웃 배경색 — data-callout-color만 바꾼다(richTextStyles.js가 실제 색을 정한다). */
  const setCalloutColor = (colorId) => {
    const el = blockMenu?.el
    if (!el) return
    if (colorId) el.setAttribute('data-callout-color', colorId)
    else el.removeAttribute('data-callout-color')
    closeBlockMenu()
    setHoveredBlock(null)
    emit()
  }

  /** 지금 마우스가 올라간 블록의 반응 ID. 아직 한 번도 반응이 안 달려 ID가 없으면 이 순간
   *  새로 매기고 즉시 저장한다(emit()) — 안 그러면 새로고침 후 ID가 사라져 방금 남긴
   *  반응이 다음번엔 엉뚱한(또는 없는) 블록을 가리킨다. */
  const ensureHoveredBlockId = () => {
    const el = hoveredBlock?.el
    if (!el) return null
    if (!el.hasAttribute('data-block-id')) {
      el.setAttribute('data-block-id', makeBlockId())
      emit()
    }
    return el.getAttribute('data-block-id')
  }

  /** 반응 팝오버를 연다 — 클릭한 자리(좌표)만 기억한다. blockId는 이 순간 확정해 둔다
   *  (그 뒤로 hoveredBlock이 바뀌어도 팝오버는 이 블록을 계속 가리켜야 하므로). */
  const openReactionPicker = (blockId, e) => {
    if (!blockId) return
    const r = e.currentTarget.getBoundingClientRect()
    setReactionPicker({ blockId, anchor: { top: r.bottom + 4, left: r.left } })
  }

  /**
   * 손잡이 pointerdown — 살짝 누르기만 하면(움직임이 거의 없으면) 클릭으로 보고
   * 메뉴를 연다. 일정 거리 이상 끌면 드래그로 보고 재배치 모드로 들어간다. 같은
   * 버튼 하나로 "클릭=메뉴, 끌기=이동" 둘 다 되게 하는 흔한 방식이다.
   */
  const handleHandlePointerDown = (e) => {
    e.preventDefault()
    e.stopPropagation()
    const block = hoveredBlock?.el
    const el = editorRef.current
    if (!block || !el) return
    // 메뉴는 누른 자리(clientX/Y) 기준으로 띄운다 — 손잡이 상자 자체의 rect를 쓰면
    // (블록 전체 높이만큼 길다) 짧게 클릭해도 메뉴가 블록 맨 아래에서 열려버린다.
    const startX = e.clientX
    const startY = e.clientY
    const anchorPos = { top: startY + 8, left: startX + 8 }
    // 콜아웃·인용문 "안"에서 시작한 드래그면, 지금 부모(homeParent)가 컨테이너다.
    // 커서가 그 컨테이너 밖으로 나가는 순간 최상위 기준으로 다시 계산해 "꺼내기"가
    // 되게 한다(사용자 지적, 2026-08-26 — 넣은 걸 다시 못 뺐다).
    const homeParent = block.parentElement
    const isNested = homeParent !== el
    let moved = false

    const onMove = (ev) => {
      if (!moved) {
        if (Math.abs(ev.clientX - startX) < 4 && Math.abs(ev.clientY - startY) < 4) return
        moved = true
      }

      let referenceParent = homeParent
      if (isNested) {
        const homeRect = homeParent.getBoundingClientRect()
        const escaped = ev.clientY < homeRect.top - 6 || ev.clientY > homeRect.bottom + 6
        referenceParent = escaped ? el : homeParent
      }
      const siblings = [...referenceParent.children]
      // 컨테이너 "안"으로 들여보내는 것(dropInto)은 최상위에서 재배치 중일 때만
      // 판단한다 — 컨테이너 안에서 또 다른 컨테이너로 들어가는 이중 중첩은
      // 다루지 않는다(범위 밖).
      const canDropInto = referenceParent === el

      // 콜아웃·인용문 위 가운데(위아래 25%씩은 빼고)에서 놓으면 형제로 끼우는 게
      // 아니라 그 블록 "안"으로 들어간다(사용자 요청, 2026-08-26 — 체크리스트나
      // 문단을 콜아웃/인용문 안에 넣고 싶다는 것). 가장자리는 그대로 형제 재배치로
      // 남겨 둔다 — 안 그러면 콜아웃 바로 앞/뒤에 놓을 방법이 없어진다.
      let dropInto = null
      let insertBeforeEl = null
      let indicatorTop = null
      for (const sib of siblings) {
        if (sib === block) continue
        const r = sib.getBoundingClientRect()
        const isContainer = canDropInto && (sib.tagName === 'ASIDE' || sib.tagName === 'BLOCKQUOTE')
        if (isContainer && ev.clientY >= r.top + r.height * 0.25 && ev.clientY <= r.bottom - r.height * 0.25) {
          dropInto = sib
          break
        }
        if (ev.clientY < r.top + r.height / 2) { insertBeforeEl = sib; indicatorTop = r.top; break }
      }
      if (!dropInto && indicatorTop === null) {
        const last = siblings[siblings.length - 1]
        indicatorTop = (last === block ? block : last).getBoundingClientRect().bottom
      }
      setBlockDrag({ dropInto, insertBeforeEl, indicatorTop, referenceParent })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      if (moved) {
        setBlockDrag(prev => {
          if (prev) {
            const target = prev.referenceParent || el
            if (prev.dropInto) prev.dropInto.appendChild(block)
            else if (prev.insertBeforeEl) target.insertBefore(block, prev.insertBeforeEl)
            else target.appendChild(block)
            emit()
          }
          return null
        })
        setHoveredBlock(null)
      } else {
        setBlockMenu({ el: block, anchor: anchorPos })
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

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

  /** 커서를 어떤 노드 바로 뒤에 둔다 — 체크리스트 항목은 맨 앞이 contenteditable="false"
   *  체크박스라, putCaretIn처럼 "안의 맨 앞"에 두면 체크박스보다 앞이 돼버린다. */
  const putCaretAfterNode = (node) => {
    const sel = window.getSelection()
    const range = document.createRange()
    range.setStartAfter(node)
    range.collapse(true)
    sel.removeAllRanges()
    sel.addRange(range)
  }

  /** 체크박스 하나를 만든다 — 삽입할 때와 Enter로 새 항목을 만들 때 둘 다 쓴다. */
  const makeTodoCheck = () => {
    const check = document.createElement('span')
    check.setAttribute('data-todo-check', '')
    check.setAttribute('contenteditable', 'false')
    return check
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

  /** 표 넣기 — 기본 3×3. 행·열을 늘리는 것만 지원한다(줄이기·셀 병합은 이번 범위 밖). */
  const insertTable = () => {
    const cell = () => '<td><br></td>'
    const row = () => `<tr>${Array.from({ length: 3 }).map(cell).join('')}</tr>`
    const html = `<table>${Array.from({ length: 3 }).map(row).join('')}</table><p><br></p>`
    applyHtml(html, 'td')
  }

  /**
   * 날짜 칩 팝오버를 연다.
   *
   * `<input type="date">`는 실제로 포커스를 받아야 값을 고를 수 있어, 색 팔레트처럼
   * onMouseDown을 막아 선택을 지키는 방법을 못 쓴다. 대신 지금 커서 위치를 복제해
   * 저장해 두고, 확정할 때 그 자리를 되살려 넣는다.
   */
  const openDatePicker = () => {
    const sel = window.getSelection()
    const range = sel?.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null
    savedRangeRef.current = range
    const rect = (range && range.getBoundingClientRect().width + range.getBoundingClientRect().height > 0)
      ? range.getBoundingClientRect()
      : editorRef.current?.getBoundingClientRect()
    setDatePicker({ rect, value: '' })
  }

  const confirmDatePicker = () => {
    const dateStr = datePicker?.value
    if (!dateStr) return
    editorRef.current?.focus()
    const sel = window.getSelection()
    if (savedRangeRef.current) {
      sel.removeAllRanges()
      sel.addRange(savedRangeRef.current)
    }
    document.execCommand('insertHTML', false, dateChipHtml(dateStr))
    setDatePicker(null)
    emit()
  }

  /** 캔버스 삽입 — 이 채널의 다른 업무 글을 카드로 심는다. 고르기는 메뉴, 삽입은 applyHtml. */
  const pickCanvasRef = (post) => {
    setCanvasMenuAnchor(null)
    editorRef.current?.focus()
    const sel = window.getSelection()
    if (savedRangeRef.current) {
      sel.removeAllRanges()
      sel.addRange(savedRangeRef.current)
    }
    applyHtml(canvasRefCardHtml(post))
    emit()
  }

  const insertFile = async (file) => {
    setUploading(n => n + 1)
    try {
      const uploaded = await uploadAttachment({ schoolId, docId, folder, file })
      onFileUploaded?.(uploaded)
    } catch (e) {
      toast.error(`파일을 올리지 못했습니다: ${e.message}`, e)
    } finally {
      setUploading(n => n - 1)
    }
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

  /** 체크리스트 — 일반 목록(applyList)과 같은 자리 계산이지만, 항목 안에 체크박스가
   *  먼저 들어가야 해서 li를 직접 만든다. 글자가 있는 줄에서 골랐으면(다른 항목처럼
   *  execCommand로 바로 바꿀 방법이 없어) 그 줄의 글자를 그대로 새 항목 안으로 옮긴다. */
  const insertChecklist = () => {
    const line = readLine()
    if (!line) return

    const list = document.createElement('ul')
    const item = document.createElement('li')
    item.setAttribute('data-todo', '')
    item.setAttribute('data-checked', 'false')
    const check = makeTodoCheck()
    item.appendChild(check)

    if (!line.isEmpty && line.block) {
      item.append(...line.block.childNodes)
      line.block.replaceWith(list)
      list.appendChild(item)
    } else {
      item.appendChild(document.createElement('br'))
      list.appendChild(item)
      placeAtEmptyLine(line.block, list)
    }
    putCaretAfterNode(check)
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

    /**
     * 체크리스트 항목에서 Enter — 브라우저 기본 동작(li 복제)에 맡기면 체크박스
     * (contenteditable="false")가 없는 빈 li가 생기거나, 체크된 상태(data-checked)까지
     * 그대로 복사돼 새 항목이 이미 완료로 시작한다. 그래서 직접 만든다 — 빈 항목에서
     * Enter면 목록을 빠져나가고(다른 목록과 같은 관례), 아니면 커서 뒤 내용을
     * 새 항목으로 옮긴다.
     */
    const todoLi = line?.block?.closest('li[data-todo]')
    if (todoLi) {
      e.preventDefault()
      if (!todoLi.textContent.trim()) {
        // li를 그 자리에서 바로 <p>로 바꿀 수 없다 — 부모가 <ul>이라 <p>가 그 안에
        // 끼면 잘못된 구조가 된다(placeAtEmptyLine의 LI 처리와 같은 이유). ul
        // 바깥으로 꺼내고, ul이 비면 통째로 지운다.
        const p = document.createElement('p')
        p.appendChild(document.createElement('br'))
        const list = todoLi.parentElement
        todoLi.remove()
        list.after(p)
        if (!list.childElementCount) list.remove()
        putCaretIn(p)
        emit()
        return
      }

      const sel = window.getSelection()
      const range = sel.getRangeAt(0)
      const afterRange = document.createRange()
      afterRange.setStart(range.startContainer, range.startOffset)
      afterRange.setEndAfter(todoLi.lastChild)
      const remainder = afterRange.extractContents()

      const newLi = document.createElement('li')
      newLi.setAttribute('data-todo', '')
      newLi.setAttribute('data-checked', 'false')
      const check = makeTodoCheck()
      newLi.appendChild(check)
      if (remainder.childNodes.length > 0) newLi.appendChild(remainder)
      else newLi.appendChild(document.createElement('br'))

      todoLi.after(newLi)
      putCaretAfterNode(check)
      emit()
      return
    }

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
    if (item.action === 'file') { docFileInputRef.current?.click(); return }
    if (item.action === 'table') { insertTable(); emit(); return }
    if (item.action === 'checklist') { insertChecklist(); emit(); return }
    if (item.action === 'date') { openDatePicker(); return }
    if (item.action === 'canvasRef') {
      // MUI Menu가 접근성 때문에 포커스를 자기 쪽으로 가져간다 — 고르는 순간 편집기 선택이
      // 사라지므로, 날짜 팝오버와 같은 방식으로 지금 커서 위치를 저장해 뒀다가 되살린다.
      const sel = window.getSelection()
      const range = sel?.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null
      savedRangeRef.current = range
      const rect = range?.getBoundingClientRect() || el?.getBoundingClientRect()
      setCanvasMenuAnchor(rect ? { top: rect.bottom, left: rect.left } : null)
      return
    }
    if (item.action === 'comingSoon') { toast.success('리스트는 다음 업데이트에서 만나요.'); return }
    if (item.cmd) {
      if (LIST_TAGS[item.cmd]) applyList(item.cmd)
      else document.execCommand(item.cmd, false, null)
    }
    else if (item.block) applyBlock(item.block)
    else if (item.html) applyHtml(item.html, item.caret)
    emit()
  }

  /**
   * 우클릭 — 예전엔 '/'와 같은 삽입 메뉴가 떴는데, 새 블록을 끼우는 것과 "지금 고른
   * 블록에 뭔가를 한다"는 서로 다른 일이다(사용자 지적, 2026-08-26). 이제 손잡이
   * (⋮⋮) 클릭과 같은 blockMenu를 연다 — 우클릭한 자리(y좌표)의 블록을 찾아서.
   */
  const handleContextMenu = (e) => {
    e.preventDefault()
    setSlash(null)
    const block = findTopBlockAtY(e.clientY)
    if (!block) return
    setBlockMenu({ el: block, anchor: { top: e.clientY, left: e.clientX } })
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

  const handleDocFiles = (files) => {
    [...files].forEach(insertFile)
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
          붙여 두면 긴 글에서도 계속 보인다.

          평소엔 제목 길이·단계만 짧은 막대로 축약해서 보여준다(글 전체 흐름을
          미니맵처럼 훑는 용도) — 글자로 늘 펼쳐 두니 폭이 168px나 차지해 캔버스보다
          목차가 더 도드라져 보였다(사용자 지적, 2026-08-26). 마우스를 올리면 그
          자리 위에 글자 목록이 겹쳐 뜬다 — width를 넓히는 대신 absolute 오버레이로
          띄워서, 펼쳐져도 옆 캔버스 레이아웃이 밀리지 않는다. */}
      {headings.length > 0 && (
        <Box
          sx={{ width: 18, flexShrink: 0, position: 'sticky', top: 8, pt: 1.4, zIndex: 20 }}
          onMouseEnter={() => setTocExpanded(true)}
          onMouseLeave={() => setTocExpanded(false)}
        >
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.7 }}>
            {headings.map(h => (
              <Box
                key={h.id}
                component="button"
                type="button"
                onClick={() => jumpToHeading(h.id)}
                aria-label={h.text}
                sx={{
                  display: 'block', p: 0, border: 0, background: 'none', cursor: 'pointer',
                  height: 3, borderRadius: 2, bgcolor: 'divider',
                  ml: h.level === 'H2' ? 0 : h.level === 'H3' ? 0.7 : 1.4,
                  width: h.level === 'H2' ? 16 : h.level === 'H3' ? 11 : 7,
                  '&:hover': { bgcolor: 'text.disabled' },
                }}
              />
            ))}
          </Box>

          {tocExpanded && (
            <Paper elevation={4} sx={{
              position: 'absolute', top: 0, left: 0, width: 180, zIndex: 20,
              p: 0.6, border: '1px solid', borderColor: 'divider',
            }}>
              <Typography fontSize="0.7rem" fontWeight={800} color="text.disabled" sx={{ mb: 0.3, pl: 0.8, mt: 0.2 }}>
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
            </Paper>
          )}
        </Box>
      )}

      {/* 목차와 같은 칸(flexGrow:1) 안에 표지 자리 → 제목 → 본문 순으로 둔다 —
          목차가 표지와 같은 줄에서 시작해야 한다는 지적(2026-08-26, "표지가
          목차 있는 곳에 함께 들어가 있어야 함")에 따라, 표지를 목차 바깥(전체
          폭 별도 줄)이 아니라 이 칸 맨 위에 둔다 — 목차 칸과 이 칸은 같은
          flex 줄의 형제라 표지·목차가 같은 높이에서 시작한다. 제목·본문은
          항상 이 칸을 공유해 왼쪽 위치가 표지와도 맞는다.

          표지는 나중에 이미지를 올리는 기능이 붙을 자리를 지금 미리 비워
          둔 것 — 평소엔 안 보이다가 마우스를 올리면 "+표지 추가"가 옅게
          나타난다(노션의 빈 커버 자리와 같은 방식). 지금은 눌러도 안내만
          뜬다 — 실제 업로드는 다음 라운드(PLAN_canvasEditor.md Phase 4). */}
      <Box sx={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <Box
          onClick={() => toast.success('표지 추가 기능은 준비 중입니다.')}
          sx={{
            height: 96, mb: 0.5, borderRadius: 1, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'text.disabled', fontSize: '0.78rem', fontWeight: 600,
            opacity: 0, transition: 'opacity .12s ease, background-color .12s ease',
            '&:hover': { opacity: 1, bgcolor: 'action.hover' },
          }}
        >
          + 표지 추가
        </Box>
        {onTitleChange && (
          <TextField
            fullWidth autoFocus variant="standard"
            placeholder={titlePlaceholder}
            value={title} onChange={e => onTitleChange(e.target.value)}
            InputProps={{ disableUnderline: true }}
            inputProps={{ style: { fontSize: '1.6rem', fontWeight: 800 } }}
            sx={{ mb: 1, px: { xs: 0, sm: 1 } }}
            // 제목을 쓰고 Enter를 치면 본문으로 이어지는 게 자연스럽다.
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); editorRef.current?.focus() }
            }}
          />
        )}
      {/* onMouseMove/onMouseLeave는 편집기(안쪽 Box)가 아니라 이 바깥 칸에 건다 —
          손잡이(⋮⋮)가 편집기 rect 왼쪽 바깥에 fixed로 뜨는데, 편집기에 리스너를
          달면 마우스가 글자 위에서 손잡이 쪽으로 움직이는 순간 편집기의
          mouseleave가 먼저 터져 손잡이가 나타나기 전에 사라졌다(사용자 확인,
          2026-08-26). 손잡이는 이 바깥 칸의 자식이라, 여기 걸면 "편집기 → 손잡이"
          이동은 이 칸 안에서의 이동일 뿐이라 leave가 안 터진다. */}
      <Box
        sx={{ position: 'relative' }}
        onMouseMove={handleEditorMouseMove}
        onMouseLeave={handleEditorMouseLeave}
      >
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
          // 오른쪽 여백을 왼쪽보다 넉넉히 둔다 — 반응(이모지 리액션) 묶음이 블록 오른쪽
          // 바깥(rect.right + 8, position:fixed)에 뜨는데, 본문이 칸 끝까지 꽉 차 있으면
          // 그 자리가 없어 여백 없이 텍스트에 바짝 붙어 보인다(사용자 지적, 2026-08-26).
          minHeight: 320, pl: { xs: 0, sm: 1 }, pr: { xs: 1, sm: 7 }, py: 1,
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
      <input
        ref={docFileInputRef}
        type="file"
        multiple
        hidden
        onChange={e => { handleDocFiles(e.target.files); e.target.value = '' }}
      />

      {/* 블록 손잡이(⋮⋮) — 지금 마우스가 올라간 블록의 왼쪽 바깥에 뜬다. picked(이미지
          손잡이)와 같은 자리 계산 방식이지만, 이건 잘라 보여줄 이유가 없어(overflow
          없음) clip 상자 없이 바로 그린다. 메뉴가 열려 있는 동안에도 계속 보이게 둔다 —
          누른 블록이 어디였는지 잊게 하지 않으려고.

          아이콘은 원래대로 유지한다 — 회색 막대로 바꾼 건 표 안 행·열 손잡이만이다
          (사용자 지적, 2026-08-26: "블록 손잡이 자체는 기존 아이콘 그대로, 표에서의
          손잡이만 바꿔야지"). 표를 고른 상태에서 이 손잡이와 행 손잡이가 같은 줄에
          같이 뜰 수 있는데, 서로 다른 레인(이 손잡이가 안쪽, 행 손잡이가 바깥쪽)에
          두고 모양도 아이콘 vs 막대로 달라 헷갈리지 않는다. */}
      {hoveredBlock && !menuRect && !slash && (
        <Box
          data-block-handle="true"
          onPointerDown={handleHandlePointerDown}
          onMouseEnter={cancelHoverClear}
          onMouseLeave={scheduleHoverClear}
          sx={{
            position: 'fixed',
            top: hoveredBlock.rect.top + 1,
            left: hoveredBlock.rect.left - 26,
            zIndex: 1200, width: 22, height: 22, borderRadius: 0.75,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'grab', color: 'text.disabled',
            bgcolor: blockMenu?.el === hoveredBlock.el ? 'action.hover' : 'transparent',
            '&:hover': { bgcolor: 'action.hover', color: 'text.secondary' },
          }}
        >
          <DragIndicatorIcon sx={{ fontSize: 17 }} />
        </Box>
      )}

      {/* 블록 반응(이모지 리액션) — 손잡이(왼쪽)와 마주 보는 오른쪽에 둔다. 이미 반응이
          달린 블록은 아래(reactionRects)가 늘 보여주므로, 여기서는 "아직 반응이 없는
          블록에 처음 반응을 남기는" 경우만 호버 중에 다룬다(둘 다 그리면 같은 블록에
          알약 줄이 두 번 뜬다).
          data-block-handle — ⋮⋮ 손잡이와 같은 표식. handleEditorMouseMove가 이걸 보면
          hoveredBlock 재배정을 멈춘다 — 이게 없으면 단추 쪽으로 마우스를 살짝만 내려도
          (블록 아래쪽 여백을 지나며) findTopBlockAtY가 다음 블록을 찾아버려 hoveredBlock이
          바뀌고, 단추가 그 블록 자리로 튀어 커서를 피해 도망가 버렸다(사용자 확인,
          2026-08-26 — "마우스커서를 살짝 내리면 아래 줄로 넘어가 버리네"). 팝오버를 연
          뒤에는(reactionPicker) 이 칸이 사라져도 팝오버 자체는 안 닫힌다 — 아래
          ReactionPicker 참고. */}
      {hoveredBlock && !menuRect && !slash
        && !blockReactions[hoveredBlock.el.getAttribute('data-block-id')] && (
        <Box
          data-block-handle="true"
          sx={{ position: 'fixed', top: hoveredBlock.rect.top, left: hoveredBlock.rect.right + 8, zIndex: 1200 }}
          onMouseEnter={cancelHoverClear}
          onMouseLeave={scheduleHoverClear}
        >
          <BlockReactionRow
            data={null}
            uid={reactionUid}
            onToggle={emoji => {
              const id = ensureHoveredBlockId()
              if (id) toggleReaction(id, emoji)
            }}
            onAddClick={e => {
              const id = ensureHoveredBlockId()
              openReactionPicker(id, e)
            }}
          />
        </Box>
      )}

      {/* 이미 반응이 하나라도 달린 블록은 호버와 무관하게 늘 알약 줄을 보여준다 — 손잡이처럼
          호버해야만 보이면 "이 글에 누가 반응을 남겼다"는 걸 훑어보기 어렵다. */}
      {reactionRects.map(({ blockId, rect }) => (
        <Box
          key={blockId} data-block-handle="true"
          onMouseEnter={cancelHoverClear} onMouseLeave={scheduleHoverClear}
          sx={{ position: 'fixed', top: rect.top, left: rect.right + 8, zIndex: 1150 }}
        >
          <BlockReactionRow
            data={blockReactions[blockId]}
            uid={reactionUid}
            onToggle={emoji => toggleReaction(blockId, emoji)}
            onAddClick={e => openReactionPicker(blockId, e)}
          />
        </Box>
      ))}

      {/* 이모지 고르는 팝오버 — hoveredBlock과 무관한 별도 상태(reactionPicker)로 열려
          있는 동안은 위 두 칸이 사라져도(마우스가 움직여 hoveredBlock이 바뀌거나 비어도)
          그대로 떠 있는다. blockMenu(Menu, anchorPosition)와 같은 이유·같은 방식. */}
      <ReactionPicker
        anchor={reactionPicker?.anchor}
        onClose={() => setReactionPicker(null)}
        onPick={emoji => {
          if (reactionPicker) toggleReaction(reactionPicker.blockId, emoji)
          setReactionPicker(null)
        }}
      />

      {/* 드래그로 블록을 끄는 동안 삽입될 자리를 보여준다 — 콜아웃·인용문 "안"으로
          들어가는 중이면 그 블록 전체를 테두리로 감싸고, 아니면 형제 사이 얇은 선. */}
      {blockDrag?.dropInto ? (
        <Box sx={{
          position: 'fixed',
          top: blockDrag.dropInto.getBoundingClientRect().top - 2,
          left: blockDrag.dropInto.getBoundingClientRect().left - 2,
          width: blockDrag.dropInto.getBoundingClientRect().width + 4,
          height: blockDrag.dropInto.getBoundingClientRect().height + 4,
          border: '2px solid', borderColor: 'primary.main', borderRadius: 1.5,
          bgcolor: 'primary.main', opacity: 0.08,
          zIndex: 1300, pointerEvents: 'none',
        }} />
      ) : blockDrag && (
        // 컨테이너 안에서 재배치 중이면 그 컨테이너 폭만큼만, 아니면 편집기 전체 폭.
        <Box sx={{
          position: 'fixed', top: blockDrag.indicatorTop - 1,
          left: (blockDrag.referenceParent ?? editorRef.current)?.getBoundingClientRect().left ?? 0,
          width: (blockDrag.referenceParent ?? editorRef.current)?.getBoundingClientRect().width ?? 0,
          height: 2, bgcolor: 'primary.main', zIndex: 1300, pointerEvents: 'none',
          borderRadius: 1,
        }} />
      )}

      {/* 블록 메뉴 — 우클릭과 손잡이(⋮⋮) 클릭이 같이 쓴다(사용자 요청, 2026-08-26 —
          "지금 고른 블록에 뭔가를 한다"는 하나의 메뉴). 삭제·복제는 항상, 변환은
          문단·제목·목록·인용류일 때만(표·이미지·콜아웃·구분선에는 뜻이 없다),
          배경색은 콜아웃일 때만 보여준다. */}
      <Menu anchorReference="anchorPosition" anchorPosition={blockMenu?.anchor} open={!!blockMenu} onClose={closeBlockMenu}>
        <MenuItem sx={{ fontSize: '0.85rem', gap: 1 }} onClick={duplicateBlock}>
          <ContentCopyIcon sx={{ fontSize: 17 }} />복제
        </MenuItem>
        <MenuItem sx={{ fontSize: '0.85rem', gap: 1, color: 'error.main' }} onClick={deleteBlock}>
          <DeleteOutlineIcon sx={{ fontSize: 17 }} />삭제
        </MenuItem>
        {blockMenu?.el && CONVERTIBLE_TAGS.has(blockMenu.el.tagName) && (
          <MenuItem
            sx={{ fontSize: '0.85rem', gap: 1 }}
            onClick={e => setConvertSubmenuAnchor(e.currentTarget)}
          >
            <TitleIcon sx={{ fontSize: 17 }} />다른 블록으로 변환
          </MenuItem>
        )}
        {blockMenu?.el?.tagName === 'ASIDE' && [
          <Divider key="d" sx={{ my: 0.5 }} />,
          <Typography key="l" sx={{ px: 2, py: 0.3, fontSize: '0.7rem', fontWeight: 800, color: 'text.disabled' }}>
            배경 색상
          </Typography>,
          <Box key="swatches" sx={{ display: 'flex', gap: 0.6, px: 2, py: 0.5 }}>
            {CALLOUT_COLORS.map(c => (
              <Tooltip key={c.id || 'default'} title={c.label}>
                <Box
                  onClick={() => setCalloutColor(c.id)}
                  sx={{
                    width: 20, height: 20, borderRadius: '50%', cursor: 'pointer',
                    bgcolor: c.swatch, border: '1px solid', borderColor: 'divider',
                    '&:hover': { boxShadow: theme => `0 0 0 2px ${theme.palette.primary.main}` },
                  }}
                />
              </Tooltip>
            ))}
          </Box>,
        ]}
      </Menu>
      <Menu anchorEl={convertSubmenuAnchor} open={!!convertSubmenuAnchor} onClose={() => setConvertSubmenuAnchor(null)}>
        {BLOCK_CONVERT_OPTIONS.map(o => (
          <MenuItem key={o.id} sx={{ fontSize: '0.85rem', gap: 1 }} onClick={() => convertBlock(o)}>
            <o.Icon sx={{ fontSize: 17 }} />{o.label}
          </MenuItem>
        ))}
      </Menu>

      {uploading > 0 && (
        <Typography fontSize="0.75rem" color="text.secondary" sx={{ mt: 0.5 }}>
          {uploading}개 올리는 중…
        </Typography>
      )}

      {/* 하단에 떠 있는 삽입 막대 — Slack 캔버스의 알약 모양 도구줄과 비슷하게(사용자가
          캡처로 준 참고 화면: 초록 원형 '+' + 자주 쓰는 아이콘 몇 개가 한 줄에). '+'는
          전체 메뉴(표·날짜·캔버스·파일·리스트)를 열고, 나머지는 자주 쓰는 것만 골라
          한 번에 바로 넣는다 — 이모지·글자 스타일처럼 아직 없는 기능까지 자리를 만들지는
          않았다(캡처와 똑같지는 않고 "비슷하게"). 캔버스 가로 폭 전체를 기준으로
          가운데 오도록, sticky는 폭 전체를 차지하는 바깥 칸에 걸고 알약은 그 안에서만
          가운데로 민다. */}
      <Box sx={{ position: 'sticky', bottom: 12, display: 'flex', justifyContent: 'center', mt: 1, zIndex: 5 }}>
      <Box sx={{
        display: 'inline-flex', alignItems: 'center', gap: 0.2,
        p: 0.4, borderRadius: 999,
        bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', boxShadow: 3,
      }}>
        <Tooltip title="삽입 (표·날짜·캔버스·파일…)">
          <IconButton
            size="small"
            onClick={(e) => {
              // 이 클릭이 window까지 올라가면 메뉴를 닫는 리스너(아래 useEffect)가
              // 같은 클릭에 걸려 열자마자 닫혀버린다 — 눌러도 반응이 없는 것처럼 보이던
              // 원인이 이것이었다.
              e.stopPropagation()
              setSlash(null)
              const r = e.currentTarget.getBoundingClientRect()
              setMenuRect({ top: r.top, bottom: r.top, left: r.left, right: r.left, width: 0, height: 0 })
            }}
            sx={{
              bgcolor: 'primary.main', color: 'primary.contrastText',
              '&:hover': { bgcolor: 'primary.dark' },
            }}
          >
            <AddIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="이미지">
          <IconButton size="small" onClick={e => { e.stopPropagation(); fileInputRef.current?.click() }}>
            <ImageOutlinedIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="파일">
          <IconButton size="small" onClick={e => { e.stopPropagation(); docFileInputRef.current?.click() }}>
            <AttachFileIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="표">
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation()
              // 캔버스를 아직 한 번도 안 눌러본 상태면 커서가 어디에도 없어 표를 끼울
              // 자리가 없다 — '/'·우클릭 메뉴 경로처럼 먼저 포커스를 준다.
              editorRef.current?.focus()
              insertTable()
              emit()
            }}
          >
            <TableChartOutlinedIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="체크리스트">
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation()
              editorRef.current?.focus()
              insertChecklist()
              emit()
            }}
          >
            <PlaylistAddCheckIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
      </Box>
      </Box>

      {/* 표를 고르면 바깥에 뜨는 행·열 추가 단추. 이미지 손잡이와 같은 자리 계산 방식이지만
          표는 잘라 보여줄 이유가 없어(overflow 없음) 클립 상자 없이 바로 그린다. */}
      {pickedTable && (
        <>
          {/* 행 추가·삭제 — 표 아래, 나란히. 삭제는 늘 마지막 행이라 추가 바로 옆에
              두면 "방금 늘린 걸 되돌린다"는 뜻으로 자연스럽게 읽힌다. */}
          <Box sx={{
            position: 'fixed', top: pickedTable.rect.bottom + 4, left: pickedTable.rect.left,
            zIndex: 1300, display: 'flex', gap: 0.4,
          }}>
            <Box
              onMouseDown={e => { e.preventDefault(); addTableRow() }}
              sx={{
                px: 0.9, py: 0.3, fontSize: '0.72rem', fontWeight: 700,
                borderRadius: 0.75, cursor: 'pointer',
                bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', boxShadow: 2,
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              + 행 추가
            </Box>
            {pickedTable.el.rows.length > 1 && (
              <Box
                onMouseDown={e => { e.preventDefault(); deleteTableRow() }}
                sx={{
                  px: 0.9, py: 0.3, fontSize: '0.72rem', fontWeight: 700,
                  borderRadius: 0.75, cursor: 'pointer', color: 'error.main',
                  bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', boxShadow: 2,
                  '&:hover': { bgcolor: 'action.hover' },
                }}
              >
                − 행 삭제
              </Box>
            )}
          </Box>
          {/* 열 추가·삭제 — 표 오른쪽, 위아래로. */}
          <Box sx={{
            position: 'fixed', top: pickedTable.rect.top, left: pickedTable.rect.right + 4,
            zIndex: 1300, display: 'flex', flexDirection: 'column', gap: 0.4,
          }}>
            <Box
              onMouseDown={e => { e.preventDefault(); addTableCol() }}
              sx={{
                px: 0.9, py: 0.3, fontSize: '0.72rem', fontWeight: 700,
                borderRadius: 0.75, cursor: 'pointer',
                bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', boxShadow: 2,
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              + 열 추가
            </Box>
            {(pickedTable.el.rows[0]?.cells.length || 0) > 1 && (
              <Box
                onMouseDown={e => { e.preventDefault(); deleteTableCol() }}
                sx={{
                  px: 0.9, py: 0.3, fontSize: '0.72rem', fontWeight: 700,
                  borderRadius: 0.75, cursor: 'pointer', color: 'error.main',
                  bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', boxShadow: 2,
                  '&:hover': { bgcolor: 'action.hover' },
                }}
              >
                − 열 삭제
              </Box>
            )}
          </Box>
          {/* 표 폭 조절 손잡이 — 이미지 리사이즈 손잡이와 같은 모양(오른쪽 아래 원형). */}
          <Box
            onPointerDown={startTableResize}
            sx={{
              position: 'fixed',
              top: pickedTable.rect.bottom - 7, left: pickedTable.rect.right - 7,
              width: 14, height: 14, borderRadius: '50%', zIndex: 1300,
              bgcolor: 'primary.main', border: '2px solid #fff',
              cursor: 'nwse-resize',
            }}
          />

          {/* 칸(열) 너비 조정 — 첫 행 칸 경계마다 얇은 세로 띠. 평소엔 안 보이다가
              올리면 파랗게 — 표 테두리와 헷갈리지 않게. */}
          {[...Array(Math.max(0, (pickedTable.el.rows[0]?.cells.length || 1) - 1))].map((_, i) => {
            const cell = pickedTable.el.rows[0]?.cells[i]
            if (!cell) return null
            const r = cell.getBoundingClientRect()
            return (
              <Box
                key={i}
                onPointerDown={startColResize(i)}
                sx={{
                  position: 'fixed', top: pickedTable.rect.top, left: r.right - 2,
                  width: 4, height: pickedTable.rect.height, zIndex: 1250,
                  cursor: 'col-resize',
                  '&:hover': { bgcolor: 'primary.main', opacity: 0.5 },
                }}
              />
            )
          })}

          {/* 행 손잡이 — 표 왼쪽 바깥, 지금 마우스가 있는 행 옆. 끌면 이 표 안에서만
              행 순서가 바뀐다(블록 드래그와 같은 모양, 범위만 표 안). 표에서 더 먼
              바깥 레인에 뒀더니 표와 멀어 보여 직관성이 떨어진다는 지적(2026-08-26)에
              표 바로 옆으로 다시 붙였다 — 모양(막대 vs 아이콘)이 이미 블록 손잡이와
              다르니 자리가 겹쳐도 헷갈리지 않는다. */}
          {hoveredRow && !rowDrag && !colDrag && (
            <Box
              data-table-handle="true"
              onPointerDown={startRowDrag}
              onMouseEnter={cancelHoverClear}
              onMouseLeave={scheduleHoverClear}
              sx={{
                position: 'fixed', top: hoveredRow.rect.top,
                left: pickedTable.rect.left - 22, zIndex: 1250,
                width: 16, height: hoveredRow.rect.height,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'grab',
                '&:hover .handle-bar': { bgcolor: 'text.secondary' },
              }}
            >
              <Box className="handle-bar" sx={{
                width: 4, height: '70%', borderRadius: 2, bgcolor: 'action.disabled',
                transition: 'background-color .1s ease',
              }} />
            </Box>
          )}

          {/* 열 손잡이 — 표 위쪽 바깥, 지금 마우스가 있는 열 위. 끌면 모든 행에서
              그 칸이 함께 옮겨진다. 가로 막대 — 세로 손잡이들과 축을 다르게 해서
              "이건 옆으로 움직인다"는 것이 모양만 봐도 드러나게 했다. */}
          {hoveredCol && !rowDrag && !colDrag && (
            <Box
              data-table-handle="true"
              onPointerDown={startColDrag}
              onMouseEnter={cancelHoverClear}
              onMouseLeave={scheduleHoverClear}
              sx={{
                position: 'fixed', top: pickedTable.rect.top - 20,
                left: hoveredCol.rect.left, zIndex: 1250,
                width: hoveredCol.rect.width, height: 16,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'grab',
                '&:hover .handle-bar': { bgcolor: 'text.secondary' },
              }}
            >
              <Box className="handle-bar" sx={{
                width: '70%', height: 4, borderRadius: 2, bgcolor: 'action.disabled',
                transition: 'background-color .1s ease',
              }} />
            </Box>
          )}

          {/* 행 드래그 중 커서를 따라다니는 미리보기 — 실제 행 내용을 그대로 보여줘
              "이 행을 들어서 옮기는 중"임을 알 수 있게 한다. tbody에 <tr>로 감싸
              넣는 이유는 td가 table 파싱 맥락 밖에서는 제대로 안 만들어지기 때문. */}
          {rowDrag?.rowHtml != null && (
            <Box sx={{
              position: 'fixed', top: rowDrag.ghostTop, left: pickedTable.rect.left,
              width: pickedTable.rect.width, zIndex: 1400, pointerEvents: 'none',
              opacity: 0.95, boxShadow: 4, borderRadius: 1, overflow: 'hidden',
              border: '2px solid', borderColor: 'primary.main', bgcolor: 'background.paper',
            }}>
              <Box
                component="table"
                sx={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse' }}
              >
                <tbody dangerouslySetInnerHTML={{ __html: `<tr>${rowDrag.rowHtml}</tr>` }} />
              </Box>
            </Box>
          )}

          {/* 행·열 드래그 중 삽입 위치 표시선. */}
          {rowDrag && (
            <Box sx={{
              position: 'fixed', top: rowDrag.indicatorTop - 1, left: pickedTable.rect.left,
              width: pickedTable.rect.width, height: 2, bgcolor: 'primary.main',
              zIndex: 1300, pointerEvents: 'none', borderRadius: 1,
            }} />
          )}
          {colDrag && (
            <Box sx={{
              position: 'fixed', top: pickedTable.rect.top, left: colDrag.indicatorLeft - 1,
              width: 2, height: pickedTable.rect.height, bgcolor: 'primary.main',
              zIndex: 1300, pointerEvents: 'none', borderRadius: 1,
            }} />
          )}
        </>
      )}

      {/* 날짜 칩 팝오버 — anchorPosition을 쓰는 이유는 버튼이 아니라 커서 위치를
          기준으로 띄워야 해서다(누른 메뉴 항목은 이미 사라진 뒤라 anchorEl이 없다). */}
      <Popover
        open={!!datePicker}
        anchorReference="anchorPosition"
        anchorPosition={datePicker ? { top: datePicker.rect.bottom, left: datePicker.rect.left } : undefined}
        onClose={() => setDatePicker(null)}
      >
        <Box sx={{ p: 1.2, display: 'flex', gap: 0.8, alignItems: 'center' }}>
          <TextField
            type="date" size="small" autoFocus
            value={datePicker?.value || ''}
            onChange={e => setDatePicker(d => ({ ...d, value: e.target.value }))}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); confirmDatePicker() } }}
          />
          <Button size="small" variant="contained" disabled={!datePicker?.value} onClick={confirmDatePicker}>
            삽입
          </Button>
        </Box>
      </Popover>

      {/* 캔버스 삽입 고르기 — 이 채널의 업무 글만 보여준다(부모가 canvasOptions로 넘김,
          지금 편집 중인 글 자신은 이미 빼서 넘어온다). */}
      <Menu
        open={!!canvasMenuAnchor}
        anchorReference="anchorPosition"
        anchorPosition={canvasMenuAnchor || undefined}
        onClose={() => setCanvasMenuAnchor(null)}
      >
        {canvasOptions.length === 0 ? (
          <MenuItem disabled sx={{ fontSize: '0.82rem', whiteSpace: 'normal', maxWidth: 260 }}>
            이 채널에 아직 다른 업무 글이 없습니다.
          </MenuItem>
        ) : canvasOptions.map(p => (
          <MenuItem key={p.id} sx={{ fontSize: '0.85rem', maxWidth: 320 }} onClick={() => pickCanvasRef(p)}>
            <Typography fontSize="0.85rem" noWrap>{p.title}</Typography>
          </MenuItem>
        ))}
      </Menu>

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
        extraItems={CANVAS_EXTRA_ITEMS}
      />
      </Box>
      </Box>
    </Box>
  )
})

export default CanvasEditor
