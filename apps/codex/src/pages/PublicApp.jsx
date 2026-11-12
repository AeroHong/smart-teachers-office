import { useCallback, useEffect, useState } from 'react'
import { Route, Routes, useParams, useSearchParams } from 'react-router-dom'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import DownloadIcon from '@mui/icons-material/Download'
import PrintIcon from '@mui/icons-material/Print'
import { Brand, barSx } from '../components/AppBar'
import AssistantPanel from '../components/AssistantPanel'
import ReaderLayout, { useHashFocus } from '../components/ReaderLayout'
import RegulationBody from '../components/RegulationBody'
import RegulationHeader from '../components/RegulationHeader'
import TocSidebar from '../components/TocSidebar'
import { downloadRegulationHwpx } from '../lib/hwpxExport'
import { getPublicRegulation, loadPublicSearch, usePublicBook } from '../lib/publicBook'
import { useSearchIndex } from '../lib/useSearchIndex'
import { BookOverview, QuickTerms, SearchField } from './Home'
import { SearchResults } from './SearchPage'

/** 공개 화면 상단 — 로그인·메뉴 없이 이름만 */
function PublicBar({ base, title, school }) {
  return (
    <Box component="header" className="no-print" sx={barSx}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ width: '100%' }}>
        <Brand to={base} school={school} />
        <Box flex={1} />
        <Typography variant="caption" sx={{ opacity: 0.8 }}>읽기 전용</Typography>
      </Stack>
    </Box>
  )
}

function usePublicNodes(schoolId) {
  return useCallback((regId) => getPublicRegulation(schoolId, regId).then((r) => r?.nodes || null), [schoolId])
}

function PublicRegulation({ schoolId, book, base, entries }) {
  const { regId } = useParams()
  const [reg, setReg] = useState(undefined)
  const loadNodes = usePublicNodes(schoolId)
  useEffect(() => { setReg(undefined); getPublicRegulation(schoolId, regId).then(setReg).catch(() => setReg(null)) }, [schoolId, regId])
  const focusId = useHashFocus(!!reg)
  const entry = book.regulations.find((r) => r.id === regId)
  return (
    <ReaderLayout
      top={<PublicBar base={base} title={book.title} school={book.schoolName} />}
      sidebar={(close) => <TocSidebar book={book} regId={regId} base={base} onPick={close} />}
      assistant={(close) => <AssistantPanel book={book} entries={entries} base={base} onClose={close} />}
    >
      {reg === undefined && <CircularProgress />}
      {reg === null && <Alert severity="warning">공개되지 않은 규정입니다.</Alert>}
      {reg && (
        <>
          <RegulationHeader
            entry={{ ...entry, title: reg.title }}
            version={reg}
            book={book}
            base={base}
            actions={(
              <>
                <Button size="small" startIcon={<DownloadIcon />} onClick={() => downloadRegulationHwpx({ title: reg.title, version: reg, history: [], regId, book, loadNodes })}>한글(hwpx)</Button>
                <Button size="small" startIcon={<PrintIcon />} onClick={() => window.print()}>인쇄·PDF</Button>
              </>
            )}
          />
          <RegulationBody regId={regId} regTitle={reg.title} nodes={reg.nodes} book={book} base={base} focusId={focusId} loadNodes={loadNodes} />
        </>
      )}
    </ReaderLayout>
  )
}

function PublicSearch({ book, base, entries }) {
  const [params] = useSearchParams()
  const q = params.get('q') || ''
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <PublicBar base={base} title={book.title} school={book.schoolName} />
      <Box sx={{ maxWidth: 900, mx: 'auto', px: 2, py: 3 }}>
        <Stack spacing={3}>
          <SearchField key={q} initial={q} base={base} size="small" />
          <SearchResults book={book} entries={entries} q={q} base={base} />
        </Stack>
      </Box>
    </Box>
  )
}

function PublicHome({ book, base }) {
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <PublicBar base={base} title={book.title} school={book.schoolName} />
      <Box sx={{ maxWidth: 980, mx: 'auto', px: 2, pt: { xs: 5, md: 10 }, pb: 8 }}>
        <Stack spacing={3} alignItems="center">
          <Typography variant="h4" textAlign="center">{book.title}</Typography>
          <Typography color="text.secondary">공개 규정 {book.regulations.length}개 · 로그인 없이 읽을 수 있습니다</Typography>
          <Box sx={{ width: '100%', maxWidth: 760 }}><SearchField base={base} autoFocus /></Box>
          <QuickTerms base={base} />
          <BookOverview book={book} base={base} />
        </Stack>
      </Box>
    </Box>
  )
}

/**
 * 외부 공개(학교 홈페이지 링크) — /public/:schoolId/… 로그인 없이 공개 사본만 읽는다.
 * 학교 데이터 경로는 읽지 않는다(규칙도 막혀 있다).
 */
export default function PublicApp() {
  const { schoolId } = useParams()
  const base = `/public/${schoolId}`
  const { book, loading, error } = usePublicBook(schoolId)
  const { entries } = useSearchIndex(schoolId, book, loadPublicSearch)
  if (loading) return <Box display="flex" justifyContent="center" mt={20}><CircularProgress /></Box>
  if (error || !book) {
    return (
      <Box sx={{ maxWidth: 520, mx: 'auto', mt: 15, px: 2 }}>
        <Alert severity="info">공개된 규정집이 없습니다. 학교에 문의해 주세요.</Alert>
      </Box>
    )
  }
  return (
    <Routes>
      <Route path="r/:regId" element={<PublicRegulation schoolId={schoolId} book={book} base={base} entries={entries} />} />
      <Route path="search" element={<PublicSearch book={book} base={base} entries={entries} />} />
      <Route path="*" element={<PublicHome book={book} base={base} />} />
    </Routes>
  )
}
