/**
 * 즐겨찾기·섹션에 넣은 캔버스(업무 글) 구독.
 *
 * ChannelSidebar.jsx가 그 캔버스들을 그리려면 title 같은 최신 값이 필요한데, 학교
 * 전체 요청글을 구독하는 건 과하다 — channelPrefs.favoritedPostIds()로 뽑은
 * postId들만 골라 구독한다(channelPrefs.js 주석 참고).
 *
 * Firestore의 `where(documentId(),'in',...)`은 한 번에 10개까지라, 10개씩
 * 나눠 여러 리스너를 연다 — 사이드바 자리 제약상 즐겨찾기 캔버스 수는 원래 적을
 * 것으로 본다.
 */
import { useEffect, useState } from 'react'
import { collection, documentId, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '@shared/lib/firebase'
import { COL, schoolPath } from '@shared/lib/schema'

const CHUNK = 10

export default function useFavoritedPosts(schoolId, postIds = []) {
  const [byId, setById] = useState({})
  const key = [...postIds].sort().join(',')

  useEffect(() => {
    if (!schoolId || postIds.length === 0) { setById({}); return undefined }
    const chunks = []
    for (let i = 0; i < postIds.length; i += CHUNK) chunks.push(postIds.slice(i, i + CHUNK))

    const unsubs = chunks.map(chunk => onSnapshot(
      query(collection(db, ...schoolPath(schoolId, COL.REQUESTS)), where(documentId(), 'in', chunk)),
      snap => {
        setById(prev => {
          const next = { ...prev }
          // 이 청크가 담당하는 id 중 이제 안 보이는 것(삭제됨)은 정리한다.
          chunk.forEach(id => delete next[id])
          snap.docs.forEach(d => { next[d.id] = { id: d.id, ...d.data() } })
          return next
        })
      },
      () => {},
    ))
    return () => unsubs.forEach(u => u())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, key])

  return Object.values(byId)
}
