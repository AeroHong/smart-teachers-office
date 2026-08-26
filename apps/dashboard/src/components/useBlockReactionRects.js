/**
 * blockIds에 있는 data-block-id 엘리먼트들의 화면 위치를 잰다 — 반응이 달린 블록마다 그
 * 자리에 알약 줄을 fixed로 띄우기 위해서다. CanvasEditor.jsx의 picked/pickedTable/
 * hoveredBlock과 같은 "떠 있는 요소를 특정 DOM 노드 rect에 고정" 패턴을 그대로 쓴다.
 */
import { useEffect, useState } from 'react'

/**
 * @param {object} containerRef 블록들이 들어있는 DOM 노드 ref
 * @param {string[]} blockIds 알약을 띄울 data-block-id 목록
 * @param {*} [version] 이 값이 바뀔 때도 다시 잰다 — 본문이 고쳐지면(타이핑, 다른 사람의
 *   자동저장) 블록이 위아래로 밀리는데, 그건 scroll/resize가 아니라서 그것만 듣고 있으면
 *   자리가 어긋난 채로 남는다.
 */
export default function useBlockReactionRects(containerRef, blockIds, version) {
  const key = blockIds.join(',')
  const [rects, setRects] = useState([])

  useEffect(() => {
    const ids = key ? key.split(',') : []
    const remeasure = () => {
      const el = containerRef.current
      if (!el || ids.length === 0) { setRects([]); return }
      const next = []
      ids.forEach(id => {
        const node = el.querySelector(`[data-block-id="${CSS.escape(id)}"]`)
        if (node) next.push({ blockId: id, rect: node.getBoundingClientRect() })
      })
      setRects(next)
    }
    remeasure()
    window.addEventListener('resize', remeasure)
    window.addEventListener('scroll', remeasure, true)
    return () => {
      window.removeEventListener('resize', remeasure)
      window.removeEventListener('scroll', remeasure, true)
    }
  }, [containerRef, key, version])

  return rects
}
