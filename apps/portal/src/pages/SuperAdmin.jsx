import { useState, useEffect } from 'react'
import {
  collection, doc, getDoc, getDocs, setDoc, deleteDoc, updateDoc,
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
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import CheckIcon from '@mui/icons-material/Check'
import CloseIcon from '@mui/icons-material/Close'
import RefreshIcon from '@mui/icons-material/Refresh'
import PeopleAltIcon from '@mui/icons-material/PeopleAlt'
import CircularProgress from '@mui/material/CircularProgress'
import Alert from '@mui/material/Alert'
import Divider from '@mui/material/Divider'
import Chip from '@mui/material/Chip'
import Tooltip from '@mui/material/Tooltip'
import LinearProgress from '@mui/material/LinearProgress'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'

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

  // 게스트 학교
  const [guestSchools, setGuestSchools] = useState([])
  const [loadingGuest, setLoadingGuest] = useState(true)
  const [convertDialog, setConvertDialog] = useState(null) // { schoolId, ownerEmail, name }
  const [convertForm, setConvertForm] = useState({ schoolName: '', domain: '' })
  const [convertSaving, setConvertSaving] = useState(false)
  const [convertError, setConvertError] = useState('')

  // 구성원 관리 다이얼로그
  const [memberDialog, setMemberDialog] = useState(null) // { schoolId, schoolName }
  const [memberList, setMemberList] = useState([])
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [memberError, setMemberError] = useState('')


  const showSuccess = (msg) => {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(''), 4000)
  }

  const loadSchools = async () => {
    setLoadingList(true)
    try {
      // 학교 목록 + 전체 school_admin 목록 병렬 조회
      const [schoolsSnap, adminsSnap] = await Promise.all([
        getDocs(collection(db, 'schools')),
        getDocs(query(collection(db, 'users'), where('role', '==', 'school_admin'))),
      ])

      // schoolId → 관리자 목록 맵
      const adminsBySchool = {}
      adminsSnap.docs.forEach(d => {
        const { schoolId, name, email } = d.data()
        if (!schoolId) return
        if (!adminsBySchool[schoolId]) adminsBySchool[schoolId] = []
        adminsBySchool[schoolId].push({ name: name || '', email: email || '' })
      })

      const list = schoolsSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(s => !s.isGuest)
        .map(s => ({
          schoolId:    s.id,
          schoolName:  s.name || s.id,
          domain:      s.domains?.[0] || null,
          coverApiUrl: s.coverApiUrl || null,
          admins:      adminsBySchool[s.id] || [],
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

  const loadGuestSchools = async () => {
    setLoadingGuest(true)
    try {
      const snap = await getDocs(query(collection(db, 'schools'), where('isGuest', '==', true)))
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      setGuestSchools(list)
    } catch (e) {
      console.error('게스트 학교 로드 실패:', e)
    } finally {
      setLoadingGuest(false)
    }
  }

  useEffect(() => { loadSchools(); loadGuestSchools() }, [])

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

  // ── 게스트 학교 정식 전환 ──────────────────────────────────────
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
      await Promise.all([loadSchools(), loadGuestSchools()])
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
      showSuccess(`🗑 게스트 학교 및 계정 삭제 완료`)
      await loadGuestSchools()
    } catch (e) {
      setError('삭제 실패: ' + e.message)
    }
  }

  // ── 구성원 관리 ────────────────────────────────────────────────
  const openMemberDialog = async (schoolId, schoolName) => {
    setMemberDialog({ schoolId, schoolName })
    setMemberError('')
    setLoadingMembers(true)
    try {
      const snap = await getDocs(query(collection(db, 'users'), where('schoolId', '==', schoolId)))
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(u => u.role !== 'rejected')
        .sort((a, b) => {
          // 관리자 → 교사 → 대기 순 정렬
          const order = { school_admin: 0, teacher: 1, admin: 0, pending: 2 }
          return (order[a.role] ?? 3) - (order[b.role] ?? 3) || (a.name || '').localeCompare(b.name || '', 'ko')
        })
      setMemberList(list)
    } catch (e) {
      setMemberError('구성원 목록을 불러오지 못했습니다.')
    } finally {
      setLoadingMembers(false)
    }
  }

  const handleMemberRoleChange = async (uid, newRole) => {
    const target = memberList.find(u => u.id === uid)
    try {
      await updateDoc(doc(db, 'users', uid), { role: newRole })
      await logAudit(user.email, 'superadmin_role_changed', {
        targetEmail: target?.email,
        from: target?.role,
        to: newRole,
        schoolId: memberDialog.schoolId,
      })
      setMemberList(prev => prev.map(u => u.id === uid ? { ...u, role: newRole } : u))
    } catch (e) {
      setMemberError('역할 변경 실패: ' + e.message)
    }
  }

  const handleMemberRemove = async (uid) => {
    const target = memberList.find(u => u.id === uid)
    const label = target?.name || target?.email || uid
    if (!window.confirm(`${label}님을 구성원에서 제거하시겠습니까?\n제거된 계정은 시스템에 접근할 수 없습니다.`)) return
    try {
      await updateDoc(doc(db, 'users', uid), { role: 'rejected' })
      await logAudit(user.email, 'superadmin_member_removed', {
        targetEmail: target?.email,
        schoolId: memberDialog.schoolId,
      })
      setMemberList(prev => prev.filter(u => u.id !== uid))
      // 학교 목록의 구성원 수도 갱신
      setSchools(prev => prev.map(s =>
        s.schoolId === memberDialog.schoolId
          ? { ...s, userCount: (s.userCount ?? 1) - 1 }
          : s
      ))
    } catch (e) {
      setMemberError('제거 실패: ' + e.message)
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
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Typography variant="subtitle1" fontWeight={600}>
          등록된 학교 ({schools.length}개)
        </Typography>
        <Tooltip title="새로고침">
          <IconButton size="small" onClick={loadSchools} disabled={loadingList}>
            <RefreshIcon fontSize="small" sx={{ color: '#888' }} />
          </IconButton>
        </Tooltip>
      </Box>

      {loadingList ? (
        <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box>
      ) : schools.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
          등록된 학교가 없습니다.
        </Typography>
      ) : (
        <TableContainer component={Paper} sx={{ borderRadius: 3, overflowX: 'auto' }}>
          <Table size="small" sx={{ width: 'auto', minWidth: '100%' }}>
            <TableHead>
              <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                <TableCell sx={{ whiteSpace: 'nowrap', pl: 2, pr: 1 }}><strong>학교명</strong></TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap', px: 1 }}><strong>Google 도메인</strong></TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap', px: 1 }}><strong>학교 ID</strong></TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap', px: 1 }}><strong>구성원</strong></TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap', px: 1 }}><strong>보강 API URL</strong></TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap', px: 1 }}><strong>학교 관리자</strong></TableCell>
                <TableCell align="center" sx={{ whiteSpace: 'nowrap', px: 1 }}><strong>마이그레이션</strong></TableCell>
                <TableCell align="center" sx={{ whiteSpace: 'nowrap', px: 1, pr: 2 }}><strong>삭제</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {schools.map(({ domain, schoolId, schoolName, coverApiUrl, admins, userCount }) => (
                <TableRow key={schoolId} hover>
                  {/* 학교명 */}
                  <TableCell sx={{ whiteSpace: 'nowrap', pl: 2, pr: 1 }}>
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
                  <TableCell sx={{ whiteSpace: 'nowrap', px: 1 }}>
                    {domain
                      ? <Chip label={`@${domain}`} size="small" variant="outlined" />
                      : <Typography variant="caption" color="text.disabled">도메인 없음</Typography>
                    }
                  </TableCell>

                  {/* 학교 ID (읽기 전용) */}
                  <TableCell sx={{ whiteSpace: 'nowrap', px: 1 }}>
                    <Typography variant="caption" sx={{ fontFamily: 'monospace', color: '#666' }}>{schoolId}</Typography>
                  </TableCell>

                  {/* 구성원 수 + 관리 */}
                  <TableCell sx={{ whiteSpace: 'nowrap', px: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      {userCount !== null && userCount !== undefined
                        ? <Chip label={`${userCount}명`} size="small" sx={{ bgcolor: '#eef2ff', color: '#4f46e5', fontWeight: 600 }} />
                        : <Typography variant="caption" color="text.disabled">—</Typography>
                      }
                      <Tooltip title={userCount > 0 ? '구성원 관리' : '구성원 없음'}>
                        <span>
                          <IconButton
                            size="small"
                            disabled={!userCount}
                            onClick={() => openMemberDialog(schoolId, schoolName)}
                            sx={{ color: '#4f46e5', opacity: userCount > 0 ? 1 : 0.3 }}
                          >
                            <PeopleAltIcon sx={{ fontSize: 16 }} />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </Box>
                  </TableCell>

                  {/* 보강 API URL */}
                  <TableCell sx={{ whiteSpace: 'nowrap', px: 1 }}>
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

                  {/* 학교 관리자 */}
                  <TableCell sx={{ px: 1 }}>
                    {admins.length === 0 ? (
                      <Typography variant="caption" color="text.disabled">없음</Typography>
                    ) : (
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.4 }}>
                        {admins.map((a, i) => (
                          <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            {a.name && (
                              <Typography variant="caption" fontWeight={600} sx={{ color: '#333', whiteSpace: 'nowrap' }}>
                                {a.name}
                              </Typography>
                            )}
                            <Typography variant="caption" sx={{ color: '#888', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                              {a.email}
                            </Typography>
                          </Box>
                        ))}
                      </Box>
                    )}
                  </TableCell>

                  {/* 마이그레이션 */}
                  <TableCell align="center" sx={{ whiteSpace: 'nowrap', px: 1 }}>
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
                  <TableCell align="center" sx={{ whiteSpace: 'nowrap', px: 1, pr: 2 }}>
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

      {/* ── 게스트 학교 관리 ── */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <Typography variant="subtitle1" fontWeight={600}>게스트 학교</Typography>
        <Chip label={`${guestSchools.length}개`} size="small" sx={{ bgcolor: '#fef3c7', color: '#92400e', fontWeight: 700 }} />
        <Tooltip title="새로고침">
          <IconButton size="small" onClick={loadGuestSchools} disabled={loadingGuest}>
            <RefreshIcon fontSize="small" sx={{ color: '#888' }} />
          </IconButton>
        </Tooltip>
        <Typography variant="caption" color="text.secondary">미등록 도메인 계정 자동 생성 학교</Typography>
      </Box>

      {loadingGuest ? (
        <Box display="flex" justifyContent="center" py={3}><CircularProgress size={24} /></Box>
      ) : guestSchools.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
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
                      onClick={() => { setConvertDialog({ schoolId: g.id, ownerEmail: g.ownerEmail, name: g.name }); setConvertForm({ schoolName: g.name, domain: g.domain || '' }); setConvertError('') }}
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
          {convertError && <Typography variant="caption" color="error" sx={{ mt: 1, display: 'block' }}>{convertError}</Typography>}
          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mt: 3 }}>
            <Button onClick={() => setConvertDialog(null)} color="inherit" disabled={convertSaving}>취소</Button>
            <Button variant="contained" onClick={handleConvertGuest} disabled={convertSaving}>
              {convertSaving ? <CircularProgress size={18} color="inherit" /> : '정식 등록'}
            </Button>
          </Box>
        </DialogContent>
      </Dialog>

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

      {/* ── 구성원 관리 다이얼로그 ── */}
      <Dialog
        open={!!memberDialog}
        onClose={() => setMemberDialog(null)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>
          구성원 관리 — {memberDialog?.schoolName}
        </DialogTitle>
        <DialogContent sx={{ pt: 0 }}>
          {memberError && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setMemberError('')}>{memberError}</Alert>
          )}

          {loadingMembers ? (
            <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box>
          ) : memberList.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
              구성원이 없습니다.
            </Typography>
          ) : (
            <TableContainer sx={{ overflowX: 'auto' }}>
              <Table size="small" sx={{ width: 'auto', minWidth: '100%' }}>
                <TableHead>
                  <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                    <TableCell sx={{ whiteSpace: 'nowrap', pl: 2, pr: 1, fontWeight: 600 }}>이름</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap', px: 1, fontWeight: 600 }}>이메일</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap', px: 1, fontWeight: 600 }}>현재 역할</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap', px: 1, fontWeight: 600 }}>역할 변경</TableCell>
                    <TableCell align="center" sx={{ whiteSpace: 'nowrap', px: 1, pr: 2, fontWeight: 600 }}>제거</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {memberList.map(u => {
                    const isAdmin = u.role === 'school_admin' || u.role === 'admin'
                    const isPending = u.role === 'pending'
                    const roleColor = {
                      school_admin: { bg: '#f3e5f5', color: '#7b1fa2' },
                      admin:        { bg: '#e8f0fe', color: '#1a73e8' },
                      teacher:      { bg: '#f0f0f0', color: '#555' },
                      pending:      { bg: '#fff7ed', color: '#c2410c' },
                    }[u.role] || { bg: '#f5f5f5', color: '#888' }
                    const roleLabel = {
                      school_admin: '학교 관리자',
                      admin: '시스템 관리자',
                      teacher: '교사',
                      pending: '승인 대기',
                    }[u.role] || u.role

                    return (
                      <TableRow key={u.id} hover>
                        <TableCell sx={{ whiteSpace: 'nowrap', pl: 2, pr: 1 }}>
                          <Typography variant="body2" fontWeight={isAdmin ? 600 : 400}>
                            {u.name || '—'}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap', px: 1 }}>
                          <Typography variant="caption" sx={{ fontFamily: 'monospace', color: '#555' }}>
                            {u.email}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap', px: 1 }}>
                          <Chip
                            label={roleLabel}
                            size="small"
                            sx={{ bgcolor: roleColor.bg, color: roleColor.color, fontWeight: 600 }}
                          />
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap', px: 1 }}>
                          {u.role === 'admin' ? (
                            <Typography variant="caption" sx={{ color: '#aaa' }}>변경 불가</Typography>
                          ) : isPending ? (
                            <Box sx={{ display: 'flex', gap: 0.5 }}>
                              <Button size="small" variant="contained" color="primary"
                                sx={{ fontSize: '0.75rem', py: 0.3 }}
                                onClick={() => handleMemberRoleChange(u.id, 'teacher')}
                              >교사 승인</Button>
                              <Button size="small" variant="contained"
                                sx={{ fontSize: '0.75rem', py: 0.3, bgcolor: '#7b1fa2', '&:hover': { bgcolor: '#6a1b9a' } }}
                                onClick={() => handleMemberRoleChange(u.id, 'school_admin')}
                              >관리자 승인</Button>
                            </Box>
                          ) : (
                            <Box sx={{ display: 'flex', gap: 0.5 }}>
                              {isAdmin ? (
                                <Button size="small" variant="outlined"
                                  sx={{ fontSize: '0.75rem', py: 0.3 }}
                                  onClick={() => handleMemberRoleChange(u.id, 'teacher')}
                                >관리자 해제</Button>
                              ) : (
                                <Button size="small" variant="outlined" color="secondary"
                                  sx={{ fontSize: '0.75rem', py: 0.3 }}
                                  onClick={() => handleMemberRoleChange(u.id, 'school_admin')}
                                >관리자 지정</Button>
                              )}
                            </Box>
                          )}
                        </TableCell>
                        <TableCell align="center" sx={{ whiteSpace: 'nowrap', px: 1, pr: 2 }}>
                          {u.role !== 'admin' && (
                            <IconButton size="small" color="error" onClick={() => handleMemberRemove(u.id)}>
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
            총 {memberList.length}명 · 역할 변경 및 제거는 즉시 반영됩니다
          </Typography>
          <Button onClick={() => setMemberDialog(null)} variant="outlined">닫기</Button>
        </DialogActions>
      </Dialog>

    </Box>
    </SuperAdminLayout>
  )
}
