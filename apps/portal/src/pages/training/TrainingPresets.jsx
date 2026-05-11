import { useState, useEffect, useRef } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Snackbar from '@mui/material/Snackbar'
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc,
  doc, getDocs, serverTimestamp, query, orderBy,
} from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useAuth } from '../../contexts/AuthContext'
import Layout from '../../components/Layout'
import { loadMembers, filterBySearch } from './trainingUtils'

export default function TrainingPresets() {
  const { user, schoolId } = useAuth()
  const [presets, setPresets] = useState([])
  const [allUsers, setAllUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [editTarget, setEditTarget] = useState(null)

  useEffect(() => {
    if (!schoolId) return
    const unsub = onSnapshot(
      query(collection(db, 'schools', schoolId, 'trainingPresets'), orderBy('name')),
      (snap) => {
        setPresets(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        setLoading(false)
      },
      () => setLoading(false)
    )
    return unsub
  }, [schoolId])

  useEffect(() => {
    if (!schoolId) return
    loadMembers('전체', schoolId).then(setAllUsers)
  }, [schoolId])

  const handleDelete = async (preset) => {
    if (!window.confirm(`"${preset.name}" 명단을 삭제할까요?`)) return
    await deleteDoc(doc(db, 'schools', schoolId, 'trainingPresets', preset.id))
  }

  return (
    <Layout>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>연수 명단 관리</Typography>
        <Button variant="contained" onClick={() => setEditTarget({ name: '', members: [] })}>
          + 명단 만들기
        </Button>
      </Box>

      {loading ? (
        <Box display="flex" justifyContent="center" py={8}><CircularProgress /></Box>
      ) : presets.length === 0 ? (
        <Box textAlign="center" py={8} color="text.secondary">
          <Typography>저장된 연수 명단이 없습니다.</Typography>
          <Typography fontSize="0.84rem" mt={1}>연수 생성 시 불러올 명단을 미리 만들어 두세요.</Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {presets.map(preset => (
            <Card key={preset.id}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5 }}>
                  <Typography fontWeight={700}>{preset.name}</Typography>
                  <Typography fontSize="0.82rem" color="text.secondary" ml={1}>
                    ({preset.members?.length ?? 0}명)
                  </Typography>
                  <Box sx={{ ml: 'auto', display: 'flex', gap: 1 }}>
                    <Button size="small" variant="outlined"
                      onClick={() => setEditTarget({ ...preset })}>수정</Button>
                    <Button size="small" variant="outlined" color="error"
                      onClick={() => handleDelete(preset)}>삭제</Button>
                  </Box>
                </Box>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {(preset.members ?? []).map((m, i) => (
                    <Chip
                      key={i}
                      label={m.staffType ? `${m.name} (${m.staffType})` : m.name}
                      size="small"
                      variant="outlined"
                      sx={{
                        borderColor: m.staffType === '교사' ? '#7dd3fc'
                          : m.staffType === '교직원' ? '#86efac' : undefined,
                        color: m.staffType === '교사' ? '#0369a1'
                          : m.staffType === '교직원' ? '#15803d' : undefined,
                      }}
                    />
                  ))}
                </Box>
              </CardContent>
            </Card>
          ))}
        </Box>
      )}

      {editTarget !== null && (
        <PresetDialog
          preset={editTarget}
          allUsers={allUsers}
          user={user}
          schoolId={schoolId}
          onClose={() => setEditTarget(null)}
        />
      )}
    </Layout>
  )
}

// ── 파일 파싱 유틸 ────────────────────────────────────────────────────────────

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
  const nameIdx  = headers.findIndex(h => /성명|이름/.test(h))
  const emailIdx = headers.findIndex(h => /이메일|email/i.test(h))
  return lines.slice(1).map(line => {
    const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''))
    const name  = (nameIdx  >= 0 ? cols[nameIdx]  : cols[0] ?? '').trim()
    const email = (emailIdx >= 0 ? cols[emailIdx] : '').trim()
    return { name, email }
  }).filter(r => r.name)
}

async function parseExcel(file) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(await file.arrayBuffer())
  const ws = wb.worksheets[0]
  if (!ws) return []

  const rows = []
  ws.eachRow({ includeEmpty: false }, row => {
    rows.push(row.values.slice(1).map(v => String(v ?? '').trim()))
  })
  if (rows.length < 2) return []

  const headers = rows[0]
  const nameIdx  = headers.findIndex(h => /성명|이름/.test(h))
  const emailIdx = headers.findIndex(h => /이메일|email/i.test(h))

  return rows.slice(1).map(cols => ({
    name:  (nameIdx  >= 0 ? cols[nameIdx]  : cols[0] ?? '').trim(),
    email: (emailIdx >= 0 ? cols[emailIdx] : '').trim(),
  })).filter(r => r.name)
}

// ── 명단 편집 다이얼로그 ──────────────────────────────────────────────────────

