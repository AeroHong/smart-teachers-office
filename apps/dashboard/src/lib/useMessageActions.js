/**
 * 메시지 한 줄에 딸린 조작들 — 반응·반응 피커·더보기 메뉴·편집·삭제.
 *
 * ChannelMessages.jsx(메인 목록)와 ThreadPanel.jsx(답장 패널) 둘 다 같은 조작을
 * 똑같이 지원해야 한다(반응 하나만 메인에만 되고 스레드엔 안 되면 이상하다) — 그런데
 * "지금 어느 메시지에 마우스가 있는지"·"지금 뭘 편집 중인지"는 목록마다 따로 가져야
 * 한다(하나로 합치면 메인에서 호버한 게 스레드 패널에도 반응해버린다). 그래서 상태
 * 자체는 이 훅을 부르는 컴포넌트마다 독립으로 생기고, 로직(규칙과 정확히 맞물려야
 * 하는 hasOnly 필드 목록 등)만 여기 한 곳에 모아 둔다.
 */
import { useCallback, useEffect, useState } from 'react'
import { deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { COL, schoolPath } from '@shared/lib/schema'
import { newMessagePayload, validateMessage } from '@shared/lib/channelMessages'
import { htmlToText, sanitizeHtml } from '@shared/lib/richText'
import { useToast } from '../components/ToastProvider'
import useChannelMessageReactions from './useChannelMessageReactions'

function escapeHtml(text) {
  return String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export default function useMessageActions({ schoolId, channelId }) {
  const { user, isAdmin, isSuperAdmin } = useAuth()
  const toast = useToast()
  const { byMessage: reactionsByMessage, toggle: toggleReaction, uid: reactionUid } =
    useChannelMessageReactions({ schoolId, channelId })

  const [reactionPicker, setReactionPicker] = useState(null) // { messageId, anchor: {top,left} }
  const [messageMenu, setMessageMenu] = useState(null)       // { message, anchor: {top,left} }
  const [editingMessageId, setEditingMessageId] = useState(null)
  const [editDraft, setEditDraft] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)

  // 채널을 바꾸면 전부 비운다 — 다른 채널의 메시지를 편집·삭제하려던 상태가 새 채널로
  // 넘어오면 엉뚱한 문서를 건드리게 된다.
  useEffect(() => {
    setReactionPicker(null); setMessageMenu(null)
    setEditingMessageId(null); setEditDraft(''); setDeleteTarget(null)
  }, [channelId])

  const openReactionPicker = useCallback((messageId, e) => {
    const r = e.currentTarget.getBoundingClientRect()
    setReactionPicker({ messageId, anchor: { top: r.bottom + 4, left: r.left } })
  }, [])
  const closeReactionPicker = useCallback(() => setReactionPicker(null), [])

  const openMessageMenu = useCallback((message, e) => {
    const r = e.currentTarget.getBoundingClientRect()
    setMessageMenu({ message, anchor: { top: r.bottom + 4, left: r.left } })
  }, [])
  const closeMessageMenu = useCallback(() => setMessageMenu(null), [])

  const startEdit = useCallback((m) => {
    setMessageMenu(null)
    setEditingMessageId(m.id)
    setEditDraft(m.bodyHtml || (m.body ? `<p>${escapeHtml(m.body).replace(/\n/g, '<br>')}</p>` : ''))
  }, [])
  const cancelEdit = useCallback(() => { setEditingMessageId(null); setEditDraft('') }, [])

  const saveEdit = useCallback(async () => {
    const safeHtml = sanitizeHtml(editDraft)
    const text = htmlToText(safeHtml)
    const error = validateMessage(text)
    if (error) { toast.error(error); return }
    const targetId = editingMessageId
    try {
      // authorUid는 여기서 안 쓰지만 newMessagePayload가 필수로 요구해 그대로 넘긴다
      // — body/bodyHtml/mentionedUids/mentionsChannel 네 필드만 뽑아 쓴다(규칙의
      // hasOnly와 정확히 맞물려야 한다, firestore.rules의 messages allow update 참고).
      const payload = newMessagePayload({ authorUid: user?.uid, bodyHtml: safeHtml })
      await updateDoc(
        doc(db, ...schoolPath(schoolId, COL.CHANNELS), channelId, COL.CHANNEL_MESSAGES, targetId),
        {
          body: payload.body,
          bodyHtml: payload.bodyHtml,
          mentionedUids: payload.mentionedUids,
          mentionsChannel: payload.mentionsChannel,
          updatedAt: serverTimestamp(),
        },
      )
      setEditingMessageId(null)
      setEditDraft('')
    } catch (e) {
      toast.error('메시지를 수정하지 못했습니다.', e)
    }
  }, [schoolId, channelId, editingMessageId, editDraft, user, toast])

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return
    try {
      await deleteDoc(doc(db, ...schoolPath(schoolId, COL.CHANNELS), channelId, COL.CHANNEL_MESSAGES, deleteTarget.id))
    } catch (e) {
      toast.error('메시지를 삭제하지 못했습니다.', e)
    } finally {
      setDeleteTarget(null)
    }
  }, [schoolId, channelId, deleteTarget, toast])

  const canEditMessage = useCallback(m => m.authorUid === user?.uid, [user])
  const canDeleteMessage = useCallback(m => m.authorUid === user?.uid || isAdmin || isSuperAdmin, [user, isAdmin, isSuperAdmin])

  return {
    reactionsByMessage, toggleReaction, reactionUid,
    reactionPicker, openReactionPicker, closeReactionPicker,
    messageMenu, openMessageMenu, closeMessageMenu,
    editingMessageId, editDraft, setEditDraft, startEdit, cancelEdit, saveEdit,
    deleteTarget, setDeleteTarget, confirmDelete,
    canEditMessage, canDeleteMessage,
  }
}
