import { useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Autocomplete from '@mui/material/Autocomplete'
import InputBase from '@mui/material/InputBase'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import InventoryIcon from '@mui/icons-material/Inventory2Outlined'
import HistoryEduIcon from '@mui/icons-material/HistoryEdu'
import AddIcon from '@mui/icons-material/Add'
import {
  ROLE_TYPES, addTask, duplicateDuty, findTask, groupPlan, mergeStaffPool, moveDuty, moveTask, moveTasks, removeDutyKeepTasks,
  removeTask, roleTypeOf, staffKindOf, updateDuty, updateTask,
} from '@shared/lib/dutyPlan'
import { PersonPicker } from './AssignTabs'
import { Field, FieldLabel, SectionTitle, SelectField, outlinedSx } from './fields'
import { ACCENT, ACCENT_BG, ROLE_STYLE } from './dutyUi'

const where = (draft, dutyId) => {
  if (!dutyId) return { dept: '보관함', rest: '' }
  const d = draft.duties.find((x) => x.id === dutyId)
  const dept = draft.departments.find((x) => x.id === d?.deptId)
  return { dept: dept?.name || '보관함', rest: [d?.assigneeName, d?.title].filter(Boolean).join(' · ') }
}

/** 어디에 있는지 — 부서 꼬리표 + 성명·업무 */
function Crumb({ draft, dutyId, kind, onOpenDuty }) {
  const w = where(draft, dutyId)
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
      <Typography sx={{ fontSize: '0.68rem', fontWeight: 800, color: '#94a3b8' }}>{kind}</Typography>
      <Box sx={{ px: 0.75, py: 0.1, borderRadius: 10, bgcolor: ACCENT_BG, color: ACCENT, fontSize: '0.72rem', fontWeight: 800 }}>{w.dept}</Box>
      {w.rest && (
        <Typography onClick={onOpenDuty} sx={{ fontSize: '0.78rem', color: '#475569', cursor: onOpenDuty ? 'pointer' : 'default', '&:hover': onOpenDuty ? { color: ACCENT, textDecoration: 'underline' } : {} }}>
          {w.rest}
        </Typography>
      )}
    </Box>
  )
}

/** 여러 줄 붙여 넣기·Enter로 카드 추가 */
function AddCardInput({ onAdd, placeholder = '새 업무 내용 — Enter로 추가 · 여러 줄 붙여 넣으면 줄마다 카드' }) {
  const [text, setText] = useState('')
  const commit = (raw) => {
    const lines = String(raw).split('\n').map((s) => s.trim()).filter(Boolean)
    if (lines.length) onAdd(lines)
    setText('')
  }
  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75, p: 0.75, borderRadius: '10px', border: '1px dashed #d6dde6', bgcolor: '#fbfcfd' }}>
      <AddIcon sx={{ fontSize: 18, color: '#a3afbf', mt: 0.6 }} />
      <InputBase fullWidth multiline maxRows={4} value={text} placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onPaste={(e) => { const p = e.clipboardData.getData('text'); if (p.includes('\n')) { e.preventDefault(); commit(p) } }}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); commit(text) } }}
        sx={{ fontSize: '0.84rem', py: 0.4, '& textarea::placeholder': { fontSize: '0.74rem', color: '#a3afbf', opacity: 1 } }} />
    </Box>
  )
}

const actionSx = { p: 0.4, color: '#94a3b8', '&:hover': { color: ACCENT, bgcolor: ACCENT_BG } }

