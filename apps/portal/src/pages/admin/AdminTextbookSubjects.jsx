import { useState, useEffect, useMemo } from 'react'
import { collection, query, where, getDocs } from 'firebase/firestore'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Table from '@mui/material/Table'
import TableHead from '@mui/material/TableHead'
import TableBody from '@mui/material/TableBody'
import TableRow from '@mui/material/TableRow'
import TableCell from '@mui/material/TableCell'
import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import TextField from '@mui/material/TextField'
import Autocomplete from '@mui/material/Autocomplete'
import IconButton from '@mui/material/IconButton'
import Alert from '@mui/material/Alert'
import CircularProgress from '@mui/material/CircularProgress'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import AddIcon from '@mui/icons-material/Add'
import UploadIcon from '@mui/icons-material/Upload'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { USERS, currentSchoolYear, sanitizeSubjectGroup } from '@shared/lib/schema'
import { loadSubjects, SUBJECT_GROUPS } from '@shared/lib/subjectData'
import {
  loadAdoptionsWithProgress, createAdoption, updateAdoptionSetup, deleteAdoption,
  DEFAULT_RUBRIC, rubricMax, newCandidateId, newExternalMemberId, STATUS_LABELS,
} from '@shared/lib/textbookAdoption'
import { RowActions, EditAction, DeleteAction } from './adminUi'
import AdminTextbookBulkImport from './AdminTextbookBulkImport'

const STAFF_ROLES = ['teacher', 'admin', 'school_admin', 'principal']

function emptyForm() {
  return {
    subjectName: '',
    subjectGroup: '',
    cycleYear: currentSchoolYear(),
    candidates: [{ id: newCandidateId(), publisher: '', author: '', price: '' }],
    rubric: DEFAULT_RUBRIC.map((r) => ({ ...r })),
    committee: [], // staff 객체 배열
    externalMembers: [], // [{id, name, affiliation}] — 시스템 계정 없는 외부 위원
    subjectHeadUid: '',
  }
}

