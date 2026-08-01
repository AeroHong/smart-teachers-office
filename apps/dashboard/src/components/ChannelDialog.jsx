/**
 * 채널 만들기·고치기.
 *
 * 참여자는 글쓰기의 대상 조건을 그대로 쓴다(TargetPicker). "2학년 담임"을 채널
 * 참여자로 뽑는 일과 업무 대상으로 뽑는 일은 같은 문제라 규칙을 두 벌 둘 이유가 없고,
 * 쓰는 사람도 한 번 익히면 양쪽에서 쓴다.
 */
import { useEffect, useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { describeRule, resolveTargets } from '@shared/lib/targeting'
import {
  CHANNEL_DESCRIPTION_MAX, CHANNEL_NAME_MAX, newChannelPayload, validateChannelName,
} from '@shared/lib/channels'
import TargetPicker from './TargetPicker'
import useSchoolMembers from '../lib/useSchoolMembers'

const EMPTY_RULE = { conditions: [], includeUids: [], excludeUids: [] }

export default function ChannelDialog({ open, channel, existingNames = [], onClose, onSave }) {
  const { members, loading } = useSchoolMembers()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [rule, setRule] = useState(EMPTY_RULE)
  const [saving, setSaving] = useState(false)

  const editing = !!channel

  useEffect(() => {
    if (!open) return
    setName(channel?.name || '')
    setDescription(channel?.description || '')
    setRule(channel?.memberRule || EMPTY_RULE)
  }, [open, channel])

  const targets = useMemo(() => resolveTargets(rule, members).members, [rule, members])
  // 고칠 때는 자기 이름이 중복 검사에 걸리면 안 된다
  const otherNames = useMemo(
    () => existingNames.filter(n => n !== channel?.name),
    [existingNames, channel],
  )
  const nameError = name.trim() ? validateChannelName(name, otherNames) : null
  const canSave = name.trim() && !nameError && targets.length > 0 && !saving

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      await onSave({
        ...newChannelPayload({
          name,
          description,
          memberRule: rule,
          memberRuleText: describeRule(rule),
          members: targets,
        }),
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontSize: '1rem', fontWeight: 800 }}>
        {editing ? '채널 고치기' : '새 채널'}
      </DialogTitle>
      <DialogContent dividers>
        <TextField
          autoFocus fullWidth size="small" label="이름"
          placeholder="예: 성적-마감"
          value={name} onChange={e => setName(e.target.value)}
          error={!!nameError} helperText={nameError || `${name.trim().length}/${CHANNEL_NAME_MAX}`}
          inputProps={{ maxLength: CHANNEL_NAME_MAX }}
          sx={{ mb: 1.5 }}
        />
        <TextField
          fullWidth size="small" label="설명" placeholder="무엇을 다루는 채널인지 한 줄로"
          value={description} onChange={e => setDescription(e.target.value)}
          inputProps={{ maxLength: CHANNEL_DESCRIPTION_MAX }}
          sx={{ mb: 2 }}
        />

        <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.25, p: 1.5 }}>
          {loading
            ? <Typography color="text.secondary" fontSize="0.85rem">구성원 불러오는 중…</Typography>
            : <TargetPicker members={members} value={rule} onChange={setRule} label="참여자" />}
        </Box>
        <Typography fontSize="0.76rem" color="text.secondary" sx={{ mt: 0.8 }}>
          참여자는 조건으로 정합니다. 인사이동이 있으면 채널을 열어 다시 저장하면 갱신됩니다.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>취소</Button>
        <Button variant="contained" onClick={handleSave} disabled={!canSave}>
          {targets.length > 0 ? `${targets.length}명으로 ${editing ? '저장' : '만들기'}` : '저장'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