function PresetDialog({ preset, allUsers, user, schoolId, onClose }) {
  const isNew = !preset.id
  const [name, setName] = useState(preset.name ?? '')
  const [members, setMembers] = useState(preset.members ?? [])
  const [teacherSearch, setTeacherSearch] = useState('')
  const [manualName, setManualName] = useState('')
  const [manualEmail, setManualEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [snackbar, setSnackbar] = useState('')
  const fileInputRef = useRef(null)

  const addUser = (u) => {
    if (members.some(m => m.uid === u.uid)) return
    setMembers(p => [...p, { uid: u.uid, name: u.name, email: u.email, staffType: u.staffType }])
    setTeacherSearch('')
  }

  const addManual = () => {
    if (!manualName.trim()) return
    setMembers(p => [...p, { uid: null, name: manualName.trim(), email: manualEmail.trim(), staffType: '' }])
    setManualName('')
    setManualEmail('')
  }

  const removeMember = (idx) => setMembers(p => p.filter((_, i) => i !== idx))

  const handleFileUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    try {
      let parsed = []
      if (file.name.toLowerCase().endsWith('.csv')) {
        parsed = parseCSV(await file.text())
      } else if (/\.xlsx?$/i.test(file.name)) {
        parsed = await parseExcel(file)
      } else {
        alert('.csv 또는 .xlsx 파일만 지원합니다.')
        return
      }
      const existing = new Set(members.map(m => m.email || m.name))
      const toAdd = parsed.filter(p => !existing.has(p.email || p.name))
        .map(p => ({ uid: null, name: p.name, email: p.email, staffType: '' }))
      setMembers(prev => [...prev, ...toAdd])
      setSnackbar(`${toAdd.length}명 추가됐습니다. (중복 ${parsed.length - toAdd.length}명 제외)`)
    } catch {
      alert('파일 파싱 중 오류가 발생했습니다.')
    } finally {
      e.target.value = ''
    }
  }

  const handleSave = async () => {
    if (!name.trim()) { alert('명단 이름을 입력하세요.'); return }
    setSaving(true)
    try {
      if (isNew) {
        await addDoc(collection(db, 'schools', schoolId, 'trainingPresets'), {
          name: name.trim(), members,
          createdBy: user.uid, createdAt: serverTimestamp(),
        })
      } else {
        await updateDoc(doc(db, 'schools', schoolId, 'trainingPresets', preset.id), {
          name: name.trim(), members,
        })
      }
      onClose()
    } catch {
      alert('저장 중 오류가 발생했습니다.')
      setSaving(false)
    }
  }

  const filteredSearch = filterBySearch(allUsers, teacherSearch, members)

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isNew ? '새 명단 만들기' : '명단 수정'}</DialogTitle>
      <DialogContent>
        <TextField
          label="명단 이름" fullWidth size="small"
          value={name} onChange={e => setName(e.target.value)} sx={{ mb: 2, mt: 1 }}
        />

        {/* 구성원 검색 */}
        <Box sx={{ mb: 1.5, position: 'relative' }}>
          <TextField label="이름 또는 이메일 검색" size="small" fullWidth
            value={teacherSearch}
            onChange={e => setTeacherSearch(e.target.value)}
            onBlur={() => setTimeout(() => setTeacherSearch(''), 150)}
            autoComplete="off"
          />
          {filteredSearch.length > 0 && (
            <Box sx={{
              position: 'absolute', top: '100%', left: 0, right: 0,
              bgcolor: '#fff', border: '1px solid #e2e8f0', borderRadius: 1,
              zIndex: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            }}>
              {filteredSearch.map(u => (
                <Box key={u.uid} onMouseDown={() => addUser(u)}
                  sx={{ px: 2, py: 1, fontSize: '0.88rem', cursor: 'pointer',
                    '&:hover': { bgcolor: '#f0f4ff' },
                    display: 'flex', gap: 1, alignItems: 'center' }}>
                  <span style={{ fontWeight: 600 }}>{u.name}</span>
                  {u.staffType && (
                    <span style={{
                      fontSize: '0.72rem', padding: '1px 6px', borderRadius: 8,
                      backgroundColor: u.staffType === '교사' ? '#e0f2fe' : '#f0fdf4',
                      color: u.staffType === '교사' ? '#0369a1' : '#15803d', fontWeight: 600,
                    }}>{u.staffType}</span>
                  )}
                  <span style={{ color: '#94a3b8', fontSize: '0.78rem' }}>{u.email}</span>
                </Box>
              ))}
            </Box>
          )}
        </Box>

        {/* 직접 입력 */}
        <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <TextField label="이름" size="small" value={manualName}
            onChange={e => setManualName(e.target.value)} sx={{ width: 150 }} />
          <TextField label="이메일 (선택)" size="small" value={manualEmail}
            onChange={e => setManualEmail(e.target.value)} sx={{ width: 200 }} />
          <Button variant="outlined" size="small" onClick={addManual} sx={{ mt: 0.5 }}>추가</Button>
        </Box>

        {/* 파일 업로드 */}
        <Box sx={{ mb: 2 }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            style={{ display: 'none' }}
            onChange={handleFileUpload}
          />
          <Button
            variant="outlined"
            size="small"
            color="secondary"
            onClick={() => fileInputRef.current?.click()}
          >
            📂 Excel / CSV 파일로 업로드
          </Button>
          <Typography fontSize="0.74rem" color="text.disabled" mt={0.5}>
            헤더: 성명(또는 이름) 필수 · 이메일 선택
          </Typography>
        </Box>

        {/* 명단 */}
        <Typography fontSize="0.82rem" color="text.secondary" mb={0.75}>총 {members.length}명</Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
          {members.map((m, i) => (
            <Chip
              key={i}
              label={m.staffType ? `${m.name} (${m.staffType})` : m.name}
              size="small"
              onDelete={() => removeMember(i)}
              sx={{
                bgcolor: m.staffType === '교사' ? '#e0f2fe'
                  : m.staffType === '교직원' ? '#f0fdf4' : undefined,
              }}
            />
          ))}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>취소</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving}>
          {saving ? <CircularProgress size={18} /> : '저장'}
        </Button>
      </DialogActions>

      <Snackbar
        open={!!snackbar} autoHideDuration={3000}
        onClose={() => setSnackbar('')} message={snackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Dialog>
  )
}
