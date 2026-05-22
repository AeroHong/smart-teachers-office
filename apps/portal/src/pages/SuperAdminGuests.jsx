import { useState, useEffect } from 'react'
import {
  collection, doc, getDocs, setDoc, deleteDoc,
  serverTimestamp, query, where, addDoc,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../contexts/AuthContext'
import SuperAdminLayout from '../components/SuperAdminLayout'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import IconButton from '@mui/material/IconButton'
import DeleteIcon from '@mui/icons-material/Delete'
import RefreshIcon from '@mui/icons-material/Refresh'
import CircularProgress from '@mui/material/CircularProgress'
import Alert from '@mui/material/Alert'
import Chip from '@mui/material/Chip'
import Tooltip from '@mui/material/Tooltip'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'

async function logAudit(userEmail, action, data = {}) {
  try {
    await addDoc(collection(db, 'auditLogs'), {
      action,
      by: userEmail,
      at: serverTimestamp(),
      ...data,
    })
  } catch (e) {
    console.warn('감사 로그 기록 실패:', e)
  }
}

export default function SuperAdminGuests() {
  const { user } = useAuth()

  const [guestSchools, setGuestSchools] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  const [convertDialog, setConvertDialog] = useState(null)
  const [convertForm, setConvertForm] = useState({ schoolName: '', domain: '' })
  const [convertSaving, setConvertSaving] = useState(false)
  const [convertError, setConvertError] = useState('')

  const showSuccess = (msg) => {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(''), 4000)
  }

  const loadGuestSchools = async () => {
    setLoading(true)
    try {
      const snap = await getDocs(query(collection(db, 'schools'), where('isGuest', '==', true)))
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      setGuestSchools(list)
    } catch (e) {
      setError('게스트 학교 목록 불러오기 실패: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadGuestSchools() }, [])

  const handleConvertGuest = async () => {
    setConvertError('')
    const schoolName = convertForm.schoolName.trim()
    const domain = convertForm.domain.trim().toLowerCase().replace(/^@/, '')

    if (!schoolName) { setConvertError('학교명은 필수입니다.'); return }
    if (domain && !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
      setConvertError('올바른 도메인 형식을 입력하세요. (예: sunyu.hs.kr)')
      return
    }

    setConvertSaving(true)
    try {
      const { schoolId } = convertDialog
      await setDoc(doc(db, 'schools', schoolId), {
        name: schoolName,
        isGuest: false,
        ...(domain ? { domains: [domain] } : {}),
        convertedAt: serverTimestamp(),
        convertedBy: user.email,
      }, { merge: true })

      if (domain) {
        await setDoc(doc(db, 'schoolDomains', domain), {
          schoolId,
          createdAt: serverTimestamp(),
          createdBy: user.email,
        })
      }

      await logAudit(user.email, 'guest_converted', { schoolId, schoolName, domain })
      showSuccess(`✅ ${schoolName} 정식 전환 완료`)
      setConvertDialog(null)
      await loadGuestSchools()
    } catch (e) {
      setConvertError('전환 실패: ' + e.message)
    } finally {
      setConvertSaving(false)
    }
  }

  const handleDeleteGuest = async (g) => {
    if (!window.confirm(`게스트 학교(${g.id})를 삭제하시겠습니까?\n소유자: ${g.ownerEmail}\n\n학교 및 소유자 계정 데이터가 함께 삭제됩니다.`)) return
    try {
      await deleteDoc(doc(db, 'schools', g.id))
      if (g.ownerUid) {
        await deleteDoc(doc(db, 'users', g.ownerUid))
      }
      await logAudit(user.email, 'guest_deleted', { schoolId: g.id, ownerEmail: g.ownerEmail })
      showSuccess('🗑 게스트 학교 및 계정 삭제 완료')
      await loadGuestSchools()
    } catch (e) {
      setError('삭제 실패: ' + e.message)
    }
  }

  return (
    <SuperAdminLayout>
      <Box>
        {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
        {successMsg && <Alert severity="success" sx={{ mb: 2 }}>{successMsg}</Alert>}

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <Typography variant="subtitle1" fontWeight={600}>게스트 학교</Typography>
          <Chip
            label={`${guestSchools.length}개`}
            size="small"
            sx={{ bgcolor: '#fef3c7', color: '#92400e', fontWeight: 700 }}
          />
          <Tooltip title="새로고침">
            <IconButton size="small" onClick={loadGuestSchools} disabled={loading}>
              <RefreshIcon fontSize="small" sx={{ color: '#888' }} />
            </IconButton>
          </Tooltip>
          <Typography variant="caption" color="text.secondary">미등록 도메인 계정 자동 생성 학교</Typography>
        </Box>

        {loading ? (
          <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box>
        ) : guestSchools.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
            게스트 학교가 없습니다.
          </Typography>
        ) : (
          <TableContainer component={Paper} sx={{ borderRadius: 3, overflowX: 'auto' }}>
            <Table size="small" sx={{ width: 'auto', minWidth: '100%' }}>
              <TableHead>
                <TableRow sx={{ bgcolor: '#fef3c7' }}>
                  <TableCell sx={{ whiteSpace: 'nowrap', pl: 2, pr: 1 }}><strong>학교 ID</strong></TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap', px: 1 }}><strong>학교명</strong></TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap', px: 1 }}><strong>소유자 이메일</strong></TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap', px: 1 }}><strong>도메인</strong></TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap', px: 1 }}><strong>생성일</strong></TableCell>
                  <TableCell align="center" sx={{ whiteSpace: 'nowrap', px: 1 }}><strong>정식 전환</strong></TableCell>
                  <TableCell align="center" sx={{ whiteSpace: 'nowrap', px: 1, pr: 2 }}><strong>삭제</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {guestSchools.map(g => (
                  <TableRow key={g.id} hover>
                    <TableCell sx={{ whiteSpace: 'nowrap', pl: 2, pr: 1 }}>
                      <Typography variant="caption" sx={{ fontFamily: 'monospace', color: '#666' }}>{g.id}</Typography>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap', px: 1 }}>{g.name}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap', px: 1 }}>
                      <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>{g.ownerEmail}</Typography>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap', px: 1 }}>
                      <Typography variant="caption" color="text.secondary">{g.domain || '—'}</Typography>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap', px: 1 }}>
                      <Typography variant="caption" color="text.secondary">
                        {g.createdAt?.toDate().toLocaleDateString('ko-KR') || '—'}
                      </Typography>
                    </TableCell>
                    <TableCell align="center" sx={{ whiteSpace: 'nowrap', px: 1 }}>
                      <Button
                        size="small"
                        variant="outlined"
                        color="primary"
                        onClick={() => {
                          setConvertDialog({ schoolId: g.id, ownerEmail: g.ownerEmail, name: g.name })
                          setConvertForm({ schoolName: g.name, domain: g.domain || '' })
                          setConvertError('')
                        }}
                        sx={{ fontSize: '0.72rem', whiteSpace: 'nowrap' }}
                      >
                        정식 등록
                      </Button>
                    </TableCell>
                    <TableCell align="center" sx={{ whiteSpace: 'nowrap', px: 1, pr: 2 }}>
                      <IconButton size="small" color="error" onClick={() => handleDeleteGuest(g)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {/* 정식 전환 다이얼로그 */}
        <Dialog open={!!convertDialog} onClose={() => !convertSaving && setConvertDialog(null)} maxWidth="xs" fullWidth>
          <DialogTitle sx={{ fontWeight: 700 }}>🏫 게스트 → 정식 학교 전환</DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              소유자: <strong>{convertDialog?.ownerEmail}</strong>
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <TextField
                label="학교명 *"
                size="small"
                value={convertForm.schoolName}
                onChange={e => setConvertForm(f => ({ ...f, schoolName: e.target.value }))}
                fullWidth
                autoFocus
              />
              <TextField
                label="Google 도메인 (선택)"
                size="small"
                placeholder="sunyu.hs.kr"
                value={convertForm.domain}
                onChange={e => setConvertForm(f => ({ ...f, domain: e.target.value }))}
                fullWidth
                helperText="등록 시 해당 도메인 계정 자동 배정"
                InputProps={{ startAdornment: <span style={{ color: '#aaa', marginRight: 2 }}>@</span> }}
              />
            </Box>
            {convertError && (
              <Typography variant="caption" color="error" sx={{ mt: 1, display: 'block' }}>{convertError}</Typography>
            )}
            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mt: 3 }}>
              <Button onClick={() => setConvertDialog(null)} color="inherit" disabled={convertSaving}>취소</Button>
              <Button variant="contained" onClick={handleConvertGuest} disabled={convertSaving}>
                {convertSaving ? <CircularProgress size={18} color="inherit" /> : '정식 등록'}
              </Button>
            </Box>
          </DialogContent>
        </Dialog>
      </Box>
    </SuperAdminLayout>
  )
}
