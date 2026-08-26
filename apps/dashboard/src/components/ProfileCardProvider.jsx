/**
 * 프로필 — 어디서든 `useProfileCard().open(uid)` 한 줄로 띄운다. ToastProvider.jsx와
 * 같은 모양(Context + 최상위 한 번 마운트, App.jsx)이다.
 *
 * 오른쪽에서 슬라이드로 뜨는 패널이다(사용자 요청, 2026-08-27 — "우측 사이드바로
 * 바로 프로필이 나오도록"). 처음엔 클릭한 자리 옆에 뜨는 팝오버였는데, Slack의 프로필
 * 패널(오른쪽 고정)을 참고 삼아 바꿨다. Drawer(anchor="right")는 화면 오른쪽 끝에
 * 붙는 자리라 클릭한 요소 위치(anchorEl)가 필요 없다 — open()이 anchorEl 인자를
 * 여전히 받긴 하지만(기존 호출부를 안 고치려고) 안에서는 그냥 무시한다.
 *
 * 구성원 목록은 이 컴포넌트가 직접 useSchoolMembers()로 구독한다 — uid 하나만 따로
 * get()으로 읽으면 firestore.rules의 users/{uid} allow read가 본인 문서만 허용해서
 * 막힌다. 이미 list 쿼리로 전체를 읽어 오는 이 훅의 결과에서 uid로 찾아야 한다
 * (PLAN 조사 참고).
 *
 * ── 내 프로필일 때는 사진을 바로 바꿀 수 있다(2026-08-27) ──────────────
 * 처음엔 "카드는 보여주기만, 사진은 Members.jsx에서"로 좁혔는데, 정작 왼쪽 아래
 * 내 아바타를 눌렀을 때 그냥 구성원 화면으로 튕겨서 "편집할 데가 없다"는 지적을
 * 받았다(Slack은 아바타를 누르면 그 자리에서 바로 사진을 바꿀 수 있는 카드가 뜬다).
 * useMyAvatar.js(Members.jsx와 같은 훅)로 이 패널 자체에서 EditableAvatar를 쓴다.
 * 이름·부서·교과 등은 관리자가 배정하는 값(teacherAssignments)이라 이 앱에서 본인이
 * 직접 고치는 자리가 아니다 — 그래서 사진만 편집 가능하고 나머지는 그대로 보여준다.
 */
import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Drawer from '@mui/material/Drawer'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import CloseIcon from '@mui/icons-material/Close'
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined'
import { useAuth } from '@shared/contexts/AuthContext'
import PersonAvatar from './PersonAvatar'
import EditableAvatar from './EditableAvatar'
import useSchoolMembers from '../lib/useSchoolMembers'
import useMyAvatar from '../lib/useMyAvatar'

const ProfileCardContext = createContext(null)

export function useProfileCard() {
  const ctx = useContext(ProfileCardContext)
  return ctx || NOOP
}

const NOOP = { open: () => {} }

export default function ProfileCardProvider({ children }) {
  const { user } = useAuth()
  const { members, refetch } = useSchoolMembers()
  const navigate = useNavigate()
  const [uid, setUid] = useState(null)

  const open = useCallback((nextUid) => {
    if (!nextUid) return
    setUid(nextUid)
  }, [])
  const close = useCallback(() => setUid(null), [])

  const api = useMemo(() => ({ open }), [open])
  const member = uid ? members.find(m => m.uid === uid) : null
  const isMe = !!member && member.uid === user?.uid

  const { uploading, uploadAvatar, resetToGoogleAvatar } = useMyAvatar({ onChanged: refetch })

  return (
    <ProfileCardContext.Provider value={api}>
      {children}
      <Drawer anchor="right" open={!!uid && !!member} onClose={close}>
        {member && (
          <Box sx={{ width: 320, p: 2.5, display: 'flex', flexDirection: 'column', height: '100%' }}>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
              <IconButton size="small" onClick={close} aria-label="프로필 닫기">
                <CloseIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, mb: 2.5 }}>
              {isMe ? (
                <EditableAvatar
                  name={member.name} photoURL={member.photoURL} size={96}
                  uploading={uploading} onPick={uploadAvatar}
                />
              ) : (
                <PersonAvatar name={member.name} photoURL={member.photoURL} size={96} />
              )}
              <Box sx={{ textAlign: 'center' }}>
                <Typography fontSize="1.1rem" fontWeight={800}>{member.name}</Typography>
                {member.positionLabel && (
                  <Typography fontSize="0.82rem" color="text.secondary">{member.positionLabel}</Typography>
                )}
              </Box>
              {isMe && member.photoSource === 'custom' && user?.photoURL && (
                <Button
                  size="small" onClick={resetToGoogleAvatar}
                  sx={{ fontSize: '0.72rem', minWidth: 0 }}
                >
                  구글 계정 사진으로 되돌리기
                </Button>
              )}
            </Box>

            {member.email && (
              <Box sx={{
                display: 'flex', alignItems: 'center', gap: 0.8, mb: 2,
                px: 1.2, py: 0.8, borderRadius: 1, border: '1px solid', borderColor: 'divider',
              }}>
                <EmailOutlinedIcon sx={{ fontSize: 17, color: 'text.disabled', flexShrink: 0 }} />
                <Tooltip title="메일 보내기">
                  <Typography
                    component="a" href={`mailto:${member.email}`}
                    fontSize="0.82rem" fontWeight={600}
                    sx={{ color: 'primary.main', textDecoration: 'none', wordBreak: 'break-all', '&:hover': { textDecoration: 'underline' } }}
                  >
                    {member.email}
                  </Typography>
                </Tooltip>
              </Box>
            )}

            {member.department || member.subject || member.office || member.isHomeroom ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.8, mb: 2.5 }}>
                <CardField label="부서" value={member.department} />
                <CardField label="교과" value={member.subject} />
                <CardField label="사무실" value={member.office} />
                <CardField
                  label="담임"
                  value={member.isHomeroom
                    ? `${member.homeroomGrade}학년 ${member.homeroomClassNo ?? ''}반`.trim()
                    : ''}
                />
              </Box>
            ) : (
              <Typography color="text.secondary" fontSize="0.8rem" sx={{ mb: 2.5 }}>
                소속 정보가 없습니다.
              </Typography>
            )}

            <Box sx={{ flexGrow: 1 }} />

            <Button
              size="small" fullWidth
              onClick={() => { close(); navigate('/members') }}
              sx={{ fontSize: '0.78rem' }}
            >
              구성원 화면에서 보기
            </Button>
          </Box>
        )}
      </Drawer>
    </ProfileCardContext.Provider>
  )
}

function CardField({ label, value }) {
  if (!value) return null
  return (
    <Box sx={{ display: 'flex', gap: 1.2 }}>
      <Typography fontSize="0.8rem" color="text.secondary" sx={{ width: 48, flexShrink: 0 }}>
        {label}
      </Typography>
      <Typography fontSize="0.8rem" fontWeight={600}>{value}</Typography>
    </Box>
  )
}
