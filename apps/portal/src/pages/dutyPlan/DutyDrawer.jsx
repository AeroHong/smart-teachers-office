import { useEffect, useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Drawer from '@mui/material/Drawer'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import Tabs from '@mui/material/Tabs'
import Tab from '@mui/material/Tab'
import Chip from '@mui/material/Chip'
import Alert from '@mui/material/Alert'
import MenuItem from '@mui/material/MenuItem'
import Divider from '@mui/material/Divider'
import CloseIcon from '@mui/icons-material/Close'
import EditIcon from '@mui/icons-material/Edit'
import LinkIcon from '@mui/icons-material/Link'
import { useAuth } from '@shared/contexts/AuthContext'
import { addNote, deleteNote, saveGuide, subscribeCatalog, subscribeNotes, updateNote } from './dutyPlanRepo'
import { ACCENT, ACCENT_BG, ROLE_STYLE, fmtTime, markOf } from './dutyUi'
import { normalizeTasks } from '@shared/lib/dutyPlan'

// 학년도 달 순서(3월 → 2월)
const MONTHS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2]
const NOTE_KINDS = ['인수인계', '메모']
const emptyGuide = { overview: '', monthly: [], tips: '', links: [] }

function GuideView({ guide }) {
  const g = { ...emptyGuide, ...(guide || {}) }
  const monthly = MONTHS.map((m) => ({ month: m, text: (g.monthly || []).find((x) => x.month === m)?.text || '' })).filter((x) => x.text)
  const empty = !g.overview && !monthly.length && !g.tips && !(g.links || []).length
  if (empty) return <Typography variant="body2" sx={{ color: 'text.secondary', py: 2 }}>아직 적힌 안내가 없습니다. 담당 선생님이 이 업무의 개요·월별 할 일·유의사항을 적어 두면 다음 담당자에게 그대로 이어집니다.</Typography>
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {g.overview && <Box><Typography variant="subtitle2" sx={{ fontWeight: 800 }}>개요</Typography><Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{g.overview}</Typography></Box>}
      {monthly.length > 0 && (
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 0.5 }}>월별 할 일</Typography>
          {monthly.map((x) => (
            <Box key={x.month} sx={{ display: 'flex', gap: 1, py: 0.4, borderBottom: '1px dashed #e2e8f0' }}>
              <Typography variant="body2" sx={{ width: 36, flexShrink: 0, fontWeight: 800, color: ACCENT }}>{x.month}월</Typography>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{x.text}</Typography>
            </Box>
          ))}
        </Box>
      )}
      {g.tips && <Box><Typography variant="subtitle2" sx={{ fontWeight: 800 }}>유의사항</Typography><Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{g.tips}</Typography></Box>}
      {(g.links || []).length > 0 && (
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>관련 자료</Typography>
          {g.links.map((l, i) => (
            <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <LinkIcon fontSize="small" sx={{ color: 'text.secondary' }} />
              <Typography variant="body2" component="a" href={l.url} target="_blank" rel="noreferrer" sx={{ color: '#2563eb' }}>{l.label || l.url}</Typography>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  )
}

function GuideEditor({ guide, onCancel, onSave }) {
  const [g, setG] = useState(() => ({ ...emptyGuide, ...(guide || {}), links: [...(guide?.links || [])] }))
  const [saving, setSaving] = useState(false)
  const monthText = (m) => (g.monthly || []).find((x) => x.month === m)?.text || ''
  const setMonth = (m, text) => setG((v) => ({ ...v, monthly: [...(v.monthly || []).filter((x) => x.month !== m), { month: m, text }].filter((x) => x.text.trim()) }))
  const setLink = (i, patch) => setG((v) => ({ ...v, links: v.links.map((l, j) => (j === i ? { ...l, ...patch } : l)) }))
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <TextField label="개요" multiline minRows={3} value={g.overview} onChange={(e) => setG({ ...g, overview: e.target.value })}
        placeholder="이 업무가 무엇이고, 누구와 함께 하며, 결과물이 무엇인지" />
      <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>월별 할 일 <Typography component="span" variant="caption" sx={{ color: 'text.secondary' }}>— 할 일이 있는 달만 적으세요</Typography></Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr', gap: 0.75 }}>
        {MONTHS.map((m) => (
          <TextField key={m} size="small" label={`${m}월`} value={monthText(m)} onChange={(e) => setMonth(m, e.target.value)} multiline maxRows={4} />
        ))}
      </Box>
      <TextField label="유의사항" multiline minRows={2} value={g.tips} onChange={(e) => setG({ ...g, tips: e.target.value })}
        placeholder="놓치기 쉬운 것, 작년에 겪은 문제, 연락처 등" />
      <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>관련 자료 링크</Typography>
      {g.links.map((l, i) => (
        <Box key={i} sx={{ display: 'flex', gap: 0.75 }}>
          <TextField size="small" label="이름" value={l.label} onChange={(e) => setLink(i, { label: e.target.value })} sx={{ width: 140 }} />
          <TextField size="small" label="주소" value={l.url} onChange={(e) => setLink(i, { url: e.target.value })} sx={{ flex: 1 }} />
          <IconButton size="small" onClick={() => setG({ ...g, links: g.links.filter((_, j) => j !== i) })}><CloseIcon fontSize="small" /></IconButton>
        </Box>
      ))}
      <Button size="small" onClick={() => setG({ ...g, links: [...g.links, { label: '', url: '' }] })} sx={{ alignSelf: 'flex-start' }}>링크 추가</Button>
      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
        <Button onClick={onCancel}>취소</Button>
        <Button variant="contained" disableElevation disabled={saving} sx={{ bgcolor: ACCENT }}
          onClick={async () => {
            setSaving(true)
            try { await onSave({ ...g, links: g.links.filter((l) => l.url.trim()) }) } finally { setSaving(false) }
          }}>저장</Button>
      </Box>
    </Box>
  )
}

function Notes({ schoolId, dutyKey, year, canWrite, isAdmin, me }) {
  const [notes, setNotes] = useState(null)
  const [draft, setDraft] = useState({ kind: '인수인계', text: '' })
  const [editing, setEditing] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => subscribeNotes(schoolId, dutyKey, setNotes, (e) => setError(e.message)), [schoolId, dutyKey])
  const byYear = useMemo(() => {
    const m = new Map()
    for (const n of notes || []) {
      if (!m.has(n.year)) m.set(n.year, [])
      m.get(n.year).push(n)
    }
    return [...m.entries()].sort((a, b) => b[0] - a[0])
  }, [notes])
  const submit = async () => {
    if (!draft.text.trim()) return
    try { await addNote(schoolId, dutyKey, { year, kind: draft.kind, text: draft.text.trim() }, me); setDraft({ ...draft, text: '' }) } catch (e) { setError(`저장하지 못했습니다: ${e.message}`) }
  }
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
      {canWrite && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, p: 1.25, border: '1px solid #e2e8f0', borderRadius: 1.5 }}>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField select size="small" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })} sx={{ width: 120 }}>
              {NOTE_KINDS.map((k) => <MenuItem key={k} value={k}>{k}</MenuItem>)}
            </TextField>
            <Typography variant="caption" sx={{ color: 'text.secondary', alignSelf: 'center' }}>{year}학년도 기록으로 남습니다</Typography>
          </Box>
          <TextField multiline minRows={3} size="small" value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })}
            placeholder={draft.kind === '인수인계' ? '다음 담당자에게 넘길 것 — 진행 중인 일, 파일 위치, 연락처, 바꾸면 좋을 점' : '업무를 하며 남겨 둘 메모'} />
          <Button variant="contained" disableElevation size="small" onClick={submit} disabled={!draft.text.trim()} sx={{ alignSelf: 'flex-end', bgcolor: ACCENT }}>남기기</Button>
        </Box>
      )}
      {notes === null ? null : !notes.length ? (
        <Typography variant="body2" sx={{ color: 'text.secondary', py: 1 }}>아직 기록이 없습니다.</Typography>
      ) : byYear.map(([y, list]) => (
        <Box key={y}>
          <Typography sx={{ fontWeight: 800, color: ACCENT, fontSize: '0.85rem', mb: 0.5 }}>{y}학년도</Typography>
          {list.map((n) => (
            <Box key={n.id} sx={{ py: 1, borderBottom: '1px solid #f1f5f9' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Chip size="small" label={n.kind} sx={{ height: 20, fontSize: '0.7rem', bgcolor: n.kind === '인수인계' ? ACCENT_BG : '#f1f5f9' }} />
                <Typography variant="caption" sx={{ fontWeight: 700 }}>{n.by?.name}</Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>{fmtTime(n.createdAt)}{n.updatedAt ? ' (고침)' : ''}</Typography>
                <Box sx={{ flex: 1 }} />
                {n.by?.uid === me.uid && editing?.id !== n.id && <Button size="small" onClick={() => setEditing({ id: n.id, text: n.text, kind: n.kind })}>고치기</Button>}
                {(n.by?.uid === me.uid || isAdmin) && (
                  <Button size="small" color="error" onClick={() => window.confirm('이 기록을 지울까요?') && deleteNote(schoolId, dutyKey, n.id).catch((e) => setError(e.message))}>지우기</Button>
                )}
              </Box>
              {editing?.id === n.id ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, mt: 0.75 }}>
                  <TextField multiline minRows={2} size="small" value={editing.text} onChange={(e) => setEditing({ ...editing, text: e.target.value })} />
                  <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                    <Button size="small" onClick={() => setEditing(null)}>취소</Button>
                    <Button size="small" variant="contained" disableElevation disabled={!editing.text.trim()}
                      onClick={() => updateNote(schoolId, dutyKey, n.id, { text: editing.text.trim(), kind: editing.kind }).then(() => setEditing(null)).catch((e) => setError(e.message))}>저장</Button>
                  </Box>
                </Box>
              ) : (
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mt: 0.5 }}>{n.text}</Typography>
              )}
            </Box>
          ))}
        </Box>
      ))}
    </Box>
  )
}

