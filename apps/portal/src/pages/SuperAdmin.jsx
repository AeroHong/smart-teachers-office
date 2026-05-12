import { useState, useEffect } from 'react'
import {
  collection, doc, getDoc, getDocs, setDoc, deleteDoc, serverTimestamp, writeBatch, query, where,
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

  // 학교명 인라인 편집
  const [editingName, setEditingName] = useState(null) // schoolId
  const [nameInput, setNameInput] = useState('')

  // 학교 ID 변경
  const [editingSchoolId, setEditingSchoolId] = useState(null) // schoolId
  const [schoolIdInput, setSchoolIdInput] = useState('')
  const [schoolIdSaving, setSchoolIdSaving] = useState(false)

  // 게스트 학교
  const [guestSchools, setGuestSchools] = useState([])
  const [loadingGuests, setLoadingGuests] = useState(true)
  const [promoteTarget, setPromoteTarget] = useState(null)  // { schoolId, name, domain }
  const [promoteForm, setPromoteForm] = useState({ domain: '', schoolName: '', adminEmail: '' })
  const [promoteSaving, setPromoteSaving] = useState(false)

  // 마이그레이션
  const [migrateDialog, setMigrateDialog] = useState(null) // { schoolId, schoolName, coverApiUrl }
  const [migrateStatus, setMigrateStatus] = useState(null) // { phase, count, total, error }

  // 개인 이메일 직접 배정
  const [emailMapList, setEmailMapList] = useState([])
  const [loadingEmailMap, setLoadingEmailMap] = useState(true)
  const [emailMapForm, setEmailMapForm] = useState({ email: '', schoolId: '', role: 'school_admin' })
  const [emailMapSaving, setEmailMapSaving] = useState(false)
  const [emailMapError, setEmailMapError] = useState('')

  const loadSchools = async () => {
    setLoadingList(true)
    try {
      const [schoolsSnap, domainSnap] = await Promise.all([
        getDocs(collection(db, 'schools')),
        getDocs(collection(db, 'schoolDomains')),
      ])

      // schoolId → 도메인 정보 맵
      const domainMap = {}
      domainSnap.docs.forEach(d => {
        const data = d.data()
        if (data.schoolId) domainMap[data.schoolId] = { domain: d.id, ...data }
      })

      const list = schoolsSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(s => !s.isGuest)
        .map(s => {
          const di = domainMap[s.id] || {}
          return {
            schoolId:   s.id,
            schoolName: s.name || di.schoolName || s.id,
            domain:     di.domain || null,
            coverApiUrl: s.coverApiUrl || null,
            adminEmail: di.adminEmail || s.adminEmail || null,
          }
        })

      list.sort((a, b) => a.schoolName?.localeCompare(b.schoolName, 'ko'))
      setSchools(list)
    } catch (e) {
      setError('목록 불러오기 실패: ' + e.message)
    } finally {
      setLoadingList(false)
    }
  }

  const loadGuestSchools = async () => {
    setLoadingGuests(true)
    try {
      const snap = await getDocs(query(collection(db, 'schools'), where('isGuest', '==', true)))
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      setGuestSchools(list)
    } catch (e) {
      console.error('게스트 학교 로드 실패:', e)
    } finally {
      setLoadingGuests(false)
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

  useEffect(() => { loadSchools(); loadGuestSchools(); loadEmailMap() }, [])

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
        schoolName,
        role,
        assignedAt: serverTimestamp(),
        assignedBy: user.email,
      })
      setEmailMapForm(f => ({ ...f, email: '' }))
      setSuccessMsg(`✅ ${email} → ${schoolName} 배정 완료`)
      setTimeout(() => setSuccessMsg(''), 4000)
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
      setSuccessMsg(`🗑 ${email} 배정 삭제 완료`)
      setTimeout(() => setSuccessMsg(''), 4000)
      await loadEmailMap()
    } catch (e) {
      setError('삭제 실패: ' + e.message)
    }
  }

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
      // schools 문서 생성
      const schoolRef = doc(db, 'schools', schoolId)
      const schoolDoc = await getDoc(schoolRef)
      if (!schoolDoc.exists()) {
        await setDoc(schoolRef, {
          name: schoolName,
          ...(domain ? { domains: [domain] } : {}),
          ...(adminEmail ? { adminEmail } : {}),
          createdAt: serverTimestamp(),
          createdBy: user.email,
        })
      }

      if (domain) {
        // 워크스페이스 도메인 등록
        await setDoc(doc(db, 'schoolDomains', domain), {
          schoolId,
          schoolName,
          adminEmail: adminEmail || null,
          createdAt: serverTimestamp(),
          createdBy: user.email,
        })
      }

      if (adminEmail) {
        // 관리자 이메일 → userEmailMap 자동 등록
        const docId = adminEmail.replace(/\./g, '_').replace(/@/g, '__at__')
        await setDoc(doc(db, 'userEmailMap', docId), {
          email: adminEmail,
          schoolId,
          schoolName,
          role: 'school_admin',
          assignedAt: serverTimestamp(),
          assignedBy: user.email,
        })
        await loadEmailMap()
      }

      setForm({ domain: '', schoolId: '', schoolName: '', adminEmail: '' })
      const label = domain ? `@${domain} (${schoolName})` : `${schoolName} (도메인 없음)`
      setSuccessMsg(`✅ ${label} 등록 완료`)
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
      if (domain) {
        await setDoc(doc(db, 'schoolDomains', domain), { coverApiUrl: url }, { merge: true })
      }
      setSuccessMsg(`✅ ${schoolId} 보강 API URL 저장 완료`)
      setTimeout(() => setSuccessMsg(''), 4000)
      setEditingUrl(null)
      await loadSchools()
    } catch (e) {
      setError('URL 저장 실패: ' + e.message)
    }
  }

  const handleSaveName = async (schoolId, domain) => {
    const name = nameInput.trim()
    if (!name) return
    try {
      await setDoc(doc(db, 'schools', schoolId), { name }, { merge: true })
      if (domain) {
        await setDoc(doc(db, 'schoolDomains', domain), { schoolName: name }, { merge: true })
      }
      setSuccessMsg(`✅ 학교명 변경 완료`)
      setTimeout(() => setSuccessMsg(''), 4000)
      setEditingName(null)
      await loadSchools()
    } catch (e) {
      setError('학교명 변경 실패: ' + e.message)
    }
  }

  const handleSaveSchoolId = async (oldSchoolId, domain, schoolName) => {
    const newId = schoolIdInput.trim().toLowerCase().replace(/\s+/g, '-')
    if (!newId || newId === oldSchoolId) { setEditingSchoolId(null); return }
    if (!/^[a-z0-9-]+$/.test(newId)) {
      setError('학교 ID는 영소문자, 숫자, 하이픈만 사용하세요.')
      return
    }
    if (!window.confirm(
      `학교 ID를 "${oldSchoolId}" → "${newId}" 로 변경합니다.\n\n` +
      `⚠️ 주의: 보강/출결/연수 등 기존 데이터는 이전되지 않습니다.\n` +
      `(메타데이터·도메인·사용자 배정만 업데이트됩니다)\n\n계속하시겠습니까?`
    )) return

    setSchoolIdSaving(true)
    try {
      // 기존 schools 문서 내용 복사 → 새 ID로 생성
      const oldRef = doc(db, 'schools', oldSchoolId)
      const oldSnap = await getDoc(oldRef)
      const oldData = oldSnap.exists() ? oldSnap.data() : {}
      await setDoc(doc(db, 'schools', newId), { ...oldData, name: schoolName })

      // schoolDomains 업데이트
      if (domain) {
        await setDoc(doc(db, 'schoolDomains', domain), { schoolId: newId }, { merge: true })
      }

      // userEmailMap 업데이트 (이 schoolId를 가진 항목)
      const emSnap = await getDocs(collection(db, 'userEmailMap'))
      const emBatch = writeBatch(db)
      emSnap.docs.forEach(d => {
        if (d.data().schoolId === oldSchoolId) {
          emBatch.update(d.ref, { schoolId: newId })
        }
      })
      await emBatch.commit()

      // users 업데이트 (이 schoolId를 가진 항목)
      const uSnap = await getDocs(query(collection(db, 'users'), where('schoolId', '==', oldSchoolId)))
      const uBatch = writeBatch(db)
      uSnap.docs.forEach(d => uBatch.update(d.ref, { schoolId: newId }))
      await uBatch.commit()

      // 기존 schools 문서 삭제
      await deleteDoc(oldRef)

      setSuccessMsg(`✅ 학교 ID 변경 완료: ${oldSchoolId} → ${newId}`)
      setTimeout(() => setSuccessMsg(''), 5000)
      setEditingSchoolId(null)
      await loadSchools()
    } catch (e) {
      setError('학교 ID 변경 실패: ' + e.message)
    } finally {
      setSchoolIdSaving(false)
    }
  }

  const handleDelete = async (schoolId, domain, schoolName) => {
    const label = domain ? `@${domain} (${schoolName})` : schoolName
    if (!window.confirm(`"${label}" 학교를 삭제하시겠습니까?\n해당 학교 사용자들은 더 이상 로그인할 수 없습니다.`)) return
    try {
      await deleteDoc(doc(db, 'schools', schoolId))
      if (domain) await deleteDoc(doc(db, 'schoolDomains', domain))
      setSuccessMsg(`🗑 ${label} 삭제 완료`)
      setTimeout(() => setSuccessMsg(''), 4000)
      await loadSchools()
    } catch (e) {
      setError('삭제 실패: ' + e.message)
    }
  }

  // ── 게스트 학교 정식 등록 ──────────────────────────────────────
  const handlePromote = async () => {
    const domain = promoteForm.domain.trim().toLowerCase().replace(/^@/, '')
    const schoolName = promoteForm.schoolName.trim()
    const adminEmail = promoteForm.adminEmail.trim().toLowerCase()
    if (!domain || !schoolName) { alert('도메인과 학교명은 필수입니다.'); return }

    setPromoteSaving(true)
    try {
      // schoolDomains 등록
      await setDoc(doc(db, 'schoolDomains', domain), {
        schoolId: promoteTarget.id,
        schoolName,
        adminEmail: adminEmail || null,
        createdAt: serverTimestamp(),
        createdBy: user.email,
      })
      // schools 문서 업데이트 (isGuest 제거, name 업데이트)
      await setDoc(doc(db, 'schools', promoteTarget.id), {
        name: schoolName,
        isGuest: false,
        domains: [domain],
      }, { merge: true })

      setPromoteTarget(null)
      setPromoteForm({ domain: '', schoolName: '', adminEmail: '' })
      setSuccessMsg(`✅ ${schoolName} 정식 등록 완료`)
      setTimeout(() => setSuccessMsg(''), 4000)
      await Promise.all([loadSchools(), loadGuestSchools()])
    } catch (e) {
      alert('정식 등록 실패: ' + e.message)
    } finally {
      setPromoteSaving(false)
    }
  }

  const handleDeleteGuest = async (schoolId, name) => {
    if (!window.confirm(`"${name}" 게스트 학교를 삭제하시겠습니까?\n해당 학교의 모든 데이터가 삭제됩니다.`)) return
    try {
      await deleteDoc(doc(db, 'schools', schoolId))
      setSuccessMsg(`🗑 ${name} 게스트 학교 삭제 완료`)
      setTimeout(() => setSuccessMsg(''), 4000)
      await loadGuestSchools()
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
            helperText="도메인 없으면 필수 — 자동 school_admin 배정"
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
                <TableRow key={schoolId} hover>
                  <TableCell>
                    {editingName === schoolId ? (
                      <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                        <TextField size="small" value={nameInput}
                          onChange={e => setNameInput(e.target.value)}
                          sx={{ width: 150 }} autoFocus
                          onKeyDown={e => { if (e.key === 'Enter') handleSaveName(schoolId, domain); if (e.key === 'Escape') setEditingName(null) }}
                        />
                        <IconButton size="small" color="success" onClick={() => handleSaveName(schoolId, domain)}><CheckIcon fontSize="small" /></IconButton>
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
                  <TableCell>
                    {domain
                      ? <Chip label={`@${domain}`} size="small" variant="outlined" />
                      : <Typography variant="caption" color="text.disabled">도메인 없음</Typography>
                    }
                  </TableCell>
                  <TableCell>
                    {editingSchoolId === schoolId ? (
                      <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                        <TextField size="small" value={schoolIdInput}
                          onChange={e => setSchoolIdInput(e.target.value)}
                          sx={{ width: 140, fontFamily: 'monospace' }} autoFocus
                          disabled={schoolIdSaving}
                          onKeyDown={e => { if (e.key === 'Enter') handleSaveSchoolId(schoolId, domain, schoolName); if (e.key === 'Escape') setEditingSchoolId(null) }}
                        />
                        <IconButton size="small" color="success" disabled={schoolIdSaving}
                          onClick={() => handleSaveSchoolId(schoolId, domain, schoolName)}>
                          {schoolIdSaving ? <CircularProgress size={14} /> : <CheckIcon fontSize="small" />}
                        </IconButton>
                        <IconButton size="small" disabled={schoolIdSaving} onClick={() => setEditingSchoolId(null)}><CloseIcon fontSize="small" /></IconButton>
                      </Box>
                    ) : (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Typography variant="caption" sx={{ fontFamily: 'monospace', color: '#666' }}>{schoolId}</Typography>
                        <Tooltip title="학교 ID 변경 (⚠️ 기존 데이터 미이전)">
                          <IconButton size="small" onClick={() => { setEditingSchoolId(schoolId); setSchoolIdInput(schoolId) }}>
                            <EditIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    )}
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
                      onClick={() => handleDelete(schoolId, domain, schoolName)}
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

      <Divider sx={{ my: 4 }} />

      {/* ── 게스트 학교 목록 ── */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
        <Typography variant="subtitle1" fontWeight={600}>게스트 학교</Typography>
        <Chip label={`${guestSchools.length}개`} size="small" sx={{ bgcolor: '#faf5ff', color: '#7c3aed', fontWeight: 700 }} />
        <Typography variant="caption" color="text.secondary">미등록 도메인으로 첫 로그인한 사용자의 체험 학교</Typography>
      </Box>

      {loadingGuests ? (
        <Box display="flex" justifyContent="center" py={3}><CircularProgress size={24} /></Box>
      ) : guestSchools.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
          게스트 학교가 없습니다.
        </Typography>
      ) : (
        <TableContainer component={Paper} sx={{ borderRadius: 3 }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: '#faf5ff' }}>
                <TableCell><strong>체험 학교명</strong></TableCell>
                <TableCell><strong>학교 ID</strong></TableCell>
                <TableCell><strong>가입 이메일</strong></TableCell>
                <TableCell><strong>가입 도메인</strong></TableCell>
                <TableCell><strong>생성일</strong></TableCell>
                <TableCell align="center"><strong>정식 등록</strong></TableCell>
                <TableCell align="center"><strong>삭제</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {guestSchools.map(g => (
                <TableRow key={g.id} hover>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {g.name}
                      <Chip label="게스트" size="small" sx={{ bgcolor: '#ede9fe', color: '#7c3aed', fontSize: '0.68rem' }} />
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" sx={{ fontFamily: 'monospace', color: '#666' }}>{g.id}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption">{g.ownerEmail || '—'}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" color="text.secondary">{g.domain || '—'}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" color="text.secondary">
                      {g.createdAt?.toDate().toLocaleDateString('ko-KR') || '—'}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Button size="small" variant="outlined" color="secondary"
                      onClick={() => {
                        setPromoteTarget(g)
                        setPromoteForm({ domain: g.domain || '', schoolName: g.name?.replace('의 체험 학교', '') || '', adminEmail: g.ownerEmail || '' })
                      }}
                      sx={{ fontSize: '0.72rem', whiteSpace: 'nowrap' }}>
                      정식 등록
                    </Button>
                  </TableCell>
                  <TableCell align="center">
                    <IconButton size="small" color="error" onClick={() => handleDeleteGuest(g.id, g.name)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* ── 정식 등록 다이얼로그 ── */}
      <Dialog open={!!promoteTarget} onClose={() => !promoteSaving && setPromoteTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>🏫 게스트 → 정식 학교 등록</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <Typography variant="body2" color="text.secondary">
            도메인을 등록하면 해당 도메인 사용자가 정식 학교로 로그인할 수 있습니다.
          </Typography>
          <TextField label="Google 도메인" size="small" fullWidth
            value={promoteForm.domain}
            onChange={e => setPromoteForm(f => ({ ...f, domain: e.target.value }))}
            placeholder="sunyu.hs.kr"
            InputProps={{ startAdornment: <span style={{ color: '#888', marginRight: 2 }}>@</span> }}
          />
          <TextField label="학교명" size="small" fullWidth
            value={promoteForm.schoolName}
            onChange={e => setPromoteForm(f => ({ ...f, schoolName: e.target.value }))}
            placeholder="선유고등학교"
          />
          <TextField label="관리자 이메일 (선택)" size="small" fullWidth
            value={promoteForm.adminEmail}
            onChange={e => setPromoteForm(f => ({ ...f, adminEmail: e.target.value }))}
          />
        </DialogContent>
        <DialogContent sx={{ pt: 0, pb: 2, display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
          <Button onClick={() => setPromoteTarget(null)} disabled={promoteSaving}>취소</Button>
          <Button variant="contained" onClick={handlePromote} disabled={promoteSaving}>
            {promoteSaving ? <CircularProgress size={18} color="inherit" /> : '정식 등록'}
          </Button>
        </DialogContent>
      </Dialog>

      <Divider sx={{ my: 4 }} />

      {/* ── 개인 이메일 직접 배정 ── */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
        <Typography variant="subtitle1" fontWeight={600}>개인 이메일 직접 배정</Typography>
        <Chip label="워크스페이스 없는 학교" size="small" sx={{ bgcolor: '#fff7ed', color: '#ea580c', fontWeight: 700 }} />
      </Box>

      <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
        Workspace 없는 학교용 — 배정된 이메일로 로그인 시 지정 학교·역할로 즉시 진입합니다.
      </Typography>

      <Paper sx={{ p: 3, mb: 3, borderRadius: 3 }}>
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
              <MenuItem value="school_admin">학교 관리자</MenuItem>
              <MenuItem value="teacher">일반 교사</MenuItem>
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
                    <Typography variant="body2">{m.schoolName}</Typography>
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
