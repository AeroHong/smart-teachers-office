import { useState } from 'react'
import { Link as RouterLink, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import DownloadIcon from '@mui/icons-material/Download'
import EditNoteIcon from '@mui/icons-material/EditNote'
import HistoryIcon from '@mui/icons-material/History'
import PrintIcon from '@mui/icons-material/Print'
import { useAuth } from '@shared/contexts/AuthContext'
import AppBar from '../components/AppBar'
import AssistantPanel from '../components/AssistantPanel'
import ReaderLayout, { useHashFocus } from '../components/ReaderLayout'
import RegulationBody from '../components/RegulationBody'
import RegulationHeader from '../components/RegulationHeader'
import TocSidebar from '../components/TocSidebar'
import { createAmendment, getCurrentNodes, useBook, useRegulation } from '../lib/data'
import { downloadRegulationHwpx } from '../lib/hwpxExport'
import { askRegulationAi } from '../lib/ai'
import { useRegulationRole } from '../lib/useRegulationRole'
import { useSearchIndex } from '../lib/useSearchIndex'
import { fmtDate } from './Home'

/** 규정 열람 — /r/:regId(?v=버전) */
export default function RegulationPage() {
  const { regId } = useParams()
  const [params] = useSearchParams()
  const verId = params.get('v')
  const navigate = useNavigate()
  const { schoolId, user, userName } = useAuth()
  const { canEdit } = useRegulationRole()
  const { book } = useBook(schoolId)
  const { reg, version, loading, error } = useRegulation(schoolId, regId, verId)
  const { entries } = useSearchIndex(schoolId, book)
  const focusId = useHashFocus(!!version)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const entry = book?.regulations?.find((r) => r.id === regId)

  const startAmendment = async () => {
    setBusy(true); setErr('')
    try {
      const id = await createAmendment(schoolId, { reg: { id: regId, title: entry?.title || reg.title }, version }, { uid: user.uid, name: userName })
      navigate(`/amendments/${id}`)
    } catch (e) { setErr(`개정안을 만들지 못했습니다: ${e.message}`); setBusy(false) }
  }

  const past = verId && reg && verId !== reg.currentVersionId
  return (
    <ReaderLayout
      top={<AppBar />}
      sidebar={(close) => <TocSidebar book={book} regId={regId} onPick={close} />}
      assistant={(close) => <AssistantPanel book={book} entries={entries} onClose={close} askAi={(q, s) => askRegulationAi(schoolId, q, s)} />}
    >
      {loading && <CircularProgress />}
      {error && <Alert severity="error">규정을 불러오지 못했습니다: {error.message}</Alert>}
      {!loading && !reg && <Alert severity="warning">없는 규정입니다. <RouterLink to="/">첫 화면으로</RouterLink></Alert>}
      {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}
      {reg && version && (
        <>
          <RegulationHeader
            entry={{ ...reg, ...entry, history: reg.history }}
            version={version}
            notice={past && (
              <Alert severity="info" sx={{ mt: 2 }} action={<Button component={RouterLink} to={`/r/${regId}`}>현행 보기</Button>}>
                {fmtDate(version.effectiveDate)} 시행 버전을 보고 있습니다.
              </Alert>
            )}
            actions={(
              <>
                <Button size="small" startIcon={<HistoryIcon />} component={RouterLink} to={`/r/${regId}/history`}>연혁·버전 비교</Button>
                <Button size="small" startIcon={<DownloadIcon />} onClick={() => downloadRegulationHwpx({ title: entry?.title || reg.title, version, history: reg.history, regId, book, loadNodes: (id) => getCurrentNodes(schoolId, book, id) }).catch((e) => setErr(`내려받기 실패: ${e.message}`))}>한글(hwpx)</Button>
                <Button size="small" startIcon={<PrintIcon />} onClick={() => window.print()}>인쇄·PDF</Button>
                {canEdit && !past && <Button size="small" variant="contained" startIcon={<EditNoteIcon />} disabled={busy} onClick={startAmendment}>개정안 만들기</Button>}
              </>
            )}
          />
          <RegulationBody regId={regId} regTitle={entry?.title || reg.title} nodes={version.nodes} book={book} focusId={focusId} />
          {!version.nodes.length && <Typography color="text.secondary">본문이 비어 있습니다.</Typography>}
          <Stack sx={{ height: 120 }} />
        </>
      )}
    </ReaderLayout>
  )
}
