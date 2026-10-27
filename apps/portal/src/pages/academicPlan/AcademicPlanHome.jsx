import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
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
import { currentYearSemester } from '@shared/lib/schema'
import {
  MIN_WEEKDAY_DAYS, STAGE_LABEL, computeStats, eventsToCards, mergeDeptColors, planStage, rollEventsToNextYear,
} from '@shared/lib/academicPlan'
import Layout from '../../components/Layout'
import useStaffDirectory from './useStaffDirectory'
import { createPlan, deletePlan, loadPrevYear, saveDeptColors, saveYear, subscribePlans, subscribeYear } from './planRepo'
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
  const [prevColors, setPrevColors] = useState({})
  const { staff, loading: staffLoading, refetch: refetchStaff } = useStaffDirectory(schoolId, year)

  useEffect(() => {
    if (!schoolId) return
    setPlans(null)
    const u1 = subscribePlans(schoolId, year, setPlans, (e) => setError(e.message))
    const u2 = subscribeYear(schoolId, year, setYearDoc)
    return () => { u1(); u2() }
  }, [schoolId, year])

  // 지난 학년도 학사일정 — 확정본, 없으면 가장 최근에 고친 초안. 새 초안을 카드로·같은 요일로 시작할 수 있게
  useEffect(() => {
    if (!schoolId) return
    loadPrevYear(schoolId, year)
      .then((r) => { setPrevConfirmed(r.plan); setPrevColors(r.deptColors) })
      .catch(() => { setPrevConfirmed(null); setPrevColors({}) })
  }, [schoolId, year])

  const canEdit = canAdmin || (yearDoc?.editorUids || []).includes(user?.uid)
  const summaries = useMemo(() => Object.fromEntries((plans || []).map((p) => [p.id, summaryOf(p)])), [plans])

  const openYear = async () => {
    const { staff: fresh } = await refetchStaff()
    await saveYear(schoolId, year, { editorUids: fresh.filter((s) => s.rank === '부장').map((s) => s.uid), confirmedPlanId: null })
  }

  const openNew = () => {
    // 지난 학년도 학사일정이 있으면 기본은 '카드로 시작' — 날짜는 새로 정하고, 내용은 그대로 가져온다
    setNewForm({ name: nextName(plans || []), source: prevConfirmed ? 'cards' : plans?.length ? 'copy' : 'blank', copyId: plans?.[0]?.id || '' })
    setNewOpen(true)
  }

  const create = async () => {
    setCreating(true)
    // 편집 화면은 새 창 — 팝업 차단을 피하려고 클릭 시점에 창부터 연다
    const win = window.open('', '_blank')
    try {
      let events = []
      let holidays = []
      let basedOn = null
      if (newForm.source === 'copy') {
        const src = plans.find((p) => p.id === newForm.copyId)
        // 복제본은 주요 일정 단계부터 — 잠금 표시(frame·unlocked)는 버린다
        events = (src?.events || []).map(({ frame, unlocked, ...e }) => e) // eslint-disable-line no-unused-vars
        holidays = src?.holidays || []
        basedOn = src?.id || null
      } else if (newForm.source === 'cards' && prevConfirmed) {
        events = eventsToCards(prevConfirmed.events)
        basedOn = prevConfirmed.id
      } else if (newForm.source === 'prev' && prevConfirmed) {
        events = rollEventsToNextYear(prevConfirmed.events, year)
        basedOn = prevConfirmed.id
      }
      const id = await createPlan({ schoolId, year, name: newForm.name.trim() || nextName(plans), events, holidays, basedOn, by })
      // 지난 학년도에서 시작했으면 부서 색도 — 이미 정한 색은 그대로, 빈 부서만
      if ((newForm.source === 'cards' || newForm.source === 'prev') && Object.keys(prevColors).length) {
        const m = mergeDeptColors(yearDoc?.deptColors, prevColors)
        if (m.added) await saveDeptColors(schoolId, year, m.colors).catch(() => {})
      }
      // 편집은 새 창에서 — 이 창(목록)의 입력 창은 닫아 둔다. 안 닫으면 편집 창에서 '목록'으로 돌아왔을 때 입력 창이 그대로 보인다
      setNewOpen(false)
      if (win) win.location.href = `/academic-plan/${id}`
      else navigate(`/academic-plan/${id}`)
    } catch (e) {
      win?.close()
      setError(`초안을 만들지 못했습니다: ${e.message}`)
    } finally { setCreating(false) }
  }

  // 같은 초안은 이미 열린 창을 다시 쓴다
  const openEditor = (id) => {
    if (!window.open(`/academic-plan/${id}`, `academic-plan-${id}`)) navigate(`/academic-plan/${id}`)
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
          const st = planStage(p)
          // 주요 일정을 확정해 한 초안으로 진행 중이면 나머지 초안은 '보관'(지우지는 않는다)
          const archived = Boolean(yearDoc?.activePlanId) && yearDoc.activePlanId !== p.id && st === 'frame'
          return (
            <Box key={p.id} onClick={() => openEditor(p.id)}
              sx={{
                border: `1px solid ${p.status === 'confirmed' ? ACCENT : '#e2e8f0'}`, bgcolor: p.status === 'confirmed' ? ACCENT_BG : '#fff',
                borderRadius: 2, p: 2, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap',
                opacity: archived ? 0.55 : 1,
                '&:hover': { boxShadow: '0 2px 8px rgba(15,23,42,0.08)' },
              }}>
              <Box sx={{ flex: 1, minWidth: 220 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography sx={{ fontWeight: 800 }}>{p.name}</Typography>
                  {st === 'final'
                    ? <Chip size="small" color="success" icon={<VerifiedIcon />} label="확정" />
                    : <Chip size="small" variant={st === 'detail' ? 'filled' : 'outlined'} color={st === 'detail' ? 'primary' : 'default'}
                        label={archived ? '보관' : STAGE_LABEL[st]} />}
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
              <FormControlLabel value="cards" control={<Radio />}
                label={`${year - 1}학년도 일정을 보관함 카드로 넣고 시작 — 날짜는 표에 끌어 놓아 정함`} />
            )}
            {prevConfirmed && (
              <FormControlLabel value="prev" control={<Radio />}
                label={`${year - 1}학년도 일정을 같은 요일로 옮겨 시작 (공휴일·요일 교체 제외)`} />
            )}
            {prevConfirmed && (
              <Typography variant="caption" sx={{ color: 'text.secondary', ml: 4 }}>
                가져올 학사일정: {prevConfirmed.name}{prevConfirmed.status === 'confirmed' ? ' (확정본)' : ' (확정본이 없어 가장 최근 초안)'}
              </Typography>
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
