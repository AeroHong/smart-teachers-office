import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Alert from '@mui/material/Alert'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import Autocomplete from '@mui/material/Autocomplete'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import FormControlLabel from '@mui/material/FormControlLabel'
import Checkbox from '@mui/material/Checkbox'
import CircularProgress from '@mui/material/CircularProgress'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import { useAuth } from '@shared/contexts/AuthContext'
import { WISH_RANKS, dutiesOf, groupPlan, planData, wishSummary } from '@shared/lib/dutyPlan'
import Layout from '../../components/Layout'
import useStaffDirectory from '../academicPlan/useStaffDirectory'
import DutySheet from './DutySheet'
import DutyDrawer from './DutyDrawer'
import useDutyAccess from './useDutyAccess'
import { loadConfirmedPlan, saveWish, subscribeMyWish, subscribePlan, subscribeWishes, subscribeYear } from './dutyPlanRepo'
import { ACCENT, ACCENT_BG, fmtTime } from './dutyUi'

const HOMEROOM = ['담임', '비담임', '무관']
const deadlineOf = (yd) => yd?.wish?.deadline?.toDate?.() || null

/** 편집자 — 업무별 희망자·미제출자 */
function WishSummary({ schoolId, year, plan }) {
  const [wishes, setWishes] = useState(null)
  const { staff } = useStaffDirectory(schoolId, year)
  useEffect(() => subscribeWishes(schoolId, year, setWishes, () => setWishes([])), [schoolId, year])
  const data = useMemo(() => planData(plan), [plan])
  const deptName = useMemo(() => new Map(data.departments.map((d) => [d.id, d.name])), [data.departments])
  const teachers = staff.filter((s) => s.staffType !== '강사' && s.rank !== '관리자')
  const sum = useMemo(() => wishSummary(data, wishes || [], teachers), [data, wishes, teachers])
  if (wishes === null) return <CircularProgress />
  const order = new Map(groupPlan(data).categories.flatMap((c) => c.departments).flatMap((d) => d.duties).map((d, i) => [d.id, i]))
  const rows = [...sum.byCard].sort((a, b) => order.get(a.duty.id) - order.get(b.duty.id))
  const td = { border: '1px solid #e2e8f0', px: 1, py: 0.5, fontSize: '0.85rem' }
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography sx={{ fontWeight: 800 }}>제출 {sum.submitted}명 · 미제출 {sum.missing.length}명</Typography>
      {sum.missing.length > 0 && (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>미제출: {sum.missing.map((m) => m.name).join(', ')}</Typography>
      )}
      <Box component="table" sx={{ borderCollapse: 'collapse', width: '100%', maxWidth: 1000 }}>
        <thead><tr>{['부서', '업무', '1지망', '2지망', '3지망'].map((h) => <Box key={h} component="th" sx={{ ...td, bgcolor: '#f1f5f9', fontWeight: 800 }}>{h}</Box>)}</tr></thead>
        <tbody>
          {rows.map(({ duty, wishers }) => (
            <tr key={duty.id}>
              <Box component="td" sx={td}>{deptName.get(duty.deptId)}</Box>
              <Box component="td" sx={{ ...td, fontWeight: 700 }}>{duty.title}</Box>
              {[1, 2, 3].map((r) => <Box key={r} component="td" sx={td}>{wishers.filter((w) => w.rank === r).map((w) => w.name).join(', ')}</Box>)}
            </tr>
          ))}
        </tbody>
      </Box>
      <Box>
        <Typography sx={{ fontWeight: 800, mb: 0.5 }}>담임 희망 · 하고 싶은 말</Typography>
        {(wishes || []).filter((w) => w.homeroom || w.note || w.keepCurrent).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko')).map((w) => (
          <Typography key={w.uid} variant="body2" sx={{ py: 0.25 }}>
            <b>{w.name}</b> — {w.homeroom || '-'}{w.homeroomGrade ? ` ${w.homeroomGrade}학년` : ''}{w.keepCurrent ? ' · 현 업무 유지 희망' : ''}{w.note ? ` · ${w.note}` : ''}
          </Typography>
        ))}
      </Box>
    </Box>
  )
}

/**
 * 업무분장 희망원 — 확정된 업무분장안(카드)을 보며 1~3지망과 담임 희망을 낸다.
 * 카드를 누르면 업무 안내·인수인계 기록(작년 담당자가 적은 것)을 읽을 수 있다.
 */
