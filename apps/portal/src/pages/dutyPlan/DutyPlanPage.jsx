import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Alert from '@mui/material/Alert'
import TextField from '@mui/material/TextField'
import InputAdornment from '@mui/material/InputAdornment'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import FormControlLabel from '@mui/material/FormControlLabel'
import Switch from '@mui/material/Switch'
import Tooltip from '@mui/material/Tooltip'
import CircularProgress from '@mui/material/CircularProgress'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import PrintIcon from '@mui/icons-material/Print'
import SearchIcon from '@mui/icons-material/Search'
import { useAuth } from '@shared/contexts/AuthContext'
import { PLAN_KINDS, dutiesOf, planData, planStage, summarizeStaff, summaryLine } from '@shared/lib/dutyPlan'
import Layout from '../../components/Layout'
import DutySheet from './DutySheet'
import DutyDrawer from './DutyDrawer'
import DutyRosters from './DutyRosters'
import DutyWorkspace from './DutyWorkspace'
import { ExportDialog } from './DutyExportDialogs'
import CommentsPanel from '../academicPlan/CommentsPanel'
import useDutyAccess from './useDutyAccess'
import { collabRepo, recordHolders, setPlanStage, subscribePlan, subscribeYear } from './dutyPlanRepo'
import { ACCENT, STAGE_STYLE, fmtTime } from './dutyUi'

/**
 * 편성안 한 개 — 확정본·공람본은 누구나 읽고, 카드를 누르면 업무 안내·인수인계 기록이 열린다.
 */
