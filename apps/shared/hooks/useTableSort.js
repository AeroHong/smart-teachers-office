import { createElement, useState, useCallback } from 'react'

/**
 * 테이블 컬럼 정렬 상태 훅
 */
export function useTableSort(defaultKey = null, defaultDir = 'asc') {
  const [sort, setSort] = useState({ key: defaultKey, dir: defaultDir })

  const toggle = useCallback((key) => {
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' }
    )
  }, [])

  function sortData(arr, getters = {}) {
    if (!sort.key) return arr
    const get = getters[sort.key] ?? ((item) => item[sort.key] ?? '')
    return [...arr].sort((a, b) => {
      const va = get(a)
      const vb = get(b)
      if (va === vb) return 0
      if (va == null || va === '') return 1
      if (vb == null || vb === '') return -1
      const cmp =
        typeof va === 'number' && typeof vb === 'number'
          ? va - vb
          : String(va).localeCompare(String(vb), 'ko')
      return sort.dir === 'asc' ? cmp : -cmp
    })
  }

  function Ind(col) {
    const active = sort.key === col
    return createElement('span', {
      style: {
        fontSize: '0.68rem',
        marginLeft: '3px',
        color: active ? '#1976d2' : '#d1d5db',
        fontWeight: 'normal',
      },
    }, active ? (sort.dir === 'asc' ? '↑' : '↓') : '↕')
  }

  const thSort = { cursor: 'pointer', userSelect: 'none' }

  return { sort, toggle, sortData, Ind, thSort }
}
