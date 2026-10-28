import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import Radio from '@mui/material/Radio'
import RadioGroup from '@mui/material/RadioGroup'
import { CATEGORIES, ROLE_TYPES, clearAssignees, groupPlan, roleTypeOf, staffKindOf } from '@shared/lib/dutyPlan'
import { ACCENT } from './dutyUi'
import { PersonPicker } from './AssignTabs'

/**
 * 업무 줄 고치기 — 업무명·직급·부서·번호 칸·담당자·메모. 주요 업무 내용은 표에서 카드로 다룬다.
 * 직군(교사/실무사 등)은 번호 칸에서 정한다(숫자·특수 = 교사, 그 밖은 적은 이름 그대로 — 원본 표와 같은 규칙).
 * onSave(patch) / onDelete() / onDuplicate() — 나누기는 빈 줄을 바로 뒤에 만든다(카드를 끌어 나눈다)
 */
export function DutyDialog({ open, duty, departments, pool, staff, onClose, onSave, onDelete, onDuplicate }) {
  // pool이 있으면 담당자도 고른다
  const [f, setF] = useState(null)
  useEffect(() => {
    if (!duty) return
    setF({
      title: duty.title || '', roleType: duty.roleType || '일반', slotLabel: duty.slotLabel || '',
      note: duty.note || '', deptId: duty.deptId || '',
      assignee: duty.assigneeName ? { uid: duty.assigneeUid || null, name: duty.assigneeName } : null,
    })
  }, [duty])
  if (!duty || !f) return null
  const isNew = !duty.title && !(duty.tasks || []).length
  const save = () => onSave({
    title: f.title.trim(), roleType: f.roleType, slotLabel: f.slotLabel.trim(), staffKind: staffKindOf(f.slotLabel),
    note: f.note.trim(), deptId: f.deptId,
    ...(pool ? { assigneeUid: f.assignee?.uid || null, assigneeName: f.assignee?.name || '' } : {}),
  })
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>{isNew ? '새 업무 줄' : '업무 줄 고치기'}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <TextField autoFocus label="업무" value={f.title} sx={{ flex: 1 }} placeholder="예: 고사1, 교육과정기획, 학생부/출결"
            onChange={(e) => {
              const title = e.target.value
              // 직급을 직접 고르지 않았으면 업무명에서 따라간다(부장·…기획)
              setF((v) => ({ ...v, title, roleType: v.roleType === roleTypeOf(v.title) ? roleTypeOf(title) : v.roleType }))
            }} />
          <TextField select label="직급" value={f.roleType} onChange={(e) => setF({ ...f, roleType: e.target.value })} sx={{ width: 110 }}>
            {ROLE_TYPES.map((r) => <MenuItem key={r} value={r}>{r}</MenuItem>)}
          </TextField>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <TextField select label="부서" value={f.deptId} onChange={(e) => setF({ ...f, deptId: e.target.value })} sx={{ flex: 1 }}>
            <MenuItem value="">보관함 (편성에서 뺌)</MenuItem>
            {departments.map((d) => <MenuItem key={d.id} value={d.id}>{d.category} · {d.name}</MenuItem>)}
          </TextField>
          <TextField label="번호 칸" value={f.slotLabel} onChange={(e) => setF({ ...f, slotLabel: e.target.value })} sx={{ width: 190 }}
            helperText={`직군: ${staffKindOf(f.slotLabel)} · 숫자는 표에서 순서대로 다시 매김`} placeholder="1 · 특수 · 교육실무사(교무)" />
        </Box>
        {pool && (
          <Box>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>성명(담당자)</Typography>
            <PersonPicker pool={pool} staff={staff} value={f.assignee} placeholder="담당 교직원" onChange={(p) => setF({ ...f, assignee: p })} />
          </Box>
        )}
        <TextField label="메모 (편성 참고용)" multiline minRows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })}
          placeholder="예: 내년부터 고사2와 합칠지 논의 필요" />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        {!isNew && <Button color="error" onClick={onDelete}>줄 삭제</Button>}
        {!isNew && onDuplicate && <Button onClick={onDuplicate}>아래에 줄 나누기</Button>}
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose}>취소</Button>
        <Button variant="contained" disableElevation onClick={save} disabled={!f.title.trim()} sx={{ bgcolor: ACCENT }}>저장</Button>
      </DialogActions>
    </Dialog>
  )
}

/**
 * 업무 내용 카드 고치기 — 내용·메모. 옮기기는 표에서 끌어서. onRecord가 있으면 '기록 보기'(안내·인수인계)
 */
export function TaskDialog({ open, task, where, onClose, onSave, onDelete, onToTray, onRecord }) {
  const [f, setF] = useState({ text: '', note: '' })
  useEffect(() => { if (task) setF({ text: task.text || '', note: task.note || '' }) }, [task])
  if (!task) return null
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>업무 내용 카드</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
        {where && <Typography variant="caption" sx={{ color: 'text.secondary' }}>{where}</Typography>}
        <TextField autoFocus label="업무 내용" multiline minRows={2} value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })}
          helperText="결재 첨부 파일에는 쉼표로 이어서 들어갑니다" />
        <TextField label="메모 (편성 참고용 — 결재 파일에는 안 나감)" multiline minRows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, flexWrap: 'wrap', gap: 0.5 }}>
        <Button color="error" onClick={onDelete}>삭제</Button>
        {onToTray && <Button onClick={onToTray}>보관함으로</Button>}
        {onRecord && <Button onClick={onRecord}>기록 보기</Button>}
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose}>취소</Button>
        <Button variant="contained" disableElevation disabled={!f.text.trim()} sx={{ bgcolor: ACCENT }}
          onClick={() => onSave({ text: f.text.replace(/\s+/g, ' ').trim(), note: f.note.trim() || undefined })}>저장</Button>
      </DialogActions>
    </Dialog>
  )
}