/** 업무 내용 카드 하나 고치기 */
function TaskEditor({ draft, at, change, onSelect, onRecord, rowOptions }) {
  const { task, dutyId } = at
  const set = (patch) => change((d) => updateTask(d, task.id, patch))
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.75 }}>
      <Crumb draft={draft} dutyId={dutyId} kind="업무 내용 카드" onOpenDuty={dutyId ? () => onSelect({ type: 'duty', id: dutyId }) : undefined} />
      {/* 카드처럼 보이는 본문 칸 */}
      <Box sx={{ borderRadius: '12px', border: `1px solid ${ACCENT}40`, bgcolor: '#fff', boxShadow: '0 1px 3px rgba(15,23,42,0.06)', overflow: 'hidden' }}>
        <Box sx={{ height: 4, bgcolor: ACCENT }} />
        <InputBase fullWidth multiline minRows={3} autoFocus value={task.text || ''} placeholder="업무 내용"
          onChange={(e) => set({ text: e.target.value.replace(/\n/g, ' ') })}
          sx={{ px: 1.5, py: 1.25, fontSize: '0.95rem', fontWeight: 700, lineHeight: 1.55, '& textarea::placeholder': { fontSize: '0.78rem', color: '#a3afbf', opacity: 1, fontWeight: 400 } }} />
        <Typography sx={{ px: 1.5, pb: 0.75, fontSize: '0.66rem', color: '#a3afbf' }}>결재 파일에는 쉼표로 이어서 들어갑니다</Typography>
      </Box>
      <Field label="메모" hint="편성 참고용 · 결재 파일에는 안 나감" multiline minRows={2} value={task.note || ''} placeholder="예: 내년엔 1학년부로 옮길지 검토"
        onChange={(e) => set({ note: e.target.value || undefined })} />
      <Box>
        <FieldLabel hint="이름·업무로 찾기">다른 줄로 옮기기</FieldLabel>
        <Autocomplete size="small" options={rowOptions} value={null}
          getOptionLabel={(o) => o.label} groupBy={(o) => o.dept}
          onChange={(_, v) => { if (v) change((d) => moveTask(d, task.id, v.id)) }}
          renderInput={(p) => <TextField {...p} placeholder="예: 하승철, 고사2" sx={outlinedSx} />} />
      </Box>
      <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', pt: 0.5 }}>
        {dutyId && <Button size="small" variant="outlined" startIcon={<HistoryEduIcon />} onClick={() => onRecord(dutyId, task.id)} sx={{ borderRadius: 10 }}>안내·인수인계 기록</Button>}
        {dutyId && <Button size="small" startIcon={<InventoryIcon />} onClick={() => change((d) => moveTask(d, task.id, ''))}>보관함으로</Button>}
        <Box sx={{ flex: 1 }} />
        <Button size="small" color="error" startIcon={<DeleteOutlineIcon />}
          onClick={() => { if (window.confirm(`'${task.text}' 카드를 지울까요?`)) { change((d) => removeTask(d, task.id)); onSelect(null) } }}>삭제</Button>
      </Box>
    </Box>
  )
}

