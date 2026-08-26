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
    // 창 자체는 안 바뀌어도 이 칸의 폭이 바뀌는 경우가 있다 — 블록 댓글 패널(4번째 칸)이
    // 열리거나 닫히면 캔버스 칸이 옆으로 좁아지는데, 그건 window resize가 아니라서 위
    // 리스너로는 못 잡는다(사용자 확인, 2026-08-26 — "댓글 창이 열리는데 기존 이모지,
    // 댓글 입력 버튼이 떠있어서 댓글 사이드바 위에 둥둥 떠있습니다" — 옛 폭 기준으로 잰
    // 자리에 그대로 떠 있던 것). ResizeObserver로 이 칸 자체의 크기 변화를 직접 듣는다.
    let ro
    if (containerRef.current && 'ResizeObserver' in window) {
      ro = new ResizeObserver(remeasure)
      ro.observe(containerRef.current)
    }
    return () => {
      window.removeEventListener('resize', remeasure)
      window.removeEventListener('scroll', remeasure, true)
      ro?.disconnect()
    }
  }, [containerRef, key, version])

  return rects
}
