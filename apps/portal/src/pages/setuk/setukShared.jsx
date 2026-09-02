// 세특 점검 결과를 보여주는 두 화면(학급별 상세 SetukCheckDetail, 과목별 보기
// SetukBySubject)이 공통으로 쓰는 표시 조각 — 중복 구현을 피하려고 분리했다.
import Typography from '@mui/material/Typography'

export const SEVERITY_COLORS = { ERROR: 'error', WARNING: 'warning', INFO: 'info' }

export const HIGHLIGHT_STYLE = { background: '#fecaca', color: '#7f1d1d', borderRadius: 3, padding: '0 2px', fontWeight: 700 }
export const BADGE_STYLE = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16,
  borderRadius: '50%', background: '#dc2626', color: '#fff', fontSize: 10, fontWeight: 700,
  marginRight: 3, verticalAlign: 'middle', flexShrink: 0,
}

/**
 * 학생-과목 하나의 전체 세특 문장 안에서, 그 과목에 걸린 항목 전부를 번호로 한 번에
 * 표시한다 - 항목 목록의 순번과 같은 번호를 달아 서로 대응시킨다. 원문/위치 정보가
 * 없는 옛 항목은 저장된 앞뒤 문맥만으로 항목별 줄을 나열해 대체한다.
 */
export function MultiHighlight({ text, groupItems }) {
  const withOrder = groupItems.map((it, i) => ({ ...it, order: i + 1 }))
  const positioned = text != null ? withOrder.filter((it) => it.index != null && it.length != null) : []

  if (positioned.length === 0) {
    return (
      <>
        {withOrder.map((it) => (
          <Typography key={it.id} sx={{ fontSize: '0.85rem', lineHeight: 1.8, mb: 1 }}>
            <span style={BADGE_STYLE}>{it.order}</span>
            <span style={{ color: '#94a3b8' }}>{it.before}</span>
            <mark style={HIGHLIGHT_STYLE}>{it.matched}</mark>
            <span style={{ color: '#94a3b8' }}>{it.after}</span>
          </Typography>
        ))}
      </>
    )
  }

  const sorted = [...positioned].sort((a, b) => a.index - b.index)
  const parts = []
  let cursor = 0
  sorted.forEach((sp) => {
    if (sp.index < cursor) return
    parts.push(text.slice(cursor, sp.index))
    parts.push(
      <mark key={sp.id} style={HIGHLIGHT_STYLE}>
        <span style={BADGE_STYLE}>{sp.order}</span>{text.slice(sp.index, sp.index + sp.length) || ' '}
      </mark>,
    )
    cursor = sp.index + sp.length
  })
  parts.push(text.slice(cursor))
  return <>{parts}</>
}
