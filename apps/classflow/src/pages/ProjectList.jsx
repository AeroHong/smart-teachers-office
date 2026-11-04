import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Collapse from '@mui/material/Collapse'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import EditIcon from '@mui/icons-material/EditOutlined'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import FolderIcon from '@mui/icons-material/FolderOutlined'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import { useAuth } from '@shared/contexts/AuthContext'
import {
  detectEnrollmentLayout, extractEnrollment, createProject, demandOf, suggestWorkInfo, folderOf, colName,
} from '@shared/lib/sectioning'
import { listProjects, createProjectDoc, deleteProject, duplicateProject, saveProjectInfo } from '../lib/projectStore'
import { parseBackup } from '../lib/exporters'
import AppShell from '../components/AppShell'
import WorkInfoDialog, { WorkInfoFields, infoPatch } from '../components/WorkInfoDialog'
import { useHubRoles } from '../lib/useHubRoles'
import { logHub, workLabel } from '../lib/activity'

/** 작업 창은 별도 창으로 연다(전체화면 작업용). 팝업이 막히면 이 창에서 연다 */
export function openWorkspace(navigate, id) {
  const w = window.open(`/p/${id}`, `classflow-${id}`)
  if (!w) navigate(`/p/${id}`)
}

const COLLAPSE_KEY = 'classflow.closedFolders'
const readClosed = () => { try { return new Set(JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '[]')) } catch { return new Set() } }

