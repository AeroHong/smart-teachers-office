import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Drawer from '@mui/material/Drawer'
import Stack from '@mui/material/Stack'
import useMediaQuery from '@mui/material/useMediaQuery'
import MenuBookIcon from '@mui/icons-material/MenuBook'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'

const SIDE_W = 290
const ASSIST_W = 360
const PANE_H = 'calc(100vh - 52px)'

/** 주소의 #n-… 로 스크롤하고, 잠깐 노랗게 표시할 노드 id를 돌려준다 */
export function useHashFocus(ready) {
  const { hash } = useLocation()
  const [focusId, setFocusId] = useState(null)
  useEffect(() => {
    if (!ready || !hash.startsWith('#n-')) { setFocusId(null); return undefined }
    const id = decodeURIComponent(hash.slice(3))
    const t = setTimeout(() => {
      document.getElementById(`n-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setFocusId(id)
    }, 50)
    const clear = setTimeout(() => setFocusId(null), 2500)
    return () => { clearTimeout(t); clearTimeout(clear) }
  }, [hash, ready])
  return focusId
}

const readPref = () => { try { return localStorage.getItem('cx.assist') !== '0' } catch { return true } }
const writePref = (v) => { try { localStorage.setItem('cx.assist', v ? '1' : '0') } catch { /* 없어도 된다 */ } }

/**
 * 3단 화면 — 왼쪽 목차, 가운데 본문, 오른쪽 도우미.
 * 넓은 화면은 도우미를 옆에 붙여 두고(닫으면 기억), 좁은 화면은 목차·도우미 모두 버튼으로 여는 서랍.
 * @param {{ top: node, sidebar: (close) => node, assistant: (close) => node, children }} p
 */
export default function ReaderLayout({ top, sidebar, assistant, children }) {
  const wide = useMediaQuery('(min-width:1200px)')
  const mid = useMediaQuery('(min-width:900px)')
  const [tocOpen, setTocOpen] = useState(false)
  const [pinned, setPinned] = useState(readPref)       // 넓은 화면: 옆에 붙인 도우미
  const [drawer, setDrawer] = useState(false)          // 좁은 화면: 서랍 도우미
  const showInline = wide && pinned
  const openAssist = () => { if (wide) { setPinned(true); writePref(true) } else setDrawer(true) }
  const closeInline = () => { setPinned(false); writePref(false) }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', display: 'flex', flexDirection: 'column' }}>
      {top}
      <Box sx={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {mid ? (
          <Box className="no-print" sx={{ width: SIDE_W, flexShrink: 0, borderRight: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', position: 'sticky', top: 52, height: PANE_H }}>
            {sidebar(() => {})}
          </Box>
        ) : (
          <Drawer open={tocOpen} onClose={() => setTocOpen(false)} PaperProps={{ sx: { width: 'min(320px, 88vw)' } }}>
            {sidebar(() => setTocOpen(false))}
          </Drawer>
        )}
        <Box component="main" sx={{ flex: 1, minWidth: 0, px: { xs: 2, md: 4 }, py: 3 }}>
          <Stack direction="row" spacing={1} className="no-print" sx={{ mb: 1, justifyContent: 'flex-end', minHeight: 30 }}>
            {!mid && <Button size="small" startIcon={<MenuBookIcon />} onClick={() => setTocOpen(true)}>목차</Button>}
            {!showInline && <Button size="small" startIcon={<AutoAwesomeIcon />} onClick={openAssist}>규정 찾기 도우미</Button>}
          </Stack>
          <Box sx={{ maxWidth: 880, mx: 'auto' }}>{children}</Box>
        </Box>
        {showInline && (
          <Box className="no-print" sx={{ width: ASSIST_W, flexShrink: 0, borderLeft: '1px solid', borderColor: 'divider', position: 'sticky', top: 52, height: PANE_H }}>
            {assistant(closeInline)}
          </Box>
        )}
        {!wide && (
          <Drawer anchor="right" open={drawer} onClose={() => setDrawer(false)} PaperProps={{ sx: { width: 'min(380px, 92vw)' } }}>
            {assistant(() => setDrawer(false))}
          </Drawer>
        )}
      </Box>
    </Box>
  )
}
