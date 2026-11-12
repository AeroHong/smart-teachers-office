import { Fragment } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import Link from '@mui/material/Link'
import { nodeHref } from './RegulationBody'

/** 근거 목록 — 학교 규정은 그 조문으로, 상위 법령은 법령정보센터로(주소가 있을 때) */
export default function BasisLinks({ basis = [], book, base = '', sep = ' · ' }) {
  return basis.map((b, i) => {
    const key = `${b.kind}-${b.regId || b.name}-${b.nodeId || b.article || i}`
    let el
    if (b.kind === 'reg') {
      const reg = book?.regulations?.find((r) => r.id === b.regId)
      el = reg
        ? <Link component={RouterLink} to={nodeHref(base, b.regId, b.nodeId)} underline="hover">{b.label || reg.title}</Link>
        : <span>{b.label}</span>
    } else {
      const label = `「${b.name}」${b.article ? ` 제${b.article}조` : ''}`
      el = b.url ? <Link href={b.url} target="_blank" rel="noreferrer" underline="hover">{label}</Link> : <span>{label}</span>
    }
    return <Fragment key={key}>{i > 0 && sep}{el}</Fragment>
  })
}
