/**
 * 알림 — 새 공지 · 멘션 · 쪽지 도착.
 *
 * "내 활동"이 안 한 일(업무 진행 중)만 다루다 보니, 완료 개념이 없는 업데이트(공지·멘션·
 * 쪽지)는 데스크톱 토스트(useDesktopNotifications.js)로 한 번 스쳐 지나가면 다시 볼 곳이
 * 없었다. 그 토스트는 Electron 전용이라 웹에서는 아예 안 뜬다는 문제도 있었다.
 *
 * 여기서는 "이미 읽음 상태가 있는 것"만 먼저 모은다(사용자 요청, 2026-08-31 — 채널 신설·
 * 댓글·일반 채널 메시지는 읽음 판정 기반이 없어서 다음 단계로 미룸). 세 갈래 각각의
 * '읽음'은 서로 다른 기존 신호를 그대로 쓴다 — 새 필드를 만들지 않는다.
 *
 *   공지·멘션 — 그 글이 속한 채널을 그 이후에 열어본 적이 있는가
 *              (channelPrefs.channelReads[channelId], useChannelPrefs.js가 이미 관리)
 *   쪽지      — personalNotices 문서 자체의 readAt (Messages.jsx와 완전히 같은 기준)
 *
 * 새 업무요청(kind='request')은 여기 넣지 않는다 — 완료 전까지 '업무 진행 중'에 이미
 * 떠 있어서, 알림에도 넣으면 같은 일이 두 번 보인다.
 *
 * markChannelRead를 내보내는 이유: 공지·멘션의 '읽음'이 채널 단위라서, 알림에서 하나를
 * 열어봐도 그 채널을 실제로 들어간 게 아니면 굵은 글씨가 안 지워진다(사용자 지적,
 * 2026-08-31 — "읽으면 뭔가 변화가 있어야"). 알림을 열 때 호출부(Activity.jsx)가 이걸
 * 불러 그 채널을 지금 읽은 것으로 같이 표시한다 — 같은 채널의 다른 알림도 함께 굵기가
 * 빠지는데, channelReads 자체가 원래 채널 단위 값이라(이 훅이 새로 만든 규칙이 아니다)
 * 자연스럽다.
 *
 * 멘션 감시는 useMentionNotifications.js와 같은 이유로 채널마다 리스너를 연다
 * (collectionGroup 쿼리는 메시지 읽기 규칙의 get() 조건과 부딪힌다, 그 파일 주석 참고).
 * 토스트 훅과 달리 Electron 여부를 안 가린다 — 웹에서도 이 화면을 보므로.
 */
import { useEffect, useMemo, useState } from 'react'
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { COL, schoolPath } from '@shared/lib/schema'
import { dmTitle, isDm } from '@shared/lib/channels'
import { isMuted } from '@shared/lib/channelPrefs'
import useChannels from './useChannels'
import useChannelPrefs from './useChannelPrefs'

/** 채널당 최근 이 정도에서만 멘션을 찾는다 — useMentionNotifications.js와 동일 기준. */
const MENTION_WINDOW = 20
const MESSAGE_LIMIT = 50

function toMillis(v) {
  return v?.toMillis?.() ?? (v instanceof Date ? v.getTime() : 0)
}

export default function useNotificationFeed() {
  const { user, schoolId } = useAuth()
  const { channels, dms } = useChannels()
  const { prefs, reads, markRead } = useChannelPrefs()

  // 1) 새 공지
  const [notices, setNotices] = useState([])
  useEffect(() => {
    if (!schoolId || !user) return undefined
    return onSnapshot(
      query(
        collection(db, ...schoolPath(schoolId, COL.REQUESTS)),
        where('targetUids', 'array-contains', user.uid),
        where('kind', '==', 'notice'),
      ),
      snap => setNotices(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      () => {},
    )
  }, [schoolId, user])

  // 2) 멘션 — 뮤트 안 한 채널·DM마다 최근 메시지를 구독해 그중 나를 멘션한 것만 남긴다.
  const watchable = useMemo(
    () => [...channels, ...dms].filter(c => !isMuted(prefs, c.id)),
    [channels, dms, prefs],
  )
  const watchKey = watchable.map(c => c.id).sort().join(',')
  const [mentionsByChannel, setMentionsByChannel] = useState({})

  useEffect(() => {
    if (!schoolId || !user) return undefined
    // 채널 목록이 바뀌면(나가기·새 채널 등) 이전 목록에만 있던 채널의 멘션이 남아있지
    // 않도록 다시 시작한다.
    setMentionsByChannel({})
    const unsubs = watchable.map(c => onSnapshot(
      query(
        collection(db, ...schoolPath(schoolId, COL.CHANNELS, c.id, COL.CHANNEL_MESSAGES)),
        orderBy('createdAt', 'desc'),
        limit(MENTION_WINDOW),
      ),
      snap => {
        const channelLabel = isDm(c) ? dmTitle(c, user.uid) : (c.name || '채널')
        const mine = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(m => m.authorUid !== user.uid && ((m.mentionedUids || []).includes(user.uid) || !!m.mentionsChannel))
          .map(m => ({ ...m, channelId: c.id, channelLabel }))
        setMentionsByChannel(prev => ({ ...prev, [c.id]: mine }))
      },
      () => {},
    ))
    return () => unsubs.forEach(u => u())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, user, watchKey])

  // 3) 쪽지
  const [messages, setMessages] = useState([])
  useEffect(() => {
    if (!schoolId || !user) return undefined
    return onSnapshot(
      query(
        collection(db, ...schoolPath(schoolId, COL.PERSONAL_NOTICES)),
        where('recipientUid', '==', user.uid),
        orderBy('createdAt', 'desc'),
        limit(MESSAGE_LIMIT),
      ),
      snap => setMessages(snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(n => !n.deletedByRecipientAt)),
      () => {},
    )
  }, [schoolId, user])

  const items = useMemo(() => {
    const readAt = (channelId) => toMillis(reads?.[channelId])

    const noticeItems = notices.map(n => ({
      type: 'notice',
      id: n.id,
      createdAt: n.createdAt,
      isNew: toMillis(n.createdAt) > readAt(n.channelId),
      label: n.title || '(제목 없음)',
      chipLabel: '공지',
      data: n,
    }))

    const mentionItems = Object.values(mentionsByChannel).flat().map(m => ({
      type: 'mention',
      id: m.id,
      createdAt: m.createdAt,
      isNew: toMillis(m.createdAt) > readAt(m.channelId),
      label: m.mentionsChannel
        ? `${m.channelLabel}: 전체 호출`
        : `${m.channelLabel}: ${m.authorName || '누군가'}님이 멘션`,
      chipLabel: '멘션',
      data: m,
    }))

    const messageItems = messages.map(n => ({
      type: 'message',
      id: n.id,
      createdAt: n.createdAt,
      isNew: !n.readAt,
      label: `${n.senderName || ''} · ${n.title || '새 쪽지'}`,
      chipLabel: '쪽지',
      data: n,
    }))

    return [...noticeItems, ...mentionItems, ...messageItems]
      .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt))
  }, [notices, mentionsByChannel, messages, reads])

  const unreadCount = useMemo(() => items.filter(i => i.isNew).length, [items])

  return { items, unreadCount, markChannelRead: markRead }
}