/** 업무 줄 고치기 — 성명·업무·직급·부서·번호·메모와 그 줄의 카드들 */
function DutyEditor({ draft, duty, change, staff, onSelect, departments }) {
  const set = (patch) => change((d) => updateDuty(d, duty.id, patch))
  const tasks = duty.tasks || []
  const move = (i, dir) => { const t = tasks[i]; if (t) change((d) => moveTask(d, t.id, duty.id, i + dir + (dir > 0 ? 1 : 0))) }
  const role = ROLE_STYLE[duty.roleType]
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Crumb draft={draft} dutyId={duty.id} kind="업무 줄" />
      {/* 머리 — 성명·업무를 크게 */}
      <Box sx={{ p: 1.25, borderRadius: '12px', bgcolor: '#fff', border: '1px solid #e8edf3', boxShadow: '0 1px 3px rgba(15,23,42,0.05)', display: 'flex', flexDirection: 'column', gap: 1.25 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          {role && <Box sx={{ fontSize: '0.7rem', fontWeight: 800, px: 0.75, py: 0.15, borderRadius: 1, bgcolor: role.bg, color: role.fg }}>{duty.roleType}</Box>}
          <InputBase value={duty.title || ''} placeholder="업무 이름 (예: 고사1)"
            onChange={(e) => { const title = e.target.value; set({ title, ...(duty.roleType === roleTypeOf(duty.title) ? { roleType: roleTypeOf(title) } : {}) }) }}
            sx={{ flex: 1, fontSize: '1.05rem', fontWeight: 800, '& input::placeholder': { fontSize: '0.8rem', color: '#a3afbf', opacity: 1, fontWeight: 400 } }} />
        </Box>
        <Box>
          <FieldLabel hint="교직원 계정에서">성명</FieldLabel>
          <PersonPicker pool={draft.staffPool || []} staff={staff} placeholder="이름으로 찾기" sx={outlinedSx}
            value={duty.assigneeName ? { uid: duty.assigneeUid || null, name: duty.assigneeName } : null}
            onChange={(p) => change((d) => {
              const next = updateDuty(d, duty.id, { assigneeUid: p?.uid || null, assigneeName: p?.name || '' })
              return p?.name ? mergeStaffPool(next, [p]) : next
            })} />
        </Box>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 92px', gap: 1 }}>
        <SelectField label="부서" value={duty.deptId || ''} onChange={(e) => change((d) => moveDuty(d, duty.id, e.target.value))}>
          <MenuItem value="">보관함 (편성에서 뺌)</MenuItem>
          {departments.map((d) => <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>)}
        </SelectField>
        <SelectField label="직급" value={duty.roleType || '일반'} onChange={(e) => set({ roleType: e.target.value })}>
          {ROLE_TYPES.map((r) => <MenuItem key={r} value={r}>{r}</MenuItem>)}
        </SelectField>
      </Box>
      <Field label="번호 칸" hint={`직군: ${staffKindOf(duty.slotLabel)} · 숫자는 표에서 순서대로 다시 매김`} value={duty.slotLabel || ''}
        placeholder="비우면 교사 · 특수 · 교육실무사(교무) · 전문상담사" onChange={(e) => set({ slotLabel: e.target.value, staffKind: staffKindOf(e.target.value) })} />
      <Field label="메모" hint="편성 참고용" multiline minRows={1} value={duty.note || ''} placeholder="예: 고사2와 합칠지 논의" onChange={(e) => set({ note: e.target.value })} />

      <SectionTitle right={<Typography sx={{ fontSize: '0.7rem', color: '#94a3b8' }}>{tasks.length}장</Typography>}>주요 업무 내용</SectionTitle>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.6 }}>
        {tasks.map((t, i) => (
          <Box key={t.id} sx={{
            display: 'flex', alignItems: 'flex-start', gap: 0.5, pl: 0.75, pr: 0.25, py: 0.4, borderRadius: '10px',
            bgcolor: '#fff', border: '1px solid #e8edf3', borderLeft: `3px solid ${ACCENT}`,
            '&:hover .card-actions': { opacity: 1 }, '&:focus-within': { borderColor: `${ACCENT}80`, boxShadow: `0 0 0 3px ${ACCENT}14` },
          }}>
            <Typography sx={{ fontSize: '0.68rem', fontWeight: 800, color: '#a3afbf', mt: 0.65, minWidth: 14 }}>{i + 1}</Typography>
            <InputBase fullWidth multiline value={t.text || ''} onChange={(e) => change((d) => updateTask(d, t.id, { text: e.target.value.replace(/\n/g, ' ') }))}
              sx={{ fontSize: '0.84rem', lineHeight: 1.5, py: 0.35 }} />
            <Box className="card-actions" sx={{ display: 'flex', flexShrink: 0, opacity: 0.35, transition: 'opacity .12s' }}>
              <Tooltip title="위로"><span><IconButton size="small" sx={actionSx} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUpwardIcon sx={{ fontSize: 15 }} /></IconButton></span></Tooltip>
              <Tooltip title="아래로"><span><IconButton size="small" sx={actionSx} disabled={i === tasks.length - 1} onClick={() => move(i, 1)}><ArrowDownwardIcon sx={{ fontSize: 15 }} /></IconButton></span></Tooltip>
              <Tooltip title="카드 열기(메모·기록)"><IconButton size="small" sx={actionSx} onClick={() => onSelect({ type: 'task', id: t.id })}><HistoryEduIcon sx={{ fontSize: 15 }} /></IconButton></Tooltip>
              <Tooltip title="보관함으로"><IconButton size="small" sx={actionSx} onClick={() => change((d) => moveTask(d, t.id, ''))}><InventoryIcon sx={{ fontSize: 15 }} /></IconButton></Tooltip>
              <Tooltip title="삭제"><IconButton size="small" sx={{ ...actionSx, '&:hover': { color: '#dc2626', bgcolor: '#fef2f2' } }} onClick={() => window.confirm(`'${t.text}' 카드를 지울까요?`) && change((d) => removeTask(d, t.id))}><DeleteOutlineIcon sx={{ fontSize: 15 }} /></IconButton></Tooltip>
            </Box>
          </Box>
        ))}
      </Box>
      <AddCardInput onAdd={(lines) => change((d) => lines.reduce((acc, l) => addTask(acc, duty.id, l).data, d))} />

      <SectionTitle>줄</SectionTitle>
      <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
        <Button size="small" variant="outlined" sx={{ borderRadius: 10 }} onClick={() => { const r = duplicateDuty(draft, duty.id); change(() => r.data); onSelect({ type: 'duty', id: r.duty.id }) }}>아래에 줄 나누기</Button>
        {duty.deptId && <Button size="small" onClick={() => change((d) => moveDuty(d, duty.id, ''))}>줄을 보관함으로</Button>}
        <Box sx={{ flex: 1 }} />
        <Button size="small" color="error" onClick={() => {
          if (!window.confirm(`'${duty.title || '업무 줄'}' 줄을 지울까요? 이 줄의 업무 내용 카드는 보관함으로 옮깁니다.`)) return
          change((d) => removeDutyKeepTasks(d, duty.id)); onSelect(null)
        }}>줄 삭제</Button>
      </Box>
    </Box>
  )
}

