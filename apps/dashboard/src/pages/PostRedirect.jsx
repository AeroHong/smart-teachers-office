/**
 * 옛 주소 `/posts/:requestId`를 새 주소로 돌린다.
 *
 * 이 주소는 예전 홈(Home.jsx)의 것이었다. 홈이 채널 목록으로 바뀌면서(2026-08-25) 사라졌지만
 * 주소 자체는 죽이면 안 된다 — 쿨메신저에 이미 붙여넣어 돌고 있는 링크가 이 형태를 가리킨다
 * (App.jsx의 예전 주석: "쿨메신저에 붙여넣는 링크가 특정 글을 가리켜야 하므로"). 데스크톱
 * 알림도 더는 이 주소를 만들지 않지만(useDesktopNotifications.js가 새 주소를 직접 쓴다),
 * 과거에 온 알림 기록이나 사람이 직접 복사해 둔 링크는 여전히 이 형태일 수 있다.
 *
 * 글 하나를 읽어 channelId를 알아낸 뒤 그 채널 아래 주소로 넘긴다. "모든 글이 채널을
 * 갖는다"(P3-A)가 규칙이 된 뒤로는 channelId가 없는 경우가 없어야 하지만, 혹시 있으면
 * 전체 공지 채널로 떨어뜨린다 — 없는 채널로 보내 또 다른 오류 화면을 만들지 않는다.
 */
import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { ALL_STAFF_CHANNEL_ID, COL, schoolPath } from '@shared/lib/schema'
import WorkspaceLayout, { DetailPlaceholder } from '../components/WorkspaceLayout'

export default function PostRedirect() {
  const { requestId } = useParams()
  const { schoolId } = useAuth()
  const [channelId, setChannelId] = useState(undefined) // undefined=조회 중, null=못 찾음

  useEffect(() => {
    if (!schoolId || !requestId) return
    let alive = true
    getDoc(doc(db, ...schoolPath(schoolId, COL.REQUESTS), requestId))
      .then(snap => { if (alive) setChannelId(snap.exists() ? (snap.data().channelId || ALL_STAFF_CHANNEL_ID) : null) })
      .catch(() => { if (alive) setChannelId(null) })
    return () => { alive = false }
  }, [schoolId, requestId])

  if (channelId === undefined) {
    return <WorkspaceLayout><DetailPlaceholder emoji="⏳" message="이동하는 중…" /></WorkspaceLayout>
  }
  if (channelId === null) {
    return <WorkspaceLayout><DetailPlaceholder emoji="🔍" message="글을 찾을 수 없습니다. 삭제되었을 수 있습니다." /></WorkspaceLayout>
  }
  return <Navigate to={`/channels/${channelId}/${requestId}`} replace />
}
