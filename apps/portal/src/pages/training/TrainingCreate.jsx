import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import MenuItem from '@mui/material/MenuItem'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Snackbar from '@mui/material/Snackbar'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import { collection, getDocs, addDoc, serverTimestamp, query, orderBy } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useAuth } from '../../contexts/AuthContext'
import Layout from '../../components/Layout'
import { loadMembers, filterBySearch } from './trainingUtils'

export default function TrainingCreate() {
  const navigate = useNavigate()
  const { user, schoolId } = useAuth()

  const [form, setForm] = useState({
    title: '', date: '', startTime: '', endTime: '', location: '', description: '',
  })
  const [members, setMembers] = useState([])
  const [presets, setPresets] = useState([])
  const [allUsers, setAllUsers] = useState([])          // 전체 구성원 캐시
  const [staffTypeFilter, setStaffTypeFilter] = useState('전체')
  const [teacherSearch, setTeacherSearch] = useState('')
  const [manualName, setManualName] = useState('')
  const [manualEmail, setManualEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [snackbar, setSnackbar] = useState('')

  const searchRef = useRef(null)

  useEffect(() => {
    if (!schoolId) return
    getDocs(query(collection(db, 'schools', schoolId, 'trainingPresets'), orderBy('name')))
      .then(snap => setPresets(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
    loadMembers('전체', schoolId).then(setAllUsers)
  }, [schoolId])

  const handleFilterChange = (_, val) => {
    if (!val) return
    setStaffTypeFilter(val)
    loadMembers(val, schoolId).then(setAllUsers)
    setTeacherSearch('')
  }

  const set = (field) => (e) => setForm(p => ({ ...p, [field]: e.target.value }))

  const loadPreset = (presetId) => {
    const preset = presets.find(p => p.id === presetId)
    if (!preset) return
    setMembers(prev => {
      const existing = new Set(prev.map(m => m.email || m.name))
      const toAdd = (preset.members || []).filter(m => !existing.has(m.email || m.name))
      return [...prev, ...toAdd]
    })
    setSnackbar(`"${preset.name}" 명단에서 ${preset.members?.length ?? 0}명 불러왔습니다.`)
  }

  // 전체 추가 (현재 필터 기준 구성원 전체)
  const addAllFiltered = () => {
    const label = staffTypeFilter === '전체' ? '전체 구성원' : `전체 ${staffTypeFilter}`
    setMembers(prev => {
      const existing = new Set(prev.map(m => m.uid).filter(Boolean))
      const toAdd = allUsers.filter(u => !existing.has(u.uid))
      setSnackbar(`${label} ${toAdd.length}명 추가됐습니다.`)
      return [...prev, ...toAdd]
    })
  }

  const addUser = (user) => {
    if (members.some(m => m.uid === user.uid)) {
      setTeacherSearch('')
      return
    }
    setMembers(p => [...p, { uid: user.uid, name: user.name, email: user.email, staffType: user.staffType }])
    setTeacherSearch('')
    searchRef.current?.focus()
  }

  const addManual = () => {
    const name = manualName.trim()
    const email = manualEmail.trim()
    if (!name) return
    if (email && members.some(m => m.email === email)) {
      setError('이미 추가된 이메일입니다.')
      return
    }
    setMembers(p => [...p, { uid: null, name, email, staffType: '' }])
    setManualName('')
    setManualEmail('')
    setError('')
  }

  const removeMember = (idx) => setMembers(p => p.filter((_, i) => i !== idx))

  const handleSave = async () => {
    if (!form.title.trim()) { setError('연수명을 입력해주세요.'); return }
    if (!form.date) { setError('날짜를 선택해주세요.'); return }
    setError('')
    setSaving(true)
    try {
      const ref = await addDoc(collection(db, 'schools', schoolId, 'trainings'), {
        ...form,
        members,
        signedCount: 0,
        status: 'open',
        createdBy: user.uid,
        createdByName: user.displayName,
        createdAt: serverTimestamp(),
      })
      navigate(`/training/${ref.id}`)
    } catch {
      setError('저장 중 오류가 발생했습니다.')
      setSaving(false)
    }
  }

  const filteredSearch = filterBySearch(allUsers, teacherSearch, members)

  // 구분별 카운트
  const teacherCount = allUsers.filter(u => u.staffType === '교사').length
  const staffCount   = allUsers.filter(u => u.staffType === '교직원').length

  return (
    <Layout>
      <Typography variant="h5" fontWeight={700} mb={3}>연수 만들기</Typography>

      {/* 기본 정보 */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 4, maxWidth: 560 }}>
        <TextField label="연수명" value={form.title} onChange={set('title')} required
          onKeyDown={e => e.key === 'Enter' && e.preventDefault()} />
        <Box sx={{ display: 'flex', gap: 2 }}>
          <TextField label="날짜" type="date" value={form.date} onChange={set('date')}
            InputLabelProps={{ shrink: true }} required sx={{ flex: 1 }} />
          <TextField label="시작" type="time" value={form.startTime} onChange={set('startTime')}
            InputLabelProps={{ shrink: true }} inputProps={{ step: 600 }} sx={{ width: 120 }} />
          <TextField label="종료" type="time" value={form.endTime} onChange={set('endTime')}
            InputLabelProps={{ shrink: true }} inputProps={{ step: 600 }} sx={{ width: 120 }} />
        </Box>
        <TextField label="장소" value={form.location} onChange={set('location')} />
        <TextField label="비고" value={form.description} onChange={set('description')} multiline rows={2} />
      </Box>

      <Divider sx={{ mb: 3 }} />

      {/* 참석 명단 */}
      <Typography variant="subtitle1" fontWeight={700} mb={2}>참석 대상 명단</Typography>

      {/* 구분 필터 + 전체 추가 */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2.5, flexWrap: 'wrap' }}>
        <ToggleButtonGroup
          value={staffTypeFilter}
          exclusive
          onChange={handleFilterChange}
          size="small"
        >
          <ToggleButton value="전체">전체 ({allUsers.length})</ToggleButton>
          <ToggleButton value="교사">교사 ({teacherCount})</ToggleButton>
          <ToggleButton value="교직원">교직원 ({staffCount})</ToggleButton>
        </ToggleButtonGroup>

        <Button
          variant="outlined"
          size="small"
          onClick={addAllFiltered}
          disabled={allUsers.length === 0}
        >
          {staffTypeFilter === '전체' ? '전체 구성원' : `전체 ${staffTypeFilter}`} 추가
        </Button>
      </Box>

      {/* preset 불러오기 */}
      {presets.length > 0 && (
        <Box sx={{ mb: 2.5 }}>
          <TextField
            select label="연수 명단 불러오기" size="small" sx={{ minWidth: 240 }}
            value=""
            onChange={(e) => loadPreset(e.target.value)}
            helperText="선택하면 현재 명단에 병합됩니다"
          >
            {presets.map(p => (
              <MenuItem key={p.id} value={p.id}>
                {p.name} ({p.members?.length ?? 0}명)
              </MenuItem>
            ))}
          </TextField>
        </Box>
      )}

      {/* 검색 */}
      <Box sx={{ mb: 1.5, position: 'relative', maxWidth: 320 }}>
        <TextField
          inputRef={searchRef}
          label="이름 또는 이메일 검색"
          size="small"
          fullWidth
          value={teacherSearch}
          onChange={e => setTeacherSearch(e.target.value)}
          onBlur={() => setTimeout(() => setTeacherSearch(''), 150)}
          placeholder="검색어 입력..."
          autoComplete="off"
        />
        {filteredSearch.length > 0 && (
          <Box sx={{
            position: 'absolute', top: '100%', left: 0, right: 0,
            bgcolor: '#fff', border: '1px solid #e2e8f0', borderRadius: 1,
            zIndex: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
          }}>
            {filteredSearch.map(u => (
              <Box
                key={u.uid}
                onMouseDown={() => addUser(u)}
                sx={{
                  px: 2, py: 1, fontSize: '0.88rem', cursor: 'pointer',
                  '&:hover': { bgcolor: '#f0f4ff' },
                  display: 'flex', gap: 1, alignItems: 'center',
                }}
              >
                <span style={{ fontWeight: 600 }}>{u.name}</span>
                {u.staffType && (
                  <span style={{
                    fontSize: '0.72rem', padding: '1px 6px', borderRadius: 8,
                    backgroundColor: u.staffType === '교사' ? '#e0f2fe' : '#f0fdf4',
                    color: u.staffType === '교사' ? '#0369a1' : '#15803d',
                    fontWeight: 600,
                  }}>{u.staffType}</span>
                )}
                <span style={{ color: '#94a3b8', fontSize: '0.78rem' }}>{u.email}</span>
              </Box>
            ))}
          </Box>
        )}
      </Box>

      {/* 직접 입력 */}
      <Box sx={{ display: 'flex', gap: 1, mb: 3, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <TextField
          label="이름 직접 입력" size="small" value={manualName}
          onChange={e => setManualName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addManual()}
          sx={{ width: 160 }}
        />
        <TextField
          label="이메일 (선택)" size="small" value={manualEmail}
          onChange={e => setManualEmail(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addManual()}
          sx={{ width: 220 }}
        />
        <Button variant="outlined" size="small" onClick={addManual} sx={{ height: 40 }}>추가</Button>
      </Box>

      {/* 명단 */}
      {members.length > 0 && (
        <Box sx={{ mb: 4 }}>
          <Typography fontSize="0.82rem" color="text.secondary" mb={1}>
            총 <strong>{members.length}</strong>명
            {members.filter(m => m.staffType === '교사').length > 0 && (
              <> · 교사 {members.filter(m => m.staffType === '교사').length}명</>
            )}
            {members.filter(m => m.staffType === '교직원').length > 0 && (
              <> · 교직원 {members.filter(m => m.staffType === '교직원').length}명</>
            )}
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
            {members.map((m, i) => (
              <Chip
                key={i}
                label={m.staffType ? `${m.name} (${m.staffType})` : m.name}
                size="small"
                onDelete={() => removeMember(i)}
                title={m.email || undefined}
                sx={{
                  bgcolor: m.staffType === '교사' ? '#e0f2fe'
                    : m.staffType === '교직원' ? '#f0fdf4' : undefined,
                }}
              />
            ))}
          </Box>
        </Box>
      )}

      {error && <Typography color="error" fontSize="0.88rem" mb={2}>{error}</Typography>}

      <Box sx={{ display: 'flex', gap: 1.5 }}>
        <Button variant="contained" onClick={handleSave} disabled={saving}>
          {saving ? <CircularProgress size={20} /> : '저장'}
        </Button>
        <Button variant="outlined" onClick={() => navigate('/training')} disabled={saving}>취소</Button>
      </Box>

      <Snackbar
        open={!!snackbar} autoHideDuration={3000}
        onClose={() => setSnackbar('')} message={snackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Layout>
  )
}
