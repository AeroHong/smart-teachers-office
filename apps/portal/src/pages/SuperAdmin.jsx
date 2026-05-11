import { useState, useEffect } from 'react'
import {
  collection, doc, getDoc, getDocs, setDoc, deleteDoc, serverTimestamp, writeBatch,
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
import EditIcon from '@mui/icons-material/Edit'
import CheckIcon from '@mui/icons-material/Check'
import CloseIcon from '@mui/icons-material/Close'
import CircularProgress from '@mui/material/CircularProgress'
import Alert from '@mui/material/Alert'
import Divider from '@mui/material/Divider'
import Chip from '@mui/material/Chip'
import Tooltip from '@mui/material/Tooltip'
import LinearProgress from '@mui/material/LinearProgress'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'

// "YYYY. M. D.", "YYYY/M/D", "YYYY-MM-DD" 등 → "YYYY-MM-DD"
function normalizeDate(raw) {
  const s = String(raw || '').trim()
  if (!s) return s
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const m = s.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  const d = new Date(s)
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  return s
}

export default function SuperAdmin() {
  const { user } = useAuth()

  const [schools, setSchools] = useState([])
  const [loadingList, setLoadingList] = useState(true)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  // 신규 등록 폼
  const [form, setForm] = useState({ domain: '', schoolId: '', schoolName: '', adminEmail: '' })
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  // 보강 API URL 인라인 편집
  const [editingUrl, setEditingUrl] = useState(null)
  const [urlInput, setUrlInput] = useState('')

  // 마이그레이션
  const [migrateDialog, setMigrateDialog] = useState(null) // { schoolId, schoolName, coverApiUrl }
  const [migrateStatus, setMigrateStatus] = useState(null) // { phase, count, total, error }

  const loadSchools = async () => {
    setLoadingList(true)
    try {
      const snap = await getDocs(collection(db, 'schoolDomains'))
      const list = await Promise.all(
        snap.docs.map(async d => {
          const domainData = { domain: d.id, ...d.data() }
          try {
            const schoolSnap = await getDoc(doc(db, 'schools', domainData.schoolId))
            if (schoolSnap.exists()) {
              domainData.coverApiUrl = schoolSnap.data().coverApiUrl || null
            }
          } catch {}
          return domainData
        })
      )
      list.sort((a, b) => a.schoolName?.localeCompare(b.schoolName, 'ko'))
      setSchools(list)
    } catch (e) {
      setError('목록 불러오기 실패: ' + e.message)
    } finally {
      setLoadingList(false)
    }
  }

  useEffect(() => { loadSchools() }, [])

  const handleAdd = async () => {
    setFormError('')
    const domain = form.domain.trim().toLowerCase().replace(/^@/, '')
    const schoolId = form.schoolId.trim().toLowerCase().replace(/\s+/g, '-')
    const schoolName = form.schoolName.trim()
    const adminEmail = form.adminEmail.trim().toLowerCase()

    if (!domain || !schoolId || !schoolName) {
      setFormError('도메인, 학교 ID, 학교명은 필수 항목입니다.')
      return
    }
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
      setFormError('올바른 도메인 형식을 입력하세요. (예: sunyu.hs.kr)')
      return
    }
    if (!/^[a-z0-9-]+$/.test(schoolId)) {
      setFormError('학교 ID는 영소문자, 숫자, 하이픈만 사용하세요. (예: sunyu-hs)')
      return
    }

    const existing = await getDoc(doc(db, 'schoolDomains', domain))
    if (existing.exists()) {
      setFormError(`@${domain} 은 이미 등록된 도메인입니다.`)
      return
    }

    setSaving(true)
    try {
      await setDoc(doc(db, 'schoolDomains', domain), {
        schoolId,
        schoolName,
        adminEmail: adminEmail || null,
        createdAt: serverTimestamp(),
        createdBy: user.email,
      })

      const schoolRef = doc(db, 'schools', schoolId)
      const schoolDoc = await getDoc(schoolRef)
      if (!schoolDoc.exists()) {
        await setDoc(schoolRef, {
          name: schoolName,
          domains: [domain],
          createdAt: serverTimestamp(),
          createdBy: user.email,
        })
      }

      setForm({ domain: '', schoolId: '', schoolName: '', adminEmail: '' })
      setSuccessMsg(`✅ @${domain} (${schoolName}) 등록 완료`)
      setTimeout(() => setSuccessMsg(''), 4000)
      await loadSchools()
    } catch (e) {
      setFormError('저장 실패: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleSaveUrl = async (schoolId, domain) => {
    const url = urlInput.trim()
    try {
      await setDoc(doc(db, 'schools', schoolId), { coverApiUrl: url }, { merge: true })
      await setDoc(doc(db, 'schoolDomains', domain), { coverApiUrl: url }, { merge: true })
      setSuccessMsg(`✅ ${schoolId} 보강 API URL 저장 완료`)
      setTimeout(() => setSuccessMsg(''), 4000)
      setEditingUrl(null)
      await loadSchools()
    } catch (e) {
      setError('URL 저장 실패: ' + e.message)
    }
  }

  const handleDelete = async (domain, schoolName) => {
    if (!window.confirm(`@${domain} (${schoolName}) 도메인을 삭제하시겠습니까?\n해당 학교 사용자들은 더 이상 로그인할 수 없습니다.`)) return
    try {
      await deleteDoc(doc(db, 'schoolDomains', domain))
      setSuccessMsg(`🗑 @${domain} 삭제 완료`)
      setTimeout(() => setSuccessMsg(''), 4000)
      await loadSchools()
    } catch (e) {
      setError('삭제 실패: ' + e.message)
    }
  }

  // ── 마이그레이션 ────────────────────────────────────────────────
  const handleMigrateStart = (school) => {
    if (!school.coverApiUrl) {
      alert('Apps Script URL이 설정되지 않았습니다. 먼저 보강 API URL을 등록하세요.')
      return
    }
    setMigrateDialog(school)
    setMigrateStatus(null)
  }

  const handleMigrateRun = async () => {
    const { schoolId, coverApiUrl } = migrateDialog
    setMigrateStatus({ phase: 'fetching', count: 0, total: 0 })
    try {
      const res = await fetch(coverApiUrl)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (!Array.isArray(data)) throw new Error('예상치 못한 응답 형식입니다.')

      setMigrateStatus({ phase: 'writing', count: 0, total: data.length })

      const BATCH_SIZE = 499
      let written = 0
      for (let i = 0; i < data.length; i += BATCH_SIZE) {
        const chunk = data.slice(i, i + BATCH_SIZE)
        const batch = writeBatch(db)
        chunk.forEach(item => {
          if (!item.id) return
          const ref = doc(db, 'schools', schoolId, 'coverRequests', String(item.id))
          batch.set(ref, {
            date: normalizeDate(item.date),
            className: String(item.className || ''),
            period: Number(item.period) || 0,
            absentTeacher: String(item.absentTeacher || ''),
            subject: String(item.subject || ''),
            status: item.status === '마감' ? '마감' : '대기중',
            coverTeacher: item.coverTeacher || null,
            coverTeacherEmail: item.coverTeacherEmail || null,
            openAt: item.openAt || null,
            _migrated: true,
          }, { merge: true })
        })
        await batch.commit()
        written += chunk.length
        setMigrateStatus({ phase: 'writing', count: written, total: data.length })
      }

      setMigrateStatus({ phase: 'done', count: data.length, total: data.length })
    } catch (e) {
      setMigrateStatus({ phase: 'error', error: e.message })
    }
  }

  return (
    <SuperAdminLayout>
    <Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {successMsg && <Alert severity="success" sx={{ mb: 2 }}>{successMsg}</Alert>}

      {/* ── 신규 학교 등록 ── */}
      <Paper sx={{ p: 3, mb: 4, borderRadius: 3 }}>
        <Typography variant="subtitle1" fontWeight={600} gutterBottom>
          새 학교 등록
        </Typography>
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mb: 1.5 }}>
          <TextField
            label="Google 도메인"
            placeholder="sunyu.hs.kr"
            size="small"
            value={form.domain}
            onChange={e => setForm(f => ({ ...f, domain: e.target.value }))}
            sx={{ flex: '1 1 160px' }}
            InputProps={{ startAdornment: <span style={{ color: '#888', marginRight: 2 }}>@</span> }}
          />
          <TextField
            label="학교 ID (영문)"
            placeholder="sunyu-hs"
            size="small"
            value={form.schoolId}
            onChange={e => setForm(f => ({ ...f, schoolId: e.target.value }))}
            sx={{ flex: '1 1 130px' }}
          />
          <TextField
            label="학교명"
            placeholder="선유고등학교"
            size="small"
            value={form.schoolName}
            onChange={e => setForm(f => ({ ...f, schoolName: e.target.value }))}
            sx={{ flex: '1 1 140px' }}
          />
          <TextField
            label="최초 관리자 이메일"
            placeholder="admin@sunyu.hs.kr"
            size="small"
            value={form.adminEmail}
            onChange={e => setForm(f => ({ ...f, adminEmail: e.target.value }))}
            sx={{ flex: '1 1 200px' }}
            helperText="첫 로그인 시 school_admin 자동 부여"
          />
          <Button
            variant="contained"
            onClick={handleAdd}
            disabled={saving}
            sx={{ minWidth: 80, alignSelf: 'flex-start', mt: 0.5 }}
          >
            {saving ? <CircularProgress size={18} color="inherit" /> : '등록'}
          </Button>
        </Box>
        {formError && (
          <Typography variant="caption" color="error">{formError}</Typography>
        )}
      </Paper>

      <Divider sx={{ mb: 3 }} />

      {/* ── 등록된 학교 목록 ── */}
      <Typography variant="subtitle1" fontWeight={600} gutterBottom>
        등록된 학교 ({schools.length}개)
      </Typography>

      {loadingList ? (
        <Box display="flex" justifyContent="center" py={4}>
          <CircularProgress />
        </Box>
      ) : schools.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
          등록된 학교가 없습니다.
        </Typography>
      ) : (
        <TableContainer component={Paper} sx={{ borderRadius: 3 }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                <TableCell><strong>학교명</strong></TableCell>
                <TableCell><strong>Google 도메인</strong></TableCell>
                <TableCell><strong>학교 ID</strong></TableCell>
                <TableCell><strong>보강 API URL</strong></TableCell>
                <TableCell><strong>최초 관리자</strong></TableCell>
                <TableCell align="center"><strong>마이그레이션</strong></TableCell>
                <TableCell align="center"><strong>삭제</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {schools.map(({ domain, schoolId, schoolName, coverApiUrl, adminEmail }) => (
                <TableRow key={domain} hover>
                  <TableCell>{schoolName}</TableCell>
                  <TableCell>
                    <Chip label={`@${domain}`} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" sx={{ fontFamily: 'monospace', color: '#666' }}>
                      {schoolId}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ minWidth: 220 }}>
                    {editingUrl === schoolId ? (
                      <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                        <TextField
                          size="small"
                          value={urlInput}
                          onChange={e => setUrlInput(e.target.value)}
                          placeholder="https://script.google.com/..."
                          sx={{ flex: 1, fontSize: '0.75rem' }}
                          autoFocus
                        />
                        <IconButton size="small" color="success" onClick={() => handleSaveUrl(schoolId, domain)}>
                          <CheckIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" onClick={() => setEditingUrl(null)}>
                          <CloseIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    ) : (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        {coverApiUrl ? (
                          <Chip label="설정됨" size="small" color="success" variant="outlined" />
                        ) : (
                          <Chip label="미설정" size="small" color="warning" variant="outlined" />
                        )}
                        <Tooltip title="URL 편집">
                          <IconButton size="small" onClick={() => { setEditingUrl(schoolId); setUrlInput(coverApiUrl || '') }}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    )}
                  </TableCell>
                  <TableCell>
                    {adminEmail ? (
                      <Typography variant="caption" sx={{ color: '#555' }}>{adminEmail}</Typography>
                    ) : (
                      <Typography variant="caption" color="text.disabled">미설정</Typography>
                    )}
                  </TableCell>
                  <TableCell align="center">
                    <Tooltip title={coverApiUrl ? 'Apps Script → Firestore 마이그레이션' : 'API URL 먼저 설정 필요'}>
                      <span>
                        <Button
                          size="small"
                          variant="outlined"
                          color="secondary"
                          disabled={!coverApiUrl}
                          onClick={() => handleMigrateStart({ schoolId, schoolName, coverApiUrl })}
                          sx={{ fontSize: '0.72rem', whiteSpace: 'nowrap' }}
                        >
                          DB 이전
                        </Button>
                      </span>
                    </Tooltip>
                  </TableCell>
                  <TableCell align="center">
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => handleDelete(domain, schoolName)}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* ── 마이그레이션 다이얼로그 ── */}
      <Dialog
        open={!!migrateDialog}
        onClose={() => { if (migrateStatus?.phase !== 'writing') setMigrateDialog(null) }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 700 }}>
          📦 보강 데이터 DB 이전
        </DialogTitle>
        <DialogContent>
          {!migrateStatus && (
            <Box>
              <Typography variant="body2" sx={{ mb: 2 }}>
                <strong>{migrateDialog?.schoolName}</strong>의 Apps Script 데이터를 Firestore로 가져옵니다.
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                기존 Firestore 데이터와 병합(merge)되며, 같은 ID의 항목은 덮어씌워집니다.
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                <Button onClick={() => setMigrateDialog(null)} color="inherit">취소</Button>
                <Button variant="contained" color="secondary" onClick={handleMigrateRun}>
                  마이그레이션 시작
                </Button>
              </Box>
            </Box>
          )}
          {migrateStatus?.phase === 'fetching' && (
            <Box sx={{ textAlign: 'center', py: 2 }}>
              <CircularProgress size={32} sx={{ mb: 1.5 }} />
              <Typography variant="body2">Apps Script에서 데이터를 가져오는 중...</Typography>
            </Box>
          )}
          {migrateStatus?.phase === 'writing' && (
            <Box sx={{ py: 1 }}>
              <Typography variant="body2" sx={{ mb: 1 }}>
                Firestore에 쓰는 중... ({migrateStatus.count} / {migrateStatus.total}건)
              </Typography>
              <LinearProgress
                variant="determinate"
                value={migrateStatus.total ? (migrateStatus.count / migrateStatus.total) * 100 : 0}
              />
            </Box>
          )}
          {migrateStatus?.phase === 'done' && (
            <Box>
              <Alert severity="success" sx={{ mb: 2 }}>
                ✅ 완료! 총 {migrateStatus.count}건의 보강 데이터를 Firestore에 저장했습니다.
              </Alert>
              <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button variant="contained" onClick={() => { setMigrateDialog(null); setMigrateStatus(null) }}>
                  닫기
                </Button>
              </Box>
            </Box>
          )}
          {migrateStatus?.phase === 'error' && (
            <Box>
              <Alert severity="error" sx={{ mb: 2 }}>
                마이그레이션 실패: {migrateStatus.error}
              </Alert>
              <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                <Button onClick={() => setMigrateStatus(null)}>다시 시도</Button>
                <Button onClick={() => { setMigrateDialog(null); setMigrateStatus(null) }}>닫기</Button>
              </Box>
            </Box>
          )}
        </DialogContent>
      </Dialog>

    </Box>
    </SuperAdminLayout>
  )
}
