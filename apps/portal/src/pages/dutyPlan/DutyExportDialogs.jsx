import { useEffect, useMemo, useState } from 'react'
import { collection, doc, getDocs, query, serverTimestamp, where, writeBatch } from 'firebase/firestore'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Alert from '@mui/material/Alert'
import TextField from '@mui/material/TextField'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import CircularProgress from '@mui/material/CircularProgress'
import { db } from '@shared/lib/firebase'
import { COL, schoolPath, teacherAssignmentId } from '@shared/lib/schema'
import { assignmentChanges, planData, yearOverYear } from '@shared/lib/dutyPlan'
import { downloadDutyHwpx, downloadDutyPdf, printDuty } from './dutyPlanExport'
import { loadConfirmedPlan } from './dutyPlanRepo'
import { ACCENT } from './dutyUi'

/**
 * 결재 첨부 내보내기 — 한글(hwpx, 원본 양식) · 인쇄 · PDF. 기준일과 교장·교감 인원은 끝줄 인원 요약에 들어간다.
 * 작년 확정본이 있으면 '작년 대비 변경 요약'을 인쇄·PDF 맨 뒤에 붙일 수 있다.
 */
export function ExportDialog({ open, onClose, schoolId, plan, yearDoc }) {
  const [dateLabel, setDateLabel] = useState(`${plan.year}.3.1.`)
  const [admins, setAdmins] = useState(2)
  const [prev, setPrev] = useState(undefined)
  const [withDiff, setWithDiff] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    if (!open || prev !== undefined) return
    loadConfirmedPlan(schoolId, plan.year - 1).then(setPrev).catch(() => setPrev(null))
  }, [open, prev, schoolId, plan.year])

  const o = {
    data: planData(plan), year: plan.year, dateLabel, admins: Number(admins) || 0,
    classCounts: yearDoc?.classCounts, specialClasses: yearDoc?.specialClasses,
    diff: withDiff && prev ? { prevYear: plan.year - 1, ...yearOverYear(planData(prev), planData(plan)) } : null,
  }
  const run = async (kind) => {
    setBusy(kind); setError('')
    try {
      if (kind === 'hwpx') await downloadDutyHwpx(o)
      else if (kind === 'pdf') await downloadDutyPdf(o)
      else if (!printDuty(o)) setError('팝업이 막혔습니다. 브라우저 주소창의 팝업 허용을 눌러 주세요.')
    } catch (e) { setError(`만들지 못했습니다: ${e.message}`) } finally { setBusy('') }
  }
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>결재 첨부 · 인쇄</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          '부서별 업무분장'과 '부장교사 및 담임교사 명단'(부장·담임/부담임·교과부장)을 지금까지 저장된 내용으로 만듭니다.
        </Typography>
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <TextField size="small" label="기준일" value={dateLabel} onChange={(e) => setDateLabel(e.target.value)} sx={{ flex: 1 }} helperText="제목 괄호 안 — 비우면 생략" />
          <TextField size="small" type="number" label="교장·교감" value={admins} onChange={(e) => setAdmins(e.target.value)} sx={{ width: 100 }} helperText="전체 교원 수에 더함" />
        </Box>
        {prev && (
          <FormControlLabel control={<Checkbox size="small" checked={withDiff} onChange={(e) => setWithDiff(e.target.checked)} />}
            label={`인쇄·PDF에 ${plan.year - 1}학년도 대비 변경 요약 붙이기`} />
        )}
        {error && <Alert severity="error">{error}</Alert>}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, flexWrap: 'wrap', gap: 1 }}>
        <Button onClick={onClose}>닫기</Button>
        <Box sx={{ flex: 1 }} />
        <Button onClick={() => run('print')} disabled={Boolean(busy)}>인쇄</Button>
        <Button onClick={() => run('pdf')} disabled={Boolean(busy)}>{busy === 'pdf' ? 'PDF 만드는 중…' : 'PDF'}</Button>
        <Button variant="contained" disableElevation onClick={() => run('hwpx')} disabled={Boolean(busy)} sx={{ bgcolor: ACCENT }}>한글(hwpx)</Button>
      </DialogActions>
    </Dialog>
  )
}

const FIELD_LABEL = {
  department: '부서', positionLabel: '직함', duty: '업무',
  isHomeroom: '담임', homeroomGrade: '담임 학년', homeroomClassNo: '담임 반',
  isSubHomeroom: '부담임', subHomeroomGrade: '부담임 학년', subHomeroomClassNo: '부담임 반',
}
const show = (v) => (v === true ? '예' : v === false ? '아니오' : v === null || v === undefined || v === '' ? '—' : String(v))

