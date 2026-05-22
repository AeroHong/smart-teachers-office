import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import {
  collection, doc, getDoc, getDocs, setDoc, deleteDoc,
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
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import RefreshIcon from '@mui/icons-material/Refresh'
import CircularProgress from '@mui/material/CircularProgress'
import Alert from '@mui/material/Alert'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import Tooltip from '@mui/material/Tooltip'

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

export default function SuperAdminDomainSetup() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const schoolId = searchParams.get('schoolId') || ''

  // 학교 정보
  const [school, setSchool] = useState(null)
  const [adminEmail, setAdminEmail] = useState('')
  const [loadingSchool, setLoadingSchool] = useState(true)

  // 도메인 목록
  const [domains, setDomains] = useState([])
  const [loadingDomains, setLoadingDomains] = useState(true)

  // 등록 폼
  const [domainInput, setDomainInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  const showSuccess = (msg) => {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(''), 4000)
  }

  // 학교 정보 로드
  useEffect(() => {
    if (!schoolId) return
    const load = async () => {
      setLoadingSchool(true)
      try {
        const snap = await getDoc(doc(db, 'schools', schoolId))
        if (snap.exists()) {
          const data = snap.data()
          setSchool({ id: snap.id, ...data })

          // 관리자 이메일: adminEmail 필드 → 없으면 users 컬렉션에서 school_admin 조회
          if (data.adminEmail) {
            setAdminEmail(data.adminEmail)
          } else {
            const adminsSnap = await getDocs(
              query(collection(db, 'users'),
                where('schoolId', '==', schoolId),
                where('role', '==', 'school_admin')
              )
            )
            if (!adminsSnap.empty) {
              setAdminEmail(adminsSnap.docs[0].data().email || '')
            }
          }
        }
      } catch (e) {
        setError('학교 정보를 불러오지 못했습니다: ' + e.message)
      } finally {
        setLoadingSchool(false)
      }
    }
    load()
  }, [schoolId])

  // 도메인 목록 로드
  const loadDomains = async () => {
    setLoadingDomains(true)
    try {
      const snap = await getDocs(collection(db, 'schoolDomains'))
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      list.sort((a, b) => a.id.localeCompare(b.id))
      setDomains(list)
    } catch (e) {
      setError('도메인 목록을 불러오지 못했습니다: ' + e.message)
    } finally {
      setLoadingDomains(false)
    }
  }

  useEffect(() => { loadDomains() }, [])

  // 도메인 등록
  const handleSave = async () => {
    setError('')
    const domain = domainInput.trim().toLowerCase().replace(/^@/, '')
    if (!domain) { setError('도메인을 입력하세요.'); return }
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
      setError('올바른 도메인 형식을 입력하세요. (예: sunyu.hs.kr)')
      return
    }

    // 중복 확인
    const existing = await getDoc(doc(db, 'schoolDomains', domain))
    if (existing.exists()) {
      const owner = existing.data().schoolId
      setError(owner === schoolId
        ? `@${domain} 은 이미 이 학교에 등록된 도메인입니다.`
        : `@${domain} 은 다른 학교(${owner})에 이미 등록된 도메인입니다.`
      )
      return
    }

    setSaving(true)
    try {
      await setDoc(doc(db, 'schoolDomains', domain), {
        schoolId,
        schoolName: school?.name || schoolId,
        createdAt: serverTimestamp(),
        createdBy: user.email,
      })
      await setDoc(doc(db, 'schools', schoolId), {
        domains: [domain],
      }, { merge: true })
      await logAudit(user.email, 'school_domain_registered', { schoolId, domain })
      setDomainInput('')
      showSuccess(`✅ @${domain} 도메인 등록 완료`)
      await loadDomains()
    } catch (e) {
      setError('등록 실패: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  // 도메인 삭제
  const handleDelete = async (domain) => {
    if (!window.confirm(`@${domain} 도메인을 삭제하시겠습니까?`)) return
    try {
      await deleteDoc(doc(db, 'schoolDomains', domain))
      // 해당 도메인이 이 학교 소속이면 schools.domains도 갱신
      const belongsHere = domains.find(d => d.id === domain)?.schoolId === schoolId
      if (belongsHere) {
        await setDoc(doc(db, 'schools', schoolId), { domains: [] }, { merge: true })
      }
      await logAudit(user.email, 'school_domain_deleted', { schoolId, domain })
      showSuccess(`🗑 @${domain} 삭제 완료`)
      await loadDomains()
    } catch (e) {
      setError('삭제 실패: ' + e.message)
    }
  }

  return (
    <SuperAdminLayout>
      <Box>
        {/* 뒤로가기 */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
          <Button
            startIcon={<ArrowBackIcon />}
            onClick={() => navigate('/super-admin')}
            sx={{ color: '#64748b', fontWeight: 500 }}
          >
            학교 목록으로
          </Button>
        </Box>

        {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
        {successMsg && <Alert severity="success" sx={{ mb: 2 }}>{successMsg}</Alert>}

        {/* ── 도메인 목록 ── */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
          <Typography variant="subtitle1" fontWeight={600}>등록된 도메인 목록</Typography>
          <Chip label={`${domains.length}개`} size="small" sx={{ bgcolor: '#eef2ff', color: '#4f46e5', fontWeight: 700 }} />
          <Tooltip title="새로고침">
            <IconButton size="small" onClick={loadDomains} disabled={loadingDomains}>
              <RefreshIcon fontSize="small" sx={{ color: '#888' }} />
            </IconButton>
          </Tooltip>
        </Box>

        {loadingDomains ? (
          <Box display="flex" justifyContent="center" py={3}><CircularProgress size={24} /></Box>
        ) : domains.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
            등록된 도메인이 없습니다.
          </Typography>
        ) : (
          <TableContainer component={Paper} sx={{ borderRadius: 3, overflowX: 'auto', mb: 4 }}>
            <Table size="small" sx={{ minWidth: '100%' }}>
              <TableHead>
                <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                  <TableCell sx={{ whiteSpace: 'nowrap', pl: 2, pr: 1 }}><strong>도메인</strong></TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap', px: 1 }}><strong>학교 ID</strong></TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap', px: 1 }}><strong>학교명</strong></TableCell>
                  <TableCell align="center" sx={{ whiteSpace: 'nowrap', px: 1, pr: 2 }}><strong>삭제</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {domains.map(d => (
                  <TableRow
                    key={d.id}
                    hover
                    sx={d.schoolId === schoolId ? { bgcolor: '#f0fdf4' } : {}}
                  >
                    <TableCell sx={{ whiteSpace: 'nowrap', pl: 2, pr: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Chip label={`@${d.id}`} size="small" variant="outlined"
                          color={d.schoolId === schoolId ? 'success' : 'default'}
                        />
                        {d.schoolId === schoolId && (
                          <Chip label="현재 학교" size="small" sx={{ bgcolor: '#dcfce7', color: '#15803d', fontSize: '0.68rem' }} />
                        )}
                      </Box>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap', px: 1 }}>
                      <Typography variant="caption" sx={{ fontFamily: 'monospace', color: '#666' }}>{d.schoolId}</Typography>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap', px: 1 }}>
                      <Typography variant="caption">{d.schoolName || '—'}</Typography>
                    </TableCell>
                    <TableCell align="center" sx={{ whiteSpace: 'nowrap', px: 1, pr: 2 }}>
                      <IconButton size="small" color="error" onClick={() => handleDelete(d.id)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        <Divider sx={{ mb: 4 }} />

        {/* ── 도메인 등록 폼 ── */}
        <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>
          도메인 등록
        </Typography>

        {loadingSchool ? (
          <Box display="flex" justifyContent="center" py={3}><CircularProgress size={24} /></Box>
        ) : !school ? (
          <Alert severity="error">학교 정보를 찾을 수 없습니다. (schoolId: {schoolId})</Alert>
        ) : (
          <Paper sx={{ p: 3, borderRadius: 3, maxWidth: 520 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>

              {/* 학교 ID (읽기 전용) */}
              <TextField
                label="학교 ID"
                value={school.id}
                size="small"
                fullWidth
                InputProps={{ readOnly: true }}
                sx={{ '& .MuiInputBase-input': { fontFamily: 'monospace', color: '#555', bgcolor: '#f8fafc' } }}
                helperText="수정 불가"
              />

              {/* 학교명 (읽기 전용) */}
              <TextField
                label="학교명"
                value={school.name || school.id}
                size="small"
                fullWidth
                InputProps={{ readOnly: true }}
                sx={{ '& .MuiInputBase-input': { bgcolor: '#f8fafc' } }}
                helperText="수정은 학교 목록 페이지에서"
              />

              {/* 관리자 이메일 (읽기 전용) */}
              <TextField
                label="학교 관리자 이메일"
                value={adminEmail || '(관리자 없음)'}
                size="small"
                fullWidth
                InputProps={{ readOnly: true }}
                sx={{ '& .MuiInputBase-input': { fontFamily: 'monospace', color: '#555', bgcolor: '#f8fafc' } }}
              />

              {/* 도메인 입력 */}
              <TextField
                label="Google Workspace 도메인 *"
                placeholder="sunyu.hs.kr"
                size="small"
                fullWidth
                value={domainInput}
                onChange={e => setDomainInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
                InputProps={{ startAdornment: <span style={{ color: '#aaa', marginRight: 4 }}>@</span> }}
                helperText="해당 도메인 계정으로 로그인하면 자동으로 이 학교에 배정됩니다"
                autoFocus
              />

              <Button
                variant="contained"
                onClick={handleSave}
                disabled={saving || !domainInput.trim()}
                sx={{ alignSelf: 'flex-start', minWidth: 100 }}
              >
                {saving ? <CircularProgress size={18} color="inherit" /> : '도메인 등록'}
              </Button>
            </Box>
          </Paper>
        )}
      </Box>
    </SuperAdminLayout>
  )
}