export default function DutyWishPage() {
  const { year: yearParam } = useParams()
  const year = Number(yearParam)
  const navigate = useNavigate()
  const { schoolId, user } = useAuth()
  const [yearDoc, setYearDoc] = useState(undefined)
  const [plan, setPlan] = useState(undefined)
  const [current, setCurrent] = useState(null) // 올해 확정본 — 내 지금 업무
  const [mine, setMine] = useState(undefined)
  const [form, setForm] = useState({ choices: [], homeroom: '무관', homeroomGrade: '', keepCurrent: false, note: '' })
  const [openId, setOpenId] = useState(null)
  const [tab, setTab] = useState('write')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  const access = useDutyAccess(yearDoc)

  useEffect(() => (schoolId ? subscribeYear(schoolId, year, setYearDoc, () => setYearDoc(null)) : undefined), [schoolId, year])
  const sourceId = yearDoc?.wish?.sourcePlanId || yearDoc?.cardsPlanId
  useEffect(() => {
    if (!schoolId || !sourceId) return undefined
    return subscribePlan(schoolId, year, sourceId, setPlan, () => setPlan(null))
  }, [schoolId, year, sourceId])
  useEffect(() => {
    if (!schoolId || !user?.uid) return undefined
    return subscribeMyWish(schoolId, year, user.uid, setMine, () => setMine(null))
  }, [schoolId, year, user?.uid])
  useEffect(() => { if (schoolId) loadConfirmedPlan(schoolId, year - 1).then(setCurrent).catch(() => setCurrent(null)) }, [schoolId, year])
  useEffect(() => {
    if (mine) setForm({ choices: mine.choices || [], homeroom: mine.homeroom || '무관', homeroomGrade: mine.homeroomGrade || '', keepCurrent: Boolean(mine.keepCurrent), note: mine.note || '' })
  }, [mine])

  const data = useMemo(() => planData(plan), [plan])
  const cards = useMemo(() => groupPlan(data).categories.flatMap((c) => c.departments.map((d) => d.duties.map((x) => ({ ...x, deptName: d.name })))).flat(), [data])
  const byKey = useMemo(() => new Map(cards.map((c) => [c.dutyKey, c])), [cards])
  const myNow = useMemo(() => (current ? dutiesOf(planData(current), user?.uid) : []), [current, user?.uid])
  const deadline = deadlineOf(yearDoc)
  const open = Boolean(yearDoc?.wish?.open) && (!deadline || deadline > new Date())
  const rankOf = (duty) => form.choices.find((c) => c.dutyKey === duty.dutyKey)?.rank

  const setRank = (rank, card) => setForm((f) => {
    const rest = f.choices.filter((c) => c.rank !== rank && (!card || c.dutyKey !== card.dutyKey))
    return { ...f, choices: card ? [...rest, { rank, dutyKey: card.dutyKey, title: card.title, deptName: card.deptName }].sort((a, b) => a.rank - b.rank) : rest }
  })

  const submit = async () => {
    setSaving(true); setMsg(null)
    try {
      await saveWish(schoolId, year, user.uid, { ...form, homeroomGrade: form.homeroomGrade ? Number(form.homeroomGrade) : null, name: access.me.name })
      setMsg({ severity: 'success', text: '희망원을 냈습니다. 마감 전까지 고칠 수 있습니다.' })
    } catch (e) {
      setMsg({ severity: 'error', text: e.code === 'permission-denied' ? '희망원 받는 기간이 아닙니다.' : `내지 못했습니다: ${e.message}` })
    } finally { setSaving(false) }
  }

  return (
    <Layout>
      <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1500, mx: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Button size="small" startIcon={<ArrowBackIcon />} onClick={() => navigate('/duty-plan')}>목록</Button>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>{year}학년도 업무분장 희망원</Typography>
          <Chip size="small" label={open ? `받는 중${deadline ? ` · ${fmtTime(deadline)} 마감` : ''}` : '받는 기간 아님'} color={open ? 'success' : 'default'} />
          <Box sx={{ flex: 1 }} />
          {access.isEditor && (
            <ToggleButtonGroup size="small" exclusive value={tab} onChange={(_, v) => v && setTab(v)}>
              <ToggleButton value="write" sx={{ fontWeight: 700 }}>작성</ToggleButton>
              <ToggleButton value="summary" sx={{ fontWeight: 700 }}>집계</ToggleButton>
            </ToggleButtonGroup>
          )}
        </Box>

        {yearDoc !== undefined && !sourceId && <Alert severity="info">아직 확정된 {year}학년도 업무분장안이 없습니다. 업무분장안이 확정되면 희망원을 받습니다.</Alert>}
        {sourceId && plan === undefined && <CircularProgress sx={{ alignSelf: 'center' }} />}
        {plan === null && <Alert severity="warning">업무분장안을 열 수 없습니다.</Alert>}

        {plan && tab === 'summary' && access.isEditor && <WishSummary schoolId={schoolId} year={year} plan={plan} />}

        {plan && tab === 'write' && (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 340px' }, gap: 2, alignItems: 'start' }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                업무나 업무 내용 카드를 누르면 지난 담당자가 남긴 안내·인수인계 기록을 볼 수 있습니다. 그 자리에서 지망 순위를 고르세요.
              </Typography>
              <DutySheet data={data} onDutyClick={(d) => setOpenId(d.id)} onTaskClick={(t, d) => setOpenId(d.id)}
                highlight={(d) => Boolean(rankOf(d))}
                rowExtra={(d) => rankOf(d) ? <Box sx={{ fontSize: '0.72rem', fontWeight: 800, color: ACCENT }}>내 {rankOf(d)}지망</Box> : null} />
            </Box>

            <Box sx={{ position: { lg: 'sticky' }, top: 16, border: `1px solid ${ACCENT}55`, borderRadius: 2, p: 1.5, bgcolor: '#fff', display: 'flex', flexDirection: 'column', gap: 1.25 }}>
              <Typography sx={{ fontWeight: 800 }}>나의 희망</Typography>
              {myNow.length > 0 && (
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  {year - 1}학년도 내 업무: {myNow.map((d) => d.title).join(', ')}
                </Typography>
              )}
              {Array.from({ length: WISH_RANKS }, (_, i) => i + 1).map((rank) => {
                const c = form.choices.find((x) => x.rank === rank)
                return (
                  <Autocomplete key={rank} size="small" options={cards} disabled={!open}
                    value={c ? byKey.get(c.dutyKey) || { dutyKey: c.dutyKey, title: c.title, deptName: c.deptName || '' } : null}
                    groupBy={(o) => o.deptName}
                    getOptionLabel={(o) => `${o.deptName} · ${o.title}`}
                    isOptionEqualToValue={(a, b) => a.dutyKey === b.dutyKey}
                    onChange={(_, v) => setRank(rank, v)}
                    renderInput={(p) => <TextField {...p} label={`${rank}지망`} />} />
                )
              })}
              <TextField select size="small" label="담임 희망" value={form.homeroom} disabled={!open} onChange={(e) => setForm({ ...form, homeroom: e.target.value })}>
                {HOMEROOM.map((h) => <MenuItem key={h} value={h}>{h}</MenuItem>)}
              </TextField>
              {form.homeroom === '담임' && (
                <TextField select size="small" label="희망 학년" value={form.homeroomGrade} disabled={!open} onChange={(e) => setForm({ ...form, homeroomGrade: e.target.value })}>
                  <MenuItem value="">무관</MenuItem>
                  {[1, 2, 3].map((g) => <MenuItem key={g} value={g}>{g}학년</MenuItem>)}
                </TextField>
              )}
              <FormControlLabel control={<Checkbox size="small" checked={form.keepCurrent} disabled={!open} onChange={(e) => setForm({ ...form, keepCurrent: e.target.checked })} />} label="지금 업무를 계속 맡고 싶습니다" />
              <TextField size="small" multiline minRows={3} label="하고 싶은 말" value={form.note} disabled={!open} onChange={(e) => setForm({ ...form, note: e.target.value })}
                placeholder="사정·희망 이유 등 (편집자만 봅니다)" inputProps={{ maxLength: 1000 }} />
              {msg && <Alert severity={msg.severity} onClose={() => setMsg(null)}>{msg.text}</Alert>}
              <Button variant="contained" disableElevation disabled={!open || saving} onClick={submit} sx={{ bgcolor: ACCENT }}>
                {saving ? '내는 중…' : mine ? '희망원 고치기' : '희망원 내기'}
              </Button>
              {mine?.submittedAt && <Typography variant="caption" sx={{ color: 'text.secondary' }}>마지막 제출 {fmtTime(mine.submittedAt)}</Typography>}
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>희망원은 본인과 편집자(관리자·교무기획부장·인사자문위원)만 봅니다.</Typography>
            </Box>
          </Box>
        )}
      </Box>
      {plan && (
        <DutyDrawer plan={plan} duty={(data.duties || []).find((d) => d.id === openId) || null} onClose={() => setOpenId(null)}
          actions={open ? (duty) => (
            <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', p: 1, borderRadius: 1.5, bgcolor: ACCENT_BG }}>
              <Typography variant="body2" sx={{ fontWeight: 700, mr: 0.5 }}>희망</Typography>
              {Array.from({ length: WISH_RANKS }, (_, i) => i + 1).map((r) => (
                <Button key={r} size="small" variant={rankOf(duty) === r ? 'contained' : 'outlined'} disableElevation
                  onClick={() => setRank(r, rankOf(duty) === r ? null : { ...duty, deptName: (data.departments.find((x) => x.id === duty.deptId) || {}).name || '' })}
                  sx={rankOf(duty) === r ? { bgcolor: ACCENT } : { color: ACCENT, borderColor: `${ACCENT}88` }}>{r}지망</Button>
              ))}
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>고른 뒤 오른쪽에서 '희망원 내기'</Typography>
            </Box>
          ) : undefined} />
      )}
    </Layout>
  )
}
