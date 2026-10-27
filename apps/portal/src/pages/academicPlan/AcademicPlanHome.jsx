import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { getDocs, query, where, collection } from 'firebase/firestore'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Alert from '@mui/material/Alert'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Autocomplete from '@mui/material/Autocomplete'
import CircularProgress from '@mui/material/CircularProgress'
import Radio from '@mui/material/Radio'
import RadioGroup from '@mui/material/RadioGroup'
import FormControlLabel from '@mui/material/FormControlLabel'
import AddIcon from '@mui/icons-material/Add'
import VerifiedIcon from '@mui/icons-material/Verified'
import CompareArrowsIcon from '@mui/icons-material/CompareArrows'
import { useAuth } from '@shared/contexts/AuthContext'
import { db } from '@shared/lib/firebase'
import { COL, currentYearSemester, schoolPath } from '@shared/lib/schema'
import { MIN_WEEKDAY_DAYS, computeStats, rollEventsToNextYear } from '@shared/lib/academicPlan'
import Layout from '../../components/Layout'
import useStaffDirectory from './useStaffDirectory'
import { createPlan, deletePlan, saveYear, subscribePlans, subscribeYear } from './planRepo'
import { ACCENT, ACCENT_BG } from './planUi'

const fmt = (ts) => (ts?.toDate ? ts.toDate().toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')
const nextName = (plans) => {
  const used = new Set(plans.map((p) => p.name))
  for (const c of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') if (!used.has(`초안 ${c}`)) return `초안 ${c}`
  return `초안 ${plans.length + 1}`
}

/** 초안 카드에 보여줄 요약 — 학년별 연간 수업일, 16회 미만 경고 수 */
function summaryOf(plan) {
  const s = computeStats(plan)
  return { days: [1, 2, 3].map((g) => s.grades[g].year.total.schoolDays), warnings: s.warnings.length }
}

function EditorsCard({ schoolId, year, yearDoc, staff, refetchStaff }) {
  const [saving, setSaving] = useState(false)
  const editors = staff.filter((s) => (yearDoc?.editorUids || []).includes(s.uid))
  const save = async (uids) => { setSaving(true); try { await saveYear(schoolId, year, { editorUids: uids }) } finally { setSaving(false) } }
  const reload = async () => {
    const { staff: fresh } = await refetchStaff()
    const heads = fresh.filter((s) => s.rank === '부장').map((s) => s.uid)
    await save([...new Set([...(yearDoc?.editorUids || []), ...heads])])
  }
  return (
    <Box sx={{ border: '1px solid #e2e8f0', borderRadius: 2, p: 2, bgcolor: '#fff' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Typography sx={{ fontWeight: 800 }}>편집자 ({editors.length}명)</Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>부장교사가 자동으로 들어갑니다. 관리자는 늘 편집할 수 있습니다.</Typography>
        <Box sx={{ flex: 1 }} />
        <Button size="small" onClick={reload} disabled={saving}>부장 명단 다시 불러오기</Button>
      </Box>
      <Autocomplete multiple size="small" options={staff} value={editors} disabled={saving}
        getOptionLabel={(s) => `${s.name}${s.positionLabel ? ` (${s.positionLabel})` : s.department ? ` (${s.department})` : ''}`}
        isOptionEqualToValue={(a, b) => a.uid === b.uid}
        onChange={(_, v) => save(v.map((s) => s.uid))}
        renderInput={(p) => <TextField {...p} placeholder="편집자 추가" />} />
    </Box>
  )
}

export default function AcademicPlanHome() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { user, userName, schoolId, isAdmin, isSuperAdmin } = useAuth()
  const by = { uid: user?.uid, name: userName || user?.email || '' }
  const thisYear = currentYearSemester().year
  const year = Number(params.get('year')) || thisYear
  const canAdmin = isAdmin || isSuperAdmin

  const [plans, setPlans] = useState(null)
  const [yearDoc, setYearDoc] = useState(undefined)
  const [error, setError] = useState('')
  const [newOpen, setNewOpen] = useState(false)
  const [newForm, setNewForm] = useState({ name: '', source: 'blank', copyId: '' })
  const [creating, setCreating] = useState(false)
  const [prevConfirmed, setPrevConfirmed] = useState(null)
  const { staff, loading: staffLoading, refetch: refetchStaff } = useStaffDirectory(schoolId, year)

  useEffect(() => {
    if (!schoolId) return
    setPlans(null)
    const u1 = subscribePlans(schoolId, year, setPlans, (e) => setError(e.message))
    const u2 = subscribeYear(schoolId, year, setYearDoc)
    return () => { u1(); u2() }
  }, [schoolId, year])

  // 지난 학년도 확정본 — 새 초안을 같은 요일로 옮겨 시작할 수 있게
  useEffect(() => {
    if (!schoolId) return
    getDocs(query(collection(db, ...schoolPath(schoolId, COL.ACADEMIC_PLANS)), where('year', '==', year - 1)))
      .then((s) => setPrevConfirmed(s.docs.map((d) => ({ id: d.id, ...d.data() })).find((p) => p.status === 'confirmed') || null))
      .catch(() => setPrevConfirmed(null))
  }, [schoolId, year])

  const canEdit = canAdmin || (yearDoc?.editorUids || []).includes(user?.uid)
  const summaries = useMemo(() => Object.fromEntries((plans || []).map((p) => [p.id, summaryOf(p)])), [plans])

  const openYear = async () => {
    const { staff: fresh } = await refetchStaff()
    await saveYear(schoolId, year, { editorUids: fresh.filter((s) => s.rank === '부장').map((s) => s.uid), confirmedPlanId: null })
  }

  const openNew = () => {
    setNewForm({ name: nextName(plans || []), source: prevConfirmed ? 'prev' : plans?.length ? 'copy' : 'blank', copyId: plans?.[0]?.id || '' })
    setNewOpen(true)
  }

  const create = async () => {
    setCreating(true)
    try {
      let events = []
      let holidays = []
      let basedOn = null
      if (newForm.source === 'copy') {
        const src = plans.find((p) => p.id === newForm.copyId)
        events = src?.events || []
        holidays = src?.holidays || []
        basedOn = src?.id || null
      } else if (newForm.source === 'prev' && prevConfirmed) {
        events = rollEventsToNextYear(prevConfirmed.events, year)
        basedOn = prevConfirmed.id
      }
      const id = await createPlan({ schoolId, year, name: newForm.name.trim() || nextName(plans), events, holidays, basedOn, by })
      navigate(`/academic-plan/${id}`)
    } catch (e) {
      setError(`초안을 만들지 못했습니다: ${e.message}`)
    } finally { setCreating(false) }
  }

  const remove = async (p) => {
    if (!window.confirm(`'${p.name}'을(를) 지울까요? 수정 기록도 함께 지워집니다.`)) return
    try { await deletePlan(schoolId, p.id) } catch (e) { setError(`지우지 못했습니다: ${e.message}`) }
  }

  return (
    <Layout>
      <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1000, mx: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>학사일정 만들기</Typography>
          <TextField select size="small" value={year} onChange={(e) => setParams({ year: e.target.value })} sx={{ width: 140 }}>
            {[thisYear - 1, thisYear, thisYear + 1].map((y) => <MenuItem key={y} value={y}>{y}학년도</MenuItem>)}
          </TextField>
          <Box sx={{ flex: 1 }} />
          {plans?.length > 1 && (
            <Button startIcon={<CompareArrowsIcon />} onClick={() => navigate(`/academic-plan/compare?year=${year}`)}>초안 비교</Button>
          )}
          {canEdit && yearDoc && (
            <Button variant="contained" disableElevation startIcon={<AddIcon />} onClick={openNew} sx={{ bgcolor: ACCENT }}>새 초안</Button>
          )}
        </Box>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          3월~다음 해 2월 학사일정을 함께 만듭니다. 수업일수는 자동으로 계산되고, 여러 초안을 만들어 비교한 뒤 관리자가 하나를 확정합니다.
        </Typography>
        {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}

        {yearDoc === null && (
          canAdmin ? (
            <Alert severity="info" action={<Button color="inherit" onClick={openYear} disabled={staffLoading}>학년도 시작</Button>}>
              {year}학년도 학사일정을 아직 시작하지 않았습니다. 시작하면 교직원 관리의 직함에 '부장'이 들어간 선생님이 편집자로 등록됩니다.
            </Alert>
          ) : (
            <Alert severity="info">{year}학년도 학사일정은 아직 관리자가 시작하지 않았습니다.</Alert>
          )
        )}

        {canAdmin && yearDoc && (
          <EditorsCard schoolId={schoolId} year={year} yearDoc={yearDoc} staff={staff} refetchStaff={refetchStaff} />
        )}

        {plans === null ? <CircularProgress sx={{ alignSelf: 'center' }} /> : plans.length === 0 ? (
          yearDoc && <Typography sx={{ color: 'text.secondary', textAlign: 'center', py: 4 }}>아직 초안이 없습니다.</Typography>
        ) : plans.map((p) => {
          const s = summaries[p.id]
          return (
            <Box key={p.id} onClick={() => navigate(`/academic-plan/${p.id}`)}
              sx={{
                border: `1px solid ${p.status === 'confirmed' ? ACCENT : '#e2e8f0'}`, bgcolor: p.status === 'confirmed' ? ACCENT_BG : '#fff',
                borderRadius: 2, p: 2, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap',
                '&:hover': { boxShadow: '0 2px 8px rgba(15,23,42,0.08)' },
              }}>
              <Box sx={{ flex: 1, minWidth: 220 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography sx={{ fontWeight: 800 }}>{p.name}</Typography>
                  {p.status === 'confirmed' && <Chip size="small" color="success" icon={<VerifiedIcon />} label="확정" />}
                </Box>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  일정 {(p.events || []).length}건 · v{p.versionCount || 0} · {p.updatedBy?.name || p.createdByName} {fmt(p.updatedAt)}
                </Typography>
              </Box>
              <Typography variant="body2">연간 수업일 {s.days.map((d, i) => `${i + 1}학년 ${d}`).join(' · ')}</Typography>
              {s.warnings > 0 && <Chip size="small" color="warning" label={`${MIN_WEEKDAY_DAYS}회 미만 ${s.warnings}칸`} />}
              {(canAdmin || (p.createdBy === user?.uid && p.status !== 'confirmed')) && (
                <Button size="small" color="error" onClick={(e) => { e.stopPropagation(); remove(p) }}>삭제</Button>
              )}
            </Box>
          )
        })}
      </Box>

      <Dialog open={newOpen} onClose={() => setNewOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>새 초안</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
          <TextField label="이름" value={newForm.name} onChange={(e) => setNewForm({ ...newForm, name: e.target.value })} />
          <RadioGroup value={newForm.source} onChange={(e) => setNewForm({ ...newForm, source: e.target.value })}>
            <FormControlLabel value="blank" control={<Radio />} label="빈 초안으로 시작" />
            {plans?.length > 0 && <FormControlLabel value="copy" control={<Radio />} label="다른 초안을 복제" />}
            {prevConfirmed && (
              <FormControlLabel value="prev" control={<Radio />}
                label={`${year - 1}학년도 확정본을 같은 요일로 옮겨 시작 (공휴일·요일 교체 제외)`} />
            )}
          </RadioGroup>
          {newForm.source === 'copy' && (
            <TextField select label="복제할 초안" value={newForm.copyId} onChange={(e) => setNewForm({ ...newForm, copyId: e.target.value })}>
              {(plans || []).map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
            </TextField>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setNewOpen(false)}>취소</Button>
          <Button variant="contained" disableElevation onClick={create} disabled={creating}>만들기</Button>
        </DialogActions>
      </Dialog>
    </Layout>
  )
}
