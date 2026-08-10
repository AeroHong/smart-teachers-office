/**
 * `/` 입력으로 블록을 넣는 메뉴 (Notion 방식).
 *
 * 서식 도구 막대는 아이콘을 알아야 쓸 수 있고, 자리가 좁아 담을 수 있는 것도 몇 개뿐이다.
 * 글을 쓰다가 `/`만 치면 이름으로 골라 넣을 수 있으면 도구 막대에 없는 것(제목·토글·
 * 구분선)까지 손을 떼지 않고 넣게 된다.
 *
 * 커서 위치에 띄우기 때문에 화면 아래쪽에서 입력하면 메뉴가 잘린다. 아래 공간이 모자라면
 * 커서 위로 올려 붙인다.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import TitleIcon from '@mui/icons-material/Title'
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted'
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered'
import FormatQuoteIcon from '@mui/icons-material/FormatQuote'
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined'
import ExpandCircleDownIcon from '@mui/icons-material/ExpandCircleDown'
import HorizontalRuleIcon from '@mui/icons-material/HorizontalRule'
import ImageIcon from '@mui/icons-material/Image'

const MENU_WIDTH = 268
const MENU_MAX_HEIGHT = 300

/**
 * 넣을 수 있는 블록들.
 * keywords에 한글·영문을 함께 둬서 '제목'으로도 'h1'으로도 찾을 수 있게 한다.
 */
export const SLASH_ITEMS = [
  { id: 'h1', label: '큰 제목', hint: '문단을 나누는 제목', keywords: 'ㅈㅁ 제목 큰제목 h1 title', Icon: TitleIcon, block: 'H2' },
  { id: 'h2', label: '작은 제목', hint: '소제목', keywords: 'ㅈㅁ 제목 작은제목 h2 subtitle', Icon: TitleIcon, block: 'H3' },
  { id: 'ul', label: '글머리 기호', hint: '· 목록', keywords: 'ㄱㅁㄹ 글머리 목록 bullet list', Icon: FormatListBulletedIcon, cmd: 'insertUnorderedList' },
  { id: 'ol', label: '번호 매기기', hint: '1. 2. 3. 목록', keywords: 'ㅂㅎ 번호 순서 number ordered list', Icon: FormatListNumberedIcon, cmd: 'insertOrderedList' },
  { id: 'quote', label: '인용', hint: '들여쓴 인용문', keywords: 'ㅇㅇ 인용 quote', Icon: FormatQuoteIcon, block: 'BLOCKQUOTE' },
  { id: 'callout', label: '콜아웃', hint: '꼭 봐야 할 안내 상자', keywords: 'ㅋㅇㅅ 콜아웃 강조 안내 주의 callout note', Icon: LightbulbOutlinedIcon, html: '<aside>💡 꼭 확인해주세요</aside><p><br></p>' },
  { id: 'toggle', label: '토글', hint: '접었다 펴는 상세 내용', keywords: 'ㅌㄱ 토글 접기 details toggle', Icon: ExpandCircleDownIcon, html: '<details><summary>제목</summary><div>내용</div></details><p><br></p>' },
  { id: 'hr', label: '구분선', hint: '가로 줄로 나누기', keywords: 'ㄱㅂㅅ 구분선 divider hr line', Icon: HorizontalRuleIcon, html: '<hr/><p><br></p>' },
  { id: 'image', label: '이미지', hint: '파일에서 고르기', keywords: 'ㅇㅁㅈ 이미지 사진 그림 image photo', Icon: ImageIcon, action: 'image' },
]

export default function SlashMenu({ open, anchorRect, query, onSelect, onClose }) {
  const [cursor, setCursor] = useState(0)
  const listRef = useRef(null)

  const items = useMemo(() => {
    const q = (query || '').trim().toLowerCase()
    if (!q) return SLASH_ITEMS
    return SLASH_ITEMS.filter(i =>
      i.label.toLowerCase().includes(q) || i.keywords.toLowerCase().includes(q))
  }, [query])

  useEffect(() => { setCursor(0) }, [query])

  // 키보드 조작은 편집기에 포커스가 있는 채로 이뤄져야 한다. 메뉴가 포커스를 가져가면
  // 글자를 계속 칠 수 없으므로, 창 단계에서 키를 가로챈다.
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      // 한글 입력 중에는 Enter가 '글자 확정'이지 '선택'이 아니다. 여기서 가로채면
      // 마지막 글자가 확정되기 전에 메뉴가 실행돼, 지우는 글자 수가 어긋나고
      // 확정된 글자만 본문에 남는다 ('/구분선' → '선'이 남던 문제).
      if (e.isComposing || e.keyCode === 229) return
      if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, items.length - 1)) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)) }
      else if (e.key === 'Enter' || e.key === 'Tab') {
        if (items[cursor]) { e.preventDefault(); onSelect(items[cursor]) }
      } else if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, items, cursor, onSelect, onClose])

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  if (!open || !anchorRect || items.length === 0) return null

  // 아래 공간이 모자라면 커서 위로 올린다
  const spaceBelow = window.innerHeight - anchorRect.bottom
  const above = spaceBelow < MENU_MAX_HEIGHT + 24
  const top = above ? anchorRect.top - Math.min(MENU_MAX_HEIGHT, items.length * 46 + 16) - 6 : anchorRect.bottom + 6
  const left = Math.min(anchorRect.left, window.innerWidth - MENU_WIDTH - 16)

  return (
    <Paper
      elevation={8}
      ref={listRef}
      sx={{
        position: 'fixed', top, left, width: MENU_WIDTH, zIndex: 1400,
        maxHeight: MENU_MAX_HEIGHT, overflowY: 'auto', py: 0.5,
        border: '1px solid', borderColor: 'divider',
      }}
    >
      {items.map((item, i) => (
        <Box
          key={item.id}
          data-active={i === cursor}
          onMouseDown={e => { e.preventDefault(); onSelect(item) }}
          onMouseEnter={() => setCursor(i)}
          sx={{
            display: 'flex', alignItems: 'center', gap: 1.2,
            px: 1.2, py: 0.7, cursor: 'pointer',
            bgcolor: i === cursor ? 'action.hover' : 'transparent',
          }}
        >
          <item.Icon sx={{ fontSize: 18, color: 'text.secondary', flexShrink: 0 }} />
          <Box sx={{ minWidth: 0 }}>
            <Typography fontSize="0.85rem" fontWeight={600} noWrap>{item.label}</Typography>
            <Typography fontSize="0.73rem" color="text.secondary" noWrap>{item.hint}</Typography>
          </Box>
        </Box>
      ))}
    </Paper>
  )
}