/**
 * 업무 줄 자세히 — 이번 편성안의 성명·담임·업무와 업무 내용 카드들, 고른 카드의 해를 넘어 이어지는 기록
 * (dutyCatalog/{카드 key}: 안내·인수인계·역대 담당자). 카드를 다른 선생님 줄로 옮겨도 기록은 카드를 따라간다.
 * 기록은 서랍을 열었을 때 고른 카드 하나만 구독한다(목록 화면이 카드 수만큼 읽지 않게).
 * @param {{ plan, duty, taskId?, onClose, onEdit?, actions? }} p onEdit이 있으면(편집 화면) '줄 고치기' 버튼,
 *   actions(duty)는 머리 아래에 덧붙일 버튼(희망원의 '1지망으로' 등)
 */
export default function DutyDrawer({ plan, duty: rawDuty, taskId, onClose, onEdit, actions }) {
  const { user, userName, schoolId, isAdmin, isSuperAdmin, isPrincipal, isHeadmaster } = useAuth()
  const me = { uid: user?.uid, name: userName || user?.email || '' }
  const dutyAdmin = isAdmin || isSuperAdmin || isPrincipal || isHeadmaster
  const [tab, setTab] = useState('guide')
  const [catalog, setCatalog] = useState(undefined)
  const [editingGuide, setEditingGuide] = useState(false)
  const [error, setError] = useState('')
  const [picked, setPicked] = useState(null)
  const duty = useMemo(() => (rawDuty ? { ...rawDuty, tasks: normalizeTasks(rawDuty) } : null), [rawDuty])
  useEffect(() => { setPicked(taskId || null) }, [rawDuty?.id, taskId])
  const task = duty ? (duty.tasks.find((t) => t.id === picked) || duty.tasks[0] || null) : null
  const key = task?.key

  useEffect(() => {
    setCatalog(undefined); setEditingGuide(false); setError('')
    if (!schoolId || !key) return undefined
    return subscribeCatalog(schoolId, key, setCatalog, () => setCatalog(null))
  }, [schoolId, key])

  if (!duty) return null
  const dept = (plan.departments || []).find((d) => d.id === duty.deptId)
  const role = ROLE_STYLE[duty.roleType]
  const mark = markOf(plan, duty)
  const holder = (catalog?.holderUids || []).includes(me.uid)
  const canWrite = Boolean(catalog) && (dutyAdmin || holder)
  const holders = [...(catalog?.holders || [])].sort((a, b) => b.year - a.year)

  return (
    <Drawer anchor="right" open={Boolean(duty)} onClose={onClose} PaperProps={{ sx: { width: { xs: '100%', sm: 480 } } }}>
      <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>{dept?.category} · {dept?.name || '보관함'}</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              {role && <Box component="span" sx={{ fontSize: '0.75rem', fontWeight: 800, px: 0.75, borderRadius: 0.75, bgcolor: role.bg, color: role.fg }}>{duty.roleType}</Box>}
              <Typography variant="h6" sx={{ fontWeight: 800 }}>{duty.title || '(업무명 없음)'}</Typography>
            </Box>
          </Box>
          {onEdit && <Button size="small" startIcon={<EditIcon />} onClick={() => onEdit(duty)}>줄 고치기</Button>}
          <IconButton onClick={onClose}><CloseIcon /></IconButton>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.25, bgcolor: '#f8fafc', borderRadius: 1.5 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>{plan.year}학년도 담당</Typography>
          <Typography sx={{ fontWeight: 800 }}>{duty.assigneeName || '미정'}</Typography>
          {mark && <Chip size="small" label={mark === '비' ? '비담임' : `${mark}임`} sx={{ height: 20 }} />}
          {duty.staffKind && duty.staffKind !== '교사' && <Chip size="small" label={duty.staffKind} sx={{ height: 20 }} />}
        </Box>

        {actions?.(duty)}
        {duty.note && <Alert severity="info" sx={{ py: 0 }}>{duty.note}</Alert>}

        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 0.5 }}>주요 업무 내용 <Typography component="span" variant="caption" sx={{ color: 'text.secondary' }}>— 눌러서 그 업무의 기록 보기</Typography></Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
            {duty.tasks.map((t) => (
              <Box key={t.id} onClick={() => setPicked(t.id)}
                sx={{
                  px: 0.9, py: 0.35, borderRadius: 1, fontSize: '0.82rem', cursor: 'pointer',
                  border: `1px solid ${task?.id === t.id ? ACCENT : '#e2e8f0'}`, bgcolor: task?.id === t.id ? ACCENT_BG : '#f8fafc',
                  fontWeight: task?.id === t.id ? 700 : 400,
                }}>{t.text}</Box>
            ))}
            {!duty.tasks.length && <Typography variant="body2" sx={{ color: 'text.secondary' }}>업무 내용이 없습니다.</Typography>}
          </Box>
        </Box>

        <Divider />
        {task && (
          <Box sx={{ p: 1.25, borderRadius: 1.5, bgcolor: ACCENT_BG }}>
            <Typography sx={{ fontWeight: 800, color: ACCENT }}>{task.text}</Typography>
            {task.note && <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.25, whiteSpace: 'pre-wrap' }}>{task.note}</Typography>}
          </Box>
        )}
        {task && catalog === null && (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            이 업무 내용의 기록은 업무분장이 확정되면 만들어집니다. 확정 뒤에는 담당 선생님이 업무 안내와 인수인계를 이어서 적을 수 있습니다.
          </Typography>
        )}
        {task && catalog && (
          <>
            <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth" sx={{ minHeight: 36, '& .MuiTab-root': { minHeight: 36, fontWeight: 700 } }}>
              <Tab value="guide" label="업무 안내" />
              <Tab value="notes" label="인수인계 기록" />
              <Tab value="holders" label={`역대 담당자 ${holders.length}`} />
            </Tabs>
            {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
            {tab === 'guide' && (editingGuide ? (
              <GuideEditor guide={catalog.guide} onCancel={() => setEditingGuide(false)}
                onSave={async (g) => {
                  try { await saveGuide(schoolId, key, g, me); setEditingGuide(false) } catch (e) { setError(`저장하지 못했습니다: ${e.message}`) }
                }} />
            ) : (
              <Box>
                {canWrite && <Button size="small" startIcon={<EditIcon />} onClick={() => setEditingGuide(true)} sx={{ float: 'right' }}>안내 고치기</Button>}
                <GuideView guide={catalog.guide} />
                {catalog.updatedBy?.name && <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1 }}>마지막 수정 {catalog.updatedBy.name} {fmtTime(catalog.updatedAt)}</Typography>}
              </Box>
            ))}
            {tab === 'notes' && <Notes key={key} schoolId={schoolId} dutyKey={key} year={plan.year} canWrite={canWrite} isAdmin={dutyAdmin} me={me} />}
            {tab === 'holders' && (
              <Box>
                {holders.map((h) => (
                  <Box key={h.year} sx={{ display: 'flex', gap: 1.5, py: 0.6, borderBottom: '1px solid #f1f5f9' }}>
                    <Typography variant="body2" sx={{ width: 80, fontWeight: 700, color: ACCENT }}>{h.year}학년도</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>{h.name || '—'}</Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>{[h.deptName, h.dutyTitle].filter(Boolean).join(' · ')}</Typography>
                  </Box>
                ))}
                {!holders.length && <Typography variant="body2" sx={{ color: 'text.secondary' }}>기록이 없습니다.</Typography>}
                {catalog.title !== task.text && <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1 }}>지난 이름: {catalog.title}</Typography>}
              </Box>
            )}
          </>
        )}
      </Box>
    </Drawer>
  )
}
