import { useEffect, useState } from 'react'
import { loadSearchIndex } from './data'

/** 검색 색인 — 규정집이 바뀌면(searchStamp) 다시 읽는다 */
export function useSearchIndex(schoolId, book, loader = loadSearchIndex) {
  const [state, setState] = useState({ entries: null, loading: true, error: null })
  const stamp = book?.searchStamp
  useEffect(() => {
    if (!schoolId || !book) { setState({ entries: null, loading: false, error: null }); return undefined }
    let alive = true
    setState((s) => ({ ...s, loading: true }))
    loader(schoolId, book)
      .then((entries) => { if (alive) setState({ entries, loading: false, error: null }) })
      .catch((e) => { console.error(e); if (alive) setState({ entries: [], loading: false, error: e }) })
    return () => { alive = false }
  }, [schoolId, stamp]) // eslint-disable-line react-hooks/exhaustive-deps
  return state
}