export default function AdminTextbookSubjects() {
  const { user, schoolId } = useAuth()

  const [adoptions, setAdoptions] = useState([])
  const [loading, setLoading] = useState(true)
  const [staff, setStaff] = useState([])
  const [subjectNames, setSubjectNames] = useState([])
  const [error, setError] = useState('')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)

  const staffByUid = useMemo(() => Object.fromEntries(staff.map((s) => [s.uid, s])), [staff])

  const fetchAdoptions = async () => {
    setLoading(true)
    try {
      const list = await loadAdoptionsWithProgress(schoolId)
      setAdoptions(list.sort((a, b) => (b.cycleYear - a.cycleYear) || a.subjectName.localeCompare(b.subjectName, 'ko')))
    } catch (e) {
      setError(`목록 조회 실패: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!schoolId) return
    fetchAdoptions()
    getDocs(query(collection(db, USERS), where('schoolId', '==', schoolId), where('role', 'in', STAFF_ROLES)))
      .then((snap) => setStaff(snap.docs.map((d) => ({ uid: d.id, name: d.data().name || d.data().email, email: d.data().email }))))
      .catch((e) => setError(`교직원 목록 조회 실패: ${e.message}`))
    loadSubjects(schoolId)
      .then((subjects) => setSubjectNames([...new Set(subjects.map((s) => s.name).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'))))
      .catch(() => {})
  }, [schoolId])

  const openCreate = () => {
    setEditTarget(null)
    setForm(emptyForm())
    setDialogOpen(true)
  }

  const openEdit = (adoption) => {
    setEditTarget(adoption)
    // subjectGroup은 저장 시 sanitize(‘/’→‘_’)되므로, 편집 화면에 원래 표기로 보여주려면
    // 10개 고정 목록에서 역매핑한다.
    const rawGroup = SUBJECT_GROUPS.find((g) => sanitizeSubjectGroup(g) === adoption.subjectGroup) || ''
    setForm({
      subjectName: adoption.subjectName,
      subjectGroup: rawGroup,
      cycleYear: adoption.cycleYear,
      candidates: adoption.candidates?.length ? adoption.candidates : [{ id: newCandidateId(), publisher: '', author: '', price: '' }],
      rubric: adoption.rubric?.length ? adoption.rubric : DEFAULT_RUBRIC.map((r) => ({ ...r })),
      committee: (adoption.committeeUids || []).map((uid) => staffByUid[uid] || { uid, name: uid }),
      externalMembers: (adoption.externalMembers || []).map((m) => ({ ...m })),
      subjectHeadUid: adoption.subjectHeadUid || '',
    })
    setDialogOpen(true)
  }

  const handleDelete = async (adoption) => {
    if (!window.confirm(`"${adoption.subjectName}" 선정 건을 삭제할까요? 위원들의 채점 기록도 함께 사라집니다.`)) return
    try {
      await deleteAdoption(schoolId, adoption.id)
      fetchAdoptions()
    } catch (e) {
      setError(`삭제 실패: ${e.message}`)
    }
  }

  const updateCandidate = (id, field, value) => {
    setForm((f) => ({ ...f, candidates: f.candidates.map((c) => (c.id === id ? { ...c, [field]: value } : c)) }))
  }
  const addCandidate = () => setForm((f) => ({ ...f, candidates: [...f.candidates, { id: newCandidateId(), publisher: '', author: '', price: '' }] }))
  const removeCandidate = (id) => setForm((f) => ({ ...f, candidates: f.candidates.filter((c) => c.id !== id) }))

  const updateExternalMember = (id, field, value) => {
    setForm((f) => ({ ...f, externalMembers: f.externalMembers.map((m) => (m.id === id ? { ...m, [field]: value } : m)) }))
  }
  const addExternalMember = () => setForm((f) => ({ ...f, externalMembers: [...f.externalMembers, { id: newExternalMemberId(), name: '', affiliation: '' }] }))
  const removeExternalMember = (id) => setForm((f) => ({ ...f, externalMembers: f.externalMembers.filter((m) => m.id !== id) }))

  const updateRubric = (idx, field, value) => {
    setForm((f) => ({ ...f, rubric: f.rubric.map((r, i) => (i === idx ? { ...r, [field]: value } : r)) }))
  }
  const addRubric = () => setForm((f) => ({ ...f, rubric: [...f.rubric, { name: '', maxScore: 0 }] }))
  const removeRubric = (idx) => setForm((f) => ({ ...f, rubric: f.rubric.filter((_, i) => i !== idx) }))

  const rubricSum = rubricMax(form.rubric)

  const canSave = form.subjectName.trim() &&
    form.candidates.every((c) => c.publisher.trim()) &&
    form.rubric.every((r) => r.name.trim() && Number(r.maxScore) > 0)

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      const payload = {
        subjectName: form.subjectName,
        subjectGroup: form.subjectGroup,
        cycleYear: Number(form.cycleYear),
        candidates: form.candidates.map((c) => ({ id: c.id, publisher: c.publisher.trim(), author: c.author.trim(), price: (c.price || '').trim() })),
        rubric: form.rubric.map((r) => ({ name: r.name.trim(), maxScore: Number(r.maxScore) })),
        committeeUids: form.committee.map((s) => s.uid),
        externalMembers: form.externalMembers.filter((m) => m.name.trim()).map((m) => ({ id: m.id, name: m.name.trim(), affiliation: (m.affiliation || '').trim() })),
        subjectHeadUid: form.subjectHeadUid,
      }
      if (editTarget) {
        await updateAdoptionSetup(schoolId, editTarget.id, payload)
      } else {
        await createAdoption(schoolId, payload, user.uid)
      }
      setDialogOpen(false)
      fetchAdoptions()
    } catch (e) {
      setError(`저장 실패: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
        <Typography variant="h5" fontWeight={700}>검·인정도서 선정 — 선정 건 관리</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" startIcon={<UploadIcon />} onClick={() => setBulkOpen(true)}>일괄 등록</Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>새 선정 건</Button>
        </Box>
      </Box>
      <Typography variant="body2" color="text.secondary" mb={3}>
        과목별 후보 교과서·배점 기준·평가위원을 등록합니다. 위원 채점과 집계는 각 위원의 &quot;검·인정도서 선정&quot; 화면에서 진행됩니다.
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {loading ? (
        <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box>
      ) : adoptions.length === 0 ? (
        <Alert severity="info">등록된 선정 건이 없습니다.</Alert>
      ) : (
        <Paper variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: '#f9fafb' } }}>
                <TableCell>과목</TableCell>
                <TableCell>교과군</TableCell>
                <TableCell align="center">선정연도</TableCell>
                <TableCell align="center">후보</TableCell>
                <TableCell align="center">위원</TableCell>
                <TableCell align="center">과목 대표교사</TableCell>
                <TableCell align="center">제출현황</TableCell>
                <TableCell align="center">상태</TableCell>
                <TableCell align="center">관리</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {adoptions.map((a) => (
                <TableRow key={a.id} hover>
                  <TableCell sx={{ fontWeight: 600 }}>{a.subjectName}</TableCell>
                  <TableCell>{a.subjectGroup ? a.subjectGroup.replace(/_/g, '/') : '-'}</TableCell>
                  <TableCell align="center">{a.cycleYear}</TableCell>
                  <TableCell align="center">{a.candidates?.length || 0}</TableCell>
                  <TableCell align="center">
                    {(a.committeeUids?.length || 0) + (a.externalMembers?.length || 0)}
                    {a.externalMembers?.length > 0 && <Typography component="span" variant="caption" color="text.secondary"> (외부 {a.externalMembers.length})</Typography>}
                  </TableCell>
                  <TableCell align="center">{staffByUid[a.subjectHeadUid]?.name || '-'}</TableCell>
                  <TableCell align="center">{a.submittedCount ?? '-'} / {(a.committeeUids?.length || 0) + (a.externalMembers?.length || 0)}</TableCell>
                  <TableCell align="center">
                    <Chip
                      size="small"
                      label={STATUS_LABELS[a.status] || a.status}
                      sx={a.status === 'closed' ? { bgcolor: '#dcfce7', color: '#166534', fontWeight: 700 } : { bgcolor: '#fef9c3', color: '#854d0e', fontWeight: 700 }}
                    />
                  </TableCell>
                  <TableCell align="center">
                    <RowActions>
                      <EditAction onClick={() => openEdit(a)} />
                      <DeleteAction onClick={() => handleDelete(a)} />
                    </RowActions>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{editTarget ? '선정 건 수정' : '새 선정 건 등록'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 2, mt: 1, mb: 3 }}>
            <Autocomplete
              freeSolo
              options={subjectNames}
              value={form.subjectName}
              onChange={(_, v) => setForm((f) => ({ ...f, subjectName: v || '' }))}
              onInputChange={(_, v) => setForm((f) => ({ ...f, subjectName: v }))}
              renderInput={(params) => <TextField {...params} label="과목명" placeholder="예: 영어Ⅱ" />}
            />
            <FormControl>
              <InputLabel>교과군</InputLabel>
              <Select
                label="교과군" value={form.subjectGroup}
                onChange={(e) => setForm((f) => ({ ...f, subjectGroup: e.target.value }))}
              >
                <MenuItem value="">미지정</MenuItem>
                {SUBJECT_GROUPS.map((g) => <MenuItem key={g} value={g}>{g}</MenuItem>)}
              </Select>
            </FormControl>
            <TextField
              type="number" label="선정 연도(학년도)" value={form.cycleYear}
              onChange={(e) => setForm((f) => ({ ...f, cycleYear: e.target.value }))}
            />
          </Box>
          {!form.subjectGroup && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              교과군을 지정하지 않으면 교과부장의 "전체 현황"에서 이 과목이 보이지 않고, 서식2·서식3의
              교과부장 결재선도 채워지지 않습니다.
            </Alert>
          )}

          <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>후보 교과서</Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 3 }}>
            {form.candidates.map((c) => (
              <Box key={c.id} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <TextField
                  size="small" label="출판사" sx={{ flex: 2 }} value={c.publisher}
                  onChange={(e) => updateCandidate(c.id, 'publisher', e.target.value)}
                />
                <TextField
                  size="small" label="저자(선택)" sx={{ flex: 2 }} value={c.author}
                  onChange={(e) => updateCandidate(c.id, 'author', e.target.value)}
                />
                <TextField
                  size="small" label="가격(선택)" sx={{ width: 110 }} value={c.price || ''}
                  onChange={(e) => updateCandidate(c.id, 'price', e.target.value)}
                />
                <IconButton size="small" onClick={() => removeCandidate(c.id)} disabled={form.candidates.length <= 1}>
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Box>
            ))}
            <Button size="small" startIcon={<AddIcon />} onClick={addCandidate} sx={{ alignSelf: 'flex-start' }}>후보 추가</Button>
          </Box>

          <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
            배점 기준 {' '}
            <Typography component="span" variant="caption" color={rubricSum === 100 ? 'text.secondary' : 'warning.main'}>
              (합계 {rubricSum}점{rubricSum !== 100 ? ' — 보통 100점 만점으로 맞춥니다' : ''})
            </Typography>
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 3 }}>
            {form.rubric.map((r, idx) => (
              <Box key={idx} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <TextField
                  size="small" label="평가영역" sx={{ flex: 1 }} value={r.name}
                  onChange={(e) => updateRubric(idx, 'name', e.target.value)}
                />
                <TextField
                  size="small" type="number" label="배점" sx={{ width: 100 }} value={r.maxScore}
                  onChange={(e) => updateRubric(idx, 'maxScore', e.target.value)}
                />
                <IconButton size="small" onClick={() => removeRubric(idx)} disabled={form.rubric.length <= 1}>
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Box>
            ))}
            <Button size="small" startIcon={<AddIcon />} onClick={addRubric} sx={{ alignSelf: 'flex-start' }}>항목 추가</Button>
          </Box>

          <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>평가위원</Typography>
          <Autocomplete
            multiple size="small" sx={{ mb: 2 }}
            options={staff}
            getOptionLabel={(o) => o.name || o.email || ''}
            isOptionEqualToValue={(a, b) => a.uid === b.uid}
            value={form.committee}
            onChange={(_, value) => setForm((f) => ({ ...f, committee: value }))}
            renderInput={(params) => <TextField {...params} label="위원 검색 후 추가" />}
          />

          {/* 외부 위원 — 시스템 계정 없이 인원 문제로 외부에서 위촉하는 경우. 로그인해서
              직접 채점하지 않고, 오프라인으로 받은 점수를 과목 대표교사·교과부장·관리자가
              상세화면에서 대리 입력한다(TextbookDetail.jsx). */}
          <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>외부 위원 (선택)</Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 3 }}>
            {form.externalMembers.map((m) => (
              <Box key={m.id} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <TextField
                  size="small" label="이름" sx={{ flex: 1 }} value={m.name}
                  onChange={(e) => updateExternalMember(m.id, 'name', e.target.value)}
                />
                <TextField
                  size="small" label="소속(선택)" sx={{ flex: 1 }} value={m.affiliation || ''}
                  onChange={(e) => updateExternalMember(m.id, 'affiliation', e.target.value)}
                />
                <IconButton size="small" onClick={() => removeExternalMember(m.id)}>
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Box>
            ))}
            <Button size="small" startIcon={<AddIcon />} onClick={addExternalMember} sx={{ alignSelf: 'flex-start' }}>외부 위원 추가</Button>
          </Box>

          {/* 과목 대표교사 = 이 선정 건의 채점 마감·집계 운영 담당자. 채점을 하지 않고
              진행상황만 관리하는 사람일 수도 있어 위원 목록에 없어도 지정할 수 있어야 한다 —
              그래서 위원(committee)이 아니라 전체 교직원(staff) 중에서 고른다. 교과군 전체를
              관장하는 "교과부장"(서식2 확인자·서식3 작성자)과는 다른 역할이며, 교과부장은
              관리자 홈 &gt; 교과부장 지정에서 별도로 지정한다. */}
          <Autocomplete
            size="small"
            options={staff}
            getOptionLabel={(o) => o.name || o.email || ''}
            isOptionEqualToValue={(a, b) => a.uid === b.uid}
            value={staffByUid[form.subjectHeadUid] || null}
            onChange={(_, value) => setForm((f) => ({ ...f, subjectHeadUid: value?.uid || '' }))}
            renderInput={(params) => <TextField {...params} label="과목 대표교사 (채점 마감·집계 권한, 위원이 아니어도 지정 가능)" />}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)} disabled={saving}>취소</Button>
          <Button variant="contained" disabled={!canSave || saving} onClick={handleSave}>
            {saving ? '저장 중...' : '저장'}
          </Button>
        </DialogActions>
      </Dialog>

      {bulkOpen && (
        <AdminTextbookBulkImport
          schoolId={schoolId}
          uid={user.uid}
          staff={staff}
          onClose={() => setBulkOpen(false)}
          onDone={() => { setBulkOpen(false); fetchAdoptions() }}
        />
      )}
    </Box>
  )
}
