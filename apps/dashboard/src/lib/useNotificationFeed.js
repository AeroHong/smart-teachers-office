/**
 * 알림 — 새 공지 · 멘션 · 쪽지 · 채널 신설 · 댓글.
 *
 * "내 활동"이 안 한 일(업무 진행 중)만 다루다 보니, 완료 개념이 없는 업데이트(공지·멘션·
 * 쪽지·댓글)는 데스크톱 토스트(useDesktopNotifications.js)로 한 번 스쳐 지나가면 다시 볼
 * 곳이 없었다. 그 토스트는 Electron 전용이라 웹에서는 아예 안 뜬다는 문제도 있었다.
 *
 * 여기서는 "이미 읽음 상태가 있는 것"부터 모은다(사용자 요청, 2026-08-31). 다섯 갈래
 * 각각의 '읽음'은 서로 다른 기존 신호를 그대로 쓴다 — 새 필드를 만들지 않는다.
 *
 *   공지·멘션·채널 신설·댓글 — 그 글/채널이 속한 채널을 그 이후에 열어본 적이 있는가
 *              (channelPrefs.channelReads[channelId], useChannelPrefs.js가 이미 관리)
 *   쪽지      — personalNotices 문서 자체의 readAt (Messages.jsx와 완전히 같은 기준)
 *
 * 채널 신설은 "해당 채널 소속 사용자에게만"(사용자 요청) 알린다 — useChannels()가 이미
 * "내가 속한 채널"만 돌려주므로 별도 필터가 필요 없다. DM은 뺀다 — 대화가 시작될 때
 * 마다 채널 문서가 새로 생기는 구조라 "신설"이라 부를 만한 사건이 아니다.
 *
 * 댓글은 "내가 대상이거나 담당인 글"에 달린 것만 본다(사용자 요청) — 학교 전체 댓글을
 * 다 보면 관심 없는 글까지 알림이 쏟아진다. 일반 채널 메시지(멘션 아닌 것)는 범위에서
 * 뺀다(사용자 요청, 2026-08-31 — "채널 메시지는 멘션 대상자에게만").
 *
 * 새 업무요청(kind='request')은 여기 넣지 않는다 — 완료 전까지 '업무 진행 중'에 이미
 * 떠 있어서, 알림에도 넣으면 같은 일이 두 번 보인다.
 *
 * markChannelRead를 내보내는 이유: 공지·멘션·댓글의 '읽음'이 채널 단위라서, 알림에서
 * 하나를 열어봐도 그 채널을 실제로 들어간 게 아니면 굵은 글씨가 안 지워진다(사용자 지적,
 * 2026-08-31 — "읽으면 뭔가 변화가 있어야"). 알림을 열 때 호출부(Activity.jsx)가 이걸
 * 불러 그 채널을 지금 읽은 것으로 같이 표시한다 — 같은 채널의 다른 알림도 함께 굵기가
 * 빠지는데, channelReads 자체가 원래 채널 단위 값이라(이 훅이 새로 만든 규칙이 아니다)
 * 자연스럽다.
 *
 * 멘션·댓글 감시는 채널/글마다 리스너를 연다(useMentionNotifications.js와 같은 이유 —
 * collectionGroup 쿼리는 메시지·댓글 읽기 규칙의 get() 조건과 부딪힌다, 그 파일 주석
 * 참고. 댓글 문서엔 channelId도 없어 필터할 필드 자체가 없다). 토스트 훅과 달리
 * Electron 여부를 안 가린다 — 웹에서도 이 화면을 보므로.
 *
 * 댓글 리스너는 "내가 대상이거나 담당인 글"만 여는데, 이 범위가 한 학기 내내 쌓여
 * 멘션(채널 수만큼)보다 훨씬 커질 수 있다. 실제로 느려지면 "마감 지난 지 오래된 글은
 * 제외" 같은 기간 제한을 여기 더한다 — 지금은 두지 않는다.
 */
import { useEffect, useMemo, useState } from 'react'
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { COL, schoolPath } from '@shared/lib/schema'
import { dmTitle, isDm } from '@shared/lib/channels'
import { isMuted } from '@shared/lib/channelPrefs'
import { isOwner, isTargetOf } from '@shared/lib/workRequests'
import useChannels from './useChannels'
import useChannelPrefs from './useChannelPrefs'

/** 채널당 최근 이 정도에서만 멘션을 찾는다 — useMentionNotifications.js와 동일 기준. */
const MENTION_WINDOW = 20
const MESSAGE_LIMIT = 50
/** 글 하나당 최근 이 정도에서만 댓글을 찾는다 — 멘션과 같은 기준. */
const COMMENT_WINDOW = 10

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

  // 5) 댓글 — 내가 대상이거나 담당인 글마다 최근 댓글을 구독해 그중 내가 안 쓴 것만
  // 남긴다. 글 목록은 useChannels()가 이미 읽어둔 것을 재사용한다(새 쿼리 없음).
  const stakeholderPosts = useMemo(() => {
    if (!user) return []
    return channels.flatMap(c => c.posts || [])
      .filter(p => isTargetOf(p, user.uid) || isOwner(p, user.uid) || p.createdBy === user.uid)
  }, [channels, user])
  const stakeholderKey = stakeholderPosts.map(p => p.id).sort().join(',')
  const [commentsByPost, setCommentsByPost] = useState({})

  useEffect(() => {
    if (!schoolId || !user) return undefined
    setCommentsByPost({})
    const unsubs = stakeholderPosts.map(p => onSnapshot(
      query(
        collection(db, ...schoolPath(schoolId, COL.REQUESTS, p.id, COL.REQUEST_COMMENTS)),
        orderBy('createdAt', 'desc'),
        limit(COMMENT_WINDOW),
      ),
      snap => {
        const mine = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(c => c.authorUid !== user.uid)
          .map(c => ({ ...c, postId: p.id, postTitle: p.title, channelId: p.channelId }))
        setCommentsByPost(prev => ({ ...prev, [p.id]: mine }))
      },
      () => {},
    ))
    return () => unsubs.forEach(u => u())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, user, stakeholderKey])

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

    // 내가 만든 채널은 알릴 이유가 없다 — 이미 만들면서 봤다.
    const channelItems = channels.filter(c => c.createdBy !== user?.uid).map(c => ({
      type: 'channel',
      id: c.id,
      createdAt: c.createdAt,
      isNew: toMillis(c.createdAt) > readAt(c.id),
      label: `새 채널: ${c.name || '이름 없음'}`,
      chipLabel: '채널',
      data: c,
    }))

    const commentItems = Object.values(commentsByPost).flat().map(c => ({
      type: 'comment',
      id: c.id,
      createdAt: c.createdAt,
      isNew: toMillis(c.createdAt) > readAt(c.channelId),
      label: `${c.postTitle || '(제목 없음)'}: ${c.authorName || '누군가'}님 댓글`,
      chipLabel: '댓글',
      data: c,
    }))

    return [...noticeItems, ...mentionItems, ...messageItems, ...channelItems, ...commentItems]
      .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt))
  }, [notices, mentionsByChannel, messages, channels, commentsByPost, user, reads])

  const unreadCount = useMemo(() => items.filter(i => i.isNew).length, [items])

  return { items, unreadCount, markChannelRead: markRead }
}
