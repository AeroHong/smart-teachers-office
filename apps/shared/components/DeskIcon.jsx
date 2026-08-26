/**
 * 책상을 위에서 내려다본 아이콘 (사무실 자리 배치용)
 *
 * 관리자 배치 편집기(portal)와 학생용 키오스크가 같은 그림을 쓰도록 공용으로 둔다.
 * 모니터 → 책상 상판 → 의자 순으로 위에서 아래로 배치해 자리 방향이 드러나게 했다.
 */
export default function DeskIcon({ size = 38, tone = '#94a3b8', active = false }) {
  const color = active ? '#3d5872' : tone
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 38 38"
      fill="none"
      aria-hidden="true"
      style={{ display: 'block', flexShrink: 0, transition: 'color .18s ease' }}
    >
      {/* 모니터 */}
      <rect x="12.5" y="3.5" width="13" height="3.4" rx="1.4" fill={color} opacity={active ? 0.75 : 0.5} />
      {/* 책상 상판 */}
      <rect
        x="3.5" y="9" width="31" height="14" rx="3"
        fill={color} fillOpacity={active ? 0.16 : 0.1}
        stroke={color} strokeOpacity={active ? 0.5 : 0.3} strokeWidth="1.3"
      />
      {/* 상판 위 서류 */}
      <rect x="7.5" y="12.5" width="9" height="7" rx="1.2" fill={color} opacity={active ? 0.35 : 0.22} />
      {/* 의자 */}
      <circle cx="19" cy="30" r="5.4" fill={color} fillOpacity={active ? 0.28 : 0.18} stroke={color} strokeOpacity={active ? 0.45 : 0.28} strokeWidth="1.3" />
    </svg>
  )
}