export default function DutyPlanPage() {
  const { year: yearParam, planId } = useParams()
  const year = Number(yearParam)
  const navigate = useNavigate()
  const { schoolId, user } = useAuth()
  const [yearDoc, setYearDoc] = useState(undefined)
  const [plan, setPlan] = useState(undefined)
  const [error, setError] = useState('')
  const [view, setView] = useState('board')
  const [q, setQ] = useState('')
  const [onlyMine, setOnlyMine] = useState(false)
  const [open, setOpen] = useState(null) // { dutyId, taskId? }
  const [exportOpen, setExportOpen] = useState(false)
  const [recording, setRecording] = useState(false)
  const access = useDutyAccess(yearDoc)

  useEffect(() => {
    if (!schoolId) return undefined
    return subscribeYear(schoolId, year, setYearDoc, () => setYearDoc(null))
  }, [schoolId, year])
  useEffect(() => {
    if (!schoolId) return undefined
    return subscribePlan(schoolId, year, planId, setPlan, (e) => {
      setPlan(null)
      setError(e.code === 'permission-denied' ? '아직 공개되지 않은 편성안입니다(1차 초안은 편집자만 봅니다).' : e.message)
    })
  }, [schoolId, year, planId])

  const data = useMemo(() => planData(plan), [plan])
  const sum = useMemo(() => summarizeStaff(data), [data])
  const mine = useMemo(() => dutiesOf(data, user?.uid), [data, user?.uid])
  const openDuty = (data.duties || []).find((d) => d.id === open?.dutyId) || null
  const stage = planStage(plan)
  const st = STAGE_STYLE[stage]
  const repo = useMemo(() => collabRepo(year), [year])
  // 편집자는 확정 전(1차·2차)에 편집 화면을 본다. 확정본은 읽기 전용 — 고치려면 관리자가 확정을 푼다
  const editing = Boolean(plan) && access.isEditor && stage !== 'confirmed'
  const unconfirm = async () => {
    if (!window.confirm('확정을 풀고 2차 공람 단계로 되돌릴까요? 공개는 유지되고 편집자가 다시 고칠 수 있습니다.')) return
    try { await setPlanStage({ schoolId, plan, stage: 'review', note: '확정 해제', by: access.me }) } catch (e) { setError(e.message) }
  }

  // 편집 화면은 학사일정 편집기처럼 포털 틀(상단바·메뉴) 없이 창 높이에 고정한다
  if (editing) {
    return <DutyWorkspace key={plan.id} plan={plan} yearDoc={yearDoc} schoolId={schoolId} me={access.me} dutyAdmin={access.dutyAdmin} />
  }

  return (
    <Layout>
      <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1500, mx: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Button size="small" startIcon={<ArrowBackIcon />} onClick={() => navigate('/duty-plan')}>목록</Button>
          {plan && (
            <>
              <Typography variant="h5" sx={{ fontWeight: 800 }}>{year}학년도 {plan.name}</Typography>
              <Chip size="small" label={PLAN_KINDS[plan.kind] || '편성안'} variant="outlined" />
              <Chip size="small" label={st.label} color={st.color} variant={st.variant} />
            </>
          )}
          <Box sx={{ flex: 1 }} />
          {plan && <Typography variant="caption" sx={{ color: 'text.secondary' }}>{plan.updatedBy?.name} {fmtTime(plan.updatedAt)} · v{plan.versionCount || 0}</Typography>}
          {plan && <Button size="small" startIcon={<PrintIcon />} onClick={() => setExportOpen(true)}>결재 첨부 · 인쇄</Button>}
          {/* 교직원 정보(teacherAssignments) 반영은 도구를 다 만든 뒤 따로 검토(사용자 결정 2026-10-28) — ApplyAssignmentsDialog는 남겨 둠 */}
          {plan && stage === 'confirmed' && plan.kind === 'assign' && access.dutyAdmin && (
            <Tooltip title="업무 내용 카드마다 이 학년도 담당자를 업무 기록(역대 담당자)에 남깁니다. 여러 번 눌러도 같습니다">
              <Button size="small" variant="outlined" disabled={recording}
                onClick={async () => {
                  setRecording(true)
                  try { const n = await recordHolders(schoolId, plan); setError(''); window.alert(`업무 내용 카드 ${n}장의 기록을 갱신했습니다.`) } catch (e) { setError(e.message) } finally { setRecording(false) }
                }}>{recording ? '갱신 중…' : '업무 기록 갱신'}</Button>
            </Tooltip>
          )}
          {plan && stage === 'confirmed' && access.dutyAdmin && <Button size="small" color="warning" onClick={unconfirm}>확정 해제</Button>}
        </Box>

        {error && <Alert severity="warning">{error}</Alert>}
        {plan === undefined && !error && <CircularProgress sx={{ alignSelf: 'center', my: 6 }} />}
        {plan === null && !error && <Alert severity="info">편성안을 찾을 수 없습니다.</Alert>}

        {plan && !editing && (
          <>
            {stage === 'review' && (
              <Alert severity="info">2차 공람 중인 안입니다. 확정 전이라 바뀔 수 있습니다.</Alert>
            )}
            {mine.length > 0 && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', p: 1.25, borderRadius: 2, bgcolor: '#fff7ed', border: `1px solid ${ACCENT}33` }}>
                <Typography sx={{ fontWeight: 800, color: ACCENT }}>내 업무</Typography>
                {mine.map((d) => (
                  <Chip key={d.id} label={`${(data.departments.find((x) => x.id === d.deptId) || {}).name} · ${d.title}`} onClick={() => setOpen({ dutyId: d.id })}
                    sx={{ fontWeight: 700, bgcolor: '#fff', border: `1px solid ${ACCENT}55` }} />
                ))}
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>눌러서 업무 안내·인수인계를 적을 수 있습니다</Typography>
              </Box>
            )}

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
              <ToggleButtonGroup size="small" exclusive value={view} onChange={(_, v) => v && setView(v)}>
                <ToggleButton value="board" sx={{ fontWeight: 700, px: 1.5 }}>부서별 업무</ToggleButton>
                <ToggleButton value="rosters" sx={{ fontWeight: 700, px: 1.5 }}>부장 · 담임 · 교과부장</ToggleButton>
              </ToggleButtonGroup>
              {view === 'board' && (
                <>
                  <TextField size="small" value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름 · 업무 · 세부 업무 찾기"
                    InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
                    sx={{ width: 260 }} />
                  {mine.length > 0 && <FormControlLabel control={<Switch size="small" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />} label="내 업무만" />}
                </>
              )}
              <Box sx={{ flex: 1 }} />
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                부서 {data.departments.length} · 업무 {sum.duties}{sum.teachers ? ` · ${summaryLine(sum)}` : ''}
              </Typography>
            </Box>

            {view === 'board'
              ? <DutySheet data={data} q={q}
                  highlight={(d) => Boolean(user?.uid) && d.assigneeUid === user.uid} onlyHighlighted={onlyMine}
                  onDutyClick={(d) => setOpen({ dutyId: d.id })} onTaskClick={(t, d) => setOpen({ dutyId: d.id, taskId: t.id })} />
              : <DutyRosters data={data} classCounts={yearDoc?.classCounts} specialClasses={yearDoc?.specialClasses} />}

            {stage === 'review' && (
              <Box sx={{ maxWidth: 720, border: '1px solid #e2e8f0', borderRadius: 2, p: 1.5, bgcolor: '#fff' }}>
                <CommentsPanel schoolId={schoolId} planId={plan.id} me={access.me} canAdmin={access.dutyAdmin} repo={repo} accent={ACCENT}
                  placeholder="이 안에 대한 의견을 남겨 주세요 — 편집자가 보고 반영합니다 (Ctrl+Enter로 등록)" />
              </Box>
            )}
          </>
        )}
      </Box>
      {plan && <DutyDrawer plan={plan} duty={openDuty} taskId={open?.taskId} onClose={() => setOpen(null)} />}
      {plan && exportOpen && <ExportDialog open onClose={() => setExportOpen(false)} schoolId={schoolId} plan={plan} yearDoc={yearDoc} />}
    </Layout>
  )
}