export default function ProjectList() {
  const { user, schoolId } = useAuth()
  const { canEdit } = useHubRoles()
  const navigate = useNavigate()
  const [items, setItems] = useState(null)
  const [error, setError] = useState('')
  const [newOpen, setNewOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [closed, setClosed] = useState(readClosed)
  const backupRef = useRef(null)

  const refresh = () => {
    listProjects(schoolId).then(setItems).catch((e) => { console.error(e); setError('작업 목록을 불러오지 못했습니다.') })
  }
  useEffect(() => { refresh() }, [schoolId]) // eslint-disable-line react-hooks/exhaustive-deps

  // 묶음별로 — 묶음은 가장 최근에 고친 작업 순, 묶음 안도 최근 순
  const groups = useMemo(() => {
    const m = new Map()
    for (const p of items || []) {
      const f = folderOf(p)
      if (!m.has(f)) m.set(f, [])
      m.get(f).push(p)
    }
    return [...m.entries()].map(([name, list]) => ({ name, list }))
  }, [items])
  const folders = groups.map((g) => g.name)

  const toggleFolder = (name) => {
    setClosed((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name); else next.add(name)
      try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...next])) } catch { /* 이번 화면에서만 */ }
      return next
    })
  }

  const onDelete = async (p) => {
    if (!window.confirm(`"${p.title}" 작업과 저장된 버전을 모두 지웁니다. 계속할까요?`)) return
    try {
      await deleteProject(schoolId, p.id)
      logHub(schoolId, { action: 'sectioning_delete', summary: `${workLabel(p)} 분반 작업 삭제 — ${p.title}`, targetId: p.id })
      refresh()
    } catch (e) {
      console.error(e)
      setError('삭제하지 못했습니다. 만든 사람이나 학교 관리자만 지울 수 있습니다.')
    }
  }

  const onDuplicate = async (p) => {
    const title = window.prompt('복제한 작업의 이름', `${p.title} (사본)`)
    if (!title) return
    try {
      const id = await duplicateProject(schoolId, p.id, user, title.trim())
      logHub(schoolId, { action: 'sectioning_create', summary: `${workLabel(p)} 분반 작업 복제 — ${title.trim()}`, targetId: id })
      refresh()
    } catch (e) {
      console.error(e)
      setError('복제하지 못했습니다.')
    }
  }

  const onBackup = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const project = parseBackup(await file.text())
      const id = await createProjectDoc(schoolId, { ...project, title: `${project.title || '분반 배정'} (백업에서)` }, user)
      logHub(schoolId, { action: 'sectioning_create', summary: `${workLabel(project)} 분반 작업 만들기(백업 파일)`, targetId: id })
      refresh()
      openWorkspace(navigate, id)
    } catch (err) {
      setError(err.message || '백업 파일을 읽지 못했습니다.')
    }
  }

  return (
    <AppShell header={<Typography fontWeight={800}>선택과목 분반 배정</Typography>}>
      <Box sx={{ maxWidth: 1100, mx: 'auto' }}>
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 3 }}>
          <Typography variant="h6" fontWeight={700} sx={{ flex: 1 }}>작업 목록</Typography>
          {canEdit && (
            <>
              <Button variant="outlined" onClick={() => backupRef.current?.click()}>백업 파일 불러오기</Button>
              <input ref={backupRef} type="file" accept=".json,application/json" hidden onChange={onBackup} />
              <Button variant="contained" startIcon={<UploadFileIcon />} onClick={() => setNewOpen(true)}>
                새 작업 (수강신청 엑셀)
              </Button>
            </>
          )}
        </Stack>

        {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

        {items === null ? <CircularProgress /> : items.length === 0 ? (
          <Paper sx={{ p: 6, textAlign: 'center', color: 'text.secondary' }}>
            아직 작업이 없습니다. 수강신청 일괄등록 엑셀로 새 작업을 만드세요.
          </Paper>
        ) : (
          <Stack spacing={2.5}>
            {groups.map((g) => (
              <Box key={g.name}>
                <Box onClick={() => toggleFolder(g.name)} sx={{ display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer', mb: 1, userSelect: 'none' }}>
                  <ExpandMoreIcon sx={{ transition: 'transform .15s', transform: closed.has(g.name) ? 'rotate(-90deg)' : 'none', color: 'text.secondary' }} />
                  <FolderIcon color="primary" />
                  <Typography fontWeight={800}>{g.name}</Typography>
                  <Typography variant="body2" color="text.secondary">작업 {g.list.length}개</Typography>
                </Box>
                <Collapse in={!closed.has(g.name)}>
                  <Stack spacing={1.25} sx={{ pl: 4 }}>
                    {g.list.map((p) => (
                      <Paper key={p.id} variant="outlined" sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1.5, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
                        onClick={() => openWorkspace(navigate, p.id)}>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          {(p.year || p.grade || p.semester) && (
                            <Typography variant="caption" fontWeight={700} color="primary"
                              sx={{ display: 'inline-block', mb: 0.5, px: 0.75, py: 0.1, borderRadius: 1, bgcolor: 'action.selected' }}>
                              {workLabel(p)}
                            </Typography>
                          )}
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Typography fontWeight={800} fontSize="1.05rem" noWrap title={p.title}>{p.title || workLabel(p)}</Typography>
                            {p.lastSolve?.ok && <Chip size="small" color="success" label="배정 완료" />}
                          </Stack>
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }} noWrap>
                            {[`학생 ${p.studentCount}명`, `과목 ${p.subjectCount}개`, p.sourceFileName,
                              p.updatedAt && `${p.updatedAt.toLocaleString('ko-KR')} ${p.updatedByName}`].filter(Boolean).join(' · ')}
                          </Typography>
                        </Box>
                        {canEdit && (
                          <>
                            <Tooltip title="작업명·학년도·묶음 고치기">
                              <IconButton onClick={(e) => { e.stopPropagation(); setEditing(p) }}><EditIcon /></IconButton>
                            </Tooltip>
                            <Tooltip title="복제(배정·기록 포함)">
                              <IconButton onClick={(e) => { e.stopPropagation(); onDuplicate(p) }}><ContentCopyIcon /></IconButton>
                            </Tooltip>
                          </>
                        )}
                        <Tooltip title="새 창으로 열기"><IconButton><OpenInNewIcon /></IconButton></Tooltip>
                        {canEdit && (
                          <Tooltip title="삭제">
                            <IconButton onClick={(e) => { e.stopPropagation(); onDelete(p) }}><DeleteOutlineIcon /></IconButton>
                          </Tooltip>
                        )}
                      </Paper>
                    ))}
                  </Stack>
                </Collapse>
              </Box>
            ))}
          </Stack>
        )}
      </Box>

      {newOpen && (
        <NewProjectDialog folders={folders}
          onClose={() => setNewOpen(false)}
          onCreated={(id) => { setNewOpen(false); refresh(); openWorkspace(navigate, id) }}
        />
      )}
      {editing && (
        <WorkInfoDialog project={editing} folders={folders} onClose={() => setEditing(null)}
          onSave={async (patch) => {
            await saveProjectInfo(schoolId, editing.id, patch, user)
            logHub(schoolId, { action: 'sectioning_save', summary: `${workLabel({ ...editing, ...patch })} 작업 정보 변경 — ${patch.title}`, targetId: editing.id })
            setEditing(null)
            refresh()
          }} />
      )}
    </AppShell>
  )
}