/** 부서 만들기·고치기 — 이름·구분. 지우면 그 부서 카드는 보관함으로 */
export function DeptDialog({ open, dept, onClose, onSave, onDelete }) {
  const [f, setF] = useState({ name: '', category: CATEGORIES[0] })
  useEffect(() => { if (open) setF({ name: dept?.name || '', category: dept?.category || CATEGORIES[0] }) }, [open, dept])
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>{dept ? '부서 고치기' : '새 부서'}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
        <TextField autoFocus label="부서 이름" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="예: 교무기획부, 1학년부" />
        <TextField select label="구분" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
          {CATEGORIES.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
        </TextField>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        {dept && <Button color="error" onClick={onDelete}>부서 삭제</Button>}
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose}>취소</Button>
        <Button variant="contained" disableElevation disabled={!f.name.trim()} onClick={() => onSave({ name: f.name.trim(), category: f.category })} sx={{ bgcolor: ACCENT }}>저장</Button>
      </DialogActions>
    </Dialog>
  )
}

/** 단계 결정 — 확정이면 인사자문위원회 결정일 등 메모를 받는다 */
export function StageDialog({ open, target, onClose, onConfirm }) {
  const [note, setNote] = useState('')
  useEffect(() => { if (open) setNote('') }, [open])
  if (!target) return null
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>{target.title}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pt: '8px !important' }}>
        <Typography variant="body2">{target.desc}</Typography>
        <TextField label="기록 메모" value={note} onChange={(e) => setNote(e.target.value)} placeholder={target.placeholder} />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>취소</Button>
        <Button variant="contained" disableElevation onClick={() => onConfirm(note.trim())} sx={{ bgcolor: ACCENT }}>{target.action}</Button>
      </DialogActions>
    </Dialog>
  )
}

/**
 * 이름 일괄 빼기 — 고른 부서 줄의 성명을 한꺼번에 비운다(줄·업무 내용 카드는 그대로). 담임·부담임·교과부장도 함께 비울 수 있다.
 * 새 학년도 업무분장안을 작년 확정본에서 시작했을 때 이름만 지우고 다시 배치하려고. onApply(fn) — fn(data) → data
 */
export function ClearNamesDialog({ open, data, onClose, onApply }) {
  const depts = groupPlan(data).categories.flatMap((c) => c.departments)
  const [scope, setScope] = useState('all')
  const [picked, setPicked] = useState(() => new Set())
  const [homerooms, setHomerooms] = useState(false)
  const [heads, setHeads] = useState(false)
  useEffect(() => { if (open) { setScope('all'); setPicked(new Set()); setHomerooms(false); setHeads(false) } }, [open])
  const ids = scope === 'all' ? null : picked
  const count = (data.duties || []).filter((d) => d.assigneeName && (ids ? ids.has(d.deptId) : true)).length
  const hrCount = homerooms ? (data.homerooms || []).reduce((n, h) => n + (h.homeroomName ? 1 : 0) + (h.subHomeroomName ? 1 : 0), 0) : 0
  const shCount = heads ? (data.subjectHeads || []).filter((x) => x.name).length : 0
  const total = count + hrCount + shCount
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>이름 일괄 빼기</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1, pt: '8px !important' }}>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>성명만 비웁니다. 업무 줄과 주요 업무 내용 카드는 그대로 남습니다. 잘못 뺐으면 '기록'에서 되돌릴 수 있습니다.</Typography>
        <RadioGroup value={scope} onChange={(e) => setScope(e.target.value)}>
          <FormControlLabel value="all" control={<Radio size="small" />} label="모든 부서(보관함 줄 포함)" />
          <FormControlLabel value="some" control={<Radio size="small" />} label="고른 부서만" />
        </RadioGroup>
        {scope === 'some' && (
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', pl: 3 }}>
            {depts.map((d) => (
              <FormControlLabel key={d.id} sx={{ '& .MuiFormControlLabel-label': { fontSize: '0.85rem' } }}
                control={<Checkbox size="small" checked={picked.has(d.id)}
                  onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(d.id); else n.delete(d.id); return n })} />}
                label={d.name} />
            ))}
          </Box>
        )}
        <FormControlLabel control={<Checkbox size="small" checked={homerooms} onChange={(e) => setHomerooms(e.target.checked)} />} label="담임·부담임도 비우기" />
        <FormControlLabel control={<Checkbox size="small" checked={heads} onChange={(e) => setHeads(e.target.checked)} />} label="교과부장도 비우기" />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Typography variant="caption" sx={{ color: 'text.secondary', mr: 'auto' }}>
          {`성명 ${count}칸${homerooms ? ` · 담임 ${hrCount}칸` : ''}${heads ? ` · 교과부장 ${shCount}칸` : ''}`}
        </Typography>
        <Button onClick={onClose}>취소</Button>
        <Button variant="contained" color="error" disableElevation disabled={!total || (scope === 'some' && !picked.size)}
          onClick={() => { onApply((d) => clearAssignees(d, { deptIds: ids, homerooms, subjectHeads: heads })); onClose() }}>
          {total}칸 비우기
        </Button>
      </DialogActions>
    </Dialog>
  )
}
