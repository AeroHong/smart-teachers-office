import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControlLabel from '@mui/material/FormControlLabel'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { comparisonRows, diffNodes, refTextOf } from '@shared/lib/regulationDiff'
import {
  convertPlainRefs, insertAfter, insertChild, markDeleted, moveNode, newBranchArticle, newNode, removeNode, updateNode,
} from '@shared/lib/regulationEdit'
import { refToken, renumber } from '@shared/lib/regulationTree'
import { useAuth } from '@shared/contexts/AuthContext'
import AdminFrame from '../components/AdminFrame'
import CompareTable from '../components/CompareTable'
import EditRow from '../components/EditRow'
import RefPicker from '../components/RefPicker'
import {
  applyAmendment, deleteAmendment, getCurrentNodes, getVersion, listAmendmentLog, makeFindReg, saveAmendment, useAmendment, useBook,
} from '../lib/data'
import { downloadComparisonHwpx } from '../lib/hwpxExport'
import { useRegulationRole } from '../lib/useRegulationRole'
import { STATUS } from './AmendmentsPage'

const KINDS = ['일부개정', '전부개정', '폐지']
const META = ['title', 'kind', 'reason', 'effectiveDate', 'staffMeetingDate', 'committeeDate']
const ACTION_LABEL = { add: '추가', modify: '수정', delete: '삭제', move: '이동', create: '만듦', meta: '정보', status: '상태', apply: '확정' }

