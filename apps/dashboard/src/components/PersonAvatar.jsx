/**
 * 사람 아바타 — 사진(photoURL)이 있으면 사진, 없으면 이름 첫 글자 + 고정 색 원
 * (avatars.js). AppRail·Directory·프로필 카드·구성원 상세가 전부 이걸 쓴다 — 같은
 * 사람이 화면마다 다른 모양으로 보이면 "저 원이 그 사람이다"를 새로 익혀야 한다.
 *
 * 모양은 정사각형에 모서리만 살짝 둥글게(사용자 요청, 2026-08-27) — MUI Avatar
 * 기본(원형) 대신 variant="rounded" + 크기 비례 radius를 쓴다. 이 radius를 쓰는
 * 다른 자리(EditableAvatar.jsx의 겹침 오버레이, AppRail.jsx의 버튼 테두리)도 같은
 * 값을 써야 사진 위에 원형 그림자가 어긋나 보이지 않는다 — AVATAR_RADIUS로 공유.
 */
import Avatar from '@mui/material/Avatar'
import { colorForName, initialFor } from '@shared/lib/avatars'

/** size(px) → 모서리 radius. 퍼센트로 하면 사진마다 픽셀 값이 달라져 EditableAvatar의
 *  오버레이와 어긋난다 — 호출부가 같은 size를 넘겨 같은 값을 계산하게 함수로 둔다. */
export function avatarRadius(size) {
  return Math.round(size * 0.28)
}

export default function PersonAvatar({ name, photoURL, size = 32, sx, ...rest }) {
  return (
    <Avatar
      variant="rounded"
      src={photoURL || undefined}
      alt={name || ''}
      sx={{
        width: size, height: size,
        borderRadius: `${avatarRadius(size)}px`,
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
