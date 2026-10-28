import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
import Switch from '@mui/material/Switch'
import AddIcon from '@mui/icons-material/Add'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import { useAuth } from '@shared/contexts/AuthContext'
import { currentYearSemester } from '@shared/lib/schema'
import { PLAN_KINDS, clonePlanData, planData, planStage, summarizeStaff } from '@shared/lib/dutyPlan'
import Layout from '../../components/Layout'
import useStaffDirectory from '../academicPlan/useStaffDirectory'
import useDutyAccess from './useDutyAccess'
import ImportHwpxDialog from './ImportHwpxDialog'
import { createPlan, deletePlan, loadConfirmedPlan, saveYear, setWishWindow, subscribePlans, subscribeYear } from './dutyPlanRepo'
import { ACCENT, ACCENT_BG, STAGE_STYLE, fmtTime } from './dutyUi'

/** 학년도를 시작할 때 자동으로 넣는 편집자 — 교무(기획)부장. 관리자(교장·교감 포함)는 명단과 상관없이 편집한다 */
const defaultEditorsOf = (staff) => staff.filter((s) => s.rank === '부장' && /교무/.test(s.positionLabel)).map((s) => s.uid)

const ROLE = {
  current: { label: '운영 중', color: ACCENT, bg: ACCENT_BG },
  next: { label: '편성 중', color: '#7c3aed', bg: '#f5f3ff' },
  past: { label: '지난 학년도', color: '#64748b', bg: '#f1f5f9' },
}