/** 개정안 편집 — /amendments/:id */
export default function AmendmentEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { schoolId, user, userName } = useAuth()
  const { canEdit, canApply } = useRegulationRole()
  const { book } = useBook(schoolId)
  const { amd, loading } = useAmendment(schoolId, id)
  const [baseline, setBaseline] = useState(null) // 마지막으로 불러오거나 저장한 개정안
  const [draft, setDraft] = useState(null)
  const [baseNodes, setBaseNodes] = useState(null)
  const [tab, setTab] = useState(0)
  const [log, setLog] = useState(null)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [refFor, setRefFor] = useState(null) // { nodeId, caret }
  const [confirmApply, setConfirmApply] = useState(false)
  const [strikeOld, setStrikeOld] = useState(false)

  // 처음 불러오기 + 다른 사람이 저장했을 때(내가 고친 게 없으면) 새로 받기
  const dirty = !!draft && !!baseline && (draft.nodes !== baseline.nodes || META.some((k) => (draft[k] ?? '') !== (baseline[k] ?? '')))
  useEffect(() => {
    if (!amd) return
    if (!baseline || (!dirty && amd.revision !== baseline.revision)) {
      setBaseline(amd)
      setDraft({ nodes: amd.nodes, ...Object.fromEntries(META.map((k) => [k, amd[k] ?? ''])) })
    }
  }, [amd]) // eslint-disable-line react-hooks/exhaustive-deps
  const remoteNewer = amd && baseline && amd.revision !== baseline.revision && dirty

  useEffect(() => {
    if (!amd?.baseVersionId) return
    getVersion(schoolId, amd.regId, amd.baseVersionId).then((v) => setBaseNodes(v?.nodes || [])).catch((e) => setErr(e.message))
  }, [schoolId, amd?.regId, amd?.baseVersionId])

  useEffect(() => { if (tab === 2) listAmendmentLog(schoolId, id).then(setLog).catch((e) => setErr(e.message)) }, [tab, schoolId, id, amd?.revision])

  useEffect(() => {
    const warn = (e) => { if (dirty) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const readOnly = !canEdit || amd?.status === 'applied' || amd?.status === 'discarded'
  const regId = amd?.regId
  const loadNodes = useCallback((rid) => getCurrentNodes(schoolId, book, rid), [schoolId, book])
  const findReg = useMemo(() => makeFindReg(book), [book])
  const regTitle = useCallback((rid) => book?.regulations?.find((r) => r.id === rid)?.title || '', [book])

  // 바뀐 줄 표시
  const states = useMemo(() => {
    if (!baseNodes || !draft) return new Map()
    const textOf = refTextOf({ regId, oldNodes: baseNodes, newNodes: draft.nodes, regTitle })
    const d = diffNodes(baseNodes, draft.nodes, { textOf })
    return new Map([...d.modified.map((x) => [x, 'modified']), ...d.moved.map((x) => [x, 'modified']), ...d.added.map((x) => [x, 'added']), ...d.deleted.map((x) => [x, 'deleted'])])
  }, [baseNodes, draft, regId, regTitle])
  const removedCount = useMemo(() => (baseNodes && draft ? baseNodes.filter((n) => !draft.nodes.some((m) => m.id === n.id)).length : 0), [baseNodes, draft])
  const rows = useMemo(() => (baseNodes && draft && tab === 1
    ? comparisonRows(baseNodes, draft.nodes, { textOf: refTextOf({ regId, oldNodes: baseNodes, newNodes: draft.nodes, regTitle }) })
    : []), [baseNodes, draft, tab, regId, regTitle])
  const depth = useMemo(() => {
    const m = new Map()
    for (const n of draft?.nodes || []) m.set(n.id, n.parent ? (m.get(n.parent) ?? 0) + 1 : 0)
    return m
  }, [draft])

  const setNodes = (fn) => setDraft((d) => ({ ...d, nodes: fn(d.nodes) }))
  const onChange = useCallback((nid, patch) => setNodes((ns) => updateNode(ns, nid, patch)), [])
  const onAction = useCallback((a, nid, arg) => setNodes((ns) => {
    const node = ns.find((n) => n.id === nid)
    switch (a) {
      case 'after': return insertAfter(ns, nid, newNode(ns, arg, node.parent ?? null))
      case 'child': return insertChild(ns, nid, newNode(ns, arg, nid))
      case 'branch': return newBranchArticle(ns, nid)
      case 'up': return moveNode(ns, nid, -1)
      case 'down': return moveNode(ns, nid, 1)
      case 'markDeleted': return markDeleted(ns, nid, true)
      case 'undelete': return markDeleted(ns, nid, false)
      case 'remove': return removeNode(ns, nid)
      default: return ns
    }
  }), [])
  const onInsertRef = useCallback((nodeId, caret) => setRefFor({ nodeId, caret }), [])
  const insertRef = (rid, targetId) => setNodes((ns) => ns.map((n) => {
    if (n.id !== refFor.nodeId) return n
    const t = n.text || ''
    const at = refFor.caret ?? t.length
    return { ...n, text: `${t.slice(0, at)}${refToken(rid, targetId)}${t.slice(at)}` }
  }))

  // 번호 다시 매기기 — 먼저 글자 참조를 고정 링크로 바꿔 참조가 새 번호를 따라가게 한다
  const doRenumber = () => {
    const linked = convertPlainRefs(draft.nodes, regId, findReg)
    const { nodes, changes } = renumber(linked.nodes)
    setNodes(() => nodes)
    // 다른 규정이 글자로 인용하는 조가 번호가 바뀌면 그쪽도 고쳐야 한다
    const cited = changes.filter((c) => (book?.citations?.[`${regId}/${c.id}`] || []).some((s) => !s.startsWith(`${regId}/`)))
    setMsg(`번호 ${changes.length}곳을 다시 매겼습니다${linked.count ? ` (본문 참조 ${linked.count}곳은 고정 링크로 바꿔 새 번호를 따라갑니다)` : ''}.${cited.length ? ` 다른 규정이 인용하는 조 ${cited.length}곳의 번호가 바뀌었습니다 — 그 규정도 확인하세요.` : ''}`)
  }

  const save = async (extra = {}) => {
    setBusy(true); setErr('')
    try {
      const patch = { ...Object.fromEntries(META.map((k) => [k, draft[k] ?? ''])), ...extra }
      if (draft.nodes !== baseline.nodes) patch.nodes = draft.nodes
      const n = await saveAmendment(schoolId, baseline, patch, { uid: user.uid, name: userName })
      setBaseline({ ...baseline, ...patch, nodes: draft.nodes, revision: (baseline.revision || 0) + 1 })
      setMsg(n ? `저장했습니다(바뀐 조문 ${n}곳 기록)` : '저장했습니다')
    } catch (e) { setErr(e.message) }
    setBusy(false)
  }

  const apply = async () => {
    setConfirmApply(false); setBusy(true); setErr('')
    try {
      if (dirty) await save()
      const fresh = { ...baseline, ...draft, id, revision: (baseline.revision || 0) + (dirty ? 1 : 0) }
      await applyAmendment(schoolId, fresh, book, { uid: user.uid, name: userName })
      navigate(`/r/${regId}`)
    } catch (e) { setErr(e.message); setBusy(false) }
  }

  const remove = async () => {
    if (!window.confirm('이 개정안을 지울까요? 작업 기록도 볼 수 없게 됩니다.')) return
    try { await deleteAmendment(schoolId, id); navigate('/amendments') } catch (e) { setErr(e.message) }
  }

  const downloadHwpx = () => {
    const r = comparisonRows(baseNodes, draft.nodes, { textOf: refTextOf({ regId, oldNodes: baseNodes, newNodes: draft.nodes, regTitle }) })
    downloadComparisonHwpx({ regTitle: amd.regTitle, kind: draft.kind, reason: draft.reason, effectiveDate: draft.effectiveDate, staffMeetingDate: draft.staffMeetingDate, committeeDate: draft.committeeDate, rows: r, strikeOld })
      .catch((e) => setErr(e.message))
  }

  if (loading || (amd && !draft)) return <AdminFrame title="개정안" need="edit" back="/amendments"><CircularProgress /></AdminFrame>
  if (!amd) return <AdminFrame title="개정안" need="edit" back="/amendments"><Alert severity="warning">없는 개정안입니다.</Alert></AdminFrame>
  const st = STATUS[amd.status] || STATUS.draft
  const changeCount = states.size + removedCount

  return (
    <AdminFrame
      title={amd.title}
      need="edit"
      back="/amendments"
      maxWidth={1280}
      actions={(
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" justifyContent="flex-end">
          <Chip label={st.label} color={st.color} />
          {!readOnly && <Button variant="contained" disabled={busy || !dirty} onClick={() => save()}>{dirty ? '저장' : '저장됨'}</Button>}
          {!readOnly && amd.status === 'draft' && <Button disabled={busy} onClick={() => save({ status: 'review' })}>검토 요청</Button>}
          {!readOnly && amd.status === 'review' && <Button disabled={busy} onClick={() => save({ status: 'draft' })}>작성 중으로</Button>}
          {!readOnly && canApply && <Button color="success" variant="contained" disabled={busy || !changeCount} onClick={() => setConfirmApply(true)}>확정</Button>}
        </Stack>
      )}
    >
      {remoteNewer && <Alert severity="warning" sx={{ mb: 2 }}>{amd.updatedByName} 님이 먼저 저장했습니다. 지금 내용을 저장하면 막힙니다 — 고친 내용을 따로 적어 두고 새로 고쳐 주세요.</Alert>}
      {err && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErr('')}>{err}</Alert>}
      {amd.status === 'applied' && <Alert severity="success" sx={{ mb: 2 }}>{amd.appliedByName} 님이 확정했습니다. <RouterLink to={`/r/${regId}`}>현행 규정 보기</RouterLink></Alert>}

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <TextField label="개정안 이름" fullWidth value={draft.title} disabled={readOnly} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} />
            <TextField select label="개정 구분" value={draft.kind} disabled={readOnly} onChange={(e) => setDraft((d) => ({ ...d, kind: e.target.value }))} sx={{ minWidth: 140 }}>
              {KINDS.map((k) => <MenuItem key={k} value={k}>{k}</MenuItem>)}
            </TextField>
          </Stack>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            {[['effectiveDate', '시행일'], ['staffMeetingDate', '교직원회의 협의일'], ['committeeDate', '학교운영위원회 심의일']].map(([k, label]) => (
              <TextField key={k} type="date" label={label} value={draft[k]} disabled={readOnly} InputLabelProps={{ shrink: true }} onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))} />
            ))}
          </Stack>
          <TextField label="개정 이유" multiline minRows={2} value={draft.reason} disabled={readOnly} onChange={(e) => setDraft((d) => ({ ...d, reason: e.target.value }))} />
        </Stack>
      </Paper>

      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }} useFlexGap flexWrap="wrap">
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ flex: 1, minWidth: 280 }}>
          <Tab label="조문 고치기" />
          <Tab label={`신구대조표${changeCount ? ` (${changeCount})` : ''}`} />
          <Tab label="작업 기록" />
        </Tabs>
        {tab === 0 && !readOnly && <Button size="small" onClick={doRenumber}>번호 다시 매기기</Button>}
        {tab === 1 && <FormControlLabel control={<Switch checked={strikeOld} onChange={(e) => setStrikeOld(e.target.checked)} />} label="현행 쪽 취소선" />}
        <Button size="small" variant="outlined" disabled={!changeCount || !baseNodes} onClick={downloadHwpx}>신구대조표 한글(hwpx)</Button>
        {!readOnly && <Button size="small" color="error" onClick={remove}>개정안 지우기</Button>}
      </Stack>

      {tab === 0 && (
        <Paper variant="outlined" sx={{ p: 1.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            줄 왼쪽 색: <b style={{ color: '#16a34a' }}>추가</b> · <b style={{ color: '#d97706' }}>수정</b> · <b style={{ color: '#dc2626' }}>삭제</b>
            {removedCount ? ` · 통째로 지운 줄 ${removedCount}개(신구대조표에서 보임)` : ''}. 칸을 벗어나면 반영되고, 「저장」을 눌러야 서버에 남습니다.
          </Typography>
          {draft.nodes.map((n) => (
            <EditRow key={n.id} node={n} depth={depth.get(n.id) || 0} state={states.get(n.id) || null} readOnly={readOnly} onChange={onChange} onAction={onAction} onInsertRef={onInsertRef} />
          ))}
          {!readOnly && <Button size="small" sx={{ mt: 1 }} onClick={() => setNodes((ns) => [...ns, newNode(ns, 'article', null)])}>맨 끝에 조 추가</Button>}
        </Paper>
      )}
      {tab === 1 && (baseNodes ? <CompareTable rows={rows} /> : <CircularProgress />)}
      {tab === 2 && (
        !log ? <CircularProgress /> : (
          <Paper variant="outlined" sx={{ p: 2 }}>
            {!log.length && <Typography color="text.secondary">기록이 없습니다.</Typography>}
            <Stack spacing={0.5}>
              {log.map((l) => (
                <Stack key={l.id} direction="row" spacing={1} alignItems="center">
                  <Typography variant="caption" color="text.secondary" sx={{ width: 150, flexShrink: 0 }}>{l.at?.toDate ? l.at.toDate().toLocaleString('ko-KR') : ''}</Typography>
                  <Chip size="small" label={ACTION_LABEL[l.action] || l.action} color={l.action === 'delete' ? 'error' : l.action === 'add' ? 'success' : 'default'} variant="outlined" />
                  <Typography variant="body2"><b>{l.name}</b> {l.label}</Typography>
                </Stack>
              ))}
            </Stack>
          </Paper>
        )
      )}

      <RefPicker open={!!refFor} onClose={() => setRefFor(null)} onPick={insertRef} book={book} regId={regId} nodes={draft.nodes} loadNodes={loadNodes} />
      <Dialog open={confirmApply} onClose={() => setConfirmApply(false)}>
        <DialogTitle>개정안을 확정할까요?</DialogTitle>
        <DialogContent>
          <Typography gutterBottom>확정하면 현행 규정이 이 내용으로 바뀌고, 바뀐 조문에 「&lt;개정 {draft.effectiveDate || '시행일'}&gt;」 표시와 연혁이 남습니다. 확정한 개정안은 고칠 수 없습니다.</Typography>
          {!draft.effectiveDate && <Alert severity="warning">시행일을 먼저 넣어 주세요.</Alert>}
          {!draft.committeeDate && <Alert severity="info" sx={{ mt: 1 }}>학교운영위원회 심의일이 비어 있습니다(심의가 필요 없는 규정이면 그대로 두세요).</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmApply(false)}>취소</Button>
          <Button variant="contained" color="success" disabled={!draft.effectiveDate || busy} onClick={apply}>확정</Button>
        </DialogActions>
      </Dialog>
      <Snackbar open={!!msg} autoHideDuration={6000} onClose={() => setMsg('')} message={msg} />
      <Box sx={{ height: 80 }} />
    </AdminFrame>
  )
}

