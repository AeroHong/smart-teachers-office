import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, query, where, getDocs } from 'firebase/firestore'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Table from '@mui/material/Table'
import TableHead from '@mui/material/TableHead'
import TableBody from '@mui/material/TableBody'
import TableRow from '@mui/material/TableRow'
import TableCell from '@mui/material/TableCell'
import Checkbox from '@mui/material/Checkbox'
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
import MenuBookIcon from '@mui/icons-material/MenuBook'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { useTableSort } from '@shared/hooks/useTableSort'
import { USERS, currentSchoolYear, sanitizeSubjectGroup } from '@shared/lib/schema'
import { loadSubjects, SUBJECT_GROUPS } from '@shared/lib/subjectData'
import {
  loadAdoptionsWithProgress, createAdoption, updateAdoptionSetup, deleteAdoption, bulkSetSubjectGroup,
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
  const navigate = useNavigate()
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

  // 여러 선정 건을 골라 같은 교과군으로 한 번에 묶는 일괄 작업(관리자가 새로 만든 선정
  // 건마다 교과군을 하나하나 고르지 않아도 되게 한다).
  const [selected, setSelected] = useState(new Set())
  const [bulkGroup, setBulkGroup] = useState('')
  const [bulkApplying, setBulkApplying] = useState(false)

  // 교과군별로 모아보는 필터(생기부 세특 점검의 "과목별 보기"·학년 필터와 같은 방식)와
  // 헤더 클릭 정렬(전체 현황 화면의 useTableSort와 동일한 패턴).
  const [groupFilter, setGroupFilter] = useState('all')
  const tableSort = useTableSort()

  const staffByUid = useMemo(() => Object.fromEntries(staff.map((s) => [s.uid, s])), [staff])

  const groupCounts = useMemo(() => {
    const counts = {}
    adoptions.forEach((a) => { if (a.subjectGroup) counts[a.subjectGroup] = (counts[a.subjectGroup] || 0) + 1 })
    return counts
  }, [adoptions])
  const unassignedCount = useMemo(() => adoptions.filter((a) => !a.subjectGroup).length, [adoptions])

  const filteredAdoptions = useMemo(() => {
    if (groupFilter === 'all') return adoptions
    if (groupFilter === 'unassigned') return adoptions.filter((a) => !a.subjectGroup)
    return adoptions.filter((a) => a.subjectGroup === groupFilter)
  }, [adoptions, groupFilter])

  const sortGetters = {
    subjectName: (a) => a.subjectName || '',
    subjectGroup: (a) => (a.subjectGroup ? a.subjectGroup.replace(/_/g, '/') : ''),
    cycleYear: (a) => a.cycleYear || 0,
    candidateCount: (a) => a.candidates?.length || 0,
    committeeCount: (a) => (a.committeeUids?.length || 0) + (a.externalMembers?.length || 0),
    subjectHead: (a) => staffByUid[a.subjectHeadUid]?.name || '',
    submitted: (a) => a.submittedCount ?? -1,
    status: (a) => a.status || '',
  }
  const sortedAdoptions = tableSort.sortData(filteredAdoptions, sortGetters)

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

  const toggleSelectOne = (id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  // "전체 선택"은 필터로 좁혀진(화면에 보이는) 행만 대상으로 한다.
  const allSelected = sortedAdoptions.length > 0 && sortedAdoptions.every((a) => selected.has(a.id))
  const someSelected = sortedAdoptions.some((a) => selected.has(a.id))
  const toggleSelectAll = () => {
    setSelected(allSelected ? new Set() : new Set(sortedAdoptions.map((a) => a.id)))
  }

  const handleBulkApplyGroup = async () => {
    if (!bulkGroup || !selected.size) return
    setBulkApplying(true)
    setError('')
    try {
      const res = await bulkSetSubjectGroup(schoolId, [...selected], bulkGroup)
      if (res.failed.length) setError(`${res.failed.length}건 지정 실패`)
      setSelected(new Set())
      setBulkGroup('')
      fetchAdoptions()
    } catch (e) {
      setError(`일괄 지정 실패: ${e.message}`)
    } finally {
      setBulkApplying(false)
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
  const addRubric = () => setForm((f) => ({ ...f, rubric: [...f.rubric, { name: '', maxScore: 0, criteria: '' }] }))
  const removeRubric = (idx) => setForm((f) => ({ ...f, rubric: f.rubric.filter((_, i) => i !== idx) }))

  // 기존에 만든 선정 건은 평가기준 필드가 생기기 전에 저장된 rubric이라 이 칸이 비어 있다.
  // 이름이 DEFAULT_RUBRIC 항목과 일치하면 그 문구를, 항목 수가 같으면 순서로 대응하는
  // 문구를 채워 넣는다 — 이미 채워진 칸은 건드리지 않는다.
  const fillDefaultCriteria = () => {
    setForm((f) => ({
      ...f,
      rubric: f.rubric.map((r, i) => {
        if (r.criteria) return r
        const byName = DEFAULT_RUBRIC.find((d) => d.name === r.name)
        const byPosition = f.rubric.length === DEFAULT_RUBRIC.length ? DEFAULT_RUBRIC[i] : null
        const criteria = byName?.criteria || byPosition?.criteria || ''
        return criteria ? { ...r, criteria } : r
      }),
    }))
  }
  const hasEmptyCriteria = form.rubric.some((r) => !r.criteria)

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
        rubric: form.rubric.map((r) => ({ name: r.name.trim(), maxScore: Number(r.maxScore), criteria: (r.criteria || '').trim() })),
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
          <Button variant="outlined" startIcon={<MenuBookIcon />} onClick={() => navigate('/admin/textbook-catalog')}>공식 목록에서 가져오기</Button>
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
        <>
          <FormControl size="small" sx={{ minWidth: 220, mb: 1.5 }}>
            <InputLabel>교과군으로 모아보기</InputLabel>
            <Select label="교과군으로 모아보기" value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}>
              <MenuItem value="all">전체 ({adoptions.length})</MenuItem>
              {SUBJECT_GROUPS.map((g) => {
                const key = sanitizeSubjectGroup(g)
                return <MenuItem key={g} value={key}>{g} ({groupCounts[key] || 0})</MenuItem>
              })}
              <MenuItem value="unassigned">미지정 ({unassignedCount})</MenuItem>
            </Select>
          </FormControl>

          {selected.size > 0 && (
            <Box sx={{
              display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap',
              p: 1.5, mb: 1.5, borderRadius: 1, bgcolor: '#f0fdfa', border: '1px solid #99f6e4',
            }}>
              <Typography variant="body2" fontWeight={700}>{selected.size}개 선택됨</Typography>
              <FormControl size="small" sx={{ minWidth: 220 }}>
                <InputLabel>교과군으로 일괄 지정</InputLabel>
                <Select label="교과군으로 일괄 지정" value={bulkGroup} onChange={(e) => setBulkGroup(e.target.value)}>
                  {SUBJECT_GROUPS.map((g) => <MenuItem key={g} value={g}>{g}</MenuItem>)}
                </Select>
              </FormControl>
              <Button variant="contained" size="small" disabled={!bulkGroup || bulkApplying} onClick={handleBulkApplyGroup}>
                {bulkApplying ? '적용 중...' : '적용'}
              </Button>
              <Button size="small" onClick={() => setSelected(new Set())}>선택 해제</Button>
            </Box>
          )}
          <Paper variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: '#f9fafb' } }}>
                  <TableCell padding="checkbox">
                    <Checkbox size="small" indeterminate={someSelected && !allSelected} checked={allSelected} onChange={toggleSelectAll} />
                  </TableCell>
                  <TableCell sx={{ cursor: 'pointer' }} onClick={() => tableSort.toggle('subjectName')}>과목{tableSort.Ind('subjectName')}</TableCell>
                  <TableCell sx={{ cursor: 'pointer' }} onClick={() => tableSort.toggle('subjectGroup')}>교과군{tableSort.Ind('subjectGroup')}</TableCell>
                  <TableCell align="center" sx={{ cursor: 'pointer' }} onClick={() => tableSort.toggle('cycleYear')}>선정연도{tableSort.Ind('cycleYear')}</TableCell>
                  <TableCell align="center" sx={{ cursor: 'pointer' }} onClick={() => tableSort.toggle('candidateCount')}>후보{tableSort.Ind('candidateCount')}</TableCell>
                  <TableCell align="center" sx={{ cursor: 'pointer' }} onClick={() => tableSort.toggle('committeeCount')}>위원{tableSort.Ind('committeeCount')}</TableCell>
                  <TableCell align="center" sx={{ cursor: 'pointer' }} onClick={() => tableSort.toggle('subjectHead')}>과목 대표교사{tableSort.Ind('subjectHead')}</TableCell>
                  <TableCell align="center" sx={{ cursor: 'pointer' }} onClick={() => tableSort.toggle('submitted')}>제출현황{tableSort.Ind('submitted')}</TableCell>
                  <TableCell align="center" sx={{ cursor: 'pointer' }} onClick={() => tableSort.toggle('status')}>상태{tableSort.Ind('status')}</TableCell>
                  <TableCell align="center">관리</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sortedAdoptions.length === 0 && (
                  <TableRow><TableCell colSpan={10} align="center" sx={{ color: 'text.secondary', py: 3 }}>이 교과군에 해당하는 선정 건이 없습니다.</TableCell></TableRow>
                )}
                {sortedAdoptions.map((a) => (
                  <TableRow key={a.id} hover selected={selected.has(a.id)}>
                    <TableCell padding="checkbox">
                      <Checkbox size="small" checked={selected.has(a.id)} onChange={() => toggleSelectOne(a.id)} />
                    </TableCell>
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
        </>
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

          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="subtitle2" fontWeight={700}>평가 영역 · 평가 기준 · 배점</Typography>
            {hasEmptyCriteria && (
              <Button size="small" onClick={fillDefaultCriteria}>기본 문구로 채우기</Button>
            )}
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 1.5 }}>
            {form.rubric.map((r, idx) => (
              <Box key={idx} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                <TextField
                  size="small" label="평가영역" sx={{ flex: 1 }} value={r.name}
                  onChange={(e) => updateRubric(idx, 'name', e.target.value)}
                />
                <TextField
                  size="small" label="평가기준" sx={{ flex: 2 }} value={r.criteria || ''}
                  multiline minRows={1} maxRows={4}
                  placeholder={'예: · 학습 분량이 단원별로 균형 있게 구성되어 있는가?'}
                  onChange={(e) => updateRubric(idx, 'criteria', e.target.value)}
                />
                <TextField
                  size="small" type="number" label="배점" sx={{ width: 90 }} value={r.maxScore}
                  onChange={(e) => updateRubric(idx, 'maxScore', e.target.value)}
                />
                <IconButton size="small" onClick={() => removeRubric(idx)} disabled={form.rubric.length <= 1}>
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Box>
            ))}
            <Button size="small" startIcon={<AddIcon />} onClick={addRubric} sx={{ alignSelf: 'flex-start' }}>항목 추가</Button>
          </Box>

          <Box sx={{
            display: 'flex', alignItems: 'center', gap: 1, mb: 3, p: 1.25, borderRadius: '10px',
            bgcolor: rubricSum === 100 ? '#f0fdf4' : '#fef2f2',
            border: '1px solid', borderColor: rubricSum === 100 ? '#bbf7d0' : '#fecaca',
          }}>
            {rubricSum === 100 ? (
              <>
                <CheckCircleIcon sx={{ fontSize: 18, color: '#16a34a' }} />
                <Typography sx={{ fontSize: '0.82rem', color: '#166534', fontWeight: 700 }}>배점 합계 100점</Typography>
              </>
            ) : (
              <>
                <WarningAmberIcon sx={{ fontSize: 18, color: '#dc2626' }} />
                <Typography sx={{ fontSize: '0.82rem', color: '#991b1b', fontWeight: 700 }}>
                  배점 합계 {rubricSum}점 — 100점이 되어야 합니다
                </Typography>
              </>
            )}
          </Box>

          <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>평가위원</Typography>
          <Autocomplete
            multiple size="small" autoHighlight sx={{ mb: 2 }}
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
            multiple
            size="small"
            autoHighlight
            options={staff}
            getOptionLabel={(o) => o.name || o.email || ''}
            isOptionEqualToValue={(a, b) => a.uid === b.uid}
            value={staffByUid[form.subjectHeadUid] ? [staffByUid[form.subjectHeadUid]] : []}
            onChange={(_, value) => setForm((f) => ({ ...f, subjectHeadUid: value.length ? value[value.length - 1].uid : '' }))}
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
