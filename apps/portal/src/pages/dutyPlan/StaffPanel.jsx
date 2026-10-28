import { useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import Menu from '@mui/material/Menu'
import Tooltip from '@mui/material/Tooltip'
import Autocomplete from '@mui/material/Autocomplete'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import { staffLoad, unlinkedNames } from '@shared/lib/dutyPlan'
import { NAME_DRAG, PERSON_DRAG, hasType, nameDragStore } from './dutyDnd'
import { outlinedSx } from './fields'
import { ACCENT, ACCENT_BG } from './dutyUi'

const FLAGS = ['', '전출예정', '휴직', '전입']

/**
 * 교직원 — 시스템 사용자(교직원 계정)만 보여 준다. 사람·검색은 늘 계정 기준이다(hwpx 이름은 처음 올릴 때만 쓴다).
 * 끌어서 성명·담임 칸에 놓고, 표의 이름 카드를 여기로 끌어 놓으면 그 줄을 비운다.
 * hwpx에서 계정과 못 맞춘 이름은 위쪽 '계정과 잇지 않은 이름'에서 계정과 잇는다(그 이름의 모든 자리가 함께 이어진다).
 *   staff: 교직원 명단(useStaffDirectory) — 강사·관리자는 뺀다
 *   onChange(kind, arg): 'flag' { uid, name, subject, flag } · 'link' { name, uid, newName, subject } · 'unassign' { dutyId }
 */
export default function StaffPanel({ data, staff, wishByUid, onChange, onPick, picked }) {
  const [filter, setFilter] = useState('')
  const [menu, setMenu] = useState(null) // { anchor, item }
  const [linkFor, setLinkFor] = useState(null) // 이름 → 계정 잇기
  const [over, setOver] = useState(false)
  const people = useMemo(() => {
    const flags = new Map((data.staffPool || []).filter((p) => p.uid).map((p) => [p.uid, p.flag]))
    return staff.filter((s) => s.staffType !== '강사' && s.rank !== '관리자')
      .map((s) => ({ uid: s.uid, name: s.name, subject: s.subject || '', department: s.department || '', flag: flags.get(s.uid) }))
  }, [staff, data.staffPool])
  const load = useMemo(() => staffLoad({ ...data, staffPool: people }), [data, people])
  const unlinked = useMemo(() => unlinkedNames(data), [data])
  const cardTitle = useMemo(() => new Map((data.duties || []).map((d) => [d.dutyKey, d.title])), [data.duties])

  const shown = load
    .filter((l) => !filter || `${l.person.name}${l.person.subject}${l.person.department}`.includes(filter))
    .sort((a, b) => (a.duties.length ? 1 : 0) - (b.duties.length ? 1 : 0) || a.person.name.localeCompare(b.person.name, 'ko'))
  const unplaced = load.filter((l) => !l.duties.length && !['전출예정', '휴직'].includes(l.person.flag)).length

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, outline: over ? `2px dashed ${ACCENT}` : 'none', borderRadius: 1 }}
      onDragOver={(e) => { if (hasType(e, NAME_DRAG)) { e.preventDefault(); setOver(true); nameDragStore.over('unassign', false, '') } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(false) }}
      onDrop={(e) => {
        if (!hasType(e, NAME_DRAG)) return
        e.preventDefault(); setOver(false)
        onChange('unassign', { dutyId: e.dataTransfer.getData(NAME_DRAG) })
      }}>
      <Box sx={{ display: 'flex', alignItems: 'center', px: 0.25 }}>
        <Typography sx={{ fontWeight: 800, fontSize: '0.95rem' }}>교직원</Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary', ml: 0.5 }}>계정 {load.length}명 · 업무 없음 {unplaced}</Typography>
      </Box>
      <TextField size="small" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="이름·과목·부서로 찾기" sx={outlinedSx} />
      {!staff.length && <Typography variant="caption" sx={{ color: 'text.secondary' }}>교직원 명단을 불러오는 중…</Typography>}

      {unlinked.length > 0 && (
        <Box sx={{ p: 1, borderRadius: 1.5, bgcolor: '#fff7ed', border: '1px solid #fdba74' }}>
          <Typography sx={{ fontWeight: 800, fontSize: '0.82rem', color: '#9a3412' }}>계정과 잇지 않은 이름 {unlinked.length}</Typography>
          <Typography variant="caption" sx={{ color: '#9a3412', display: 'block', mb: 0.5 }}>hwpx에서 계정과 못 맞춘 이름입니다. 눌러서 교직원 계정과 이으세요.</Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
            {unlinked.map((n) => (
              <Box key={n} onClick={() => setLinkFor(n)}
                sx={{ px: 0.75, py: 0.25, borderRadius: 1, bgcolor: '#fff', border: '1px solid #fdba74', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', '&:hover': { borderColor: ACCENT } }}>
                {n}
              </Box>
            ))}
          </Box>
        </Box>
      )}

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {shown.map((l) => {
          const w = wishByUid?.get(l.person.uid)
          const first = w?.choices?.find((c) => c.rank === 1)
          const out = ['전출예정', '휴직'].includes(l.person.flag)
          const active = picked === l.key
          return (
            <Box key={l.key} draggable={!out}
              onDragStart={(e) => { e.dataTransfer.setData(PERSON_DRAG, JSON.stringify({ uid: l.person.uid, name: l.person.name, subject: l.person.subject })); e.dataTransfer.effectAllowed = 'copy' }}
              onClick={() => onPick?.(active ? null : l.key, l.person)}
              onContextMenu={(e) => { e.preventDefault(); setMenu({ anchor: e.currentTarget, item: l }) }}
              sx={{
                px: 1, py: 0.6, borderRadius: 1.25, bgcolor: active ? '#ffedd5' : '#fff', cursor: out ? 'default' : 'grab',
                border: `1px solid ${active ? ACCENT : l.duties.length ? '#e2e8f0' : '#fdba74'}`, opacity: out ? 0.5 : 1,
                '&:hover': { bgcolor: active ? '#ffedd5' : ACCENT_BG },
              }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Typography sx={{ fontWeight: 800, fontSize: '0.85rem' }}>{l.person.name}</Typography>
                {l.person.subject && <Typography variant="caption" sx={{ color: 'text.secondary' }}>{l.person.subject}</Typography>}
                {l.person.flag && <Typography variant="caption" sx={{ color: '#7c3aed', fontWeight: 700 }}>{l.person.flag}</Typography>}
                <Box sx={{ flex: 1 }} />
                {l.homeroom && <Typography variant="caption" sx={{ color: '#15803d', fontWeight: 700 }}>{l.homeroom.grade}-{l.homeroom.classNo}</Typography>}
                {l.sub && <Typography variant="caption" sx={{ color: '#64748b' }}>부{l.sub.grade}-{l.sub.classNo}</Typography>}
                <Typography variant="caption" sx={{ fontWeight: 800, color: l.duties.length ? ACCENT : '#94a3b8', minWidth: 14, textAlign: 'right' }}>{l.duties.length}</Typography>
              </Box>
              {(l.duties.length > 0 || first) && (
                <Typography variant="caption" sx={{ display: 'block', color: '#64748b', lineHeight: 1.35, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {l.duties.map((d) => d.title).join(', ')}
                  {first && (
                    <Tooltip title={[...(w.choices || [])].sort((a, b) => a.rank - b.rank).map((c) => `${c.rank}지망 ${c.title || cardTitle.get(c.dutyKey) || ''}`).join(' · ') + (w.homeroom ? ` · ${w.homeroom}${w.homeroomGrade ? ` ${w.homeroomGrade}학년` : ''}` : '')}>
                      <Box component="span" sx={{ ml: l.duties.length ? 0.75 : 0, color: '#2563eb' }}>희망 {first.title || cardTitle.get(first.dutyKey) || ''}</Box>
                    </Tooltip>
                  )}
                </Typography>
              )}
            </Box>
          )
        })}
      </Box>
      <Typography variant="caption" sx={{ color: 'text.secondary', px: 0.25 }}>
        끌어서 성명·담임 칸에 놓기 · 누르면 그 사람 줄 강조 · 오른쪽 클릭으로 전출예정·휴직 표시 · 표의 이름 카드를 여기 놓으면 그 줄 비우기
      </Typography>

      <Menu open={Boolean(menu)} anchorEl={menu?.anchor} onClose={() => setMenu(null)}>
        {FLAGS.map((f) => (
          <MenuItem key={f || 'none'} selected={(menu?.item.person.flag || '') === f}
            onClick={() => { onChange('flag', { ...menu.item.person, flag: f }); setMenu(null) }}>{f || '표시 없음'}</MenuItem>
        ))}
      </Menu>

      <Dialog open={Boolean(linkFor)} onClose={() => setLinkFor(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>'{linkFor}' 계정과 잇기</DialogTitle>
        <DialogContent sx={{ pt: '8px !important' }}>
          <Autocomplete size="small" options={staff} getOptionLabel={(s) => `${s.name}${s.department ? ` (${s.department})` : ''}`}
            onChange={(_, v) => { if (v) { onChange('link', { name: linkFor, uid: v.uid, newName: v.name, subject: v.subject }); setLinkFor(null) } }}
            renderInput={(p) => <TextField {...p} autoFocus placeholder="교직원 계정 고르기" />} />
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1 }}>이 이름으로 들어 있는 성명·담임·교과부장 자리가 모두 이 계정으로 바뀝니다.</Typography>
        </DialogContent>
        <DialogActions><Button onClick={() => setLinkFor(null)}>닫기</Button></DialogActions>
      </Dialog>
    </Box>
  )
}