/** 여러 장 고른 업무 내용 카드 — 한꺼번에 옮기기·보관함·삭제 */
function MultiEditor({ draft, ids, change, rowOptions, onClear, onSelect }) {
  const items = ids.map((id) => findTask(draft, id)).filter(Boolean)
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box sx={{ px: 1, py: 0.25, borderRadius: 10, bgcolor: ACCENT, color: '#fff', fontWeight: 800, fontSize: '0.8rem' }}>{items.length}장 선택</Box>
        <Typography sx={{ fontSize: '0.72rem', color: '#94a3b8' }}>Ctrl·Shift+클릭으로 더하고 빼기 · Esc로 풀기</Typography>
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {items.map(({ task, dutyId }) => (
          <Box key={task.id} onClick={() => onSelect({ type: 'task', id: task.id })}
            sx={{ px: 1, py: 0.6, borderRadius: '10px', bgcolor: '#fff', border: '1px solid #e8edf3', borderLeft: `3px solid ${ACCENT}`, cursor: 'pointer', '&:hover': { bgcolor: ACCENT_BG } }}>
            <Typography sx={{ fontSize: '0.84rem', fontWeight: 700 }}>{task.text}</Typography>
            <Typography sx={{ fontSize: '0.68rem', color: '#94a3b8' }}>{[where(draft, dutyId).dept, where(draft, dutyId).rest].filter(Boolean).join(' · ')}</Typography>
          </Box>
        ))}
      </Box>
      <Box>
        <FieldLabel hint="이름·업무로 찾기 — 그 줄 끝에 순서대로">한꺼번에 다른 줄로 옮기기</FieldLabel>
        <Autocomplete size="small" options={rowOptions} value={null}
          getOptionLabel={(o) => o.label} groupBy={(o) => o.dept}
          onChange={(_, v) => { if (v) change((d) => moveTasks(d, ids, v.id)) }}
          renderInput={(p) => <TextField {...p} placeholder="예: 하승철, 고사2" sx={outlinedSx} />} />
      </Box>
      <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
        <Button size="small" startIcon={<InventoryIcon />} onClick={() => change((d) => moveTasks(d, ids, ''))}>모두 보관함으로</Button>
        <Button size="small" onClick={onClear}>선택 풀기</Button>
        <Box sx={{ flex: 1 }} />
        <Button size="small" color="error" startIcon={<DeleteOutlineIcon />}
          onClick={() => { if (window.confirm(`고른 카드 ${items.length}장을 지울까요?`)) { change((d) => ids.reduce((acc, id) => removeTask(acc, id), d)); onClear() } }}>모두 삭제</Button>
      </Box>
    </Box>
  )
}

