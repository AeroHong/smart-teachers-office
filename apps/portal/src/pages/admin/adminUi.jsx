/**
 * 관리자 페이지 공용 UI.
 *
 * 관리자 화면이 페이지마다 따로 자라면서 같은 동작이 서로 다른 모양으로 나뉘었다.
 * 삭제 하나만 해도 생 <button> + 인라인 스타일, IconButton, 배경색만 빨갛게 덮어쓴
 * 버튼이 섞여 있었고 파란색도 세 종류(#1a73e8 / #4f46e5 / MUI 기본)였다.
 *
 * 규칙
 *  - 표 안의 표준 동작(수정·삭제)은 아이콘 + 툴팁. 열이 많은 표에서 가로 폭을 아낀다.
 *  - 의미가 특수해 아이콘으로 유추되지 않는 동작(역할 변경 등)은 텍스트 버튼.
 *  - 파괴적 동작은 error 색만 쓴다. 배경색을 직접 지정하지 않는다.
 *  - 색은 MUI 테마 팔레트를 쓴다. hex를 새로 만들지 않는다.
 */
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'

/** 표 한 행의 액션들을 담는 컨테이너. 줄바꿈 없이 오른쪽에 모아 둔다. */
export function RowActions({ children }) {
  return (
    <Box sx={{ display: 'flex', gap: 0.25, alignItems: 'center', whiteSpace: 'nowrap' }}>
      {children}
    </Box>
  )
}

/** 표 행의 수정 버튼. */
export function EditAction({ onClick, title = '수정', disabled = false }) {
  return (
    <Tooltip title={title}>
      {/* disabled 버튼은 이벤트를 내지 않아 Tooltip이 동작하지 않으므로 span으로 감싼다 */}
      <span>
        <IconButton size="small" onClick={onClick} disabled={disabled} aria-label={title}>
          <EditIcon sx={{ fontSize: '1.05rem' }} />
        </IconButton>
      </span>
    </Tooltip>
  )
}

/** 표 행의 삭제 버튼. 파괴적 동작이므로 항상 error 색. */
export function DeleteAction({ onClick, title = '삭제', disabled = false }) {
  return (
    <Tooltip title={title}>
      <span>
        <IconButton size="small" color="error" onClick={onClick} disabled={disabled} aria-label={title}>
          <DeleteIcon sx={{ fontSize: '1.05rem' }} />
        </IconButton>
      </span>
    </Tooltip>
  )
}

/**
 * 표 행의 텍스트 액션. 역할 변경처럼 아이콘으로 뜻이 전달되지 않는 동작에만 쓴다.
 * @param {boolean} danger 파괴적 동작이면 error 색
 */
export function TextAction({ onClick, children, danger = false, disabled = false }) {
  return (
    <Button
      size="small"
      variant="outlined"
      color={danger ? 'error' : 'primary'}
      onClick={onClick}
      disabled={disabled}
      sx={{ minWidth: 0, px: 1, py: 0.15, fontSize: '0.78rem', lineHeight: 1.6 }}
    >
      {children}
    </Button>
  )
}

/**
 * 관리자 표 공용 스타일.
 * 페이지마다 조금씩 다른 값으로 복제돼 있던 것을 하나로 모았다.
 */
export const table = {
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' },
  thead: { backgroundColor: '#f9fafb' },
  th: { padding: '0.5rem 0.75rem', fontWeight: 700, color: '#374151', textAlign: 'left', borderBottom: '2px solid #e5e7eb', fontSize: '0.8rem', whiteSpace: 'nowrap' },
  tr: { borderBottom: '1px solid #f3f4f6' },
  td: { padding: '0.4rem 0.75rem', color: '#111827', verticalAlign: 'middle' },
  tdMuted: { padding: '0.4rem 0.75rem', color: '#6b7280', fontSize: '0.82rem', verticalAlign: 'middle' },
}

/** 알약형 필터 탭 + 개수 배지. AdminSubjects에서 쓰던 것을 공용으로 옮겼다. */
export const filters = {
  row: { display: 'flex', gap: '0.4rem', marginBottom: '0.75rem', alignItems: 'center', flexWrap: 'wrap' },
  tab: { padding: '0.3rem 0.75rem', border: '1px solid #e5e7eb', borderRadius: '999px', cursor: 'pointer', fontSize: '0.82rem', backgroundColor: '#fff', color: '#6b7280' },
  tabActive: { padding: '0.3rem 0.75rem', border: '1px solid #1976d2', borderRadius: '999px', cursor: 'pointer', fontSize: '0.82rem', backgroundColor: '#e3f2fd', color: '#1565c0', fontWeight: 700 },
  badge: { display: 'inline-block', fontSize: '0.72rem', fontWeight: 600, backgroundColor: '#e5e7eb', color: '#374151', borderRadius: '999px', padding: '0.05rem 0.45rem', marginLeft: '0.3rem' },
  badgeActive: { display: 'inline-block', fontSize: '0.72rem', fontWeight: 600, backgroundColor: '#bbdefb', color: '#0d47a1', borderRadius: '999px', padding: '0.05rem 0.45rem', marginLeft: '0.3rem' },
}
