import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  collection, getDocs, doc, getDoc, setDoc, addDoc, serverTimestamp,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../contexts/AuthContext'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import Divider from '@mui/material/Divider'
import CircularProgress from '@mui/material/CircularProgress'
import Alert from '@mui/material/Alert'
import Chip from '@mui/material/Chip'

export default function SchoolSetup() {
  const { user, loading, needsSchoolSetup, role, schoolId: ctxSchoolId, logout, completeSchoolSetup } = useAuth()
  const navigate = useNavigate()
  const email = user?.email || ''
  const domain = email.split('@')[1] || ''

  const [schools, setSchools] = useState([])
  const [loadingSchools, setLoadingSchools] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null) // { id, name, domains[] }
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [createMode, setCreateMode] = useState(false)
  const [newSchoolName, setNewSchoolName] = useState('')
  const [hasExistingGuest, setHasExistingGuest] = useState(false)

  // completeSchoolSetup 완료 후 상태 변경 감지 → 자동 navigate
  useEffect(() => {
    if (!loading && user && !needsSchoolSetup && role !== null && ctxSchoolId) {
      navigate('/', { replace: true })
    }
  }, [loading, user, needsSchoolSetup, role, ctxSchoolId])

  useEffect(() => {
    const load = async () => {
      try {
        // 기존 게스트 학교 보유 여부 확인
        if (user?.uid) {
          const guestSchoolId = `guest_${user.uid.slice(0, 8)}`
          const guestSnap = await getDoc(doc(db, 'schools', guestSchoolId))
          setHasExistingGuest(guestSnap.exists())
        }

        const snap = await getDocs(collection(db, 'schools'))
        const list = snap.docs
          .filter(d => !d.data().isGuest)
          .map(d => ({
            id: d.id,
            name: d.data().name || d.id,
            domains: d.data().domains || [],
          }))
          .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
        setSchools(list)
      } catch (e) {
        setError('학교 목록을 불러오지 못했습니다.')
      } finally {
        setLoadingSchools(false)
      }
    }
    load()
  }, [])

  // 도메인 일치 학교 추천 (상단 표시용)
  const domainSchools = domain
    ? schools.filter(s => s.domains.includes(domain))
    : []

  const filtered = search.trim()
    ? schools.filter(s => s.name.includes(search.trim()))
    : schools

  // 선택된 학교가 도메인 등록 학교인지 여부
  const selectedHasDomain = selected?.domains?.length > 0
  const selectedDomain = selected?.domains?.[0] || ''
  const userDomainMatches = selectedHasDomain && selected.domains.includes(domain)

  // 학교 가입 신청 (pending)
  const handleJoin = async () => {
    if (!selected) return
    setSaving(true)
    setError('')
    try {
      await setDoc(doc(db, 'users', user.uid), {
        name: user.displayName || '',
        email,
        role: 'pending',
        schoolId: selected.id,
        staffType: '',
        createdAt: serverTimestamp(),
      }, { merge: true })
      await addDoc(collection(db, 'auditLogs'), {
        action: 'school_setup_joined',
        by: email,
        at: serverTimestamp(),
        schoolId: selected.id,
        schoolName: selected.name,
      }).catch(() => {})
      await completeSchoolSetup(selected.id, 'pending')
      // navigate는 useEffect가 처리
    } catch (e) {
      setError('학교 가입에 실패했습니다: ' + e.message)
      setSaving(false)
    }
  }

  // 새 학교 직접 등록
  const handleCreate = async () => {
    const name = newSchoolName.trim()
    if (!name) { setError('학교명을 입력하세요.'); return }
    setSaving(true)
    setError('')
    try {
      const schoolId = `school-${Date.now().toString(36)}`
      await setDoc(doc(db, 'schools', schoolId), {
        name,
        adminEmail: email,
        createdAt: serverTimestamp(),
        createdBy: email,
      })
      await setDoc(doc(db, 'users', user.uid), {
        name: user.displayName || '',
        email,
        role: 'school_admin',
        schoolId,
        staffType: '',
        createdAt: serverTimestamp(),
      }, { merge: true })
      await addDoc(collection(db, 'auditLogs'), {
        action: 'school_setup_created',
        by: email,
        at: serverTimestamp(),
        schoolId,
        schoolName: name,
      }).catch(() => {})
      await completeSchoolSetup(schoolId, 'school_admin')
      // navigate는 useEffect가 처리
    } catch (e) {
      setError('학교 등록에 실패했습니다: ' + e.message)
      setSaving(false)
    }
  }

  // 게스트 모드로 체험 (재방문 시 기존 학교 재사용)
  const handleGuest = async () => {
    setSaving(true)
    setError('')
    try {
      const guestSchoolId = `guest_${user.uid.slice(0, 8)}`

      if (!hasExistingGuest) {
        // 최초: 게스트 학교 생성
        const dName = user.displayName || email.split('@')[0]
        const guestSchoolName = `${dName}의 체험 학교`
        await setDoc(doc(db, 'schools', guestSchoolId), {
          name: guestSchoolName,
          isGuest: true,
          ownerEmail: email,
          ownerUid: user.uid,
          domain,
          createdAt: serverTimestamp(),
        })
        await setDoc(doc(db, 'users', user.uid), {
          name: user.displayName || '',
          email,
          role: 'school_admin',
          schoolId: guestSchoolId,
          staffType: '교사',
          createdAt: serverTimestamp(),
        }, { merge: true })
      }

      await completeSchoolSetup(guestSchoolId, 'school_admin')
      // navigate는 useEffect가 처리
    } catch (e) {
      setError('게스트 학교 진입에 실패했습니다: ' + e.message)
      setSaving(false)
    }
  }

  if (loadingSchools) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Box sx={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      bgcolor: '#f0f4ff',
      p: 2,
    }}>
      <Paper sx={{
        p: 4,
        width: '100%',
        maxWidth: 500,
        borderRadius: 4,
        boxShadow: '0 4px 24px rgba(0,0,0,0.1)',
      }}>
        <Typography variant="h2" textAlign="center" sx={{ mb: 1 }}>🏫</Typography>
        <Typography variant="h6" fontWeight={700} textAlign="center" gutterBottom>
          학교 설정
        </Typography>
        <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ mb: 3 }}>
          {email}
        </Typography>

        {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

        {!createMode ? (
          <>
            {/* 도메인 일치 학교 추천 */}
            {domainSchools.length > 0 && !search && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="caption" fontWeight={600} color="primary" sx={{ display: 'block', mb: 0.5 }}>
                  추천 학교 (@{domain})
                </Typography>
                <Paper variant="outlined" sx={{ borderColor: '#c7d2fe' }}>
                  <List dense disablePadding>
                    {domainSchools.map((s, i) => (
                      <Box key={s.id}>
                        {i > 0 && <Divider />}
                        <ListItemButton
                          selected={selected?.id === s.id}
                          onClick={() => setSelected(s)}
                          sx={{ '&.Mui-selected': { bgcolor: '#eef2ff' } }}
                        >
                          <ListItemText
                            primary={s.name}
                            secondary={`@${s.domains[0]}`}
                          />
                          {selected?.id === s.id && (
                            <Chip label="선택됨" size="small" color="primary" />
                          )}
                        </ListItemButton>
                      </Box>
                    ))}
                  </List>
                </Paper>
              </Box>
            )}

            <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>
              소속 학교를 검색해 선택하세요
            </Typography>
            <TextField
              fullWidth
              size="small"
              placeholder="학교명 검색..."
              value={search}
              onChange={e => { setSearch(e.target.value); setSelected(null) }}
              sx={{ mb: 1 }}
            />

            {filtered.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                검색 결과가 없습니다.
              </Typography>
            ) : (
              <Paper variant="outlined" sx={{ maxHeight: 240, overflow: 'auto', mb: 2 }}>
                <List dense disablePadding>
                  {filtered.map((s, i) => (
                    <Box key={s.id}>
                      {i > 0 && <Divider />}
                      <ListItemButton
                        selected={selected?.id === s.id}
                        onClick={() => setSelected(s)}
                      >
                        <ListItemText
                          primary={s.name}
                          secondary={s.domains.length > 0 ? `@${s.domains[0]}` : null}
                        />
                        {selected?.id === s.id && (
                          <Chip label="선택됨" size="small" color="primary" />
                        )}
                      </ListItemButton>
                    </Box>
                  ))}
                </List>
              </Paper>
            )}

            {/* 도메인 등록 학교 선택 시 경고 (도메인 불일치) */}
            {selected && selectedHasDomain && !userDomainMatches && (
              <Alert severity="warning" sx={{ mb: 2, fontSize: '0.82rem' }}>
                <strong>{selected.name}</strong>은(는) <strong>@{selectedDomain}</strong> 계정 전용 학교입니다.<br />
                현재 계정(<strong>{email}</strong>)으로는 가입 신청 후 학교 관리자의 <strong>수동 승인</strong>이 필요합니다.
              </Alert>
            )}

            {/* 도메인 일치 시 안내 */}
            {selected && userDomainMatches && (
              <Alert severity="info" sx={{ mb: 2, fontSize: '0.82rem' }}>
                학교 도메인 계정입니다. 가입 신청 후 관리자 승인을 기다려 주세요.
              </Alert>
            )}

            <Button
              fullWidth
              variant="contained"
              size="large"
              disabled={!selected || saving}
              onClick={handleJoin}
              sx={{ mb: 1.5, fontWeight: 600 }}
            >
              {saving
                ? <CircularProgress size={20} color="inherit" />
                : `${selected?.name || '학교'} 가입 신청하기`}
            </Button>

            {!selected && (
              <Alert severity="info" sx={{ mb: 2, fontSize: '0.8rem' }}>
                가입 신청 후 학교 관리자의 승인을 받으면 이용할 수 있습니다.
              </Alert>
            )}

            <Divider sx={{ my: 1.5 }}>
              <Typography variant="caption" color="text.secondary">또는</Typography>
            </Divider>

            <Button
              fullWidth
              variant="outlined"
              onClick={() => setCreateMode(true)}
              sx={{ mb: 1 }}
            >
              새 학교 등록하기
            </Button>

            <Button
              fullWidth
              variant="outlined"
              color="secondary"
              disabled={saving}
              onClick={handleGuest}
              sx={{
                borderStyle: 'dashed',
                color: '#7c3aed',
                borderColor: '#c4b5fd',
                '&:hover': { bgcolor: '#faf5ff', borderColor: '#7c3aed' },
              }}
            >
              {saving
                ? <CircularProgress size={20} color="inherit" />
                : hasExistingGuest ? '기존 체험 학교로 계속하기' : '게스트 모드로 체험하기'}
            </Button>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mt: 0.5 }}>
              {hasExistingGuest
                ? '이전에 생성한 체험 학교로 이동합니다'
                : '개인 전용 체험 학교가 생성됩니다 (언제든 정식 전환 가능)'}
            </Typography>
          </>
        ) : (
          <>
            <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>
              새 학교 등록
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
              등록하면 자동으로 학교 관리자로 지정됩니다.
            </Typography>
            <TextField
              fullWidth
              size="small"
              label="학교명 *"
              placeholder="선유고등학교"
              value={newSchoolName}
              onChange={e => setNewSchoolName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
              sx={{ mb: 2 }}
              autoFocus
            />
            <Button
              fullWidth
              variant="contained"
              size="large"
              disabled={!newSchoolName.trim() || saving}
              onClick={handleCreate}
              sx={{ mb: 1.5, fontWeight: 600 }}
            >
              {saving ? <CircularProgress size={20} color="inherit" /> : '학교 등록 및 시작하기'}
            </Button>
            <Button
              fullWidth
              variant="text"
              onClick={() => { setCreateMode(false); setNewSchoolName(''); setError('') }}
            >
              ← 학교 검색으로 돌아가기
            </Button>
          </>
        )}

        <Divider sx={{ mt: 3, mb: 2 }} />
        <Button
          fullWidth
          variant="text"
          onClick={async () => { await logout(); navigate('/login', { replace: true }) }}
          sx={{ color: '#888', fontSize: '0.85rem' }}
        >
          다른 계정으로 로그인
        </Button>
      </Paper>
    </Box>
  )
}
