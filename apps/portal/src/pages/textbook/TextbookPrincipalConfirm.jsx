import { useState, useEffect, useCallback } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Paper from '@mui/material/Paper'
import Table from '@mui/material/Table'
import TableHead from '@mui/material/TableHead'
import TableBody from '@mui/material/TableBody'
import TableRow from '@mui/material/TableRow'
import TableCell from '@mui/material/TableCell'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Divider from '@mui/material/Divider'
import Alert from '@mui/material/Alert'
import Snackbar from '@mui/material/Snackbar'
import CircularProgress from '@mui/material/CircularProgress'
import { useAuth } from '@shared/contexts/AuthContext'
import {
  loadAdoptions, getDeptHead, getPrincipalSignature, savePrincipalSignature, confirmRecommendation,
} from '@shared/lib/textbookAdoption'
import Layout from '../../components/Layout'
import SignaturePad from '../../components/SignaturePad'
import TextbookSection, { ACCENT, ACCENT_BG } from './TextbookSection'

function fmt(ts) {
  if (!ts) return '-'
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

export default function TextbookPrincipalConfirm() {
  const { user, userName, schoolId, isPrincipal } = useAuth()

  const [adoptions, setAdoptions] = useState([])
  const [deptHeadNames, setDeptHeadNames] = useState({}) // subjectGroup -> name
  const [savedSig, setSavedSig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [snack, setSnack] = useState('')

  const [dialogTarget, setDialogTarget] = useState(null)
  const [dialogMode, setDialogMode] = useState('saved')
  const [confirming, setConfirming] = useState(false)

  const fetchAll = useCallback(async () => {
    if (!schoolId) return
    setLoading(true)
    try {
      const all = await loadAdoptions(schoolId)
      const pending = all.filter((a) => a.status === 'closed' && a.recommendation)
      setAdoptions(pending)
      const groups = [...new Set(pending.map((a) => a.subjectGroup).filter(Boolean))]
      const entries = await Promise.all(groups.map(async (g) => [g, (await getDeptHead(schoolId, g))?.name || '']))
      setDeptHeadNames(Object.fromEntries(entries))
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [schoolId])

  useEffect(() => { fetchAll() }, [fetchAll])

  useEffect(() => {
    if (!schoolId || !user) return
    getPrincipalSignature(schoolId, user.uid).then(setSavedSig).catch(() => setSavedSig(null))
  }, [schoolId, user])

  const handleSaveSignature = async (dataUrl) => {
    try {
      await savePrincipalSignature(schoolId, user.uid, dataUrl, userName)
      setSavedSig({ dataUrl, name: userName })
      setSnack('서명이 저장되었습니다.')
    } catch (e) {
      setError(`서명 저장 실패: ${e.message}`)
    }
  }

  const handleConfirm = async (dataUrl) => {
    if (!dialogTarget) return
    setConfirming(true)
    try {
      await confirmRecommendation(schoolId, dialogTarget.id, dialogTarget.recommendation, { uid: user.uid, name: userName, dataUrl })
      setSnack('확인 처리했습니다.')
      setDialogTarget(null)
      fetchAll()
    } catch (e) {
      setError(`확인 실패: ${e.message}`)
    } finally {
      setConfirming(false)
    }
  }

  const handleBulkConfirm = async () => {
    if (!savedSig?.dataUrl) return
    const unconfirmed = adoptions.filter((a) => !a.recommendation?.confirmedAt)
    if (!unconfirmed.length) { setSnack('미확인 건이 없습니다.'); return }
    if (!window.confirm(`저장된 서명을 미확인 ${unconfirmed.length}건에 일괄 적용합니다. 진행할까요?`)) return
    setConfirming(true)
    try {
      await Promise.all(unconfirmed.map((a) =>
        confirmRecommendation(schoolId, a.id, a.recommendation, { uid: user.uid, name: userName, dataUrl: savedSig.dataUrl })))
      setSnack(`${unconfirmed.length}건 확인 완료`)
      fetchAll()
    } catch (e) {
      setError(`일괄 확인 실패: ${e.message}`)
    } finally {
      setConfirming(false)
    }
  }

  if (!isPrincipal) {
    return <Layout><Alert severity="error" sx={{ borderRadius: '10px' }}>교감 계정만 접근할 수 있습니다.</Alert></Layout>
  }

  const unconfirmedCount = adoptions.filter((a) => !a.recommendation?.confirmedAt).length

  return (
    <Layout wide>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
        <Box sx={{ width: 40, height: 40, borderRadius: '10px', bgcolor: ACCENT_BG, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>✅</Box>
        <Typography sx={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a' }}>검·인정도서 선정 — 교감 확인</Typography>
      </Box>
      <Typography sx={{ fontSize: '0.85rem', color: '#64748b', mb: 3 }}>
        교과부장이 작성한 추천의견서(서식3)를 검토하고 확인(서명)합니다.
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2, borderRadius: '10px' }} onClose={() => setError('')}>{error}</Alert>}

      <TextbookSection title="저장된 서명">
        {savedSig?.dataUrl ? (
          <Box>
            <Box component="img" src={savedSig.dataUrl} alt="저장된 서명"
              sx={{ width: 300, height: 120, border: '1px solid', borderColor: 'success.light', borderRadius: 1, display: 'block', objectFit: 'contain', background: '#fff', mb: 1 }} />
            <Button size="small" variant="outlined" onClick={() => setSavedSig(null)}>서명 변경</Button>
          </Box>
        ) : (
          <SignaturePad onSave={handleSaveSignature} label={`${userName} 교감`} />
        )}
      </TextbookSection>

      <TextbookSection
        title={`확인 대기 목록 (${adoptions.length}건)`}
        right={
          <Button
            variant="outlined" size="small" disabled={!savedSig?.dataUrl || confirming || unconfirmedCount === 0}
            onClick={handleBulkConfirm}
            sx={{ borderRadius: '8px', textTransform: 'none', fontWeight: 700 }}
          >
            미확인 {unconfirmedCount}건 일괄 확인
          </Button>
        }
      >
        {loading ? (
          <Box display="flex" justifyContent="center" py={4}><CircularProgress sx={{ color: ACCENT }} /></Box>
        ) : adoptions.length === 0 ? (
          <Typography sx={{ fontSize: '0.86rem', color: '#94a3b8', textAlign: 'center', py: 3 }}>확인할 추천의견서가 없습니다.</Typography>
        ) : (
          <Paper variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: '#f9fafb' } }}>
                  <TableCell>과목</TableCell>
                  <TableCell>교과군</TableCell>
                  <TableCell>작성자(교과부장)</TableCell>
                  <TableCell>상태</TableCell>
                  <TableCell align="right">확인</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {adoptions.map((a) => (
                  <TableRow key={a.id} hover>
                    <TableCell sx={{ fontWeight: 600 }}>{a.subjectName}</TableCell>
                    <TableCell>{a.subjectGroup?.replace(/_/g, '/') || '-'}</TableCell>
                    <TableCell>{deptHeadNames[a.subjectGroup] || '-'}</TableCell>
                    <TableCell>
                      {a.recommendation?.confirmedAt
                        ? <Chip size="small" label={`확인완료 · ${fmt(a.recommendation.confirmedAt)}`} color="success" />
                        : <Chip size="small" label="미확인" color="warning" variant="outlined" />}
                    </TableCell>
                    <TableCell align="right">
                      <Button
                        size="small" variant={a.recommendation?.confirmedAt ? 'text' : 'outlined'}
                        onClick={() => { setDialogTarget(a); setDialogMode(savedSig?.dataUrl ? 'saved' : 'draw') }}
                      >
                        {a.recommendation?.confirmedAt ? '재확인' : '확인하기'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
        )}
      </TextbookSection>

      <Dialog open={!!dialogTarget} onClose={() => setDialogTarget(null)} maxWidth="sm" fullWidth>
        <DialogTitle>
          추천의견서 확인
          {dialogTarget && <Typography variant="caption" color="text.secondary" display="block">{dialogTarget.subjectName}</Typography>}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
            {savedSig?.dataUrl && (
              <Button size="small" variant={dialogMode === 'saved' ? 'contained' : 'outlined'} onClick={() => setDialogMode('saved')}>저장된 서명으로</Button>
            )}
            <Button size="small" variant={dialogMode === 'draw' ? 'contained' : 'outlined'} onClick={() => setDialogMode('draw')}>새로 그리기</Button>
          </Box>
          <Divider sx={{ mb: 2 }} />
          {dialogMode === 'saved' && savedSig?.dataUrl ? (
            <Box component="img" src={savedSig.dataUrl} alt="서명"
              sx={{ width: '100%', maxWidth: 400, height: 150, border: '1px solid', borderColor: 'success.light', borderRadius: 1, display: 'block', objectFit: 'contain', background: '#fff' }} />
          ) : (
            <SignaturePad onSave={handleConfirm} label={`${userName} 교감`} />
          )}
        </DialogContent>
        {dialogMode === 'saved' && savedSig?.dataUrl && (
          <DialogActions>
            <Button onClick={() => setDialogTarget(null)}>취소</Button>
            <Button variant="contained" disabled={confirming} onClick={() => handleConfirm(savedSig.dataUrl)}>
              {confirming ? '확인 중...' : '확인 완료'}
            </Button>
          </DialogActions>
        )}
      </Dialog>

      <Snackbar open={!!snack} autoHideDuration={3000} onClose={() => setSnack('')} message={snack} />
    </Layout>
  )
}
