/**
 * 사람 아바타 — 사진(photoURL)이 있으면 사진, 없으면 이름 첫 글자 + 고정 색 원
 * (avatars.js). AppRail·Directory·프로필 카드·구성원 상세가 전부 이걸 쓴다 — 같은
 * 사람이 화면마다 다른 모양으로 보이면 "저 원이 그 사람이다"를 새로 익혀야 한다.
 */
import Avatar from '@mui/material/Avatar'
import { colorForName, initialFor } from '@shared/lib/avatars'

export default function PersonAvatar({ name, photoURL, size = 32, sx, ...rest }) {
  return (
    <Avatar
      src={photoURL || undefined}
      alt={name || ''}
      sx={{
        width: size, height: size,
        fontSize: Math.round(size * 0.42),
        fontWeight: 700,
        ...(!photoURL && { bgcolor: colorForName(name) }),
        ...sx,
      }}
      {...rest}
    >
      {!photoURL && initialFor(name)}
    </Avatar>
  )
}
