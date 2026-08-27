/**
 * 멘션(@사람·@전체) 데스크톱 알림 — useDesktopNotifications.js와 같은 파이프라인
 * (Electron 전용, notifyOnce로 발사·dedupe)을 재사용하지만 감시 대상이 다르다.
 *
 * 채널 메시지는 channels/{channelId}/messages 서브컬렉션이다. "나를 멘션한 메시지"를
 * 학교 전체에 걸쳐 한 번에 구독하려면 collectionGroup 쿼리가 필요한데, 메시지 읽기
 * 규칙(isChannelMember)이 get()을 쓰는 규칙이라 이 프로젝트가 이미 못박아 둔 "목록
 * 쿼리에 get() 규칙은 못 쓴다"(PLAN_channels_datamodel.md §1·§3)와 정면으로 부딪힌다.
 * 그래서 collectionGroup 대신 **채널마다 리스너 하나**를 연다 — useChannels()가 이미
 * 구독 중인 "내가 속한 채널" 목록을 그대로 써서 채널 목록을 새로 구하지 않는다.
 *
 * 뮤트한 채널(channelPrefs.mutedChannelIds)은 리스너 자체를 안 연다.
 */
import { useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, limitToLast, onSnapshot, orderBy, query } from 'firebase/firestore'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { COL, schoolPath } from '@shared/lib/schema'
import { dmTitle, isDm } from '@shared/lib/channels'
import { isMuted } from '@shared/lib/channelPrefs'
import { isDesktop, notifyOnce, previewText } from './useDesktopNotifications'
import useChannels from './useChannels'
import useChannelPrefs from './useChannelPrefs'

/** 리스너 하나당 최근 이 정도만 본다 — 멘션은 방금 온 메시지에서만 쓸모 있다. */
const RECENT_WINDOW = 20

export default function useMentionNotifications() {
  const { user, schoolId } = useAuth()
  const navigate = useNavigate()
  const { channels, dms } = useChannels()
  const { prefs } = useChannelPrefs()

  // 알림 클릭 → 메인 프로세스가 창을 복원한 뒤 이동할 경로를 돌려준다.
  // useDesktopNotifications.js와 같은 코드다 — onNavigate 리스너는 창 하나에 하나만
  // 있으면 되는데, 두 훅이 각자 등록해도 둘 다 같은 route를 받아 같은 navigate를
  // 부를 뿐이라 중복 이동은 없다.
  useEffect(() => {
    if (!isDesktop()) return undefined
    return window.smartOfficeDesktop.onNavigate?.((route) => {
      if (route) navigate(route)
    })
  }, [navigate])

  // 감시할 채널 — 뮤트 안 한 채널 전부(DM 포함, memberUids가 나를 담고 있으면 거기서도
  // 멘션될 수 있다). 채널 배열은 useChannels()가 스냅샷마다 새로 만들어 참조가 매번
  // 바뀌므로, id 목록을 문자열로 다져 그 값이 실제로 바뀔 때만 아래 useEffect가
  // 리스너를 다시 여닫게 한다(그렇지 않으면 매 렌더마다 구독을 끊고 다시 여는 셈이 된다).
  const watchable = useMemo(
    () => [...channels, ...dms].filter(c => !isMuted(prefs, c.id)),
    [channels, dms, prefs],
  )
  const watchKey = watchable.map(c => c.id).sort().join(',')

  useEffect(() => {
    if (!isDesktop() || !schoolId || !user) return undefined

    const unsubs = watchable.map((c) => {
      let first = true
      return onSnapshot(
        query(
          collection(db, ...schoolPath(schoolId, COL.CHANNELS, c.id, COL.CHANNEL_MESSAGES)),
          orderBy('createdAt', 'asc'),
          limitToLast(RECENT_WINDOW),
        ),
        (snap) => {
          // 최초 스냅샷은 건너뛴다 — 채널에 예전부터 있던 멘션이 앱을 켤 때마다 되살아나면 안 된다.
          if (first) { first = false; return }
          snap.docChanges().forEach((change) => {
            if (change.type !== 'added') return
            const m = change.doc.data()
            if (m.authorUid === user.uid) return   // 내가 보낸 메시지는 알리지 않는다
            const mentioned = (m.mentionedUids || []).includes(user.uid) || !!m.mentionsChannel
            if (!mentioned) return
            const channelLabel = isDm(c) ? dmTitle(c, user.uid) : (c.name || '채널')
            notifyOnce(
              `mention:${change.doc.id}`,
              m.mentionsChannel ? `${channelLabel}에서 전체 호출` : `${m.authorName || ''}님이 멘션했습니다`,
              previewText(m.bodyHtml || m.body || ''),
              `/channels/${c.id}`,
              { category: channelLabel },
            )
          })
        },
        () => {},
      )
    })

    return () => unsubs.forEach(u => u())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, user, watchKey])
}
