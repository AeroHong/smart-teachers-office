/**
 * 사람 아바타 — 사진(photoURL)이 있으면 사진, 없으면 성을 뺀 이름(예: "창기") + 고정
 * 색 상자(avatars.js). AppRail·Directory·프로필 패널·구성원 상세·채널 메시지가 전부
 * 이걸 쓴다 — 같은 사람이 화면마다 다른 모양으로 보이면 "저 상자가 그 사람이다"를
 * 새로 익혀야 한다.
 *
 * 성 하나만 쓰면(첫 글자) "김"·"이"·"박"처럼 겹치는 사람이 많아 구분이 잘 안 됐다
 * (사용자 요청, 2026-08-27) — 이름에서 실제로 서로 다른 부분(성 뺀 나머지)을 쓴다.
 * 글자가 두 자로 늘어난 만큼 폰트 크기를 첫 글자 하나만 쓰던 때보다 줄였다.
 *
 * 모양은 정사각형에 모서리만 살짝 둥글게(사용자 요청, 2026-08-27) — MUI Avatar
 * 기본(원형) 대신 variant="rounded" + 크기 비례 radius를 쓴다. 이 radius를 쓰는
 * 다른 자리(EditableAvatar.jsx의 겹침 오버레이, AppRail.jsx의 버튼 테두리)도 같은
 * 값을 써야 사진 위에 원형 그림자가 어긋나 보이지 않는다 — avatarRadius()로 공유.
 */
import Avatar from '@mui/material/Avatar'
import { colorForName, givenNameFor } from '@shared/lib/avatars'

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
        fontSize: Math.round(size * 0.32),
        fontWeight: 700,
        ...(!photoURL && { bgcolor: colorForName(name) }),
        ...sx,
      }}
      {...rest}
    >
      {!photoURL && givenNameFor(name)}
    </Avatar>
  )
}
