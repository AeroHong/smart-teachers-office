import { useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { explainUnassigned } from '@shared/lib/sectioning'

const KIND_LABEL = {
  clash: { label: '그룹 겹침', color: 'error' },
  full: { label: '분반 꽉 참', color: 'warning' },
  lock: { label: '고정', color: 'info' },
  separation: { label: '분리 규칙', color: 'info' },
  free: { label: '공강 제한', color: 'info' },
  other: { label: '전체 조합', color: 'default' },
}

const fmtAt = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/** 예전 저장본(change 하나, full 없음)도 같은 모양으로 */
const normSuggestion = (s) => ({ ...s, changes: s.changes || (s.change ? [s.change] : []), full: s.full ?? true })
const swapsOf = (sg) => sg.swaps || [{ from: sg.from, to: sg.to, block: sg.block }]

/**
 * 배정 불가 진단 창 — 남는 학생과 원인, 학생 과목 조정 제안, 조건 바꾸기 대안(완전 해결·부분 개선·두 가지 함께)
 * info: project.lastDiagnose 모양 { at, reason: 'proven'|'timeout', byName, diagnose }
 * stale: 진단 뒤 배정 조건이 바뀜
 */
export function InfeasibleDialog({
  info, project, stale = false, onApply, onApplyStudent, onRediagnose, onRetryLonger,
  labelOf = (x) => x, canEdit = true, onClose,
}) {
  if (!info) return null
  const { diagnose, reason } = info
  const timeout = reason === 'timeout'
  const studentSugs = diagnose?.studentSuggestions || []
  const sugs = (diagnose?.suggestions || []).map(normSuggestion)
  const full = sugs.filter((s) => s.full)
  const partial = sugs.filter((s) => !s.full)
  const base = diagnose?.minUnassigned
  const causes = explainUnassigned(project, diagnose)
  const names = (sids) => sids.map((x) => labelOf(String(x))).join(', ')

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        {timeout ? '제한 시간 안에 모든 학생을 배정하는 해를 찾지 못했습니다' : '이 설정으로는 모든 학생을 배정할 수 없습니다'}
        {info.at && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            진단 {fmtAt(info.at)}{info.byName ? ` · ${info.byName}` : ''}
          </Typography>
        )}
      </DialogTitle>
      <DialogContent dividers>
        {stale && (
          <Alert severity="info" sx={{ mb: 2 }}
            action={onRediagnose && canEdit ? <Button color="inherit" size="small" onClick={onRediagnose}>다시 진단</Button> : null}>
            진단한 뒤 분반 수·고정·인원 조건·학생 신청이 바뀌었습니다. 아래 결과는 그때 기준이라 지금과 다를 수 있습니다.
          </Alert>
        )}
        {timeout ? (
          <Alert severity="warning" sx={{ mb: 2 }}
            action={onRetryLonger && canEdit ? <Button color="inherit" size="small" onClick={onRetryLonger}>5분 동안 다시 계산</Button> : null}>
            해가 없다는 <b>증명은 아닙니다</b>. 시간을 더 주면 풀릴 수도 있습니다. 아래는 지금까지 찾은 &quot;남는 학생이 가장 적은 배치&quot; 기준 진단입니다.
          </Alert>
        ) : (
          <Alert severity="warning" sx={{ mb: 2 }}>
            솔버가 지금 분반 수·그룹·고정·인원 조건으로는 해가 없다는 것을 증명했습니다. 지금 규칙을 하나 이상 바꿔야 하며, 아래 대안 중 하나를 적용하면 다시 계산합니다.
          </Alert>
        )}

        {base > 0 && info.currentUnassigned != null && info.currentUnassigned < base && (
          <Alert severity="info" sx={{ mb: 2 }}
            action={onRediagnose && canEdit ? <Button color="inherit" size="small" onClick={onRediagnose}>다시 진단</Button> : null}>
            진단 계산이 시간 안에 지금 배정(제자리 없는 학생 {info.currentUnassigned}명)보다 좋은 배치를 찾지 못했습니다.
            아래 남는 학생·학생 제안은 진단 배치 기준이라 실제보다 많게 나왔을 수 있습니다. 다시 진단하면 지금 배정에서 출발합니다.
          </Alert>
        )}
        {base === 0 && (
          <Alert severity="success" sx={{ mb: 2 }}>
            진단 계산에서는 모든 학생이 들어가는 배치를 찾았습니다. 해가 있으니 「5분 동안 다시 계산」으로 다시 시도해 보세요.
          </Alert>
        )}
        {base > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography fontWeight={700} sx={{ mb: 0.5 }}>
              조건을 그대로 두면 {timeout ? '' : '최소 '}{base}명이 남습니다
            </Typography>
            {causes.length ? (
              <>
                {causes.map((c) => (
                  <Box key={`${c.kind}|${c.text}`} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', mb: 0.75 }}>
                    <Chip size="small" label={KIND_LABEL[c.kind]?.label || c.kind} color={KIND_LABEL[c.kind]?.color || 'default'}
                      variant="outlined" sx={{ flexShrink: 0, mt: 0.1 }} />
                    <Box>
                      <Typography variant="body2">{c.text}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {c.sids.length > 1 ? `같은 이유 ${c.sids.length}명 — ` : ''}{names(c.sids)}
                      </Typography>
                    </Box>
                  </Box>
                ))}
                <Typography variant="caption" color="text.secondary">
                  원인은 남는 학생이 가장 적은 그룹 배치를 기준으로 짚었습니다. 그룹 배치가 달라지면 막히는 학생도 달라질 수 있습니다.
                </Typography>
              </>
            ) : (
              <>
                {diagnose.unassigned.map((u) => (
                  <Typography key={u.id} variant="body2">· <b>{labelOf(String(u.id))}</b> — {u.subjects.join(', ')}</Typography>
                ))}
                <Typography variant="caption" color="text.secondary">
                  이 학생의 과목 조합을 다른 학생과 겹치지 않게 놓을 그룹이 없습니다. 분반을 늘리거나, 학생 상담으로 과목을 바꾸는 방법이 있습니다.
                </Typography>
              </>
            )}
          </Box>
        )}

        <Typography fontWeight={700} sx={{ mb: 0.5 }}>풀리는 대안 — 규칙·조건 바꾸기 (분반 평균 인원이 많은 과목부터 시험한 순서)</Typography>
        {full.length ? (
          <Table size="small" sx={{ mb: 1 }}>
            <TableHead>
              <TableRow><TableCell>바꿀 것</TableCell><TableCell align="center">분반 평균 인원</TableCell><TableCell align="center">분반 편차 최대</TableCell><TableCell align="center">편차 합계</TableCell><TableCell /></TableRow>
            </TableHead>
            <TableBody>
              {full.map((s) => (
                <TableRow key={s.label}>
                  <TableCell>
                    {s.label}
                    {s.changes.length > 1 && <Chip size="small" color="secondary" variant="outlined" label="두 가지 함께" sx={{ ml: 0.75, height: 18, fontSize: 11 }} />}
                  </TableCell>
                  <TableCell align="center">{s.avgBefore != null ? `${s.avgBefore} → ${s.avgAfter}명` : '—'}</TableCell>
                  <TableCell align="center">{s.worstSpread ?? '—'}{s.worstSpread != null ? '명' : ''}</TableCell>
                  <TableCell align="center">{s.spreadSum ?? '—'}</TableCell>
                  <TableCell align="right"><Button size="small" variant="contained" disabled={!canEdit} onClick={() => onApply(s)}>적용 후 다시 계산</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {partial.length
              ? '한두 가지를 바꿔서 모두 배정되는 대안은 찾지 못했습니다. 아래 부분 개선을 적용하면 남는 학생이 줄고, 남은 학생으로 다시 진단합니다.'
              : '한두 가지를 바꿔서는 풀리지 않았습니다. 1분반 과목의 분반을 늘리거나, 고정·분리 규칙을 풀고 다시 시도하세요.'}
          </Typography>
        )}

        {partial.length > 0 && (
          <>
            <Typography fontWeight={700} sx={{ mb: 0.5, mt: 1.5 }}>부분 개선 — 모두 풀리지는 않지만 남는 학생이 줄어드는 대안</Typography>
            <Table size="small">
              <TableHead>
                <TableRow><TableCell>바꿀 것</TableCell><TableCell align="center">남는 학생</TableCell><TableCell align="center">분반 평균 인원</TableCell><TableCell /></TableRow>
              </TableHead>
              <TableBody>
                {partial.map((s) => (
                  <TableRow key={s.label}>
                    <TableCell>
                      {s.label}
                      {s.changes.length > 1 && <Chip size="small" color="secondary" variant="outlined" label="두 가지 함께" sx={{ ml: 0.75, height: 18, fontSize: 11 }} />}
                    </TableCell>
                    <TableCell align="center" sx={{ whiteSpace: 'nowrap' }}>{base != null ? `${base} → ` : ''}<b>{s.remaining}명</b> 이하</TableCell>
                    <TableCell align="center">{s.avgBefore != null ? `${s.avgBefore} → ${s.avgAfter}명` : '—'}</TableCell>
                    <TableCell align="right"><Button size="small" variant="outlined" disabled={!canEdit} onClick={() => onApply(s)}>적용 후 다시 계산</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Typography variant="caption" color="text.secondary">
              &quot;이하&quot;는 짧은 시험 계산에서 찾은 값이라 실제로는 더 줄 수도 있다는 뜻입니다.
            </Typography>
          </>
        )}

        {diagnose?.unassigned?.length > 0 && (
          <StudentSuggestions sugs={studentSugs} nStudents={diagnose.unassigned.length} labelOf={labelOf}
            canEdit={canEdit} onApplyStudent={onApplyStudent} />
        )}
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          현재 분반 {project.subjects.reduce((a, s) => a + s.sections, 0)}개 · 그룹 {project.slots.length}개
          {Array.isArray(project.rooms) && project.rooms.some((r) => r !== null && r !== undefined && r !== '')
            ? ` · 그룹별 교실 ${project.slots.map((l, t) => `${l} ${project.rooms[t] ?? '∞'}`).join(' · ')}` : ''}
        </Typography>
      </DialogContent>
      <DialogActions>
        {!stale && onRediagnose && canEdit && <Button onClick={onRediagnose}>다시 진단</Button>}
        <Button onClick={onClose}>닫기</Button>
      </DialogActions>
    </Dialog>
  )
}

/**
 * 학생 과목 조정 제안 — 최후 수단이라 분반·규칙 대안 아래에 둔다.
 * 학생마다 가장 좋은 후보 1줄, 나머지는 「다른 후보」로 접는다. 대상 학생이 3명을 넘으면 칸 전체를 접어 둔다.
 */
function StudentSuggestions({ sugs, nStudents, labelOf, canEdit, onApplyStudent }) {
  const byStudent = []
  const seen = new Map()
  for (const sg of sugs) {
    const id = String(sg.id)
    if (!seen.has(id)) { seen.set(id, byStudent.length); byStudent.push({ id, list: [] }) }
    byStudent[seen.get(id)].list.push(sg)
  }
  const [open, setOpen] = useState(byStudent.length <= 3)
  const [more, setMore] = useState({})
  const nVerified = byStudent.filter((x) => x.list[0]?.verified).length

  const row = (sg, first, extra) => {
    const sw = swapsOf(sg)
    return (
      <TableRow key={`${sg.id}:${sw.map((x) => `${x.from}>${x.to}`).join(',')}`} sx={first ? undefined : { bgcolor: '#fafafa' }}>
        <TableCell sx={{ whiteSpace: 'nowrap' }}>{first ? <b>{labelOf(String(sg.id))}</b> : <Typography variant="caption" color="text.secondary">다른 후보</Typography>}</TableCell>
        <TableCell sx={{ fontSize: 12.5, color: 'text.secondary' }}>{first ? (sg.subjects || []).join(', ') : ''}</TableCell>
        <TableCell sx={{ whiteSpace: 'nowrap' }}>
          {sw.map((x) => (
            <div key={`${x.from}>${x.to}`}>{x.from} → <b>{x.to}</b>{x.block ? ` (${x.block})` : ''}</div>
          ))}
          {sw.length > 1 && <Chip size="small" label="두 과목" sx={{ height: 18, fontSize: 11 }} />}
        </TableCell>
        <TableCell align="center" sx={{ whiteSpace: 'nowrap' }}>
          {sg.verified ? <Typography variant="body2" color="success.main" fontWeight={700}>전체 배정 가능 ✓{sg.worstSpread != null ? ` · 편차 ${sg.worstSpread}명` : ''}</Typography>
            : sg.remaining != null ? <Typography variant="body2" color="text.secondary">남는 학생 {sg.remaining}명</Typography>
              : <Typography variant="body2" color="text.secondary">빠른 판정만</Typography>}
          {extra}
        </TableCell>
        <TableCell align="right">
          <Button size="small" variant="outlined" disabled={!canEdit || !onApplyStudent} onClick={() => onApplyStudent(sg)}>바꾸고 다시 계산</Button>
        </TableCell>
      </TableRow>
    )
  }

  return (
    <Box sx={{ mt: 2.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        <Typography fontWeight={700}>학생 과목 조정 제안 — 최후 수단 (같은 칸막이 안에서 과목 바꾸기)</Typography>
        {byStudent.length > 0 && (
          <Button size="small" onClick={() => setOpen((v) => !v)}>
            {open ? '접기' : `펼치기 (학생 ${byStudent.length}명${nVerified ? ` · 전체 배정 확인 ${nVerified}명` : ''})`}
          </Button>
        )}
      </Box>
      {!byStudent.length ? (
        <Typography variant="body2" color="text.secondary">과목 한두 개를 바꿔서 들어갈 수 있는 조합을 찾지 못했습니다.</Typography>
      ) : !open ? (
        <Typography variant="body2" color="text.secondary">
          {nStudents > 3 ? `남는 학생이 ${nStudents}명이라 학생 과목을 바꾸기보다 위의 분반·규칙 대안을 먼저 보세요.` : '학생 신청을 바꾸는 제안입니다.'}
        </Typography>
      ) : (
        <>
          <Table size="small">
            <TableHead>
              <TableRow><TableCell>대상 학생</TableCell><TableCell>지금 신청</TableCell><TableCell>제안</TableCell><TableCell align="center">확인</TableCell><TableCell /></TableRow>
            </TableHead>
            <TableBody>
              {byStudent.flatMap(({ id, list }) => {
                const rest = list.slice(1)
                const toggle = rest.length ? (
                  <Button size="small" sx={{ display: 'block', mx: 'auto', minWidth: 0, p: 0, fontSize: 11.5 }}
                    onClick={() => setMore((m) => ({ ...m, [id]: !m[id] }))}>
                    {more[id] ? '다른 후보 접기' : `다른 후보 ${rest.length}개`}
                  </Button>
                ) : null
                return [row(list[0], true, toggle), ...(more[id] ? rest.map((sg) => row(sg, false)) : [])]
              })}
            </TableBody>
          </Table>
          <Typography variant="caption" color="text.secondary">
            학생·학부모 상담으로 바꿀 과목을 정한 뒤 적용하세요. &quot;전체 배정 가능&quot;은 그 학생만 바꾸면 모든 학생이 배정되는 것을 솔버로 확인한 제안이고,
            &quot;빠른 판정만&quot;은 진단 배치에 들어갈 자리가 있는지만 본 것입니다.
          </Typography>
        </>
      )}
    </Box>
  )
}
