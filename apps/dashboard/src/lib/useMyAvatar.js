/**
 * 내 프로필 사진 바꾸기 — Members.jsx 상세 칸과 ProfileCardProvider.jsx(내 프로필 카드)
 * 둘 다 이 훅을 쓴다. "사진은 어디서 바꾸든 같은 방식"을 한 곳에 모아 둔다.
 *
 * uploadAttachment(requestAttachments.js)를 그대로 재사용 — folder를 'avatars'로
 * 주면 storage.rules의 avatars/{uid} 경로와 맞아떨어진다. 새 업로드 함수를 안 만든다.
 */
import { useState } from 'react'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '@shared/lib/firebase'
import { useAuth } from '@shared/contexts/AuthContext'
import { USERS } from '@shared/lib/schema'
import { uploadAttachment } from '@shared/lib/requestAttachments'
import { useToast } from '../components/ToastProvider'
import { refreshAllSchoolMembers } from './useSchoolMembers'

/** @param {() => void} [onChanged] 저장 성공 뒤 부르는 콜백 — 호출부가 들고 있는
 *  구성원 목록(useSchoolMembers는 한 번만 읽으므로)을 다시 읽어야 화면에 반영된다. */
export default function useMyAvatar({ onChanged } = {}) {
  const { user, schoolId, setPhotoURL } = useAuth()
  const toast = useToast()
  const [uploading, setUploading] = useState(false)

  const applyAvatar = async (patch) => {
    if (!user) return
    try {
      await updateDoc(doc(db, USERS, user.uid), patch)
      // AuthContext의 photoURL은 로그인 시점에 한 번 읽은 값이라 여기서 직접 갱신해야
      // AppRail의 내 아바타(useAuth().photoURL을 그대로 씀)에도 바로 반영된다
      // (사용자 지적, 2026-08-29 — "왼쪽 하단 사용자 아이콘 변경 안됨").
      if ('photoURL' in patch) setPhotoURL(patch.photoURL)
      // 채널 메시지 목록의 아바타(ChannelMessages.jsx)는 이 훅을 호출한 화면과
      // 무관한 별도 useSchoolMembers() 인스턴스를 쓴다 — 그쪽도 새로고침 없이 바로
      // 바뀌게 전체 방송한다(사용자 지적, 2026-08-29 — "메시지 쪽에 실시간으로
      // 반영이 안 되네, 새로고침 하도록 하는건 어때?" → 페이지 새로고침 대신
      // 이 방송으로 필요한 부분만 조용히 새로고침한다).
      refreshAllSchoolMembers()
      await onChanged?.()
    } catch (e) {
      toast.error('사진을 바꾸지 못했습니다.', e)
    }
  }

  const uploadAvatar = async (file) => {
    if (!file || !user || !schoolId) return
    setUploading(true)
    try {
      const uploaded = await uploadAttachment({ schoolId, docId: user.uid, folder: 'avatars', file })
      await applyAvatar({ photoURL: uploaded.url, photoSource: 'custom' })
    } catch (e) {
      toast.error('사진을 올리지 못했습니다.', e)
    } finally {
      setUploading(false)
    }
  }

  const resetToGoogleAvatar = () => applyAvatar({ photoURL: user?.photoURL || null, photoSource: 'google' })

  return { uploading, uploadAvatar, resetToGoogleAvatar }
}