/**
 * 확정본을 교직원 정보(teacherAssignments/{year}_{uid})에 반영 — 바뀌는 칸만 보여주고, 고른 사람만 쓴다(관리자·교감).
 * 교직원 관리·대상 지정(부서·담임 조건)·StudentHub 담임 판정이 이 값을 쓴다.
 */
export function ApplyAssignmentsDialog({ open, onClose, schoolId, plan }) {
  const [current, setCurrent] = useState(null)
  const [skip, setSkip] = useState(new Set())
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!open) return
    setCurrent(null); setResult(null); setError(''); setSkip(new Set())
    getDocs(query(collection(db, ...schoolPath(schoolId, COL.TEACHER_ASSIGNMENTS)), where('year', '==', plan.year)))
      .then((s) => setCurrent(new Map(s.docs.map((d) => [d.data().uid, d.data()]))))
      .catch((e) => setError(e.message))
  }, [open, schoolId, plan.year])
  const { changes, skipped } = useMemo(() => (current ? assignmentChanges(planData(plan), current) : { changes: [], skipped: [] }), [current, plan])

  const apply = async () => {
    setBusy(true); setError('')
    try {
      const list = changes.filter((c) => !skip.has(c.uid))
      for (let i = 0; i < list.length; i += 400) {
        const b = writeBatch(db)
        list.slice(i, i + 400).forEach((c) => {
          const fields = Object.fromEntries(Object.entries(c.fields).map(([k, v]) => [k, v.to]))
          b.set(doc(db, ...schoolPath(schoolId, COL.TEACHER_ASSIGNMENTS), teacherAssignmentId(plan.year, c.uid)),
            { uid: c.uid, year: plan.year, ...fields, updatedAt: serverTimestamp() }, { merge: true })
        })
        await b.commit()
      }
      setResult(list.length)
    } catch (e) {
      setError(e.code === 'permission-denied' ? '교직원 정보는 학교 관리자·교감만 바꿀 수 있습니다.' : `반영하지 못했습니다: ${e.message}`)
    } finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>{plan.year}학년도 교직원 정보에 반영</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          확정한 업무분장의 부서·직함·업무·담임·부담임을 교직원 관리({plan.year}학년도)에 씁니다. 바뀌는 칸만 보입니다 — 빼고 싶은 사람은 체크를 끄세요.
        </Typography>
        {error && <Alert severity="error">{error}</Alert>}
        {result !== null && <Alert severity="success">{result}명의 교직원 정보를 반영했습니다.</Alert>}
        {current === null && !error && <CircularProgress sx={{ alignSelf: 'center' }} />}
        {current && !changes.length && <Alert severity="info">교직원 정보와 다른 곳이 없습니다.</Alert>}
        {skipped.length > 0 && <Alert severity="warning">계정과 이어지지 않은 이름은 반영하지 않습니다: {skipped.join(', ')}</Alert>}
        {changes.map((c) => (
          <Box key={c.uid} sx={{ border: '1px solid #e2e8f0', borderRadius: 1.5, p: 1, opacity: skip.has(c.uid) ? 0.45 : 1 }}>
            <FormControlLabel sx={{ m: 0 }} control={<Checkbox size="small" checked={!skip.has(c.uid)}
              onChange={(e) => setSkip((s) => { const n = new Set(s); if (e.target.checked) n.delete(c.uid); else n.add(c.uid); return n })} />}
              label={<Typography sx={{ fontWeight: 800 }}>{c.name}</Typography>} />
            <Box sx={{ pl: 4, display: 'flex', flexDirection: 'column', gap: 0.25 }}>
              {Object.entries(c.fields).map(([k, v]) => (
                <Typography key={k} variant="body2"><Box component="span" sx={{ color: 'text.secondary', mr: 1 }}>{FIELD_LABEL[k] || k}</Box>{show(v.from)} → <b>{show(v.to)}</b></Typography>
              ))}
            </Box>
          </Box>
        ))}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>닫기</Button>
        <Button variant="contained" disableElevation disabled={busy || !changes.length || result !== null} onClick={apply} sx={{ bgcolor: ACCENT }}>
          {busy ? '반영 중…' : `${changes.filter((c) => !skip.has(c.uid)).length}명 반영`}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