/** 인식 결과 — 자동으로 찾은 행·열을 보여 주고 고칠 수 있게 */
function LayoutBox({ rows, layout, onOverride }) {
  const width = layout.width
  const head = rows.slice(0, layout.dataStart)
  const rowLabel = (r) => {
    const cells = (rows[r] || []).map((v) => (v === null || v === undefined ? '' : String(v).trim())).filter(Boolean)
    return `${r + 1}행 — ${cells.slice(0, 4).join(' · ').slice(0, 40)}${cells.length > 4 ? ' …' : ''}`
  }
  const colLabel = (c) => {
    const head1 = head.map((r) => r?.[c]).filter((v) => v !== null && v !== undefined && String(v).trim()).map(String)
    const sample = rows[layout.dataStart]?.[c]
    return `${colName(c)}열${head1.length ? ` — ${head1[0].slice(0, 12)}` : ''}${sample !== null && sample !== undefined ? ` (예: ${String(sample).slice(0, 10)})` : ''}`
  }
  const cols = Array.from({ length: width }, (_, c) => c)
  const headRows = head.map((_, r) => r)
  const sel = (label, value, options, key, allowNone = false) => (
    <TextField select size="small" label={label} value={value ?? ''} sx={{ minWidth: 200, flex: 1 }}
      onChange={(e) => onOverride({ [key]: e.target.value === '' ? null : Number(e.target.value) })}>
      {allowNone && <MenuItem value="">없음</MenuItem>}
      {options.map((o) => <MenuItem key={o.v} value={o.v}>{o.l}</MenuItem>)}
    </TextField>
  )
  const first = layout.subjectCols[0]
  const last = layout.subjectCols[layout.subjectCols.length - 1]
  return (
    <Paper variant="outlined" sx={{ p: 1.5, bgcolor: '#fafbfc' }}>
      <Typography variant="body2" fontWeight={700} sx={{ mb: 1 }}>
        인식 결과 — 학생 {layout.dataStart + 1}행부터 · 학번 {layout.idCols.map(colName).join('·')}열 · 이름 {layout.nameCol !== null ? `${colName(layout.nameCol)}열` : '없음'}
        {' '}· 과목 {colName(first)}~{colName(last)}열({layout.subjectCols.length}개). 틀리면 아래에서 고치세요.
      </Typography>
      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
        {sel('학번 열', layout.idCols.length === 1 ? layout.idCols[0] : '', cols.map((c) => ({ v: c, l: colLabel(c) })), 'idCol', true)}
        {sel('이름 열', layout.nameCol, cols.map((c) => ({ v: c, l: colLabel(c) })), 'nameCol', true)}
        {sel('과목명 행', layout.subjectRow, headRows.map((r) => ({ v: r, l: rowLabel(r) })), 'subjectRow')}
        {sel('칸막이(선택그룹) 행', layout.blockRow, headRows.map((r) => ({ v: r, l: rowLabel(r) })), 'blockRow', true)}
        {sel('과목 첫 열', first, cols.map((c) => ({ v: c, l: colLabel(c) })), 'firstCol')}
        {sel('과목 끝 열', last, cols.map((c) => ({ v: c, l: colLabel(c) })), 'lastCol')}
      </Stack>
      {layout.idCols.length > 1 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          학번 열이 여러 개(1·2·3학년)면 행마다 0이 아닌 값을 학번으로 씁니다. 「학번 열」 '없음'은 자동입니다.
        </Typography>
      )}
    </Paper>
  )
}

