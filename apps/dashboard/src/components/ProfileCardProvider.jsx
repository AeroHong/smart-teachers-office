/**
 * 동료 프로필 카드 — 어디서든 `useProfileCard().open(uid, anchorEl)` 한 줄로 띄운다.
 * ToastProvider.jsx와 같은 모양(Context + 최상위 한 번 마운트, App.jsx)이다.
 *
 * 구성원 목록은 이 컴포넌트가 직접 useSchoolMembers()로 구독한다 — uid 하나만 따로
 * get()으로 읽으면 firestore.rules의 users/{uid} allow read가 본인 문서만 허용해서
 * 막힌다. 이미 list 쿼리로 전체를 읽어 오는 이 훅의 결과에서 uid로 찾아야 한다
 * (PLAN 조사 참고).
 *
 * 사진을 바꾸는 기능은 여기 없다 — 정보를 보여주기만 한다. 내 프로필도 Members.jsx
 * 상세 칸에서 고친다(한 자리 원칙, PLAN 참고).
 */
import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Popover from '@mui/material/Popover'
import Typography from '@mui/material/Typography'
import PersonAvatar from './PersonAvatar'
import useSchoolMembers from '../lib/useSchoolMembers'

const ProfileCardContext = createContext(null)

export function useProfileCard() {
  const ctx = useContext(ProfileCardContext)
  return ctx || NOOP
}

const NOOP = { open: () => {} }

export default function ProfileCardProvider({ children }) {
  const { members } = useSchoolMembers()
  const navigate = useNavigate()
  const [state, setState] = useState(null)   // { uid, anchorEl }

  const open = useCallback((uid, anchorEl) => {
    if (!uid || !anchorEl) return
    setState({ uid, anchorEl })
  }, [])
  const close = useCallback(() => setState(null), [])

  const api = useMemo(() => ({ open }), [open])
  const member = state ? members.find(m => m.uid === state.uid) : null

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
              <PersonAvatar name={member.name} photoURL={member.photoURL} size={48} />
              <Box sx={{ minWidth: 0 }}>
                <Typography fontSize="0.98rem" fontWeight={800} noWrap>{member.name}</Typography>
                {member.positionLabel && (
                  <Typography fontSize="0.78rem" color="text.secondary" noWrap>
                    {member.positionLabel}
                  </Typography>
                )}
              </Box>
            </Box>

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
