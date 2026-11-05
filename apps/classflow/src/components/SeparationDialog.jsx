import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import Checkbox from '@mui/material/Checkbox'
import CircularProgress from '@mui/material/CircularProgress'
import MenuItem from '@mui/material/MenuItem'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import { addSeparation, removeSeparation, updateSeparation, separationIssues, sectionLabel, quickAssign, matchSeparations, folderOf, studentLabel } from '@shared/lib/sectioning'
import { useAuth } from '@shared/contexts/AuthContext'
import { listProjects, loadProject } from '../lib/projectStore'

const HOW = {
  id: { label: '학번 같음', color: 'success' },
  name: { label: '이름으로 찾음', color: 'info' },
  missing: { label: '못 찾음', color: 'error' },
  ambiguous: { label: '동명이인', color: 'warning' },
}

/**
 * 다른 작업(다른 학기·학년도)의 분리 규칙을 지금 작업으로 가져온다.
 * 학번이 같으면 그대로, 학년이 바뀌어 학번이 달라졌으면 이름으로 찾는다(지금 명단에 한 명뿐일 때만).
 */
function ImportPanel({ project, onImport, onClose }) {
  const { schoolId } = useAuth()
  const { projectId } = useParams()
  const [list, setList] = useState(null)
  const [srcId, setSrcId] = useState('')
  const [matches, setMatches] = useState(null)
  const [checked, setChecked] = useState(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // 처음 열 때 한 번 — 작업 목록(요약)
  useEffect(() => {
    let alive = true
    listProjects(schoolId).then((all) => {
      if (!alive) return
      const mine = folderOf(project)
      const rows = all.filter((x) => x.id !== projectId && x.separationCount > 0)
        .sort((a, b) => (folderOf(b) === mine) - (folderOf(a) === mine) || (b.updatedAt?.getTime?.() || 0) - (a.updatedAt?.getTime?.() || 0))
      setList(rows)
    }).catch((e) => { console.error(e); setError('작업 목록을 불러오지 못했습니다.'); setList([]) })
    return () => { alive = false }
  }, [schoolId]) // eslint-disable-line react-hooks/exhaustive-deps

  const pick = async (id) => {
    setSrcId(id)
    setMatches(null)
    if (!id) return
    setBusy(true)
    try {
      const src = await loadProject(schoolId, id)
      const m = matchSeparations(src?.separations || [], src?.names || {}, project)
      setMatches(m)
      // 기본: 학생을 모두 찾은 규칙만
      setChecked(new Set(m.map((x, i) => (x.ok && x.students.every((st) => st.to) ? i : -1)).filter((i) => i >= 0)))
    } catch (e) {
      console.error(e)
      setError('작업을 불러오지 못했습니다.')
    }
    setBusy(false)
  }

  const toggle = (i) => setChecked((prev) => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n })
  const name = (sid) => (project.names?.[sid] ? `${sid} ${project.names[sid]}` : sid)

  return (
    <Box sx={{ p: 1.5, mb: 2, borderRadius: 1.5, bgcolor: '#f3f8ff', border: '1px solid #c9dcf5' }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <Typography fontWeight={700} fontSize={14} sx={{ flex: 1 }}>다른 작업에서 가져오기</Typography>
        <Button size="small" onClick={onClose}>닫기</Button>
      </Stack>
      {list === null ? <CircularProgress size={20} /> : !list.length ? (
        <Typography variant="body2" color="text.secondary">분리 규칙이 있는 다른 작업이 없습니다.</Typography>
      ) : (
        <TextField select size="small" fullWidth label="가져올 작업" value={srcId} onChange={(e) => pick(e.target.value)}>
          {list.map((x) => (
            <MenuItem key={x.id} value={x.id}>
              {x.title || '이름 없음'} · {folderOf(x)} · 분리 규칙 {x.separationCount}개
            </MenuItem>
          ))}
        </TextField>
      )}
      {error && <Alert severity="warning" sx={{ mt: 1 }}>{error}</Alert>}
      {busy && <CircularProgress size={20} sx={{ mt: 1 }} />}
      {matches && (
        <>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', my: 1 }}>
            학번이 같으면 그대로, 학년이 바뀌어 학번이 달라졌으면 이름으로 찾습니다(지금 명단에 같은 이름이 한 명일 때만). 학생 2명 이상을 찾은 규칙만 가져올 수 있습니다.
          </Typography>
          <Stack spacing={0.75}>
            {matches.map((m, i) => (
              <Stack key={m.rule.id || i} direction="row" alignItems="center" spacing={0.75} sx={{ flexWrap: 'wrap', rowGap: 0.5, p: 0.75, borderRadius: 1, bgcolor: '#fff', border: '1px solid #e1e6ec', opacity: m.ok ? 1 : 0.6 }}>
                <Checkbox size="small" sx={{ p: 0.25 }} checked={checked.has(i)} disabled={!m.ok} onChange={() => toggle(i)} />
                {m.students.map((st) => (
                  <Chip key={st.from} size="small" variant="outlined" color={HOW[st.how].color}
                    label={st.to ? `${name(st.to)}${st.how === 'name' ? ` ← ${st.from}` : ''}` : `${st.from}${st.name ? ` ${st.name}` : ''} · ${HOW[st.how].label}`}
                    title={HOW[st.how].label} />
                ))}
                {m.rule.memo && <Typography fontSize={12} color="text.secondary">{m.rule.memo}</Typography>}
                {m.duplicate && <Chip size="small" label="이미 있음" />}
              </Stack>
            ))}
          </Stack>
          <Stack direction="row" justifyContent="flex-end" sx={{ mt: 1 }}>
            <Button variant="contained" size="small" disabled={!checked.size}
              onClick={() => onImport([...checked].map((i) => matches[i]))}>규칙 {checked.size}개 가져오기</Button>
          </Stack>
        </>
      )}
    </Box>
  )
}

/**
 * 분리 규칙 — 서로 같은 분반에 들어가면 안 되는 학생들.
 * 규칙 학생들이 함께 듣는 모든 과목에서 다른 분반에 들어가도록 배정 실행이 지킨다(꼭 지킴).
 * initialStudents가 오면 그 학생으로 새 규칙을 시작한다(학생 창의 「분리할 학생 추가」).
 */
export default function SeparationDialog({ project, onChange, onClose, initialStudents = [] }) {
  const [draft, setDraft] = useState(initialStudents)
  const [input, setInput] = useState('')
  const [memo, setMemo] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const known = useMemo(() => new Set(Object.keys(project.requests)), [project.requests])
  const issues = useMemo(() => separationIssues(project), [project])
  const rules = project.separations || []

  const addId = () => {
    const id = input.trim()
    if (!id) return
    if (!known.has(id)) { setError(`학번 ${id}는 배정 대상 명단에 없습니다.`); return }
    if (!draft.includes(id)) setDraft([...draft, id])
    setInput('')
    setError('')
  }
  const create = () => {
    if (draft.length < 2) { setError('2명 이상 넣어 주세요.'); return }
    // 규칙을 넣고 브라우저에서 바로 학생만 다시 나눠 본다(그룹 배치는 그대로, 바뀌는 학생 최소)
    const withRule = addSeparation(project, draft, memo)
    const r = quickAssign(withRule)
    const left = separationIssues(r.project).violations.length
    onChange(r.project)
    setNotice(left
      ? `규칙을 넣었습니다. 지금 그룹 배치로는 ${left}곳을 떼어 놓지 못했습니다 — 「배정 실행 ▾ → 조건만 맞추기」를 눌러 주세요.`
      : `규칙을 넣고 바로 맞췄습니다 — 바뀐 학생 ${r.changed}명. 배정 실행을 다시 누르지 않아도 됩니다.`)
    setDraft([])
    setMemo('')
    setError('')
  }

  const importRules = (picked) => {
    let p = project
    for (const m of picked) p = addSeparation(p, m.ids, m.rule.memo || '')
    const r = quickAssign(p)
    const left = separationIssues(r.project).violations.length
    onChange(r.project)
    setImportOpen(false)
    setNotice(left
      ? `규칙 ${picked.length}개를 가져왔습니다. 지금 그룹 배치로는 ${left}곳을 떼어 놓지 못했습니다 — 「배정 실행 ▾ → 조건만 맞추기」를 눌러 주세요.`
      : `규칙 ${picked.length}개를 가져와 바로 맞췄습니다 — 바뀐 학생 ${r.changed}명.`)
  }

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>분리 규칙 — 같은 분반에 들어가면 안 되는 학생</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          규칙에 넣은 학생들은 <b>함께 듣는 모든 과목에서 서로 다른 분반</b>에 배정됩니다. 배정 실행이 꼭 지키며,
          이 때문에 해가 없으면 대안에 「규칙 잠시 빼기」가 나옵니다. 1분반 과목은 나눌 수 없어 ⚠로 표시합니다.
        </Typography>

        {importOpen && <ImportPanel project={project} onImport={importRules} onClose={() => setImportOpen(false)} />}

        {/* 새 규칙 */}
        <Box sx={{ p: 1.5, mb: 2, borderRadius: 1.5, bgcolor: '#f5f7fa', border: '1px solid #e1e6ec' }}>
          <Stack direction="row" alignItems="center" sx={{ mb: 1 }}>
            <Typography fontWeight={700} fontSize={14} sx={{ flex: 1 }}>새 규칙</Typography>
            {!importOpen && <Button size="small" variant="outlined" onClick={() => setImportOpen(true)}>다른 작업에서 가져오기</Button>}
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1, flexWrap: 'wrap', rowGap: 1 }}>
            {draft.map((id) => <Chip key={id} label={project.names?.[id] ? `${id} ${project.names[id]}` : id} onDelete={() => setDraft(draft.filter((x) => x !== id))} />)}
            <TextField size="small" placeholder="학번 입력 후 Enter" value={input} sx={{ width: 170 }}
              onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addId()} />
            <Button size="small" onClick={addId}>넣기</Button>
          </Stack>
          <Stack direction="row" spacing={1}>
            <TextField size="small" fullWidth placeholder="짧은 메모(선택) — 예: 생활지도 요청" value={memo} onChange={(e) => setMemo(e.target.value)}
              inputProps={{ maxLength: 40 }} />
            <Button variant="contained" onClick={create} disabled={draft.length < 2}>규칙 만들기</Button>
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
            민감한 사유는 적지 마세요. 이 작업을 여는 교직원은 모두 볼 수 있습니다.
          </Typography>
          {error && <Alert severity="warning" sx={{ mt: 1 }}>{error}</Alert>}
          {notice && <Alert severity={notice.includes('못했') ? 'info' : 'success'} sx={{ mt: 1 }} onClose={() => setNotice('')}>{notice}</Alert>}
        </Box>

        {/* 목록 */}
        {!rules.length && <Typography color="text.secondary">아직 규칙이 없습니다.</Typography>}
        <Stack spacing={1}>
          {rules.map((r, i) => {
            const v = issues.violations.filter((x) => x.ruleId === r.id)
            const u = issues.unsplittable.filter((x) => x.ruleId === r.id)
            return (
              <Box key={r.id} sx={{ p: 1.25, borderRadius: 1.5, border: `1px solid ${v.length ? '#f5b5b5' : '#e1e6ec'}`, bgcolor: v.length ? '#fff6f6' : '#fff' }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
                  <Typography fontWeight={800} fontSize={14} sx={{ width: 52 }}>규칙 {i + 1}</Typography>
                  {r.students.map((id) => (
                    <Chip key={id} size="small" label={project.names?.[id] ? `${id} ${project.names[id]}` : id} color={known.has(id) ? 'default' : 'warning'}
                      onDelete={r.students.length > 2 ? () => onChange(updateSeparation(project, r.id, { students: r.students.filter((x) => x !== id) })) : undefined} />
                  ))}
                  <TextField size="small" variant="standard" placeholder="메모" defaultValue={r.memo} sx={{ width: 180, ml: 1 }}
                    inputProps={{ maxLength: 40 }} onBlur={(e) => e.target.value !== r.memo && onChange(updateSeparation(project, r.id, { memo: e.target.value.trim() }))} />
                  <Box sx={{ flex: 1 }} />
                  {v.length ? <Chip size="small" color="error" label={`같은 분반 ${v.length}곳`} />
                    : <Chip size="small" color="success" variant="outlined" label="지켜짐 ✓" />}
                  {u.length > 0 && <Chip size="small" color="warning" variant="outlined" label={`1분반이라 분리 불가 ${u.length}과목`} />}
                  <IconButton size="small" onClick={() => onChange(removeSeparation(project, r.id))}><DeleteOutlineIcon fontSize="small" /></IconButton>
                </Stack>
                {(v.length > 0 || u.length > 0) && (
                  <Typography fontSize={12} color="text.secondary" sx={{ mt: 0.5, pl: 7.5 }}>
                    {v.map((x) => `✕ ${project.subjects[x.s].name} ${sectionLabel(project, x.s, x.k)}: ${x.students.map((id) => studentLabel(project, id)).join('·')}`).join('   ')}
                    {v.length && u.length ? '   ' : ''}
                    {u.map((x) => `⚠ ${project.subjects[x.s].name}(1분반): ${x.students.map((id) => studentLabel(project, id)).join('·')}`).join('   ')}
                  </Typography>
                )}
              </Box>
            )
          })}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Typography variant="caption" color="text.secondary" sx={{ flex: 1, pl: 1 }}>규칙을 만들면 바로 학생만 다시 나눕니다. 안 되면 「배정 실행 ▾ → 조건만 맞추기」.</Typography>
        <Button variant="contained" onClick={onClose}>닫기</Button>
      </DialogActions>
    </Dialog>
  )
}