function NewProjectDialog({ folders, onClose, onCreated }) {
  const { user, schoolId } = useAuth()
  const [sheet, setSheet] = useState(null)   // { rows, merges }
  const [overrides, setOverrides] = useState({})
  const [fileName, setFileName] = useState('')
  const [info, setInfo] = useState(null)
  const [maxSize, setMaxSize] = useState(30)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  // 시트 + 사람이 고친 값 → 모양·추출 결과
  const { layout, parsed, parseError } = useMemo(() => {
    if (!sheet) return {}
    try {
      const lay = detectEnrollmentLayout(sheet.rows, sheet.merges, overrides)
      return { layout: lay, parsed: extractEnrollment(sheet.rows, sheet.merges, lay) }
    } catch (e) {
      return { parseError: e.message || '엑셀 파일을 읽지 못했습니다.' }
    }
  }, [sheet, overrides])

  const onFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true, blankrows: true })
      const merges = ws['!merges'] || []
      setSheet({ rows, merges })
      setOverrides({})
      setFileName(file.name)
      // 작업 정보 미리 채우기(입학년도는 파일명, 학년·학기는 시트의 "2-1")
      let term = ''
      try { term = extractEnrollment(rows, merges, detectEnrollmentLayout(rows, merges)).termLabel } catch { /* 아래 인식 결과에서 고친다 */ }
      const s = suggestWorkInfo(file.name, term)
      setInfo({
        title: s.title, folder: s.folder,
        entryYear: s.entryYear ? String(s.entryYear) : '', grade: s.grade ? String(s.grade) : '',
        semester: s.semester ? String(s.semester) : '', year: s.year ? String(s.year) : '',
      })
    } catch (err) {
      console.error(err)
      setSheet(null)
      setError(err.message || '엑셀 파일을 읽지 못했습니다.')
    }
  }

  const create = async () => {
    setSaving(true)
    try {
      const v = infoPatch(info)
      const project = createProject(parsed, {
        title: v.title, year: v.year, entryYear: v.entryYear, grade: v.grade, semester: v.semester, folder: v.folder,
        maxSize: Number(maxSize) || 30, sourceFileName: fileName,
      })
      const id = await createProjectDoc(schoolId, project, user)
      logHub(schoolId, { action: 'sectioning_create', summary: `${workLabel(project)} 분반 작업 만들기 — 학생 ${Object.keys(project.requests).length}명`, details: [fileName, v.title], targetId: id })
      onCreated(id)
    } catch (err) {
      console.error(err)
      setError('작업을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.')
      setSaving(false)
    }
  }

  const preview = parsed ? createProject(parsed, { maxSize: Number(maxSize) || 30 }) : null
  const demand = preview ? demandOf(preview) : []
  const nameCount = parsed ? Object.keys(parsed.names || {}).length : 0

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>새 분반 배정 작업</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Button variant="outlined" component="label" startIcon={<UploadFileIcon />} sx={{ alignSelf: 'flex-start' }}>
            수강신청 일괄등록 엑셀 선택
            <input type="file" hidden accept=".xlsx,.xls" onChange={onFile} />
          </Button>
          <Typography variant="body2" color="text.secondary">
            교육부 수강신청 프로그램에서 받은 파일을 그대로 올리세요. 학번·이름·과목명·선택그룹(칸막이) 행과 열을 자동으로 찾습니다.
            양식이 달라 틀리게 찾으면 인식 결과에서 고칠 수 있습니다. 학기마다 작업을 따로 만드세요.
          </Typography>
          {error && <Alert severity="error">{error}</Alert>}
          {sheet && layout && <LayoutBox rows={sheet.rows} layout={layout} onOverride={(o) => setOverrides((x) => ({ ...x, ...o }))} />}
          {sheet && parseError && (
            <Alert severity="error" action={Object.keys(overrides).length ? <Button color="inherit" size="small" onClick={() => setOverrides({})}>자동으로</Button> : null}>
              {parseError}
            </Alert>
          )}
          {parsed && info && (
            <>
              <WorkInfoFields value={info} onChange={setInfo} folders={folders} />
              <TextField size="small" label="분반별 최대 인원" type="number" value={maxSize} onChange={(e) => setMaxSize(e.target.value)} sx={{ width: 160 }} />
              <Alert severity="info">
                학생 {parsed.students.length}명{nameCount ? `(이름 ${nameCount}명)` : ''} · 과목 {parsed.subjects.length}개
                · 칸막이 {[...new Set(parsed.subjects.map((s) => s.block))].join(', ')}
                · 학생당 {parsed.slotCount}과목 → 그룹 {parsed.slotCount}개({preview.slots.join(', ')})
                {parsed.termLabel && ` · 파일의 학기 ${parsed.termLabel}`}
              </Alert>
              {parsed.excluded.length > 0 && (
                <Alert severity="warning">
                  배정에서 빠지는 학생: {parsed.excluded.map((x) => `${x.id}${parsed.names?.[x.id] ? ` ${parsed.names[x.id]}` : ''}(${x.reason})`).join(', ')}
                </Alert>
              )}
              {parsed.warnings.length > 0 && (
                <Alert severity="warning"><Box component="ul" sx={{ m: 0, pl: 2 }}>{parsed.warnings.slice(0, 10).map((w) => <li key={w}>{w}</li>)}</Box></Alert>
              )}
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0.5 }}>
                {preview.subjects.map((s, i) => (
                  <Typography key={s.name} variant="body2">
                    <b>{s.block}</b> {s.name} — {demand[i]}명 → {s.sections}분반
                  </Typography>
                ))}
              </Box>
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>취소</Button>
        <Button variant="contained" disabled={!parsed || !info || saving} onClick={create}>{saving ? '만드는 중…' : '만들고 열기'}</Button>
      </DialogActions>
    </Dialog>
  )
}
