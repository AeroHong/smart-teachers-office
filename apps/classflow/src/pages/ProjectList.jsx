import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import { useAuth } from '@shared/contexts/AuthContext'
import { parseEnrollmentRows, createProject, demandOf } from '@shared/lib/sectioning'
import { listProjects, createProjectDoc, deleteProject } from '../lib/projectStore'
import { parseBackup } from '../lib/exporters'
import AppShell from '../components/AppShell'
import { useHubRoles } from '../lib/useHubRoles'
import { logHub, workLabel } from '../lib/activity'

/** 작업 창은 별도 창으로 연다(전체화면 작업용). 팝업이 막히면 이 창에서 연다 */
export function openWorkspace(navigate, id) {
  const w = window.open(`/p/${id}`, `classflow-${id}`)
  if (!w) navigate(`/p/${id}`)
}

/** 작업명이 파일명에서 자동으로 만든 이름이 아니면(직접 고쳤으면) 제목 옆에 함께 보여 준다 */
function customTitle(p) {
  if (!p.title) return false
  const base = (p.sourceFileName || '').replace(/\.[^.]+$/, '')
  return !(base && p.title.startsWith(base))
}

function termText(p) {
  if (p.grade && p.semester) return `${p.grade}학년 ${p.semester}학기`
  return p.termLabel || ''
}

export default function ProjectList() {
  const { user, schoolId } = useAuth()
  const { canEdit } = useHubRoles()
  const navigate = useNavigate()
  const [items, setItems] = useState(null)
  const [error, setError] = useState('')
  const [newOpen, setNewOpen] = useState(false)
  const backupRef = useRef(null)

  const refresh = () => {
    listProjects(schoolId).then(setItems).catch((e) => { console.error(e); setError('작업 목록을 불러오지 못했습니다.') })
  }
  useEffect(() => { refresh() }, [schoolId]) // eslint-disable-line react-hooks/exhaustive-deps

  const onDelete = async (p) => {
    if (!window.confirm(`"${p.title}" 작업과 저장된 버전을 모두 지웁니다. 계속할까요?`)) return
    try {
      await deleteProject(schoolId, p.id)
      logHub(schoolId, { action: 'sectioning_delete', summary: `${workLabel(p)} 분반 작업 삭제`, targetId: p.id })
      refresh()
    } catch (e) {
      console.error(e)
      setError('삭제하지 못했습니다. 만든 사람이나 학교 관리자만 지울 수 있습니다.')
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
            아직 작업이 없습니다. 나이스 수강신청 일괄등록 엑셀로 새 작업을 만드세요.
          </Paper>
        ) : (
          <Stack spacing={1.5}>
            {items.map((p) => (
              <Paper key={p.id} variant="outlined" sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
                onClick={() => openWorkspace(navigate, p.id)}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography fontWeight={800} fontSize="1.05rem">
                      {[p.year && `${p.year}학년도`, termText(p)].filter(Boolean).join(' ') || p.title || '(학년도 미정)'}
                    </Typography>
                    {customTitle(p) && <Typography color="text.secondary" fontSize="0.9rem" noWrap title={p.title}>· {p.title}</Typography>}
                    {p.lastSolve?.ok && <Chip size="small" color="success" label="배정 완료" />}
                  </Stack>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    학생 {p.studentCount}명 · 과목 {p.subjectCount}개 · {p.sourceFileName}
                    {p.updatedAt && ` · ${p.updatedAt.toLocaleString('ko-KR')} ${p.updatedByName}`}
                  </Typography>
                </Box>
                <Tooltip title="새 창으로 열기"><IconButton><OpenInNewIcon /></IconButton></Tooltip>
                {canEdit && (
                  <Tooltip title="삭제">
                    <IconButton onClick={(e) => { e.stopPropagation(); onDelete(p) }}><DeleteOutlineIcon /></IconButton>
                  </Tooltip>
                )}
              </Paper>
            ))}
          </Stack>
        )}
      </Box>

      {newOpen && (
        <NewProjectDialog
          onClose={() => setNewOpen(false)}
          onCreated={(id) => { setNewOpen(false); refresh(); openWorkspace(navigate, id) }}
        />
      )}
    </AppShell>
  )
}

function NewProjectDialog({ onClose, onCreated }) {
  const { user, schoolId } = useAuth()
  const [parsed, setParsed] = useState(null)
  const [fileName, setFileName] = useState('')
  const [title, setTitle] = useState('')
  const [year, setYear] = useState(new Date().getFullYear())
  const [maxSize, setMaxSize] = useState(30)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const onFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true, blankrows: false })
      const p = parseEnrollmentRows(rows, ws['!merges'] || [])
      setParsed(p)
      setFileName(file.name)
      const term = p.termLabel ? `${p.termLabel.replace('-', '학년 ')}학기` : ''
      setTitle(`${file.name.replace(/\.[^.]+$/, '')}${term ? ` (${term})` : ''}`)
    } catch (err) {
      console.error(err)
      setParsed(null)
      setError(err.message || '엑셀 파일을 읽지 못했습니다.')
    }
  }

  const create = async () => {
    setSaving(true)
    try {
      const project = createProject(parsed, { title: title.trim() || fileName, year: Number(year) || null, maxSize: Number(maxSize) || 30, sourceFileName: fileName })
      const id = await createProjectDoc(schoolId, project, user)
      logHub(schoolId, { action: 'sectioning_create', summary: `${workLabel(project)} 분반 작업 만들기 — 학생 ${Object.keys(project.requests).length}명`, details: [fileName], targetId: id })
      onCreated(id)
    } catch (err) {
      console.error(err)
      setError('작업을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.')
      setSaving(false)
    }
  }

  const preview = parsed ? createProject(parsed, { maxSize: Number(maxSize) || 30 }) : null
  const demand = preview ? demandOf(preview) : []

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
            1열 학번, 과목명 행 위에 선택 칸막이(C·D 등), 신청한 칸에 1이 들어 있는 나이스 양식입니다. 학기마다 작업을 따로 만드세요.
          </Typography>
          {error && <Alert severity="error">{error}</Alert>}
          {parsed && (
            <>
              <Stack direction="row" spacing={2}>
                <TextField label="작업 이름" value={title} onChange={(e) => setTitle(e.target.value)} sx={{ flex: 1 }} />
                <TextField label="학년도" type="number" value={year} onChange={(e) => setYear(e.target.value)} sx={{ width: 120 }} />
                <TextField label="분반별 최대 인원" type="number" value={maxSize} onChange={(e) => setMaxSize(e.target.value)} sx={{ width: 150 }} />
              </Stack>
              <Alert severity="info">
                학생 {parsed.students.length}명 · 과목 {parsed.subjects.length}개 · 칸막이 {[...new Set(parsed.subjects.map((s) => s.block))].join(', ')}
                · 학생당 {parsed.slotCount}과목 → 그룹 {parsed.slotCount}개({preview.slots.join(', ')})
                {parsed.termLabel && ` · ${parsed.termLabel}`}
              </Alert>
              {parsed.excluded.length > 0 && (
                <Alert severity="warning">
                  배정에서 빠지는 학생: {parsed.excluded.map((x) => `${x.id}(${x.reason})`).join(', ')}
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
        <Button variant="contained" disabled={!parsed || saving} onClick={create}>{saving ? '만드는 중…' : '만들고 열기'}</Button>
      </DialogActions>
    </Dialog>
  )
}
