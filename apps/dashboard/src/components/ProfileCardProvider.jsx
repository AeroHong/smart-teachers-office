/**
 * 프로필 카드 — 어디서든 `useProfileCard().open(uid, anchorEl)` 한 줄로 띄운다.
 * ToastProvider.jsx와 같은 모양(Context + 최상위 한 번 마운트, App.jsx)이다.
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
 * useMyAvatar.js(Members.jsx와 같은 훅)로 이 카드 자체에서 EditableAvatar를 쓴다.
 * 이름·부서·교과 등은 관리자가 배정하는 값(teacherAssignments)이라 이 앱에서 본인이
 * 직접 고치는 자리가 아니다 — 그래서 사진만 편집 가능하고 나머지는 그대로 보여준다.
 */
import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Popover from '@mui/material/Popover'
import Typography from '@mui/material/Typography'
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
  const [state, setState] = useState(null)   // { uid, anchorEl }

  const open = useCallback((uid, anchorEl) => {
    if (!uid || !anchorEl) return
    setState({ uid, anchorEl })
  }, [])
  const close = useCallback(() => setState(null), [])

  const api = useMemo(() => ({ open }), [open])
  const member = state ? members.find(m => m.uid === state.uid) : null
  const isMe = !!member && member.uid === user?.uid

  const { uploading, uploadAvatar, resetToGoogleAvatar } = useMyAvatar({ onChanged: refetch })

  return (
    <ProfileCardContext.Provider value={api}>
      {children}
      <Popover
        open={!!state && !!member}
        anchorEl={state?.anchorEl}
        onClose={close}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        {member && (
          <Box sx={{ p: 2, width: 260 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2, mb: 1.5 }}>
              {isMe ? (
                <EditableAvatar
                  name={member.name} photoURL={member.photoURL} size={48}
                  uploading={uploading} onPick={uploadAvatar}
                />
              ) : (
                <PersonAvatar name={member.name} photoURL={member.photoURL} size={48} />
              )}
              <Box sx={{ minWidth: 0 }}>
                <Typography fontSize="0.98rem" fontWeight={800} noWrap>{member.name}</Typography>
                {member.positionLabel && (
                  <Typography fontSize="0.78rem" color="text.secondary" noWrap>
                    {member.positionLabel}
                  </Typography>
                )}
              </Box>
            </Box>

            {isMe && member.photoSource === 'custom' && user?.photoURL && (
              <Button
                size="small" onClick={resetToGoogleAvatar}
                sx={{ fontSize: '0.72rem', minWidth: 0, px: 0, mb: 1 }}
              >
                구글 계정 사진으로 되돌리기
              </Button>
            )}

            {member.department || member.subject || member.office || member.isHomeroom ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mb: 1.5 }}>
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
              <Typography color="text.secondary" fontSize="0.8rem" sx={{ mb: 1.5 }}>
                소속 정보가 없습니다.
              </Typography>
            )}

            <Button
              size="small" fullWidth
              onClick={() => { close(); navigate('/members') }}
              sx={{ fontSize: '0.78rem' }}
            >
              구성원 화면에서 보기
            </Button>
          </Box>
        )}
      </Popover>
    </ProfileCardContext.Provider>
  )
}

function CardField({ label, value }) {
  if (!value) return null
  return (
    <Box sx={{ display: 'flex', gap: 1 }}>
      <Typography fontSize="0.78rem" color="text.secondary" sx={{ width: 44, flexShrink: 0 }}>
        {label}
      </Typography>
      <Typography fontSize="0.78rem" fontWeight={600} noWrap>{value}</Typography>
    </Box>
  )
}