/**
 * 오른쪽 편집 칸 — 표에서 누른 카드·줄을 여기서 고친다(대화상자 대신, 표를 가리지 않게).
 * sel: { type: 'task' | 'duty', id } | null
 */
export default function InspectorPanel({ draft, sel, multiIds = [], change, staff, onSelect, onRecord, onClearMulti }) {
  const departments = useMemo(() => groupPlan(draft).categories.flatMap((c) => c.departments), [draft])
  const rowOptions = useMemo(() => departments.flatMap((dept) => dept.duties.map((d) => ({
    id: d.id, dept: dept.name, label: `${d.assigneeName || '—'} · ${d.title || '(업무)'}`,
  }))), [departments])
  const at = sel?.type === 'task' ? findTask(draft, sel.id) : null
  const duty = sel?.type === 'duty' ? draft.duties.find((d) => d.id === sel.id) : null

  if (multiIds.length > 1) {
    return <MultiEditor draft={draft} ids={multiIds} change={change} rowOptions={rowOptions} onClear={onClearMulti} onSelect={onSelect} />
  }
  if (at) return <TaskEditor draft={draft} at={at} change={change} onSelect={onSelect} onRecord={onRecord} rowOptions={rowOptions} />
  if (duty) return <DutyEditor draft={draft} duty={duty} change={change} staff={staff} onSelect={onSelect} departments={departments} />
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Box sx={{ p: 1.5, borderRadius: '12px', bgcolor: ACCENT_BG }}>
        <Typography sx={{ fontWeight: 800, color: ACCENT, mb: 0.75, fontSize: '0.9rem' }}>표에서 고칠 것을 누르세요</Typography>
        {[
          ['업무 내용 카드', '내용·메모 고치기, 다른 줄·보관함으로 옮기기'],
          ['성명 · 업무 칸', '담당자·업무명과 그 줄의 카드 목록 고치기'],
          ['카드 · 이름 끌기', '다른 줄로 바로 옮기기(두 쪽 사이도 됨) · 이름은 Ctrl+놓기로 복사'],
          ['업무 칸 ⋮⋮', '줄 전체를 다른 줄 앞·다른 부서로'],
        ].map(([k, v]) => (
          <Box key={k} sx={{ display: 'flex', gap: 1, py: 0.35 }}>
            <Typography sx={{ fontSize: '0.75rem', fontWeight: 800, color: '#7c2d12', minWidth: 92 }}>{k}</Typography>
            <Typography sx={{ fontSize: '0.75rem', color: '#57534e' }}>{v}</Typography>
          </Box>
        ))}
      </Box>
      <SectionTitle>보관함에 새 카드</SectionTitle>
      <AddCardInput onAdd={(lines) => change((d) => lines.reduce((acc, l) => addTask(acc, '', l).data, d))} placeholder="새 업무 내용 — 보관함에 넣고 표로 끌어 옮기기" />
    </Box>
  )
}
