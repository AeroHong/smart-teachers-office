/**
 * 눌러서 바꾸는 아바타 — 본인 프로필에서만 쓴다(Members.jsx 상세 칸, ProfileCardProvider.jsx
 * 내 프로필 카드). 평소엔 PersonAvatar와 똑같이 보이다가, 마우스를 올리면 "바꾸기"가
 * 겹쳐 뜬다 — 눌러도 아무 반응 없는 사진은 오히려 "고장 났나"로 읽힌다.
 */
import { useRef } from 'react'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import PersonAvatar, { avatarRadius } from './PersonAvatar'

export default function EditableAvatar({ name, photoURL, size = 56, uploading, onPick }) {
  const inputRef = useRef(null)
  const radius = avatarRadius(size)

  return (
    <Box
      component="button" type="button"
      onClick={() => inputRef.current?.click()}
      disabled={uploading}
      sx={{
        position: 'relative', border: 0, background: 'none', p: 0, borderRadius: `${radius}px`,
        cursor: uploading ? 'default' : 'pointer', flexShrink: 0,
        '&:hover .avatar-hint': { opacity: 1 },
      }}
      aria-label="프로필 사진 바꾸기"
    >
      <PersonAvatar name={name} photoURL={photoURL} size={size} />
      {uploading ? (
        <Box sx={{
          position: 'absolute', inset: 0, borderRadius: `${radius}px`,
          bgcolor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <CircularProgress size={Math.round(size * 0.36)} sx={{ color: '#fff' }} />
        </Box>
      ) : (
        <Box
          className="avatar-hint"
          sx={{
            position: 'absolute', inset: 0, borderRadius: `${radius}px`,
            bgcolor: 'rgba(0,0,0,0.35)', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.62rem', fontWeight: 700, opacity: 0, transition: 'opacity .12s ease',
          }}
        >
          바꾸기
        </Box>
      )}
      <input
        ref={inputRef} type="file" accept="image/*" hidden
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; onPick(f) }}
      />
    </Box>
  )
}
