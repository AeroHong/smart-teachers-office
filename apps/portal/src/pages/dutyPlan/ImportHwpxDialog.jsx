import { useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Alert from '@mui/material/Alert'
import TextField from '@mui/material/TextField'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Autocomplete from '@mui/material/Autocomplete'
import Radio from '@mui/material/Radio'
import RadioGroup from '@mui/material/RadioGroup'
import FormControlLabel from '@mui/material/FormControlLabel'
import Chip from '@mui/material/Chip'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import { applyNameMatches, summarizeStaff, summaryLine } from '@shared/lib/dutyPlan'
import { matchTeacherNames } from '../evalplan/teacherMatch'
import { readDutyHwpx } from './dutyPlanHwpxImport'
import { createPlan, loadYear, recordHolders, saveYear } from './dutyPlanRepo'
import { ACCENT } from './dutyUi'

/** 담임 명단에서 학년별 학급 수·특수학급 */
function classLayout(homerooms) {
  const classCounts = {}
  const specialClasses = {}
  for (const h of homerooms || []) {
    if (h.classNo === '특수') specialClasses[h.grade] = true
    else classCounts[h.grade] = Math.max(classCounts[h.grade] || 0, Number(h.classNo) || 0)
  }
  return { classCounts, specialClasses }
}

/**
 * 한글(hwpx) 업무분장표 가져오기(관리자) — 이미 결재된 업무분장은 확정본으로(업무 기록·역대 담당자가 여기서 시작),
 * 아직 고칠 것이면 1차 초안으로. 이름은 교직원 명단과 맞춰 uid를 붙이고, 못 맞춘 이름은 이름 자리로 남는다.
 */
export default function ImportHwpxDialog({ open, onClose, schoolId, defaultYear, staff, defaultEditors, by, onDone }) {
  const [file, setFile] = useState(null)
  const [parsed, setParsed] = useState(null)
  const [year, setYear] = useState(defaultYear)
  const [mode, setMode] = useState('confirmed')
  const [manual, setManual] = useState({}) // 이름 → uid(직접 고른 것)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const reset = () => { setFile(null); setParsed(null); setManual({}); setError(''); setBusy(false) }
  const close = () => { reset(); onClose() }

  const pick = async (f) => {
    if (!f) return
    reset()
    setFile(f)
    setBusy(true)
    try {
      const r = await readDutyHwpx(f)
      setParsed(r)
      const y = r.title.match(/(20\d\d)\s*학년도/)
      if (y) setYear(Number(y[1]))
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  const matches = useMemo(() => (parsed ? matchTeacherNames(parsed.staffPool.map((p) => p.name), staff) : []), [parsed, staff])
  const uidByName = useMemo(() => {
    const m = new Map()
    for (const r of matches) { const uid = manual[r.name] ?? r.uid; if (uid) m.set(r.name, uid) }
    return m
  }, [matches, manual])
  const unresolved = matches.filter((r) => r.status !== 'matched')
  const sum = parsed ? summarizeStaff(parsed) : null
  const staffById = useMemo(() => new Map(staff.map((s) => [s.uid, s])), [staff])

  const run = async () => {
    setBusy(true); setError('')
    try {
      const data = applyNameMatches(parsed, uidByName)
      const confirmed = mode === 'confirmed'
      const id = await createPlan({
        schoolId, year, kind: 'assign', stage: confirmed ? 'confirmed' : 'draft',
        name: confirmed ? '업무분장' : '업무분장 (hwpx 초안)', data, by,
        extra: {
          importedFrom: file?.name || '',
          confirmations: confirmed ? [{ stage: 'confirmed', versionNo: 0, at: Date.now(), by, note: `한글 파일에서 가져옴 — ${parsed.title || file?.name || ''}` }] : [],
        },
      })
      const yd = await loadYear(schoolId, year)
      await saveYear(schoolId, year, {
        ...classLayout(data.homerooms),
        ...(yd ? {} : { editorUids: defaultEditors }),
        ...(confirmed ? { confirmedPlanId: id } : {}),
      })
      if (confirmed) await recordHolders(schoolId, { ...data, year }, (uid) => staffById.get(uid)?.name || '')
      reset()
      onDone(id, year)
    } catch (e) {
      setError(`가져오지 못했습니다: ${e.message}`)
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onClose={close} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>한글(hwpx) 업무분장표 가져오기</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          '부서별 업무분장' 표(구분·부서·성명·담임·업무·주요 업무 내용)와 담임/부담임·교과부장 명단을 읽습니다. 표 양식이 바뀌었으면 결과를 꼭 확인하세요.
        </Typography>
        <Button component="label" variant="outlined" startIcon={<UploadFileIcon />} disabled={busy} sx={{ alignSelf: 'flex-start' }}>
          {file ? file.name : '파일 고르기 (.hwpx)'}
          <input type="file" accept=".hwpx" hidden onChange={(e) => pick(e.target.files?.[0])} />
        </Button>
        {error && <Alert severity="error">{error}</Alert>}

        {parsed && (
          <>
            <Box sx={{ p: 1.5, bgcolor: '#f8fafc', borderRadius: 1.5, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              <Typography sx={{ fontWeight: 800 }}>{parsed.title || '(제목 없음)'}</Typography>
              <Typography variant="body2">
                부서 {parsed.departments.length} · 업무 카드 {parsed.duties.length} · 담임 칸 {parsed.homerooms.length} · 교과부장 {parsed.subjectHeads.length}
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>{summaryLine(sum)}</Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>{parsed.departments.map((d) => d.name).join(' · ')}</Typography>
            </Box>
            {parsed.warnings.map((w) => <Alert key={w} severity="warning" sx={{ py: 0 }}>{w}</Alert>)}

            <Box>
              <Typography sx={{ fontWeight: 800, mb: 0.5 }}>
                이름 맞추기 — {matches.length - unresolved.length}/{matches.length}명 자동
              </Typography>
              {unresolved.length > 0 ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    교직원 명단에서 찾지 못한 이름입니다. 고르지 않으면 이름 자리로 남고(전출·계정 없음 등), 나중에 인원 배치에서 연결할 수 있습니다.
                  </Typography>
                  {unresolved.map((r) => (
                    <Box key={r.name} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography sx={{ width: 72, fontWeight: 700 }}>{r.name}</Typography>
                      <Chip size="small" label={r.status === 'ambiguous' ? '동명이인' : '없음'} color={r.status === 'ambiguous' ? 'warning' : 'default'} />
                      <Autocomplete size="small" sx={{ flex: 1 }}
                        options={r.candidateUids.length ? staff.filter((s) => r.candidateUids.includes(s.uid)) : staff}
                        value={staffById.get(manual[r.name]) || null}
                        getOptionLabel={(s) => `${s.name}${s.department ? ` (${s.department})` : ''}`}
                        isOptionEqualToValue={(a, b) => a.uid === b.uid}
                        onChange={(_, v) => setManual((m) => ({ ...m, [r.name]: v?.uid || null }))}
                        renderInput={(p) => <TextField {...p} placeholder="교직원 계정 고르기" />} />
                    </Box>
                  ))}
                </Box>
              ) : <Typography variant="body2" sx={{ color: '#15803d' }}>모든 이름을 교직원 계정과 맞췄습니다.</Typography>}
            </Box>

            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
              <TextField size="small" type="number" label="학년도" value={year} onChange={(e) => setYear(Number(e.target.value))} sx={{ width: 120 }} />
              <RadioGroup row value={mode} onChange={(e) => setMode(e.target.value)}>
                <FormControlLabel value="confirmed" control={<Radio size="small" />} label="확정본으로 (이미 결재됨)" />
                <FormControlLabel value="draft" control={<Radio size="small" />} label="1차 초안으로" />
              </RadioGroup>
            </Box>
            {mode === 'confirmed' && (
              <Typography variant="caption" sx={{ color: 'text.secondary', mt: -1 }}>
                확정본은 교직원 누구나 보고, 업무 카드마다 업무 기록(역대 담당자·안내·인수인계)이 만들어집니다. 교직원 정보(부서·담임)는 바꾸지 않습니다.
              </Typography>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={close}>취소</Button>
        <Button variant="contained" disableElevation disabled={!parsed || busy || !year} onClick={run} sx={{ bgcolor: ACCENT }}>
          {busy ? '가져오는 중…' : '가져오기'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
