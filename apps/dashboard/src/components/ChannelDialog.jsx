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
import FormControlLabel from '@mui/material/FormControlLabel'
import Switch from '@mui/material/Switch'
import LockIcon from '@mui/icons-material/LockOutlined'
import CampaignIcon from '@mui/icons-material/CampaignOutlined'
import { describeRule, resolveTargets } from '@shared/lib/targeting'
import {
  CHANNEL_DESCRIPTION_MAX, CHANNEL_NAME_MAX, POST_POLICY, VISIBILITY,
  channelPostPolicy, channelVisibility, newChannelPayload, validateChannelName,
} from '@shared/lib/channels'
import TargetPicker from './TargetPicker'
import useSchoolMembers from '../lib/useSchoolMembers'

const EMPTY_RULE = { conditions: [], includeUids: [], excludeUids: [] }

/**
 * @param {object} [preset] 새 채널을 미리 채워 연다(디렉터리의 그룹 → '채널 만들기').
 *   조건까지 담아 오므로 참여자 선택기가 이미 그 사람들을 가리킨 채로 열린다. 고치기와
 *   구분해 받는 이유는 channel이 있으면 "고치는 중"으로 판정되기 때문이다 — preset을
 *   channel로 넘기면 저장이 update로 가서 있지도 않은 문서를 고치려 든다.
 */
export default function ChannelDialog({ open, channel, preset, existingNames = [], onClose, onSave }) {
  const { members, loading } = useSchoolMembers()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [rule, setRule] = useState(EMPTY_RULE)
  const [isPrivate, setIsPrivate] = useState(false)
  const [ownerOnly, setOwnerOnly] = useState(false)
  const [saving, setSaving] = useState(false)

  const editing = !!channel

  useEffect(() => {
    if (!open) return
    setName(channel?.name || preset?.name || '')
    setDescription(channel?.description || '')
    setRule(channel?.memberRule || preset?.memberRule || EMPTY_RULE)
    setIsPrivate(channelVisibility(channel) === VISIBILITY.PRIVATE)
    setOwnerOnly(channelPostPolicy(channel) === POST_POLICY.OWNER)
  }, [open, channel, preset])

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
          visibility: isPrivate ? VISIBILITY.PRIVATE : VISIBILITY.PUBLIC,
          postPolicy: ownerOnly ? POST_POLICY.OWNER : POST_POLICY.MEMBERS,
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
          참여자는 조건으로 정합니다. 인사이동으로 조건에 맞는 사람이 달라지면 채널 머리에
          갱신 안내가 뜨고, 거기서 누가 들어오고 빠지는지 확인한 뒤 갱신합니다.
        </Typography>

        <Box sx={{ mt: 2, pt: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
          <FormControlLabel
            control={<Switch size="small" checked={isPrivate} onChange={e => setIsPrivate(e.target.checked)} />}
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>
                <LockIcon sx={{ fontSize: 16, color: isPrivate ? 'warning.main' : 'text.disabled' }} />
                <Typography fontSize="0.85rem" fontWeight={600}>비공개 채널</Typography>
              </Box>
            }
          />
          <Typography fontSize="0.74rem" color="text.secondary" sx={{ ml: 4.5, mt: -0.3 }}>
            {isPrivate
              // 공개 채널과 다른 점을 "이름조차"로 못 박는다. 보통은 "내용이 안 보인다"로
              // 읽는데, 그렇게 알고 만들면 감췄다고 믿은 것이 목록에 남는다.
              ? '참여자가 아니면 이 채널이 있다는 것조차 알 수 없습니다. 목록·검색 어디에도 나오지 않고, 채널에 올린 글도 참여자만 봅니다.'
              : '소속 교사 누구나 채널 이름과 글을 볼 수 있습니다. 참여자가 아닌 사람도 보고 "넣어달라"고 말할 수 있습니다.'}
          </Typography>

          <FormControlLabel
            sx={{ mt: 1 }}
            control={<Switch size="small" checked={ownerOnly} onChange={e => setOwnerOnly(e.target.checked)} />}
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>
                <CampaignIcon sx={{ fontSize: 16, color: ownerOnly ? 'primary.main' : 'text.disabled' }} />
                <Typography fontSize="0.85rem" fontWeight={600}>공지 전용</Typography>
              </Box>
            }
          />
          <Typography fontSize="0.74rem" color="text.secondary" sx={{ ml: 4.5, mt: -0.3 }}>
            {ownerOnly
              ? '만든 사람과 관리자만 글을 씁니다. 부장회의 안내처럼 일방 안내만 필요한 채널에 씁니다.'
              : '참여자 누구나 글을 쓰고 되물을 수 있습니다.'}
          </Typography>
        </Box>
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
