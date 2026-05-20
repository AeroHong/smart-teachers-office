import { useState, useEffect, useRef } from 'react'
import {
  collection, doc, getDoc, getDocs, setDoc, deleteDoc,
  serverTimestamp, writeBatch, query, where,
  getCountFromServer, addDoc,
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
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import CheckIcon from '@mui/icons-material/Check'
import CloseIcon from '@mui/icons-material/Close'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import DownloadIcon from '@mui/icons-material/Download'
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

function downloadCsvTemplate() {
  const rows = [
    'email,role',
    'teacher@gmail.com,teacher',
    'admin@school.com,school_admin',
  ].join('\n')
  const blob = new Blob(['﻿' + rows], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = '이메일배정_양식.csv'
  a.click()
  URL.revokeObjectURL(url)
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
  const emailIdx = headers.findIndex(h => h === 'email' || h === '이메일')
  const roleIdx  = headers.findIndex(h => h === 'role'  || h === '역할')
  if (emailIdx === -1) return null // 헤더 없음
  return lines.slice(1).map(line => {
    const cols = line.split(',').map(v => v.trim())
    return {
      email: cols[emailIdx] || '',
      role: cols[roleIdx] || 'teacher',
    }
  }).filter(r => r.email)
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

  // 학교명 인라인 편집
  const [editingName, setEditingName] = useState(null)
  const [nameInput, setNameInput] = useState('')

  // 마이그레이션
  const [migrateDialog, setMigrateDialog] = useState(null)
  const [migrateStatus, setMigrateStatus] = useState(null)

  // 개인 이메일 직접 배정
  const [emailMapList, setEmailMapList] = useState([])
  const [loadingEmailMap, setLoadingEmailMap] = useState(true)
  const [emailMapForm, setEmailMapForm] = useState({ email: '', schoolId: '', role: 'teacher' })
  const [emailMapSaving, setEmailMapSaving] = useState(false)
  const [emailMapError, setEmailMapError] = useState('')

  // CSV 업로드
  const csvInputRef = useRef(null)
  const [csvSchoolId, setCsvSchoolId] = useState('')
  const [csvUploading, setCsvUploading] = useState(false)
  const [csvResult, setCsvResult] = useState(null) // { success, skipped, errors }

  const showSuccess = (msg) => {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(''), 4000)
  }

  const loadSchools = async () => {
    setLoadingList(true)
    try {
      const schoolsSnap = await getDocs(collection(db, 'schools'))

      const list = schoolsSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(s => !s.isGuest)
        .map(s => ({
          schoolId:    s.id,
          schoolName:  s.name || s.id,
          domain:      s.domains?.[0] || null,
          coverApiUrl: s.coverApiUrl || null,
          adminEmail:  s.adminEmail || null,
        }))

      list.sort((a, b) => a.schoolName?.localeCompare(b.schoolName, 'ko'))

      // 학교별 구성원 수 병렬 조회
      const counts = await Promise.all(
        list.map(s =>
          getCountFromServer(query(collection(db, 'users'), where('schoolId', '==', s.schoolId)))
            .then(snap => snap.data().count)
            .catch(() => null)
        )
      )

      setSchools(list.map((s, i) => ({ ...s, userCount: counts[i] })))
    } catch (e) {
      setError('목록 불러오기 실패: ' + e.message)
    } finally {
      setLoadingList(false)
    }
  }

  const loadEmailMap = async () => {
    setLoadingEmailMap(true)
    try {
      const snap = await getDocs(collection(db, 'userEmailMap'))
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      list.sort((a, b) => (b.assignedAt?.seconds || 0) - (a.assignedAt?.seconds || 0))
      setEmailMapList(list)
    } catch (e) {
      console.error('이메일 매핑 로드 실패:', e)
    } finally {
      setLoadingEmailMap(false)
    }
  }

  useEffect(() => { loadSchools(); loadEmailMap() }, [])

  // ── 학교 등록 ──────────────────────────────────────────────────
  const handleAdd = async () => {
    setFormError('')
    const domain = form.domain.trim().toLowerCase().replace(/^@/, '')
    const schoolId = form.schoolId.trim().toLowerCase().replace(/\s+/g, '-')
    const schoolName = form.schoolName.trim()
    const adminEmail = form.adminEmail.trim().toLowerCase()

    if (!schoolId || !schoolName) {
      setFormError('학교 ID와 학교명은 필수 항목입니다.')
      return
    }
    if (!/^[a-z0-9-]+$/.test(schoolId)) {
      setFormError('학교 ID는 영소문자, 숫자, 하이픈만 사용하세요. (예: sunyu-hs)')
      return
    }
    if (domain && !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
      setFormError('올바른 도메인 형식을 입력하세요. (예: sunyu.hs.kr)')
      return
    }
    if (!domain && !adminEmail) {
      setFormError('도메인이 없는 경우 관리자 이메일은 필수입니다.')
      return
    }

    if (domain) {
      const existing = await getDoc(doc(db, 'schoolDomains', domain))
      if (existing.exists()) {
        setFormError(`@${domain} 은 이미 등록된 도메인입니다.`)
        return
      }
    }

    setSaving(true)
    try {
      const schoolRef = doc(db, 'schools', schoolId)
      const schoolDoc = await getDoc(schoolRef)
      if (schoolDoc.exists()) {
        setFormError('이미 존재하는 학교 ID입니다.')
        return
      }

      await setDoc(schoolRef, {
        name: schoolName,
        ...(domain ? { domains: [domain] } : {}),
        ...(adminEmail ? { adminEmail } : {}),
        createdAt: serverTimestamp(),
        createdBy: user.email,
      })

      if (domain) {
        await setDoc(doc(db, 'schoolDomains', domain), {
          schoolId,
          createdAt: serverTimestamp(),
          createdBy: user.email,
        })
      }

      if (adminEmail) {
        const docId = adminEmail.replace(/\./g, '_').replace(/@/g, '__at__')
        await setDoc(doc(db, 'userEmailMap', docId), {
          email: adminEmail,
          schoolId,
          role: 'school_admin',
          assignedAt: serverTimestamp(),
          assignedBy: user.email,
        })
        await loadEmailMap()
      }

      await logAudit(user.email, 'school_created', { schoolId, schoolName, domain, adminEmail })

      setForm({ domain: '', schoolId: '', schoolName: '', adminEmail: '' })
      showSuccess(`✅ ${schoolName} 등록 완료`)
      await loadSchools()
    } catch (e) {
      setFormError('저장 실패: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  // ── 보강 API URL 저장 (schools만 업데이트) ────────────────────
  const handleSaveUrl = async (schoolId) => {
    const url = urlInput.trim()
    try {
      await setDoc(doc(db, 'schools', schoolId), { coverApiUrl: url }, { merge: true })
      await logAudit(user.email, 'cover_url_changed', { schoolId, url })
      showSuccess(`✅ ${schoolId} 보강 API URL 저장 완료`)
      setEditingUrl(null)
      await loadSchools()
    } catch (e) {
      setError('URL 저장 실패: ' + e.message)
    }
  }

  // ── 학교명 저장 (schools만 업데이트 — 단일 소스) ──────────────
  const handleSaveName = async (schoolId) => {
    const name = nameInput.trim()
    if (!name) return
    try {
      await setDoc(doc(db, 'schools', schoolId), { name }, { merge: true })
      await logAudit(user.email, 'school_name_changed', { schoolId, name })
      showSuccess(`✅ 학교명 변경 완료`)
      setEditingName(null)
      await loadSchools()
    } catch (e) {
      setError('학교명 변경 실패: ' + e.message)
    }
  }

  // ── 학교 삭제 ─────────────────────────────────────────────────
  const handleDelete = async (schoolId, domain, schoolName) => {
    const label = domain ? `@${domain} (${schoolName})` : schoolName
    if (!window.confirm(`"${label}" 학교를 삭제하시겠습니까?\n해당 학교 사용자들은 더 이상 로그인할 수 없습니다.`)) return
    try {
      await deleteDoc(doc(db, 'schools', schoolId))
      if (domain) await deleteDoc(doc(db, 'schoolDomains', domain))
      await logAudit(user.email, 'school_deleted', { schoolId, schoolName })
      showSuccess(`🗑 ${label} 삭제 완료`)
      await loadSchools()
    } catch (e) {
      setError('삭제 실패: ' + e.message)
    }
  }

  // ── 이메일 배정 (단건) ─────────────────────────────────────────
  const handleAddEmailMap = async () => {
    setEmailMapError('')
    const email = emailMapForm.email.trim().toLowerCase()
    const schoolId = emailMapForm.schoolId
    const role = emailMapForm.role

    if (!email || !schoolId) {
      setEmailMapError('이메일과 학교는 필수입니다.')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailMapError('올바른 이메일 형식을 입력하세요.')
      return
    }

    const selectedSchool = schools.find(s => s.schoolId === schoolId)
    const schoolName = selectedSchool?.schoolName || schoolId

    setEmailMapSaving(true)
    try {
      const docId = email.replace(/\./g, '_').replace(/@/g, '__at__')
      await setDoc(doc(db, 'userEmailMap', docId), {
        email,
        schoolId,
        role,
        assignedAt: serverTimestamp(),
        assignedBy: user.email,
      })
      await logAudit(user.email, 'email_assigned', { email, schoolId, schoolName, role })
      setEmailMapForm(f => ({ ...f, email: '' }))
      showSuccess(`✅ ${email} → ${schoolName} 배정 완료`)
      await loadEmailMap()
    } catch (e) {
      setEmailMapError('저장 실패: ' + e.message)
    } finally {
      setEmailMapSaving(false)
    }
  }

  const handleDeleteEmailMap = async (docId, email) => {
    if (!window.confirm(`${email} 배정을 삭제하시겠습니까?`)) return
    try {
      await deleteDoc(doc(db, 'userEmailMap', docId))
      await logAudit(user.email, 'email_removed', { email })
      showSuccess(`🗑 ${email} 배정 삭제 완료`)
      await loadEmailMap()
    } catch (e) {
      setError('삭제 실패: ' + e.message)
    }
  }

  // ── CSV 일괄 업로드 ────────────────────────────────────────────
  const handleCsvUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !csvSchoolId) return
    e.target.value = ''

    setCsvUploading(true)
    setCsvResult(null)

    try {
      const text = await file.text()
      const rows = parseCsv(text)

      if (rows === null) {
        setEmailMapError('CSV 헤더를 확인하세요. email 또는 이메일 열이 필요합니다.')
        setCsvUploading(false)
        return
      }

      const VALID_ROLES = ['teacher', 'school_admin']
      const selectedSchool = schools.find(s => s.schoolId === csvSchoolId)
      const schoolName = selectedSchool?.schoolName || csvSchoolId

      let success = 0, skipped = 0
      const errors = []
      const batch = writeBatch(db)

      for (const row of rows) {
        const email = row.email.toLowerCase()
        const role = VALID_ROLES.includes(row.role) ? row.role : 'teacher'

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          errors.push(`${email}: 이메일 형식 오류`)
          skipped++
          continue
        }

        const docId = email.replace(/\./g, '_').replace(/@/g, '__at__')
        batch.set(doc(db, 'userEmailMap', docId), {
          email,
          schoolId: csvSchoolId,
          role,
          assignedAt: serverTimestamp(),
          assignedBy: user.email,
        })
        success++
      }

      if (success > 0) await batch.commit()

      await logAudit(user.email, 'email_csv_uploaded', {
        schoolId: csvSchoolId,
        schoolName,
        count: success,
      })

      setCsvResult({ success, skipped, errors })
      await loadEmailMap()
    } catch (e) {
      setEmailMapError('CSV 처리 실패: ' + e.message)
    } finally {
      setCsvUploading(false)
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
            label="학교 ID (영문) *"
            placeholder="sunyu-hs"
            size="small"
            value={form.schoolId}
            onChange={e => setForm(f => ({ ...f, schoolId: e.target.value }))}
            sx={{ flex: '1 1 130px' }}
          />
          <TextField
            label="학교명 *"
            placeholder="선유고등학교"
            size="small"
            value={form.schoolName}
            onChange={e => setForm(f => ({ ...f, schoolName: e.target.value }))}
            sx={{ flex: '1 1 140px' }}
          />
          <TextField
            label="Google 도메인 (선택)"
            placeholder="sunyu.hs.kr"
            size="small"
            value={form.domain}
            onChange={e => setForm(f => ({ ...f, domain: e.target.value }))}
            sx={{ flex: '1 1 160px' }}
            InputProps={{ startAdornment: <span style={{ color: '#aaa', marginRight: 2 }}>@</span> }}
            helperText="Workspace 있는 학교만"
          />
          <TextField
            label="관리자 이메일"
            placeholder="admin@gmail.com"
            size="small"
            value={form.adminEmail}
            onChange={e => setForm(f => ({ ...f, adminEmail: e.target.value }))}
            sx={{ flex: '1 1 200px' }}
            helperText="도메인 없으면 필수"
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
        {formError && <Typography variant="caption" color="error">{formError}</Typography>}
      </Paper>

      <Divider sx={{ mb: 3 }} />

      {/* ── 등록된 학교 목록 ── */}
      <Typography variant="subtitle1" fontWeight={600} gutterBottom>
        등록된 학교 ({schools.length}개)
      </Typography>

      {loadingList ? (
        <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box>
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
                <TableCell><strong>구성원</strong></TableCell>
                <TableCell><strong>보강 API URL</strong></TableCell>
                <TableCell><strong>최초 관리자</strong></TableCell>
                <TableCell align="center"><strong>마이그레이션</strong></TableCell>
                <TableCell align="center"><strong>삭제</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {schools.map(({ domain, schoolId, schoolName, coverApiUrl, adminEmail, userCount }) => (
                <TableRow key={schoolId} hover>
                  {/* 학교명 */}
                  <TableCell>
                    {editingName === schoolId ? (
                      <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                        <TextField size="small" value={nameInput}
                          onChange={e => setNameInput(e.target.value)}
                          sx={{ width: 150 }} autoFocus
                          onKeyDown={e => { if (e.key === 'Enter') handleSaveName(schoolId); if (e.key === 'Escape') setEditingName(null) }}
                        />
                        <IconButton size="small" color="success" onClick={() => handleSaveName(schoolId)}><CheckIcon fontSize="small" /></IconButton>
                        <IconButton size="small" onClick={() => setEditingName(null)}><CloseIcon fontSize="small" /></IconButton>
                      </Box>
                    ) : (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        {schoolName}
                        <Tooltip title="학교명 편집">
                          <IconButton size="small" onClick={() => { setEditingName(schoolId); setNameInput(schoolName) }}>
                            <EditIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    )}
                  </TableCell>

                  {/* 도메인 */}
                  <TableCell>
                    {domain
                      ? <Chip label={`@${domain}`} size="small" variant="outlined" />
                      : <Typography variant="caption" color="text.disabled">도메인 없음</Typography>
                    }
                  </TableCell>

                  {/* 학교 ID (읽기 전용) */}
                  <TableCell>
                    <Typography variant="caption" sx={{ fontFamily: 'monospace', color: '#666' }}>{schoolId}</Typography>
                  </TableCell>

                  {/* 구성원 수 */}
                  <TableCell>
                    {userCount !== null && userCount !== undefined
                      ? <Chip label={`${userCount}명`} size="small" sx={{ bgcolor: '#eef2ff', color: '#4f46e5', fontWeight: 600 }} />
                      : <Typography variant="caption" color="text.disabled">—</Typography>
                    }
                  </TableCell>

                  {/* 보강 API URL */}
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
                        <IconButton size="small" color="success" onClick={() => handleSaveUrl(schoolId)}><CheckIcon fontSize="small" /></IconButton>
                        <IconButton size="small" onClick={() => setEditingUrl(null)}><CloseIcon fontSize="small" /></IconButton>
                      </Box>
                    ) : (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        {coverApiUrl
                          ? <Chip label="설정됨" size="small" color="success" variant="outlined" />
                          : <Chip label="미설정" size="small" color="warning" variant="outlined" />
                        }
                        <Tooltip title="URL 편집">
                          <IconButton size="small" onClick={() => { setEditingUrl(schoolId); setUrlInput(coverApiUrl || '') }}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    )}
                  </TableCell>

                  {/* 관리자 */}
                  <TableCell>
                    {adminEmail
                      ? <Typography variant="caption" sx={{ color: '#555' }}>{adminEmail}</Typography>
                      : <Typography variant="caption" color="text.disabled">미설정</Typography>
                    }
                  </TableCell>

                  {/* 마이그레이션 */}
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

                  {/* 삭제 */}
                  <TableCell align="center">
                    <IconButton size="small" color="error" onClick={() => handleDelete(schoolId, domain, schoolName)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Divider sx={{ my: 4 }} />

      {/* ── 개인 이메일 직접 배정 ── */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
        <Typography variant="subtitle1" fontWeight={600}>개인 이메일 직접 배정</Typography>
        <Chip label="Workspace 없는 학교" size="small" sx={{ bgcolor: '#fff7ed', color: '#ea580c', fontWeight: 700 }} />
      </Box>

      <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
        배정된 이메일로 로그인 시 지정 학교·역할로 즉시 진입합니다.
      </Typography>

      {/* 단건 입력 */}
      <Paper sx={{ p: 3, mb: 2, borderRadius: 3 }}>
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mb: 1 }}>
          <TextField
            label="이메일"
            placeholder="teacher@gmail.com"
            size="small"
            value={emailMapForm.email}
            onChange={e => setEmailMapForm(f => ({ ...f, email: e.target.value }))}
            sx={{ flex: '1 1 200px' }}
          />
          <FormControl size="small" sx={{ flex: '1 1 180px' }}>
            <InputLabel>학교 선택</InputLabel>
            <Select
              value={emailMapForm.schoolId}
              label="학교 선택"
              onChange={e => setEmailMapForm(f => ({ ...f, schoolId: e.target.value }))}
            >
              {schools.map(s => (
                <MenuItem key={s.schoolId} value={s.schoolId}>{s.schoolName}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>역할</InputLabel>
            <Select
              value={emailMapForm.role}
              label="역할"
              onChange={e => setEmailMapForm(f => ({ ...f, role: e.target.value }))}
            >
              <MenuItem value="teacher">일반 교사</MenuItem>
              <MenuItem value="school_admin">학교 관리자</MenuItem>
            </Select>
          </FormControl>
          <Button
            variant="contained"
            onClick={handleAddEmailMap}
            disabled={emailMapSaving}
            sx={{ minWidth: 80, alignSelf: 'flex-start', mt: 0.5 }}
          >
            {emailMapSaving ? <CircularProgress size={18} color="inherit" /> : '배정'}
          </Button>
        </Box>
        {emailMapError && <Typography variant="caption" color="error">{emailMapError}</Typography>}
      </Paper>

      {/* CSV 일괄 업로드 */}
      <Paper sx={{ p: 3, mb: 3, borderRadius: 3, bgcolor: '#fafafa', border: '1px dashed #e2e8f0' }}>
        <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5 }}>
          CSV 일괄 업로드
        </Typography>
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
          <FormControl size="small" sx={{ flex: '1 1 180px' }}>
            <InputLabel>학교 선택</InputLabel>
            <Select
              value={csvSchoolId}
              label="학교 선택"
              onChange={e => { setCsvSchoolId(e.target.value); setCsvResult(null) }}
            >
              {schools.map(s => (
                <MenuItem key={s.schoolId} value={s.schoolId}>{s.schoolName}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button
            variant="outlined"
            size="small"
            startIcon={<DownloadIcon />}
            onClick={downloadCsvTemplate}
          >
            양식 다운로드
          </Button>
          <input
            type="file"
            accept=".csv"
            ref={csvInputRef}
            style={{ display: 'none' }}
            onChange={handleCsvUpload}
          />
          <Button
            variant="contained"
            size="small"
            startIcon={csvUploading ? <CircularProgress size={14} color="inherit" /> : <UploadFileIcon />}
            disabled={!csvSchoolId || csvUploading}
            onClick={() => { setCsvResult(null); csvInputRef.current?.click() }}
          >
            CSV 업로드
          </Button>
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
          양식: email, role (teacher 또는 school_admin) — 기존 이메일은 덮어씁니다.
        </Typography>
        {csvResult && (
          <Alert
            severity={csvResult.errors.length > 0 ? 'warning' : 'success'}
            sx={{ mt: 1.5, fontSize: '0.8rem' }}
          >
            ✅ {csvResult.success}건 등록 완료
            {csvResult.skipped > 0 && ` / ⚠️ ${csvResult.skipped}건 건너뜀`}
            {csvResult.errors.length > 0 && (
              <Box component="ul" sx={{ m: 0, pl: 2, mt: 0.5 }}>
                {csvResult.errors.map((e, i) => <li key={i}>{e}</li>)}
              </Box>
            )}
          </Alert>
        )}
      </Paper>

      {/* 배정 목록 */}
      {loadingEmailMap ? (
        <Box display="flex" justifyContent="center" py={3}><CircularProgress size={24} /></Box>
      ) : emailMapList.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
          배정된 이메일이 없습니다.
        </Typography>
      ) : (
        <TableContainer component={Paper} sx={{ borderRadius: 3 }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: '#fff7ed' }}>
                <TableCell><strong>이메일</strong></TableCell>
                <TableCell><strong>학교</strong></TableCell>
                <TableCell><strong>역할</strong></TableCell>
                <TableCell><strong>배정일</strong></TableCell>
                <TableCell align="center"><strong>삭제</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {emailMapList.map(m => (
                <TableRow key={m.id} hover>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{m.email}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {schools.find(s => s.schoolId === m.schoolId)?.schoolName || m.schoolId}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">{m.schoolId}</Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={m.role === 'school_admin' ? '학교관리자' : '일반교사'}
                      size="small"
                      color={m.role === 'school_admin' ? 'primary' : 'default'}
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" color="text.secondary">
                      {m.assignedAt?.toDate().toLocaleDateString('ko-KR') || '—'}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <IconButton size="small" color="error" onClick={() => handleDeleteEmailMap(m.id, m.email)}>
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
        <DialogTitle sx={{ fontWeight: 700 }}>📦 보강 데이터 DB 이전</DialogTitle>
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