function EditorsCard({ schoolId, year, yearDoc, staff, refetchStaff }) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const roles = yearDoc?.editorRoles || {}
  const editors = staff.filter((s) => (yearDoc?.editorUids || []).includes(s.uid))
  const save = async (uids, nextRoles = roles) => {
    setSaving(true)
    try { await saveYear(schoolId, year, { editorUids: uids, editorRoles: Object.fromEntries(uids.map((u) => [u, nextRoles[u] || '인사자문위원'])) }) } finally { setSaving(false) }
  }
  const reload = async () => {
    const { staff: fresh } = await refetchStaff()
    const heads = defaultEditorsOf(fresh)
    await save([...new Set([...(yearDoc?.editorUids || []), ...heads])], { ...roles, ...Object.fromEntries(heads.map((u) => [u, '교무기획부장'])) })
  }
  return (
    <Box sx={{ border: '1px solid #e2e8f0', borderRadius: 2, px: 1.5, py: 1, bgcolor: '#fff' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer' }} onClick={() => setOpen((o) => !o)}>
        <Typography sx={{ fontWeight: 800, fontSize: '0.9rem' }}>편집자 {editors.length}명</Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>교무기획부장 · 인사자문위원 — 관리자(교장·교감)는 늘 편집 가능</Typography>
        <Box sx={{ flex: 1 }} />
        {open ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
      </Box>
      {open && (
        <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Autocomplete multiple size="small" options={staff} value={editors} disabled={saving}
            getOptionLabel={(s) => `${s.name}${s.positionLabel ? ` (${s.positionLabel})` : s.department ? ` (${s.department})` : ''}`}
            isOptionEqualToValue={(a, b) => a.uid === b.uid}
            onChange={(_, v) => save(v.map((s) => s.uid))}
            renderInput={(p) => <TextField {...p} placeholder="인사자문위원 추가" />} />
          {editors.map((s) => (
            <Box key={s.uid} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="body2" sx={{ width: 100 }}>{s.name}</Typography>
              <TextField select size="small" value={roles[s.uid] || '인사자문위원'} disabled={saving} sx={{ width: 160 }}
                onChange={(e) => save(yearDoc.editorUids, { ...roles, [s.uid]: e.target.value })}>
                {['교무기획부장', '인사자문위원', '기타'].map((r) => <MenuItem key={r} value={r}>{r}</MenuItem>)}
              </TextField>
            </Box>
          ))}
          <Button size="small" onClick={reload} disabled={saving} sx={{ alignSelf: 'flex-end' }}>교무기획부장 다시 불러오기</Button>
        </Box>
      )}
    </Box>
  )
}

function PlanCard({ plan: p, featured, canDelete, onOpen, onDelete }) {
  const st = STAGE_STYLE[planStage(p)]
  const sum = summarizeStaff(planData(p))
  const confirmed = planStage(p) === 'confirmed'
  const placed = (p.duties || []).filter((d) => d.deptId)
  const assigned = placed.filter((d) => d.assigneeUid || d.assigneeName).length
  return (
    <Box onClick={onOpen}
      sx={{
        border: `${featured ? 2 : 1}px solid ${confirmed ? ACCENT : '#e2e8f0'}`, bgcolor: confirmed ? ACCENT_BG : '#fff',
        borderRadius: 2, p: featured ? 2.5 : 1.75, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 0.5,
        '&:hover': { boxShadow: '0 2px 8px rgba(15,23,42,0.08)' },
      }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography sx={{ fontWeight: 800, fontSize: featured ? '1.15rem' : '1rem' }}>{p.name}</Typography>
        <Chip size="small" label={PLAN_KINDS[p.kind] || '편성안'} variant="outlined" />
        <Chip size="small" label={st.label} color={st.color} variant={st.variant} />
        <Box sx={{ flex: 1 }} />
        {canDelete && <Button size="small" color="error" onClick={(e) => { e.stopPropagation(); onDelete() }}>삭제</Button>}
      </Box>
      <Typography variant="body2">
        부서 {(p.departments || []).length} · 업무 {placed.length}
        {p.kind === 'assign' && ` · 배치 ${assigned}/${placed.length}`}
        {sum.teachers > 0 && ` · 교원 ${sum.teachers}명(학년부 ${sum.grade} · 일반 부서 ${sum.general})`}
      </Typography>
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        v{p.versionCount || 0} · {p.updatedBy?.name || p.createdByName} {fmtTime(p.updatedAt)}
      </Typography>
    </Box>
  )
}

/** datetime-local 입력 값 ↔ Date */
const toLocalInput = (d) => (d ? new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '')

/**
 * 희망원 칸 — 확정한 업무분장안이 있으면 나온다. 교직원은 '희망원 쓰기', 편집자는 기간 설정·집계
 */
function WishBlock({ year, yearDoc, cardsPlan, isEditor }) {
  const navigate = useNavigate()
  const { schoolId } = useAuth()
  const [edit, setEdit] = useState(null) // { open, deadline }
  const [error, setError] = useState('')
  const w = yearDoc?.wish || {}
  const deadline = w.deadline?.toDate?.() || null
  const open = Boolean(w.open) && (!deadline || deadline > new Date())
  const save = async () => {
    try {
      await setWishWindow(schoolId, year, { open: edit.open, deadline: edit.deadline ? new Date(edit.deadline) : null, sourcePlanId: cardsPlan.id })
      setEdit(null)
    } catch (e) { setError(`저장하지 못했습니다: ${e.message}`) }
  }
  return (
    <Box sx={{ border: `1px solid ${open ? '#86efac' : '#e2e8f0'}`, bgcolor: open ? '#f0fdf4' : '#fff', borderRadius: 2, p: 1.5, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography sx={{ fontWeight: 800 }}>업무분장 희망원</Typography>
        <Chip size="small" label={open ? '받는 중' : w.open ? '마감' : '받기 전'} color={open ? 'success' : 'default'} />
        {deadline && <Typography variant="caption" sx={{ color: 'text.secondary' }}>{fmtTime(deadline)} 마감</Typography>}
        <Box sx={{ flex: 1 }} />
        {isEditor && <Button size="small" onClick={() => setEdit({ open: Boolean(w.open), deadline: toLocalInput(deadline) })}>기간 설정</Button>}
        <Button size="small" variant="contained" disableElevation sx={{ bgcolor: ACCENT }} onClick={() => navigate(`/duty-plan/${year}/wish`)}>
          {isEditor ? '희망원 보기' : open ? '희망원 쓰기' : '업무 보기'}
        </Button>
      </Box>
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>확정한 업무분장안 '{cardsPlan.name}'의 업무를 보고 1~3지망과 담임 희망을 냅니다.</Typography>
      {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
      <Dialog open={Boolean(edit)} onClose={() => setEdit(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>희망원 받는 기간</DialogTitle>
        {edit && (
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
            <FormControlLabel control={<Switch checked={edit.open} onChange={(e) => setEdit({ ...edit, open: e.target.checked })} />} label="희망원 받기" />
            <TextField type="datetime-local" label="마감" value={edit.deadline} onChange={(e) => setEdit({ ...edit, deadline: e.target.value })}
              InputLabelProps={{ shrink: true }} helperText="비워 두면 직접 끌 때까지 받습니다" />
          </DialogContent>
        )}
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setEdit(null)}>취소</Button>
          <Button variant="contained" disableElevation onClick={save} sx={{ bgcolor: ACCENT }}>저장</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

const nextName = (plans, base) => {
  const used = new Set(plans.map((p) => p.name))
  for (const c of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') if (!used.has(`${base} ${c}`)) return `${base} ${c}`
  return `${base} ${plans.length + 1}`
}

/**
 * 한 학년도 칸. role: current(운영 중 — 확정본을 크게) | next(편성 중)
 */
function YearColumn({ year, role, staffState, onImport }) {
  const navigate = useNavigate()
  const { schoolId } = useAuth()
  const r = ROLE[role]
  const [yearDoc, setYearDoc] = useState(undefined)
  const [plans, setPlans] = useState(null)
  const [error, setError] = useState('')
  const [showOthers, setShowOthers] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  const [form, setForm] = useState({ kind: 'cards', source: 'blank', copyId: '', name: '' })
  const [prev, setPrev] = useState(null)
  const [creating, setCreating] = useState(false)
  const access = useDutyAccess(yearDoc)
  const { staff, loading: staffLoading, refetch: refetchStaff } = staffState

  useEffect(() => {
    if (!schoolId) return undefined
    return subscribeYear(schoolId, year, setYearDoc, () => setYearDoc(null))
  }, [schoolId, year])

  // 편집자가 아니면 공람·확정본만 조회한다(규칙이 이 조건을 요구한다) — 편집자 여부가 정해진 뒤에 구독
  useEffect(() => {
    if (!schoolId || !access.ready) return undefined
    setPlans(null)
    return subscribePlans(schoolId, year, { onlyShared: !access.isEditor }, setPlans, (e) => setError(e.message))
  }, [schoolId, year, access.ready, access.isEditor])

  // 지난 학년도 확정본 — 새 업무분장안을 그 카드로 시작
  useEffect(() => {
    if (!schoolId || !access.isEditor) return
    loadConfirmedPlan(schoolId, year - 1).then(setPrev).catch(() => setPrev(null))
  }, [schoolId, year, access.isEditor])

  const cardsPlan = (plans || []).find((p) => p.id === yearDoc?.cardsPlanId)
  const featured = (plans || []).find((p) => p.id === yearDoc?.confirmedPlanId) || null
  const others = (plans || []).filter((p) => p !== featured)

  const openYear = async () => {
    const { staff: fresh } = await refetchStaff()
    const uids = defaultEditorsOf(fresh)
    await saveYear(schoolId, year, { editorUids: uids, editorRoles: Object.fromEntries(uids.map((u) => [u, '교무기획부장'])), confirmedPlanId: null, cardsPlanId: null })
  }

  const openNew = () => {
    const kind = cardsPlan && planStage(cardsPlan) === 'confirmed' ? 'assign' : 'cards'
    setForm({
      kind,
      source: kind === 'assign' ? 'cardsPlan' : prev ? 'prev' : plans?.length ? 'copy' : 'blank',
      copyId: plans?.[0]?.id || '',
      name: nextName(plans || [], kind === 'assign' ? '배치안' : '업무분장안'),
    })
    setNewOpen(true)
  }

  const create = async () => {
    setCreating(true)
    try {
      let data = { departments: [], duties: [], homerooms: [], subjectHeads: [], staffPool: [] }
      let basedOn = null
      if (form.source === 'prev' && prev) { data = clonePlanData(planData(prev), { keepAssignees: false }); basedOn = prev.id }
      else if (form.source === 'copy') {
        const src = plans.find((p) => p.id === form.copyId)
        data = clonePlanData(planData(src), { keepAssignees: true }); basedOn = src?.id || null
      } else if (form.source === 'cardsPlan' && cardsPlan) { data = clonePlanData(planData(cardsPlan), { keepAssignees: false }); basedOn = cardsPlan.id }
      const id = await createPlan({ schoolId, year, name: form.name.trim() || nextName(plans, '업무분장안'), kind: form.kind, data, basedOn, by: access.me })
      setNewOpen(false)
      navigate(`/duty-plan/${year}/${id}`)
    } catch (e) { setError(`편성안을 만들지 못했습니다: ${e.message}`) } finally { setCreating(false) }
  }

  const remove = async (p) => {
    if (!window.confirm(`'${p.name}'을(를) 지울까요? 수정 기록도 함께 지워집니다.`)) return
    try { await deletePlan(schoolId, year, p.id) } catch (e) { setError(`지우지 못했습니다: ${e.message}`) }
  }
  const card = (p, isFeatured) => (
    <PlanCard key={p.id} plan={p} featured={isFeatured}
      canDelete={access.dutyAdmin || (p.createdBy === access.me.uid && planStage(p) === 'draft')}
      onOpen={() => navigate(`/duty-plan/${year}/${p.id}`)} onDelete={() => remove(p)} />
  )

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, minWidth: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', borderBottom: `3px solid ${r.color}`, pb: 1 }}>
        <Typography variant="h6" sx={{ fontWeight: 800 }}>{year}학년도</Typography>
        <Chip size="small" label={r.label} sx={{ bgcolor: r.bg, color: r.color, fontWeight: 800 }} />
        <Box sx={{ flex: 1 }} />
        {access.dutyAdmin && (
          <Button size="small" startIcon={<UploadFileIcon />} onClick={() => onImport(year)}>hwpx 가져오기</Button>
        )}
        {access.isEditor && yearDoc && (
          <Button size="small" variant="contained" disableElevation startIcon={<AddIcon />} onClick={openNew} sx={{ bgcolor: ACCENT }}>새 편성안</Button>
        )}
      </Box>
      {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}

      {yearDoc === null && (
        access.dutyAdmin ? (
          <Alert severity="info" action={<Button color="inherit" onClick={openYear} disabled={staffLoading}>학년도 시작</Button>}>
            {year}학년도 업무분장을 아직 시작하지 않았습니다. 시작하면 교무기획부장이 편집자로 등록되고, 인사자문위원을 더할 수 있습니다.
            {role === 'current' && ' 이미 결재된 업무분장이 있으면 hwpx 가져오기로 바로 올리세요.'}
          </Alert>
        ) : (
          <Alert severity="info">{year}학년도 업무분장은 아직 {role === 'next' ? '편성 전입니다' : '올라오지 않았습니다'}.</Alert>
        )
      )}

      {plans === null && yearDoc !== null ? <CircularProgress sx={{ alignSelf: 'center' }} /> : !plans?.length ? (
        yearDoc && <Typography sx={{ color: 'text.secondary', textAlign: 'center', py: 4 }}>
          {access.isEditor ? '아직 편성안이 없습니다.' : '아직 공개된 업무분장이 없습니다.'}
        </Typography>
      ) : featured ? (
        <>
          {card(featured, true)}
          {others.length > 0 && (
            <Button size="small" onClick={() => setShowOthers((v) => !v)} sx={{ alignSelf: 'flex-start' }}
              startIcon={showOthers ? <ExpandLessIcon /> : <ExpandMoreIcon />}>
              다른 편성안 {others.length}개 {showOthers ? '접기' : '보기'}
            </Button>
          )}
          {showOthers && others.map((p) => card(p, false))}
        </>
      ) : plans.map((p) => card(p, false))}

      {cardsPlan && planStage(cardsPlan) === 'confirmed' && (
        <WishBlock year={year} yearDoc={yearDoc} cardsPlan={cardsPlan} isEditor={access.isEditor} />
      )}

      {access.dutyAdmin && yearDoc && (
        <EditorsCard schoolId={schoolId} year={year} yearDoc={yearDoc} staff={staff} refetchStaff={refetchStaff} />
      )}

      <Dialog open={newOpen} onClose={() => setNewOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>새 편성안</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
          <TextField select label="종류" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
            <MenuItem value="cards">업무분장안 — 부서·업무 카드 구성</MenuItem>
            <MenuItem value="assign">인원 배치안 — 확정한 업무에 사람 배치</MenuItem>
          </TextField>
          <TextField label="이름" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <RadioGroup value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
            {prev && <FormControlLabel value="prev" control={<Radio />} label={`${year - 1}학년도 확정 업무분장의 부서·업무로 시작 (담당자는 비움)`} />}
            {cardsPlan && planStage(cardsPlan) === 'confirmed' && (
              <FormControlLabel value="cardsPlan" control={<Radio />} label={`확정한 업무분장안 '${cardsPlan.name}'으로 시작`} />
            )}
            {plans?.length > 0 && <FormControlLabel value="copy" control={<Radio />} label="다른 편성안을 그대로 복제" />}
            <FormControlLabel value="blank" control={<Radio />} label="빈 편성안" />
          </RadioGroup>
          {form.source === 'copy' && (
            <TextField select label="복제할 편성안" value={form.copyId} onChange={(e) => setForm({ ...form, copyId: e.target.value })}>
              {(plans || []).map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
            </TextField>
          )}
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>새 편성안은 1차 초안(관리자·편집자만 봄)으로 시작합니다.</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setNewOpen(false)}>취소</Button>
          <Button variant="contained" disableElevation onClick={create} disabled={creating} sx={{ bgcolor: ACCENT }}>{creating ? '만드는 중…' : '만들기'}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default function DutyPlanHome() {
  const navigate = useNavigate()
  const { schoolId, isAdmin, isSuperAdmin, isPrincipal, isHeadmaster } = useAuth()
  const thisYear = currentYearSemester().year
  const dutyAdmin = Boolean(isAdmin || isSuperAdmin || isPrincipal || isHeadmaster)
  // 교직원 명단은 관리자 기능(편집자·가져오기 이름 맞추기)에만 쓴다 — 다른 사람은 읽지 않는다
  const staffState = useStaffDirectory(dutyAdmin ? schoolId : null, thisYear)
  const [importYear, setImportYear] = useState(null)
  const defaultEditors = useMemo(() => defaultEditorsOf(staffState.staff), [staffState.staff])
  const { me } = useDutyAccess(null)

  return (
    <Layout>
      <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1360, mx: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5, flexWrap: 'wrap' }}>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>업무분장</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            확정된 업무분장은 누구나 봅니다. 업무 카드를 누르면 업무 안내와 인수인계 기록이 이어집니다.
          </Typography>
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3, alignItems: 'start' }}>
          <YearColumn year={thisYear} role="current" staffState={staffState} onImport={setImportYear} />
          <YearColumn year={thisYear + 1} role="next" staffState={staffState} onImport={setImportYear} />
        </Box>
      </Box>
      {dutyAdmin && (
        <ImportHwpxDialog open={importYear !== null} onClose={() => setImportYear(null)} schoolId={schoolId}
          key={importYear ?? 'none'} defaultYear={importYear ?? thisYear}
          staff={staffState.staff} defaultEditors={defaultEditors} by={me}
          onDone={(id, y) => { setImportYear(null); navigate(`/duty-plan/${y}/${id}`) }} />
      )}
    </Layout>
  )
}
