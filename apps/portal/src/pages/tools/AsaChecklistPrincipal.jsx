import { useState, useEffect, useCallback } from 'react'
import {
  collection, query, where, onSnapshot,
  doc, getDoc, setDoc, updateDoc, serverTimestamp,
} from 'firebase/firestore'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Alert from '@mui/material/Alert'
import Snackbar from '@mui/material/Snackbar'
import CircularProgress from '@mui/material/CircularProgress'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Divider from '@mui/material/Divider'
import Avatar from '@mui/material/Avatar'
import { db } from '../../lib/firebase'
import { useAuth } from '../../contexts/AuthContext'
import Layout from '../../components/Layout'
import SignaturePad from '../../components/SignaturePad'

// 제출 상태 → Chip 색상
const STATUS_COLOR = {
  submitted: 'success',
  locked:    'default',
  draft:     'warning',
}
const STATUS_LABEL = {
  submitted: '제출완료',
  locked:    '잠금',
  draft:     '작성중',
}

function fmt(ts) {
  if (!ts) return '-'
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function AsaChecklistPrincipal() {
  const { user, schoolId, isPrincipal, userName } = useAuth()

  // ── 데이터 상태 ──────────────────────────────────────────────────────────
  const [subjects, setSubjects] = useState([])       // asaSubjects 전체
  const [submissions, setSubmissions] = useState([]) // status in ['submitted','locked']
  const [savedSig, setSavedSig] = useState(null)     // asaPrincipalSignature/{uid}
  const [loadingSubjects, setLoadingSubjects] = useState(true)
  const [loadingSubmissions, setLoadingSubmissions] = useState(true)
  const [loadingSig, setLoadingSig] = useState(true)

  // ── 필터 ─────────────────────────────────────────────────────────────────
  const [filterGrade, setFilterGrade] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all') // all | submitted | locked

  // ── 서명 Dialog ──────────────────────────────────────────────────────────
  const [sigDialogOpen, setSigDialogOpen] = useState(false)
  const [sigDialogMode, setSigDialogMode] = useState('saved') // 'saved' | 'draw'
  const [selectedSubmission, setSelectedSubmission] = useState(null)
  const [signingOne, setSigningOne] = useState(false)

  // ── 일괄 서명 ─────────────────────────────────────────────────────────────
  const [bulkSigning, setBulkSigning] = useState(false)

  // ── 서명 저장 섹션 ────────────────────────────────────────────────────────
  const [savingSig, setSavingSig] = useState(false)

  // ── Snackbar ─────────────────────────────────────────────────────────────
  const [snackbar, setSnackbar] = useState('')

  // ── 저장된 서명 조회 ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!schoolId || !user) return
    setLoadingSig(true)
    const ref = doc(db, 'schools', schoolId, 'asaPrincipalSignature', user.uid)
    getDoc(ref)
      .then((snap) => setSavedSig(snap.exists() ? snap.data() : null))
      .catch(() => setSavedSig(null))
      .finally(() => setLoadingSig(false))
  }, [schoolId, user])

  // ── asaSubjects 전체 구독 ────────────────────────────────────────────────
  useEffect(() => {
    if (!schoolId) return
    const unsub = onSnapshot(
      collection(db, 'schools', schoolId, 'asaSubjects'),
      (snap) => {
        setSubjects(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
        setLoadingSubjects(false)
      },
      () => setLoadingSubjects(false),
    )
    return unsub
  }, [schoolId])

  // ── asaSubmissions (submitted / locked) 구독 ─────────────────────────────
  useEffect(() => {
    if (!schoolId) return
    const q = query(
      collection(db, 'schools', schoolId, 'asaSubmissions'),
      where('status', 'in', ['submitted', 'locked']),
    )
    const unsub = onSnapshot(
      q,
      (snap) => {
        setSubmissions(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
        setLoadingSubmissions(false)
      },
      () => setLoadingSubmissions(false),
    )
    return unsub
  }, [schoolId])

  // ── 서명 저장 ────────────────────────────────────────────────────────────
  const handleSaveSignature = useCallback(async (dataUrl) => {
    if (!schoolId || !user) return
    setSavingSig(true)
    try {
      const ref = doc(db, 'schools', schoolId, 'asaPrincipalSignature', user.uid)
      await setDoc(ref, { dataUrl, savedAt: serverTimestamp(), name: userName })
      setSavedSig({ dataUrl, name: userName })
      setSnackbar('서명이 저장되었습니다.')
    } catch (err) {
      setSnackbar(`서명 저장 실패: ${err.message}`)
    } finally {
      setSavingSig(false)
    }
  }, [schoolId, user, userName])

  // ── 개별 서명 적용 ────────────────────────────────────────────────────────
  const applySignature = useCallback(async (submissionId, dataUrl) => {
    if (!schoolId) return
    const ref = doc(db, 'schools', schoolId, 'asaSubmissions', submissionId)
    await updateDoc(ref, {
      principalSignature: {
        dataUrl,
        signedAt: serverTimestamp(),
        name: userName,
      },
    })
  }, [schoolId, userName])

  const handleSignOne = useCallback(async (dataUrl) => {
    if (!selectedSubmission) return
    setSigningOne(true)
    try {
      await applySignature(selectedSubmission.id, dataUrl)
      setSnackbar('서명이 완료되었습니다.')
      setSigDialogOpen(false)
      setSelectedSubmission(null)
    } catch (err) {
      setSnackbar(`서명 실패: ${err.message}`)
    } finally {
      setSigningOne(false)
    }
  }, [selectedSubmission, applySignature])

  // ── 일괄 서명 ────────────────────────────────────────────────────────────
  const handleBulkSign = useCallback(async () => {
    if (!savedSig?.dataUrl) return
    const unsigned = submissions.filter(
      (s) => s.status === 'submitted' && !s.principalSignature,
    )
    if (!unsigned.length) {
      setSnackbar('미서명 제출 완료 체크리스트가 없습니다.')
      return
    }
    if (!window.confirm(`저장된 서명을 미서명 ${unsigned.length}개 체크리스트에 일괄 적용합니다. 진행할까요?`)) return
    setBulkSigning(true)
    try {
      await Promise.all(unsigned.map((s) => applySignature(s.id, savedSig.dataUrl)))
      setSnackbar(`${unsigned.length}개 과목에 서명 완료`)
    } catch (err) {
      setSnackbar(`일괄 서명 중 오류: ${err.message}`)
    } finally {
      setBulkSigning(false)
    }
  }, [savedSig, submissions, applySignature])

  // ── 필터 적용 ────────────────────────────────────────────────────────────
  const subjectMap = Object.fromEntries(subjects.map((s) => [s.id, s]))

  const filteredSubmissions = submissions.filter((s) => {
    const subject = subjectMap[s.subjectId]
    if (filterGrade !== 'all' && String(subject?.grade) !== filterGrade) return false
    if (filterStatus !== 'all' && s.status !== filterStatus) return false
    return true
  })

  const grades = [...new Set(subjects.map((s) => s.grade).filter(Boolean))].sort()

  const loading = loadingSubjects || loadingSubmissions || loadingSig

  // ── 권한 방어 ─────────────────────────────────────────────────────────────
  if (!isPrincipal) {
    return (
      <Layout>
        <Alert severity="error">접근 권한이 없습니다.</Alert>
      </Layout>
    )
  }

  if (loading) {
    return (
      <Layout>
        <Box display="flex" justifyContent="center" py={8}><CircularProgress /></Box>
      </Layout>
    )
  }

  const unsignedCount = submissions.filter((s) => s.status === 'submitted' && !s.principalSignature).length

  return (
    <Layout>
      <Typography variant="h5" fontWeight={700} mb={0.5}>
        성취평가제 체크리스트 서명
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={3}>
        제출된 체크리스트를 검토하고 서명합니다.
      </Typography>

      {/* ── 서명 관리 섹션 ─────────────────────────────────────────────────── */}
      <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
        <Typography variant="subtitle1" fontWeight={700} mb={2}>
          저장된 서명
        </Typography>

        {savedSig?.dataUrl ? (
          <Box>
            <Box
              component="img"
              src={savedSig.dataUrl}
              alt="저장된 서명"
              sx={{
                width: 400,
                height: 150,
                border: '1px solid',
                borderColor: 'success.light',
                borderRadius: 1,
                display: 'block',
                objectFit: 'contain',
                background: '#fff',
                mb: 1,
              }}
            />
            <Typography variant="caption" color="text.secondary" display="block" mb={1}>
              {savedSig.name} · {savedSig.savedAt ? fmt(savedSig.savedAt) : '-'} 저장
            </Typography>
            <Button
              size="small"
              variant="outlined"
              onClick={() => setSavedSig(null)}
            >
              서명 변경
            </Button>
          </Box>
        ) : (
          <Box>
            <Typography variant="body2" color="text.secondary" mb={1.5}>
              서명을 그린 뒤 저장하면 이후 일괄 서명 또는 원클릭 서명에 사용됩니다.
            </Typography>
            <SignaturePad
              onSave={handleSaveSignature}
              label={`${userName} 교감`}
            />
            {savingSig && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                <CircularProgress size={16} />
                <Typography variant="caption">저장 중...</Typography>
              </Box>
            )}
          </Box>
        )}
      </Paper>

      {/* ── 일괄 서명 섹션 ────────────────────────────────────────────────── */}
      <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
        <Typography variant="subtitle1" fontWeight={700} mb={0.5}>
          일괄 서명
        </Typography>
        <Typography variant="body2" color="text.secondary" mb={2}>
          저장된 서명을 아직 서명하지 않은 모든 제출 완료 체크리스트에 적용합니다.
          {unsignedCount > 0 && (
            <Chip
              size="small"
              label={`미서명 ${unsignedCount}건`}
              color="warning"
              sx={{ ml: 1 }}
            />
          )}
        </Typography>
        <Button
          variant="contained"
          disabled={!savedSig?.dataUrl || bulkSigning || unsignedCount === 0}
          onClick={handleBulkSign}
        >
          {bulkSigning ? '서명 중...' : '미서명 전체에 적용'}
        </Button>
        {!savedSig?.dataUrl && (
          <Typography variant="caption" color="text.secondary" display="block" mt={1}>
            저장된 서명이 있어야 일괄 서명을 사용할 수 있습니다.
          </Typography>
        )}
      </Paper>

      {/* ── 과목별 체크리스트 목록 ───────────────────────────────────────── */}
      <Paper variant="outlined" sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, flexWrap: 'wrap' }}>
          <Typography variant="subtitle1" fontWeight={700} sx={{ mr: 'auto' }}>
            체크리스트 목록 ({filteredSubmissions.length})
          </Typography>

          {/* 학년 필터 */}
          <FormControl size="small" sx={{ minWidth: 100 }}>
            <InputLabel>학년</InputLabel>
            <Select
              value={filterGrade}
              label="학년"
              onChange={(e) => setFilterGrade(e.target.value)}
            >
              <MenuItem value="all">전체</MenuItem>
              {grades.map((g) => (
                <MenuItem key={g} value={String(g)}>{g}학년</MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* 상태 필터 */}
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>상태</InputLabel>
            <Select
              value={filterStatus}
              label="상태"
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <MenuItem value="all">전체</MenuItem>
              <MenuItem value="submitted">제출완료</MenuItem>
              <MenuItem value="locked">잠금</MenuItem>
            </Select>
          </FormControl>
        </Box>

        <Divider sx={{ mb: 2 }} />

        {filteredSubmissions.length === 0 ? (
          <Typography variant="body2" color="text.secondary" py={3} textAlign="center">
            해당하는 체크리스트가 없습니다.
          </Typography>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: '#f8fafc' } }}>
                <TableCell>과목명</TableCell>
                <TableCell>학년</TableCell>
                <TableCell>유형</TableCell>
                <TableCell>교사 서명 현황</TableCell>
                <TableCell>내 서명 상태</TableCell>
                <TableCell align="right">서명</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredSubmissions.map((s) => {
                const subject = subjectMap[s.subjectId]
                const hasPrincipalSig = !!s.principalSignature
                const typeLabel = s.checklistType === 'process' ? '붙임1 과정' : s.checklistType || '-'

                return (
                  <TableRow key={s.id} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>
                        {subject?.subjectName || subject?.name || s.subjectId}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {subject?.grade ? `${subject.grade}학년` : '-'}
                    </TableCell>
                    <TableCell>{typeLabel}</TableCell>

                    {/* 교사 서명 현황 */}
                    <TableCell>
                      {s.teacherSignature ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Avatar
                            src={s.teacherSignature.dataUrl}
                            variant="rounded"
                            sx={{ width: 40, height: 20, bgcolor: '#fff', border: '1px solid #e2e8f0' }}
                          >
                            <Typography variant="caption" color="text.disabled">서명</Typography>
                          </Avatar>
                          <Typography variant="caption" color="text.secondary">
                            {s.teacherSignature.name}
                          </Typography>
                        </Box>
                      ) : (
                        <Typography variant="caption" color="text.disabled">미서명</Typography>
                      )}
                    </TableCell>

                    {/* 내(교감) 서명 상태 */}
                    <TableCell>
                      {hasPrincipalSig ? (
                        <Box>
                          <Chip size="small" label="서명완료" color="success" />
                          <Typography variant="caption" color="text.secondary" display="block">
                            {fmt(s.principalSignature.signedAt)}
                          </Typography>
                        </Box>
                      ) : (
                        <Chip
                          size="small"
                          label={STATUS_LABEL[s.status] || s.status}
                          color={STATUS_COLOR[s.status] || 'default'}
                          variant="outlined"
                        />
                      )}
                    </TableCell>

                    {/* 서명 버튼 */}
                    <TableCell align="right">
                      {hasPrincipalSig ? (
                        <Button
                          size="small"
                          variant="text"
                          color="inherit"
                          onClick={() => {
                            setSelectedSubmission(s)
                            setSigDialogMode('draw')
                            setSigDialogOpen(true)
                          }}
                        >
                          재서명
                        </Button>
                      ) : (
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => {
                            setSelectedSubmission(s)
                            setSigDialogMode(savedSig?.dataUrl ? 'saved' : 'draw')
                            setSigDialogOpen(true)
                          }}
                        >
                          서명하기
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </Paper>

      {/* ── 서명 Dialog ────────────────────────────────────────────────────── */}
      <Dialog
        open={sigDialogOpen}
        onClose={() => { setSigDialogOpen(false); setSelectedSubmission(null) }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          체크리스트 서명
          {selectedSubmission && subjectMap[selectedSubmission.subjectId] && (
            <Typography variant="caption" color="text.secondary" display="block">
              {subjectMap[selectedSubmission.subjectId]?.subjectName || subjectMap[selectedSubmission.subjectId]?.name}
            </Typography>
          )}
        </DialogTitle>

        <DialogContent>
          {/* 서명 방식 선택 탭 */}
          <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
            {savedSig?.dataUrl && (
              <Button
                size="small"
                variant={sigDialogMode === 'saved' ? 'contained' : 'outlined'}
                onClick={() => setSigDialogMode('saved')}
              >
                저장된 서명으로
              </Button>
            )}
            <Button
              size="small"
              variant={sigDialogMode === 'draw' ? 'contained' : 'outlined'}
              onClick={() => setSigDialogMode('draw')}
            >
              새로 그리기
            </Button>
          </Box>

          <Divider sx={{ mb: 2 }} />

          {sigDialogMode === 'saved' && savedSig?.dataUrl ? (
            <Box>
              <Typography variant="body2" color="text.secondary" mb={1.5}>
                아래 저장된 서명이 적용됩니다.
              </Typography>
              <Box
                component="img"
                src={savedSig.dataUrl}
                alt="저장된 서명"
                sx={{
                  width: '100%',
                  maxWidth: 400,
                  height: 150,
                  border: '1px solid',
                  borderColor: 'success.light',
                  borderRadius: 1,
                  display: 'block',
                  objectFit: 'contain',
                  background: '#fff',
                }}
              />
            </Box>
          ) : (
            <Box>
              <Typography variant="body2" color="text.secondary" mb={1.5}>
                서명을 그린 뒤 "서명 완료" 버튼을 눌러주세요.
              </Typography>
              <SignaturePad
                onSave={(dataUrl) => handleSignOne(dataUrl)}
                label={`${userName} 교감`}
              />
            </Box>
          )}
        </DialogContent>

        {sigDialogMode === 'saved' && savedSig?.dataUrl && (
          <DialogActions>
            <Button onClick={() => { setSigDialogOpen(false); setSelectedSubmission(null) }}>
              취소
            </Button>
            <Button
              variant="contained"
              disabled={signingOne}
              onClick={() => handleSignOne(savedSig.dataUrl)}
            >
              {signingOne ? '서명 중...' : '서명 완료'}
            </Button>
          </DialogActions>
        )}
      </Dialog>

      <Snackbar
        open={!!snackbar}
        autoHideDuration={3500}
        onClose={() => setSnackbar('')}
        message={snackbar}
      />
    </Layout>
  )
}
